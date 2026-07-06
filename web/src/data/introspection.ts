/**
 * Standard GraphQL `__schema` introspection — the generic baseline every
 * conformant endpoint supports (ADR-0017). Hippo's `hippoSchema` /
 * `hippoEntityType` enrichment layers on top when advertised (its presence is
 * detected here; richer enrichment is a Phase-1 concern once its query shape
 * is confirmed against a live `hippo serve`).
 */

export interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}

export interface IntrospectionInputValue {
  name: string;
  type: TypeRef;
}

export interface IntrospectionField {
  name: string;
  description?: string | null;
  args: IntrospectionInputValue[];
  type: TypeRef;
}

export interface IntrospectionType {
  kind: string;
  name: string;
  description?: string | null;
  fields?: IntrospectionField[] | null;
  enumValues?: { name: string }[] | null;
}

export interface IntrospectionSchema {
  queryType: { name: string };
  mutationType?: { name: string } | null;
  types: IntrospectionType[];
}

export interface IntrospectionData {
  __schema: IntrospectionSchema;
}

/** Nested-list depth we resolve type refs to (spec-typical is 7 levels). */
const TYPE_REF_DEPTH = 7;

function typeRefSelection(depth: number): string {
  return depth === 0 ? 'kind name' : `kind name ofType { ${typeRefSelection(depth - 1)} }`;
}

export const INTROSPECTION_QUERY = `
  query ApertureIntrospection {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        kind
        name
        description
        fields {
          name
          description
          args { name type { ${typeRefSelection(TYPE_REF_DEPTH)} } }
          type { ${typeRefSelection(TYPE_REF_DEPTH)} }
        }
        enumValues { name }
      }
    }
  }
`;

/** Unwraps NON_NULL wrappers only. */
export function unwrapNonNull(ref: TypeRef): TypeRef {
  return ref.kind === 'NON_NULL' && ref.ofType ? unwrapNonNull(ref.ofType) : ref;
}

/** Unwraps NON_NULL and LIST wrappers down to the named type. */
export function namedType(ref: TypeRef): TypeRef {
  return (ref.kind === 'NON_NULL' || ref.kind === 'LIST') && ref.ofType
    ? namedType(ref.ofType)
    : ref;
}

/** True when the (non-null-unwrapped) type is a list. */
export function isListType(ref: TypeRef): boolean {
  return unwrapNonNull(ref).kind === 'LIST';
}

export function findType(
  schema: IntrospectionSchema,
  name: string | null,
): IntrospectionType | undefined {
  if (name == null) return undefined;
  return schema.types.find((t) => t.name === name);
}
