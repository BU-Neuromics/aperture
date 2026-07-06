/**
 * Placeholder nav content for Phase 0.1a (issue #3) ONLY. These domain labels
 * come from the design prototype's illustrative data; real collections derive
 * from `hippoSchema` introspection in step 0.5, which deletes this file —
 * domain nouns never ship in durable source (ADR-0002).
 */
export interface MockCollection {
  id: string;
  label: string;
  initial: string;
}

export const MOCK_COLLECTIONS: readonly MockCollection[] = [
  { id: 'donors', label: 'Donors', initial: 'Do' },
  { id: 'samples', label: 'Samples', initial: 'Sa' },
  { id: 'brain-samples', label: 'Brain Samples', initial: 'Br' },
  { id: 'datafiles', label: 'Datafiles', initial: 'Df' },
  { id: 'datasets', label: 'Datasets', initial: 'Ds' },
  { id: 'workflows', label: 'Workflows', initial: 'Wf' },
];
