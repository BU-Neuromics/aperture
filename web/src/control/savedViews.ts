import type { FilterValues } from '../data/hippoSource';
import type { ControlPlaneDocument, Visibility } from './store';
import { openPayload, sealPayload } from './store';

/**
 * Saved views (R3.9 → Phase 4): the serializable query-state object,
 * persisted as a named control-plane document. The payload pins the schema
 * fingerprint it was saved under so opening after a schema change is
 * detectable (the L10 pattern, applied to views).
 */
export const SAVED_VIEW_VERSION = 1;

export interface SavedViewState {
  collection: string;
  page: number;
  q?: string;
  filters?: FilterValues;
  /** `<column field>:<asc|desc>` (issue #20) — absent for endpoints/columns without sort. */
  sort?: string;
}

export interface SavedView {
  name: string;
  state: SavedViewState;
  schemaFingerprint: string;
  /**
   * Read-side ownership metadata (ADR-0032 ownership amendment). Absent when
   * constructing a view to save — the store stamps the owner on create, and
   * never accepts one from here. `null` means unowned.
   */
  owner?: string | null;
  visibility?: Visibility;
}

function isFilterValues(value: unknown): value is FilterValues {
  return (
    typeof value === 'object' &&
    value != null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string' || typeof v === 'boolean')
  );
}

function isSavedViewData(data: unknown): data is Omit<SavedView, 'name'> {
  if (typeof data !== 'object' || data == null) return false;
  const d = data as Record<string, unknown>;
  const state = d['state'] as Record<string, unknown> | undefined;
  return (
    typeof d['schemaFingerprint'] === 'string' &&
    typeof state === 'object' &&
    state != null &&
    typeof state['collection'] === 'string' &&
    typeof state['page'] === 'number' &&
    (state['q'] === undefined || typeof state['q'] === 'string') &&
    (state['filters'] === undefined || isFilterValues(state['filters'])) &&
    (state['sort'] === undefined || typeof state['sort'] === 'string')
  );
}

export function sealSavedView(view: SavedView): ControlPlaneDocument {
  return {
    kind: 'savedView',
    name: view.name,
    payload: sealPayload(SAVED_VIEW_VERSION, {
      state: view.state,
      schemaFingerprint: view.schemaFingerprint,
    }),
  };
}

/** Invalid/foreign documents read as null — skipped, never a crash. */
export function openSavedView(document: ControlPlaneDocument): SavedView | null {
  const data = openPayload(document.payload, SAVED_VIEW_VERSION, isSavedViewData);
  if (!data) return null;
  return {
    name: document.name,
    ...data,
    owner: document.owner ?? null,
    visibility: document.visibility,
  };
}
