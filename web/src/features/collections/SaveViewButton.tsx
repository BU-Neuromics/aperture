import { useState } from 'react';
import { useSavedViews } from '../../control/SavedViewsContext';
import type { HippoSource } from '../../data/hippoSource';
import { schemaFingerprint } from '../../workflows/engine';
import { useCollectionUrlState } from './urlState';

/**
 * Saves the current query-state as a named view (Phase 4). Same name
 * overwrites — the store's (kind, name) upsert rule, said out loud.
 */
export function SaveViewButton({
  source,
  collectionId,
}: {
  source: HippoSource;
  collectionId: string;
}) {
  const { save, views } = useSavedViews();
  const { page, search, filters } = useCollectionUrlState();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setBusy(true);
    setNote(null);
    try {
      await save({
        name: trimmed,
        state: {
          collection: collectionId,
          page,
          q: search || undefined,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        },
        schemaFingerprint: schemaFingerprint(source),
      });
      setOpen(false);
      setName('');
    } catch (error) {
      setNote(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <>
        {note && (
          <span className="export-note" role="status">
            {note}
          </span>
        )}
        <button type="button" className="action-button" onClick={() => setOpen(true)}>
          Save view
        </button>
      </>
    );
  }

  const overwriting = views.some((v) => v.name === name.trim());
  return (
    <div className="save-view-form">
      <input
        type="text"
        className="form-input save-view-input"
        placeholder="View name…"
        aria-label="View name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="button"
        className="action-button action-primary"
        disabled={busy || name.trim() === ''}
        onClick={() => void submit()}
      >
        {busy ? 'Saving…' : overwriting ? 'Overwrite' : 'Save'}
      </button>
      <button type="button" className="action-button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
