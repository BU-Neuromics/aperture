import { useEffect, useMemo, useRef, useState } from 'react';
import { useCapabilities, useDataSource } from '../data/DataSourceContext';
import type { ConversationTurn } from '../data/conversation';
import { currentQuerySpec } from '../data/conversation';
import type { CollectionModel } from '../data/schemaModel';
import { useCollectionUrlState } from '../features/collections/urlState';
import type { QuerySpec } from './querySpec';
import { canonicalizeQuerySpec, validateQuerySpecShape } from './querySpec';
import { SpecProse } from './specProse';
import './query.css';

/**
 * The conversational query panel (ADR-0039): describe a query in prose, watch
 * the `QuerySpec` assemble, hand it to the builder to run.
 *
 * Capability-gated and slot-resident. It renders only in the query context —
 * where the `queryWorkbench` layout gives it a composer column beside the
 * artifact it is building — and only when the endpoint advertises the
 * conversational mutation, so an endpoint without one shows no chat
 * affordance at all (ADR-0029).
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
  const [showJson, setShowJson] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const collections = state.status === 'ready' ? state.source.collections : [];
  const starters = useMemo(() => starterPrompts(collections), [collections]);

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

  const send = async (text?: string) => {
    const utterance = (text ?? draft).trim();
    if (utterance === '' || pending) return;
    setPending(true);
    setError(null);
    try {
      // Turns are strictly ordered and the server derives the draft from the
      // whole list, so exactly one is ever in flight (the composer is disabled
      // meanwhile) and the response's list replaces ours wholesale.
      const response = await source.converse({
        utterance,
        querySpec: spec,
        turns,
        editTurnId: editing?.id ?? null,
      });
      // An authoritative list replaces ours wholesale (the server recomputes
      // downstream turns after an edit). Its absence means append, not reset:
      // the boundary returns a bare error turn carrying no list when a
      // candidate spec fails re-validation, and its own message says "Nothing
      // was applied" — so the prior transcript is still current and the error
      // is one more turn on the end. Collapsing to the error alone would lose
      // the user's conversation to a server-side rejection (ADR-0025).
      setTurns(response.turns ?? [...turns, response.turn]);
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

  const reset = () => {
    setTurns([]);
    setSuspended([]);
    setEditing(null);
    setError(null);
    setDraft('');
  };

  return (
    <section className="chat" data-testid="chat-panel" aria-label="Query composer">
      <header className="chat-head">
        <div className="chat-head-titles">
          <span className="chat-eyebrow">Composer</span>
          <h2 className="chat-title">Describe the query</h2>
        </div>
        {turns.length > 0 && (
          <button type="button" className="chat-ghost" onClick={reset}>
            Clear
          </button>
        )}
      </header>

      <div className="chat-body" ref={bodyRef}>
        {turns.length === 0 && !pending ? (
          <div className="chat-intro">
            <p className="chat-intro-lead">
              Ask in plain language. Each reply proposes a query you can read, refine, and run —
              the wording stays editable, so you can go back and change any turn.
            </p>
            {starters.length > 0 && (
              <div className="chat-starters">
                <span className="chat-eyebrow">Starting points</span>
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chat-starter"
                    // Fills the composer rather than sending: these are shaped
                    // from the live schema, but the planner still has to agree,
                    // and a chip that fires blind would promise that it will.
                    onClick={() => {
                      setDraft(s);
                      inputRef.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          turns.map((turn, i) => (
            <TurnView
              key={turn.id}
              turn={turn}
              index={i + 1}
              suspended={suspended.includes(turn.id)}
              editing={editing?.id === turn.id}
              onEdit={() => beginEdit(turn)}
            />
          ))
        )}

        {pending && (
          <div className="chat-reply chat-reply-pending" role="status">
            <span className="chat-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="chat-pending-label">Planning</span>
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {spec != null && (
        <SpecPane
          spec={spec}
          collections={collections}
          showJson={showJson}
          onToggleJson={() => setShowJson(!showJson)}
        />
      )}

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
            <span className="chat-dot chat-dot-warning" aria-hidden="true" />
            {suspended.length} turn{suspended.length > 1 ? 's' : ''} need
            {suspended.length > 1 ? '' : 's'} re-wording after your edit
          </button>
        )}
        {editing && (
          <div className="chat-editing-note">
            <span className="chat-dot chat-dot-warning" aria-hidden="true" />
            Rewriting turn {turns.findIndex((t) => t.id === editing.id) + 1} — later turns
            recompute.{' '}
            <button
              type="button"
              className="chat-inline-link"
              onClick={() => {
                setEditing(null);
                setDraft('');
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <div className="chat-field">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={2}
            value={draft}
            disabled={pending}
            aria-label="Describe the query"
            placeholder={pending ? 'Waiting for the last turn…' : 'Describe what you want…'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="chat-field-foot">
            <span className="chat-hint">Enter to send · Shift+Enter for a new line</span>
            <button
              type="button"
              className="chat-send"
              disabled={pending || draft.trim() === ''}
              onClick={() => void send()}
            >
              {editing ? 'Redo turn' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const STATUS_LABELS: Record<string, string> = {
  proposal: 'proposed',
  clarification: 'needs an answer',
  suspended: 'needs re-wording',
};

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
    <article className="chat-turn" data-testid="chat-turn" data-status={status}>
      <div className="chat-said">
        <p className="chat-bubble">{turn.utterance}</p>
        <button
          type="button"
          className="chat-edit"
          onClick={onEdit}
          disabled={editing}
          aria-label={`Rewrite turn ${index}`}
        >
          {editing ? 'editing…' : 'rewrite'}
        </button>
      </div>
      <div className={`chat-reply chat-reply-${status}`}>
        <p className="chat-message">{turn.message}</p>
        <div className="chat-meta">
          <span className={`chat-dot chat-dot-${status}`} aria-hidden="true" />
          <span className="chat-status">{STATUS_LABELS[status] ?? status}</span>
          <span className="chat-turn-index">turn {index}</span>
        </div>
        {status === 'suspended' && (
          <p className="chat-suspended-note">
            An earlier edit invalidated this — flagged, not dropped. Re-word it to bring it back.
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * The spec the conversation has built, read back in the builder's own words.
 *
 * Since the v2 canonicalization the artifact is LinkML-spelled end to end, so
 * a proposal naming `anchor: "Sample"` and `edge: "donor"` resolves directly
 * against the introspected schema — no translation, and the handoff runs.
 *
 * The degradation stays for the case that is still real: an anchor this
 * endpoint exposes no type for. Running a spec whose anchor silently didn't
 * match would execute a different query than the words above it describe
 * (ADR-0029).
 */
