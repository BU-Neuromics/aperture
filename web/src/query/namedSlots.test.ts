/**
 * Recovering which fields a turn named, from prose.
 *
 * The rules here are not arbitrary — each one exists because the equivalent grader in Reel
 * got it wrong first, against live model output.
 */
import { describe, it, expect } from 'vitest';
import { namedSlots, slotsInMessage, slotsInSpec } from './namedSlots';

const KNOWN = ['history_of_rhi', 'cause_of_death', 'storage_condition', 'notes', 'name', 'donor', 'cohort'];

describe('slotsInMessage', () => {
  it('credits a compound name mentioned bare', () => {
    expect(slotsInMessage('history_of_rhi records it.', KNOWN)).toContain('history_of_rhi');
  });

  it('credits the spoken form of a compound name', () => {
    // "storage condition" communicates the data element exactly as well as the identifier.
    // Scoring only the underscored spelling marked correct, readable answers wrong.
    expect(slotsInMessage('We record the storage condition.', KNOWN)).toContain('storage_condition');
  });

  it('ignores case', () => {
    expect(slotsInMessage('Cause Of Death is free text.', KNOWN)).toContain('cause_of_death');
  });

  it('does NOT credit a bare common word', () => {
    // `notes` and `donor` are ordinary English as well as slot names. Crediting the bare
    // word scored "the donor's free-text notes" as naming two fields.
    const found = slotsInMessage('Nothing models that; the donor has free-text notes.', KNOWN);
    expect(found.has('notes')).toBe(false);
    expect(found.has('donor')).toBe(false);
  });

  it('credits a common word written as a field reference', () => {
    expect(slotsInMessage('Search `notes` for it.', KNOWN)).toContain('notes');
    expect(slotsInMessage('Search **notes** for it.', KNOWN)).toContain('notes');
  });

  it('does not credit a longer name as a shorter one', () => {
    // Mentioning cause_of_death must not also credit a hypothetical `cause`.
    const found = slotsInMessage('cause_of_death varies.', [...KNOWN, 'cause']);
    expect(found.has('cause_of_death')).toBe(true);
    expect(found.has('cause')).toBe(false);
  });

  it('credits nothing from an empty message', () => {
    expect(slotsInMessage('', KNOWN).size).toBe(0);
  });
});

describe('slotsInSpec', () => {
  it('finds a filtered slot', () => {
    expect(slotsInSpec({ criteria: [{ kind: 'field', slot: 'history_of_rhi' }] })).toContain('history_of_rhi');
  });

  it('finds a traversed edge and the related slot under it', () => {
    const found = slotsInSpec({
      criteria: [{ kind: 'related', edge: 'donor', criteria: [{ slot: 'cohort' }] }],
    });
    expect(found).toContain('donor');
    expect(found).toContain('cohort');
  });

  it('finds a sort slot', () => {
    expect(slotsInSpec({ sort: [{ slot: 'cause_of_death', direction: 'asc' }] })).toContain('cause_of_death');
  });

  it('survives junk', () => {
    expect(slotsInSpec(null).size).toBe(0);
    expect(slotsInSpec('nope').size).toBe(0);
    expect(slotsInSpec({ criteria: [null, 7, {}] }).size).toBe(0);
  });
});

describe('namedSlots', () => {
  it('unions prose and spec', () => {
    const found = namedSlots('Filtering to donors with a documented history.', { criteria: [{ slot: 'history_of_rhi' }] }, KNOWN);
    expect(found).toContain('history_of_rhi');
  });

  it('credits a common word from the spec even when the prose is ambiguous', () => {
    // The spec is unambiguous no matter how the prose reads.
    const found = namedSlots('searching the notes', { criteria: [{ slot: 'notes' }] }, KNOWN);
    expect(found).toContain('notes');
  });
});
