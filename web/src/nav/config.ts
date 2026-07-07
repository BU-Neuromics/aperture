import { runtimeEnv } from '../config/runtime';
import type { CollectionModel } from '../data/schemaModel';

/**
 * Nav composition config (R3.1) — derive-all + override as config-as-data
 * (Level-1 composition, ADR-0004): the nav still derives every collection
 * from introspection; this document reorders, relabels, hides, and picks the
 * default landing collection. Data, never code.
 *
 * Source of config: a control-plane `config/nav` document (versioned
 * envelope, like `config/workflows`), with the `VITE_NAV` env var as the
 * local fallback. Config referencing unknown collection ids is surfaced, not
 * swallowed (ADR-0029); hidden collections stay deep-linkable — hidden ≠
 * inaccessible.
 */
export interface NavConfig {
  /**
   * Collection ids in display order. Unlisted visible collections follow in
   * derived order. Listing the control-plane document collection here is the
   * explicit opt-in that unhides it.
   */
  order?: string[];
  /** Collection id → replacement label. */
  labels?: Record<string, string>;
  /** Collection ids hidden from the nav (deep links still resolve). */
  hide?: string[];
  /** The collection shown when the URL names none. */
  defaultCollection?: string;
}

/** Without config the nav is pure derive-all (doc collection excepted). */
export const DEFAULT_NAV_CONFIG: NavConfig = {};

function fail(message: string): never {
  throw new Error(message);
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) fail(`nav config ${name} must be an array of collection ids`);
  return value.map((entry, i) => {
    if (typeof entry !== 'string' || entry === '') fail(`nav config ${name}[${i}] must be a collection id`);
    return entry;
  });
}

export function parseNavConfig(raw: unknown): NavConfig {
  if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
    fail('nav config must be a JSON object');
  }
  const c = raw as Record<string, unknown>;
  const config: NavConfig = {};
  if (c['order'] !== undefined) {
    config.order = stringArray(c['order'], 'order');
    if (new Set(config.order).size !== config.order.length) fail('nav config order has duplicate ids');
  }
  if (c['hide'] !== undefined) config.hide = stringArray(c['hide'], 'hide');
  if (c['labels'] !== undefined) {
    const labels = c['labels'];
    if (typeof labels !== 'object' || labels == null || Array.isArray(labels)) {
      fail('nav config labels must be an object of id → label');
    }
    for (const [id, label] of Object.entries(labels)) {
      if (typeof label !== 'string' || label === '') fail(`nav config labels.${id} must be a label`);
    }
    config.labels = labels as Record<string, string>;
  }
  if (c['defaultCollection'] !== undefined) {
    if (typeof c['defaultCollection'] !== 'string' || c['defaultCollection'] === '') {
      fail('nav config defaultCollection must be a collection id');
    }
    config.defaultCollection = c['defaultCollection'];
  }
  return config;
}

export interface ResolvedNavConfig {
  config: NavConfig;
  /** A config parse problem — surfaced, never swallowed (ADR-0029). */
  error?: string;
}

export function resolveNavConfig(env: Record<string, unknown> = runtimeEnv()): ResolvedNavConfig {
  const raw = env['VITE_NAV'];
  if (typeof raw !== 'string' || raw.trim() === '') return { config: DEFAULT_NAV_CONFIG };
  try {
    return { config: parseNavConfig(JSON.parse(raw)) };
  } catch (error) {
    return {
      config: DEFAULT_NAV_CONFIG,
      error: `VITE_NAV is invalid: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * The nav's view of the derived collections after config is applied. `all`
 * keeps every collection (relabeled) so deep links to hidden collections
 * still resolve; `visible` is what the nav lists.
 */
export interface NavView {
  all: CollectionModel[];
  visible: CollectionModel[];
  /** The collection to show when the URL names none. */
  defaultId: string | null;
  /** Config problems — surfaced, never swallowed (ADR-0029). */
  error?: string;
}

export function buildNavView(
  collections: CollectionModel[],
  config: NavConfig,
  documentCollectionId?: string,
  configError?: string,
): NavView {
  const known = new Set(collections.map((c) => c.id));
  const unknown = new Set<string>();
  const checkKnown = (id: string) => {
    if (!known.has(id)) unknown.add(id);
    return known.has(id);
  };

  const all = collections.map((c) => {
    const label = config.labels?.[c.id];
    return label != null && checkKnown(c.id) ? { ...c, label } : c;
  });
  for (const id of Object.keys(config.labels ?? {})) checkKnown(id);

  const order = (config.order ?? []).filter(checkKnown);
  const hidden = new Set((config.hide ?? []).filter(checkKnown));
  // Aperture's own document storage is not portal data: hidden unless the
  // config lists it explicitly (deep links still resolve either way).
  if (documentCollectionId != null && !order.includes(documentCollectionId)) {
    hidden.add(documentCollectionId);
  }

  const listed = new Set(order);
  const visible = [
    ...order.map((id) => all.find((c) => c.id === id)!),
    ...all.filter((c) => !listed.has(c.id)),
  ].filter((c) => !hidden.has(c.id));

  const defaultId =
    config.defaultCollection != null && checkKnown(config.defaultCollection)
      ? config.defaultCollection
      : (visible[0]?.id ?? all[0]?.id ?? null);

  const problems = [
    configError,
    unknown.size > 0
      ? `The nav config references unknown collections: ${[...unknown].join(', ')} — those entries are ignored.`
      : undefined,
  ].filter(Boolean);

  return { all, visible, defaultId, error: problems.length > 0 ? problems.join(' ') : undefined };
}

/** The one active-collection resolution rule, shared by nav, main, and facets. */
export function activeCollection(view: NavView, collectionId: string | null): CollectionModel | undefined {
  if (collectionId != null) {
    const linked = view.all.find((c) => c.id === collectionId);
    if (linked) return linked;
  }
  return view.all.find((c) => c.id === view.defaultId) ?? view.visible[0] ?? view.all[0];
}
