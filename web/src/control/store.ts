import type { HippoSource } from '../data/hippoSource';
import type { CollectionModel } from '../data/schemaModel';

/**
 * The control-plane store (Phase 4; ADR-0017, N5.4): Aperture's OWN state —
 * saved views, workflow drafts, config-as-data — lives in a control-plane
 * document store, DISTINCT from the browsed data plane. The MVP reference
 * impl is LinkML-on-Hippo: documents are ordinary entities on a (co-located)
 * Hippo whose schema carries an Aperture document type, reached through the
 * same Layer-D machinery as everything else. When no such type is advertised,
 * persistence degrades honestly to this browser's localStorage — labeled as
 * such, never silently (ADR-0029).
 */
export type DocumentKind = 'savedView' | 'workflowDraft' | 'config';

export interface ControlPlaneDocument {
  kind: DocumentKind;
  /** Unique per kind (e.g. the view name, the workflow id). */
  name: string;
  /** The versioned payload envelope, JSON-serialized. */
  payload: string;
}

/**
 * Every payload travels inside a versioned envelope; readers skip documents
 * they can't validate (structural validation + versioning, ADR-0003/0004).
 */
export interface PayloadEnvelope<T> {
  v: number;
  data: T;
}

export function sealPayload<T>(v: number, data: T): string {
  return JSON.stringify({ v, data } satisfies PayloadEnvelope<T>);
}

export function openPayload<T>(
  payload: string,
  v: number,
  validate: (data: unknown) => data is T,
): T | null {
  try {
    const parsed = JSON.parse(payload) as PayloadEnvelope<unknown>;
    if (typeof parsed !== 'object' || parsed == null || parsed.v !== v) return null;
    return validate(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface ControlPlaneStore {
  /** Where documents live — surfaced in the UI so persistence scope is legible. */
  backend: 'hippo' | 'local';
  list(kind: DocumentKind): Promise<ControlPlaneDocument[]>;
  get(kind: DocumentKind, name: string): Promise<ControlPlaneDocument | null>;
  /** Upsert by (kind, name). */
  put(document: ControlPlaneDocument): Promise<void>;
  remove(kind: DocumentKind, name: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* LinkML-on-Hippo store                                               */
/* ------------------------------------------------------------------ */

/**
 * The document collection is recognized structurally, like every other
 * capability: an entity type with text-ish `kind`, `name`, and `payload`
 * fields, an equality filter over `kind` and `name`, and create + update
 * mutations. Anything less → no Hippo control plane (fallback applies).
 */
export function findDocumentCollection(source: HippoSource): CollectionModel | undefined {
  return source.collections.find((c) => {
    const fields = new Map(c.detailColumns.map((col) => [col.field, col.kind]));
    const textish = (f: string) =>
      fields.get(f) === 'text' || fields.get(f) === 'id' || fields.get(f) === 'enum';
    if (!textish('kind') || !textish('name') || !textish('payload')) return false;
    if (!c.filterFields.includes('kind') || !c.filterFields.includes('name')) return false;
    if (!c.write.create || !c.write.update) return false;
    return true;
  });
}

export function createHippoStore(
  source: HippoSource,
  collection: CollectionModel,
): ControlPlaneStore {
  const idField = collection.idColumn ?? collection.columns[0].field;

  const fetchByName = async (kind: DocumentKind, name: string) => {
    const page = await source.listEntities(collection.id, {
      page: 1,
      pageSize: 1,
      filters: { kind, name },
      fresh: true, // read-after-write correctness over the document cache
    });
    return page.rows[0] ?? null;
  };

  const toDocument = (row: Record<string, unknown>): ControlPlaneDocument => ({
    kind: String(row['kind']) as DocumentKind,
    name: String(row['name']),
    payload: String(row['payload'] ?? ''),
  });

  return {
    backend: 'hippo',

    async list(kind) {
      const rows: Record<string, unknown>[] = [];
      let page = 1;
      for (;;) {
        const result = await source.listEntities(collection.id, {
          page,
          pageSize: 100,
          filters: { kind },
          fresh: true, // read-after-write correctness over the document cache
        });
        rows.push(...result.rows);
        if (!result.mayHaveMore || page >= 10) break; // 1k docs is plenty for MVP
        page += 1;
      }
      return rows.map(toDocument).filter(isLiveDocument);
    },

    async get(kind, name) {
      const row = await fetchByName(kind, name);
      if (row == null) return null;
      const document = toDocument(row);
      return isLiveDocument(document) ? document : null;
    },

    async put(document) {
      const existing = await fetchByName(document.kind, document.name);
      if (existing) {
        await source.updateEntity(collection.id, String(existing[idField]), {
          payload: document.payload,
        });
      } else {
        await source.createEntity(collection.id, {
          kind: document.kind,
          name: document.name,
          payload: document.payload,
        });
      }
    },

    async remove(kind, name) {
      // No hard delete on Hippo (W4.4) — clearing the payload retires the
      // document; readers treat an empty payload as absent.
      const existing = await fetchByName(kind, name);
      if (existing) {
        await source.updateEntity(collection.id, String(existing[idField]), { payload: '' });
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Local fallback                                                      */
/* ------------------------------------------------------------------ */

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const localKey = (kind: DocumentKind, name: string) => `aperture:cp:${kind}:${name}`;

export function createLocalStore(storage: StorageLike = window.localStorage): ControlPlaneStore {
  return {
    backend: 'local',

    async list(kind) {
      const prefix = `aperture:cp:${kind}:`;
      const documents: ControlPlaneDocument[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key == null || !key.startsWith(prefix)) continue;
        const payload = storage.getItem(key);
        if (payload == null || payload === '') continue;
        documents.push({ kind, name: key.slice(prefix.length), payload });
      }
      return documents;
    },

    async get(kind, name) {
      const payload = storage.getItem(localKey(kind, name));
      return payload == null || payload === '' ? null : { kind, name, payload };
    },

    async put(document) {
      storage.setItem(localKey(document.kind, document.name), document.payload);
    },

    async remove(kind, name) {
      storage.removeItem(localKey(kind, name));
    },
  };
}

/** Documents with retired/empty payloads read as absent everywhere. */
export function isLiveDocument(document: { payload: string }): boolean {
  return document.payload !== '';
}