function SpecPane({
  spec,
  collections,
  showJson,
  onToggleJson,
}: {
  spec: unknown;
  collections: readonly CollectionModel[];
  showJson: boolean;
  onToggleJson: () => void;
}) {
  const urlState = useCollectionUrlState();
  // A planning service emits v2 vocabulary already; `canonicalizeQuerySpec` is here
  // for the v1 case (a spec replayed from an older transcript or endpoint).
  const parsed = validateQuerySpecShape(spec) as QuerySpec | null;
  const shaped = parsed ? canonicalizeQuerySpec(parsed, [...collections]) : null;

  return (
    <section className="chat-spec" aria-label="Proposed query">
      <header className="chat-spec-head">
        <span className="chat-eyebrow">Proposed query</span>
        <button type="button" className="chat-ghost" onClick={onToggleJson}>
          {showJson ? 'Hide JSON' : 'JSON'}
        </button>
      </header>

      {shaped ? (
        <SpecProse spec={shaped} collections={collections} />
      ) : (
        <p className="chat-spec-note">The proposed spec isn’t a shape this build reads.</p>
      )}

      {showJson && <pre className="chat-spec-json">{JSON.stringify(spec, null, 2)}</pre>}

      <div className="chat-spec-foot">
        <button
          type="button"
          className="chat-primary"
          disabled={!shaped}
          onClick={() => shaped && urlState.setQuerySpec(shaped)}
        >
          Use in builder
        </button>
        {/* One branch, because canonicalization succeeding means the anchor
            resolves by construction — it is built from a collection that was
            just found. `null` is the only failure, and it means the anchor
            matched neither a type nor a collection. */}
        {parsed && !shaped && (
          <p className="chat-spec-note">
            <span className="chat-dot chat-dot-warning" aria-hidden="true" />
            This endpoint exposes no type <code>{String(parsed.anchor)}</code> — shown, but not
            run, since running it would query something other than what the words above describe.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Opening suggestions, shaped from the live schema rather than written in
 * source — Aperture carries no domain nouns (ADR-0002), so these have to come
 * from whatever the endpoint exposes. They fill the composer; they do not
 * promise the planner will agree.
 */
function starterPrompts(collections: readonly CollectionModel[]): string[] {
  const prompts: string[] = [];
  for (const collection of collections.slice(0, 3)) {
    const label = collection.label.toLowerCase();
    const facet = collection.detailColumns.find(
      (c) => c.kind === 'enum' && (c.enumValues?.length ?? 0) > 0,
    );
    if (facet?.enumValues?.[0]) {
      prompts.push(`${label} where ${facet.label.toLowerCase()} is ${facet.enumValues[0]}`);
    } else if (prompts.length === 0) {
      prompts.push(`all ${label}`);
    }
    if (prompts.length === 2) break;
  }
  return prompts;
}
