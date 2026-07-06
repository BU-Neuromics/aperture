import type { WorkflowRunState } from './engine';

/**
 * Resumable drafts (W4.8/L10): the run state persists as an INERT draft —
 * nothing enters the domain graph until the atomic commit. Interim home is
 * localStorage; Phase 4 moves drafts into the control-plane store
 * (ADR-0017). The draft pins workflow + schema version via the fields inside
 * WorkflowRunState, so resume can detect drift instead of silently breaking.
 */
export interface WorkflowDraft {
  state: WorkflowRunState;
  savedAt: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const draftKey = (workflowId: string) => `aperture:workflow-draft:${workflowId}`;

export function saveDraft(
  state: WorkflowRunState,
  storage: StorageLike = window.localStorage,
): void {
  const draft: WorkflowDraft = { state, savedAt: new Date().toISOString() };
  storage.setItem(draftKey(state.workflowId), JSON.stringify(draft));
}

export function loadDraft(
  workflowId: string,
  storage: StorageLike = window.localStorage,
): WorkflowDraft | null {
  const raw = storage.getItem(draftKey(workflowId));
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as WorkflowDraft;
    if (typeof parsed !== 'object' || parsed == null) return null;
    const state = parsed.state;
    if (
      typeof state?.workflowId !== 'string' ||
      typeof state.workflowVersion !== 'string' ||
      typeof state.schemaFingerprint !== 'string' ||
      typeof state.currentStep !== 'number' ||
      typeof state.staged !== 'object'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null; // corrupt draft — treat as absent, never crash resume
  }
}

export function clearDraft(
  workflowId: string,
  storage: StorageLike = window.localStorage,
): void {
  storage.removeItem(draftKey(workflowId));
}
