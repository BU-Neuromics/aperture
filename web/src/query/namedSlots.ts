/**
 * Which fields a conversational turn named.
 *
 * The planner names fields in prose; the wire contract carries no structured list of them
 * (Mosaic's `ConversationTurn` has no such field, and adding one is a three-repo change).
 * So they are recovered by matching the message against the slot names the schema actually
 * has — the same technique Reel's discovery grader uses, including the trap it found the
 * hard way.
 *
 * **This is presentational only.** A miss fails to emphasise a row; it never withholds
 * one, because the panel lists every field regardless.
 */

/**
 * Whether a bare mention of this name can only mean the field.
 *
 * `history_of_rhi` in prose is unambiguous. `notes`, `name` and `donor` are not — they are
 * ordinary English words as well as slot names, and crediting the bare word scored "the
 * donor's free-text notes" as naming two fields. An underscore is a good proxy for "the
 * schema author wrote a compound identifier", and being wrong here is cheap: a distinctive
 * name missed in prose is still credited from the spec.
 */
function isDistinctive(slot: string): boolean {
  return slot.includes('_');
}

/** How a single-word slot has to appear before it counts as a field reference. */
const REFERENCE_FORMS = ['`{}`', '**{}**', "'{}'", '"{}"'];

/** Slot names a message mentions, matched against the names the schema really has. */
export function slotsInMessage(message: string, known: readonly string[]): Set<string> {
  const found = new Set<string>();
  const lower = (message || '').toLowerCase();
  // Longest first, so mentioning `cause_of_death` does not also credit a `cause`.
  for (const slot of [...known].sort((a, b) => b.length - a.length)) {
    const spoken = slot.replace(/_/g, ' ').toLowerCase();
    if (isDistinctive(slot)) {
      // Either spelling: "storage condition" communicates the data element exactly as well
      // as `storage_condition`, and the goal is that the user learns which element to use —
      // not that the answer quotes an identifier.
      if (lower.includes(slot.toLowerCase()) || lower.includes(spoken)) found.add(slot);
    } else if (REFERENCE_FORMS.some((form) => message.includes(form.replace('{}', slot)))) {
      found.add(slot);
    }
  }
  return found;
}

/** Slot names a QuerySpec filters on, including inside related criteria and sort. */
export function slotsInSpec(spec: unknown): Set<string> {
  const found = new Set<string>();
  if (!spec || typeof spec !== 'object') return found;
  const s = spec as Record<string, unknown>;
  for (const raw of (s.criteria as unknown[]) ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.slot === 'string') found.add(c.slot);
    if (typeof c.edge === 'string') found.add(c.edge);
    for (const rawSub of (c.criteria as unknown[]) ?? []) {
      const sub = rawSub as Record<string, unknown>;
      if (sub && typeof sub.slot === 'string') found.add(sub.slot);
    }
  }
  for (const rawSort of (s.sort as unknown[]) ?? []) {
    const so = rawSort as Record<string, unknown>;
    if (so && typeof so.slot === 'string') found.add(so.slot);
  }
  return found;
}

/**
 * Everything the latest turn named — by filtering on it, or by saying it.
 *
 * Both count: a proposal that filters on the right field has told the user what to include
 * at least as clearly as prose naming it.
 */
export function namedSlots(
  message: string | undefined,
  spec: unknown,
  known: readonly string[],
): Set<string> {
  const named = slotsInMessage(message ?? '', known);
  for (const slot of slotsInSpec(spec)) named.add(slot);
  return named;
}

/**
 * Which collection the turn was about, when that is not the one being anchored.
 *
 * Asking about toxicology while the builder is anchored on `Aliquot` used to produce a
 * correct answer beside a panel listing aliquot fields — the page answered the question
 * and then showed something else. Found by driving the page at fifteen collections, where
 * the alphabetically-first default made it the normal case rather than an edge one.
 *
 * Scored on slots belonging to exactly ONE collection. `name`, `id`, `notes` and
 * `is_available` are carried by nearly everything, so crediting them would score every
 * collection alike and pick whichever came first — the same arbitrariness this exists to
 * remove. A shared name is evidence of nothing.
 *
 * **Presentational only, and deliberately not automatic.** It changes which fields are
 * displayed; it never edits the draft, never writes the URL and never runs anything. The
 * caller offers the user an explicit action to adopt it, so discovery leads into query
 * building by a gesture rather than by surprise (ADR-0039).
 */
export function subjectCollection<T extends { typeName: string; detailColumns: readonly { field: string; slot?: string }[] }>(
  collections: readonly T[],
  named: ReadonlySet<string>,
  anchor: T | undefined,
): T | undefined {
  if (named.size === 0) return anchor;

  // How many collections carry each slot name, so the shared ones can be discounted.
  const owners = new Map<string, number>();
  for (const c of collections) {
    for (const name of new Set(c.detailColumns.map((col) => col.slot ?? col.field))) {
      owners.set(name, (owners.get(name) ?? 0) + 1);
    }
  }

  let best: T | undefined;
  let bestScore = 0;
  for (const c of collections) {
    let score = 0;
    for (const col of c.detailColumns) {
      const name = col.slot ?? col.field;
      if (owners.get(name) === 1 && (named.has(name) || named.has(col.field))) score += 1;
    }
    // Ties go to the anchor: a tie is not evidence to move the reader's attention.
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : anchor;
}
