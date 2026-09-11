import { useEffect, useRef, useState } from 'react';
import { useCapabilities, useDataSource } from '../data/DataSourceContext';
import type { ConversationTurn } from '../data/conversation';
import { currentQuerySpec } from '../data/conversation';
import { useCollectionUrlState } from '../features/collections/urlState';
import type { QuerySpec } from './querySpec';
import { validateQuerySpecShape } from './querySpec';
import './query.css';

/**
 * The conversational query panel (ADR-0039): describe a query in prose, watch
 * the `QuerySpec` assemble, hand it to the builder to run.
 *
 * Capability-gated and slot-resident. It renders only while a cross-class query
 * view is open — the same condition under which `FacetPanel` vacates the
 * inspector column — so the two never contend for the slot, and only when the
 * endpoint advertises the conversational mutation, so an endpoint without one
 * shows no chat affordance at all (ADR-0029).
 *
 * Aperture holds no conversation state beyond this component: the server owns
 * the turn list and returns it whole on every call (editing an earlier turn
 * recomputes the later ones server-side), so `turns` is always replaced, never
 * merged. A refresh loses the transcript by design — the `QuerySpec` it
 * produced survives in the URL, which is the artifact that matters.
 */
export function ChatPanel() {
  const state = useDataSource();
  const capabilities = useCapabilities();
  const urlState = useCollectionUrlState();

  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [suspended, setSuspended] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<ConversationTurn | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view: the transcript outgrows the column quickly,
  // and a reply the user never sees reads as a hang.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [turns, pending]);

  if (state.status !== 'ready') return null;
  if (urlState.view !== 'query') return null;
  if (!capabilities.conversationalQuery) return null;

  const source = state.source;
  const spec = currentQuerySpec(turns);

  const send = async () => {
    const utterance = draft.trim();
    if (utterance === '' || pending) return;
    setPending(true);
    setError(null);
    try {
      // Turns are strictly ordered and the server derives the draft from the
      // whole list, so exactly one is ever in flight (the input is disabled
      // meanwhile) and the response's list replaces ours wholesale.
      const response = await source.converse({
        utterance,
        querySpec: spec,
        turns,
        editTurnId: editing?.id ?? null,
      });
      setTurns(response.turns);
      setSuspended(response.suspendedTurnIds);
      setDraft('');
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const beginEdit = (turn: ConversationTurn) => {
    setEditing(turn);
    setDraft(turn.utterance);
    inputRef.current?.focus();
  };

  return (
    <div className="chat-panel" data-testid="chat-panel">
      <div className="chat-header">
        <span className="chat-title">Describe the query</span>
        {turns.length > 0 && (
          <button
            type="button"
            className="facet-clear-all"
            onClick={() => {
              setTurns([]);
              setSuspended([]);
              setEditing(null);
              setError(null);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="chat-body" ref={bodyRef}>
        {turns.length === 0 && !pending && (
          <p className="chat-empty">
            Ask in plain language — “hippocampus tissue samples from donors over 60”. Each reply
            proposes a QuerySpec you can inspect and run.
          </p>
        )}

        {turns.map((turn, i) => (
          <TurnView
            key={turn.id}
            turn={turn}
            index={i + 1}
            suspended={suspended.includes(turn.id)}
            editing={editing?.id === turn.id}
            onEdit={() => beginEdit(turn)}
          />
        ))}

        {pending && (
          <div className="chat-turn chat-pending" role="status">
            <span className="chat-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="chat-pending-label">Planning…</span>
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {spec != null && <SpecView spec={spec} expanded={showSpec} onToggle={() => setShowSpec(!showSpec)} />}

      <div className="chat-compose">
        {/* The transcript scrolls, so an invalidated turn can sit out of view —
            a standing count keeps it glanceable without relocating the turn
            away from where the break happened (ADR-0025). */}
        {suspended.length > 0 && (
          <button
            type="button"
            className="chat-suspended-banner"
            onClick={() => {
              const first = turns.find((t) => suspended.includes(t.id));
              if (first) beginEdit(first);
            }}
          >
            {suspended.length} turn{suspended.length > 1 ? 's' : ''} suspended by an edit — re-word
            to bring {suspended.length > 1 ? 'them' : 'it'} back
          </button>
        )}
        {editing && (
          <div className="chat-editing-note">
            Rewriting turn {turns.findIndex((t) => t.id === editing.id) + 1}; later turns recompute.{' '}
            <button type="button" className="chat-link" onClick={() => { setEditing(null); setDraft(''); }}>
              Cancel
            </button>
          </div>
        )}
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={2}
          value={draft}
          disabled={pending}
          placeholder={pending ? 'Waiting for the last turn…' : 'Describe what you want…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="query-add chat-send"
          disabled={pending || draft.trim() === ''}
          onClick={() => void send()}
        >
          {editing ? 'Redo turn' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function TurnView({
  turn,
  index,
  suspended,
  editing,
  onEdit,
}: {
  turn: ConversationTurn;
  index: number;
  suspended: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  const status = suspended ? 'suspended' : turn.status;
  return (
    <div className={`chat-turn chat-turn-${status}`} data-testid="chat-turn">
      <div className="chat-utterance">
        <span className="chat-turn-index">{index}</span>
        <span className="chat-utterance-text">{turn.utterance}</span>
        <button type="button" className="chat-link" onClick={onEdit} disabled={editing}>
          {editing ? 'editing' : 'edit'}
        </button>
      </div>
      <div className="chat-message">{turn.message}</div>
      {status === 'suspended' && (
        <div className="chat-suspended-note">
          An earlier edit invalidated this turn — it was flagged, not dropped. Re-word it to bring
          it back.
        </div>
      )}
      {status === 'clarification' && <div className="chat-status-note">Needs an answer to go on.</div>}
    </div>
  );
}

/**
 * The spec the conversation has built, and the handoff into the builder.
 *
 * The handoff degrades honestly rather than guessing: the planning service
 * names its anchor by LinkML type (`Sample`) while Aperture's `QuerySpec`
 * currently carries collection ids (`samples`) and derived `fwd:`/`rev:` edge
 * keys. Until that spelling is canonicalized (ADR-0039's sequenced consequence)
 * a spec whose anchor doesn't resolve is shown but not applied — running a spec
 * whose anchor silently didn't match would execute the wrong query.
 */
function SpecView({
  spec,
  expanded,
  onToggle,
}: {
  spec: unknown;
  expanded: boolean;
  onToggle: () => void;
}) {
  const state = useDataSource();
  const urlState = useCollectionUrlState();
  const collections = state.status === 'ready' ? state.source.collections : [];

  const shaped = validateQuerySpecShape(spec) as QuerySpec | null;
  const anchor = shaped ? collections.find((c) => c.id === shaped.anchor) : undefined;

  return (
    <div className="chat-spec">
      <div className="chat-spec-header">
        <button type="button" className="chat-link" onClick={onToggle}>
          {expanded ? 'Hide' : 'Show'} QuerySpec
        </button>
        <button
          type="button"
          className="query-add"
          disabled={!shaped || !anchor}
          onClick={() => shaped && urlState.setQuerySpec(shaped)}
          title={anchor ? 'Load this spec into the builder' : undefined}
        >
          Use in builder
        </button>
      </div>
      {expanded && <pre className="chat-spec-json">{JSON.stringify(spec, null, 2)}</pre>}
      {shaped && !anchor && (
        <p className="chat-spec-note">
          Anchor “{String(shaped.anchor)}” is a schema type name; this builder still addresses
          collections by id. Canonicalizing the two spellings is sequenced work (ADR-0039) — until
          it lands the spec is shown but not run.
        </p>
      )}
      {!shaped && <p className="chat-spec-note">The proposed spec isn’t a shape this build reads.</p>}
    </div>
  );
}
