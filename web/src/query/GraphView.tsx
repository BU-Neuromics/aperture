import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular } from 'cytoscape';
import type { HippoSource } from '../data/hippoSource';
import type { CollectionModel, ColumnModel } from '../data/schemaModel';
import { slotName } from '../data/schemaModel';
import { useCollectionUrlState } from '../features/collections/urlState';
import { runQuerySpec } from './planner';
import { readGraphTheme, useGraphTheme, type GraphTheme } from './graphTheme';
import './query.css';

/**
 * The graph exploration view (ADR-0037, Proposed): a Cytoscape canvas seeded
 * from the current QuerySpec's results (or the active collection's first
 * page), expanded one hop per click. Until the server advertises a
 * `neighbors` root (Mosaic OpenSpec heterogeneous-roots), expansion is the
 * documented client-side fallback — per-entity detail reads for forward
 * reference edges plus filtered reverse lookups — exact but slower, and the
 * legend says so (ADR-0029). Node budget is visible, never silent.
 */

export const NODE_BUDGET = 250;
const SEED_LIMIT = 50;
const EXPAND_LIMIT = 25;

const PALETTE = [
  '#4f6b8f',
  '#8f6b4f',
  '#4f8f6b',
  '#8f4f6b',
  '#6b4f8f',
  '#6b8f4f',
  '#8f8f4f',
  '#4f8f8f',
];

function colorFor(typeName: string): string {
  let hash = 0;
  for (const ch of typeName) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/**
 * The Cytoscape stylesheet for a given resolved palette. Kept out of the mount
 * effect so the same definition can be re-applied when the theme changes; the
 * per-node `background-color` bypass set in addEntity survives a restyle.
 */
function graphStylesheet(theme: GraphTheme): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-size': '9px',
        color: theme.label,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        width: 18,
        height: 18,
        'border-width': 1,
        'border-color': theme['node-ring'],
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': theme.edge,
        'target-arrow-shape': 'triangle',
        'target-arrow-color': theme.edge,
        'curve-style': 'bezier',
        'arrow-scale': 0.7,
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-width': 3, 'border-color': theme.selected },
    },
  ];
}

function labelColumn(collection: CollectionModel): ColumnModel | undefined {
  return (
    collection.columns.find((c) => c.kind === 'text') ??
    collection.columns.find((c) => c.field === collection.idColumn)
  );
}

interface GraphNodeData {
  id: string;
  entityId: string;
  collectionId: string;
  typeName: string;
  label: string;
  expanded: boolean;
}

