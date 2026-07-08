import type { FilterValues } from '../data/hippoSource';
import type { ControlPlaneDocument } from './store';
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
}

export interface SavedView {
  name: string;
  state: SavedViewState;
  schemaFingerprint: string;
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
    (state['filters'] === undefined || isFilterValues(state['filters']))
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
  return data ? { name: document.name, ...data } : null;
}