export function GraphView({ source }: { source: HippoSource }) {
  const { collections, capabilities } = source;
  const urlState = useCollectionUrlState();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<GraphNodeData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const graphTheme = useGraphTheme(containerEl);

  const byType = useMemo(
    () => new Map(collections.map((c) => [c.typeName, c])),
    [collections],
  );
  const byId = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);

  const addEntity = useCallback(
    (
      cy: Core,
      collection: CollectionModel,
      entityId: string,
      row?: Record<string, unknown>,
    ): string | null => {
      const nodeId = `${collection.typeName}:${entityId}`;
      if (cy.getElementById(nodeId).nonempty()) return nodeId;
      if (cy.nodes().length >= NODE_BUDGET) {
        setNote(
          `Node budget (${NODE_BUDGET}) reached — some neighbors are not shown. ` +
            `Narrow the query to explore further.`,
        );
        return null;
      }
      const labelCol = labelColumn(collection);
      const label =
        (row && labelCol && row[labelCol.field] != null && String(row[labelCol.field])) ||
        entityId.slice(0, 8);
      cy.add({
        group: 'nodes',
        data: {
          id: nodeId,
          entityId,
          collectionId: collection.id,
          typeName: collection.typeName,
          label,
          expanded: false,
        } satisfies GraphNodeData & { id: string },
        style: { 'background-color': colorFor(collection.typeName) },
      });
      setNodeCount(cy.nodes().length);
      return nodeId;
    },
    [],
  );

  const addEdge = useCallback((cy: Core, from: string, to: string, label: string) => {
    const edgeId = `${from}->${to}:${label}`;
    if (cy.getElementById(edgeId).nonempty()) return;
    if (cy.getElementById(from).empty() || cy.getElementById(to).empty()) return;
    cy.add({ group: 'edges', data: { id: edgeId, source: from, target: to, label } });
  }, []);

  /** One-hop expansion: forward reference edges + reverse lookups (fallback tier). */
  const expandNode = useCallback(
    async (node: GraphNodeData) => {
      const cy = cyRef.current;
      const collection = byId.get(node.collectionId);
      if (!cy || !collection) return;
      setBusy(true);
      try {
        // Forward: the entity's own reference fields, from a detail read.
        if (collection.detail) {
          const entity = await source.getEntity(collection.id, node.entityId);
          if (entity) {
            for (const column of collection.detailColumns) {
              if (column.kind !== 'ref' && column.kind !== 'refList') continue;
              const target = column.targetType && byType.get(column.targetType);
              if (!target || !column.targetIdField) continue;
              const raw = entity[column.field];
              const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
              for (const v of values) {
                const targetId = (v as Record<string, unknown>)?.[column.targetIdField];
                if (targetId == null) continue;
                const added = addEntity(cy, target, String(targetId));
                if (added) addEdge(cy, node.id, added, column.label);
              }
            }
          }
        }
        // Reverse: collections whose reference column points at this type
        // (full field set — the table budget truncates reference columns).
        for (const other of collections) {
          for (const column of other.detailColumns) {
            if (column.kind !== 'ref' || column.targetType !== node.typeName) continue;
            const result = await source.listEntities(other.id, {
              page: 1,
              pageSize: EXPAND_LIMIT,
              conditions: [{ field: slotName(column.field), value: node.entityId }],
            });
            if (result.mayHaveMore) {
              setNote(
                `${other.label} referencing this ${node.typeName} exceed ${EXPAND_LIMIT} — ` +
                  `showing the first page only.`,
              );
            }
            for (const row of result.rows) {
              const id = row[other.idColumn ?? ''];
              if (id == null) continue;
              const added = addEntity(cy, other, String(id), row);
              if (added) addEdge(cy, added, node.id, column.label);
            }
          }
        }
        cy.getElementById(node.id).data('expanded', true);
        cy.layout({ name: 'cose', animate: false }).run();
      } finally {
        setBusy(false);
      }
    },
    [addEdge, addEntity, byId, byType, collections, source],
  );

  // Mount cytoscape once.
  useEffect(() => {
    if (!containerRef.current) return;
    // Read synchronously at mount so the first paint is already themed; the
    // effect below keeps it in step with later theme changes.
    const cy = cytoscape({
      container: containerRef.current,
      style: graphStylesheet(readGraphTheme(containerRef.current)),
    });
    cy.on('tap', 'node', (event) => {
      const node = event.target as NodeSingular;
      setSelected(node.data() as GraphNodeData);
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Re-skin the canvas when the theme changes (data-theme flip, OS preference).
  useEffect(() => {
    cyRef.current?.style(graphStylesheet(graphTheme)).update();
  }, [graphTheme]);

  // Seed from the QuerySpec results (or the active collection's first page).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const spec = urlState.querySpec;
        const anchorId = spec?.anchor ?? urlState.collection ?? collections[0]?.id;
        const anchor = anchorId ? byId.get(anchorId) : undefined;
        if (!anchor) return;
        const rows = spec
          ? (await runQuerySpec(source, collections, capabilities, spec, 1, SEED_LIMIT)).rows
          : (
              await source.listEntities(anchor.id, { page: 1, pageSize: SEED_LIMIT })
            ).rows;
        if (cancelled) return;
        for (const row of rows) {
          const id = row[anchor.idColumn ?? ''];
          if (id != null) addEntity(cy, anchor, String(id), row);
        }
        cy.layout({ name: 'grid', animate: false }).run();
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Seed exactly once per mount — the URL spec is fixed while this view is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typesShown = useMemo(() => {
    const cy = cyRef.current;
    const names = new Set<string>();
    cy?.nodes().forEach((n) => {
      names.add(n.data('typeName') as string);
    });
    return [...names];
    // Recompute when the node count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount]);

  return (
    <div className="main-panel query-view" data-testid="graph-view">
      <div className="query-header">
        <h1 className="main-panel-title">Graph</h1>
        <div className="collection-actions">
          <button
            type="button"
            className="detail-link"
            onClick={() => urlState.openQueryBuilder(urlState.querySpec ?? undefined)}
          >
            Back to query
          </button>
          <button type="button" className="detail-link" onClick={urlState.closeQueryViews}>
            Collections
          </button>
        </div>
      </div>
      <p className="query-graph-honesty" role="note">
        Client-side one-hop expansion ({nodeCount}/{NODE_BUDGET} nodes
        {busy ? ', loading…' : ''}) — the endpoint does not advertise a server-side
        `neighbors` traversal yet, so edges appear as you expand nodes, first pages only.
      </p>
      {note && (
        <div className="query-notes" role="status">
          {note}
        </div>
      )}
      <div className="query-graph-wrap">
        <div
          ref={(el) => {
            containerRef.current = el;
            setContainerEl(el);
          }}
          className="query-graph-canvas"
          data-testid="graph-canvas"
        />
        <div className="query-graph-side">
          <div className="query-graph-legend">
            {typesShown.map((t) => (
              <span key={t} className="query-legend-item">
                <span className="query-legend-dot" style={{ backgroundColor: colorFor(t) }} />
                {t}
              </span>
            ))}
          </div>
          {selected ? (
            <div className="query-graph-selected">
              <div className="query-selected-title">
                {selected.typeName} · {selected.label}
              </div>
              <div className="collection-actions">
                <button
                  type="button"
                  className="action-button"
                  disabled={busy}
                  onClick={() => void expandNode(selected)}
                >
                  Expand neighbors
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => urlState.openIn(selected.collectionId, selected.entityId)}
                >
                  Open detail
                </button>
              </div>
            </div>
          ) : (
            <p className="query-graph-hint">Tap a node to expand its neighbors.</p>
          )}
        </div>
      </div>
    </div>
  );
}
