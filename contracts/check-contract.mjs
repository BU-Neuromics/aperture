#!/usr/bin/env node
/**
 * Checks a Mosaic (formerly Hippo) GraphQL introspection result against
 * ./hippo-graphql-contract.json (issue #16 - consumer-driven contract).
 *
 * Plain Node, no dependencies, no Aperture build step: the point is that
 * this can run standalone in Mosaic's own CI against a booted `mosaic serve`,
 * or in Aperture's CI against the frozen `realIntrospection.json` fixture, so
 * the fixture can't silently drift from what Aperture actually asserts.
 *
 * Usage:
 *   node check-contract.mjs --introspection <path-to-introspection.json>
 *   node check-contract.mjs --url http://localhost:8000/graphql
 *   node check-contract.mjs --url http://localhost:8000/graphql --header "Authorization: Bearer test-token"
 *
 * The introspection JSON is the bare `__schema` object shape
 * ({queryType, mutationType, types}), matching what
 * `web/src/data/testing/realIntrospection.json` stores and what `--url`
 * mode extracts from a standard `{ data: { __schema } }` GraphQL response.
 *
 * Exits 0 with a per-assertion report when everything asserted is present;
 * exits 1 (still printing the full report) on any failure.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const INTROSPECTION_QUERY = `
  query ApertureContractIntrospection {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        kind
        name
        fields { name args { name type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } } type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } }
        inputFields { name type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } }
        enumValues { name }
      }
    }
  }
`;

function parseArgs(argv) {
  const opts = { contract: path.join(HERE, 'hippo-graphql-contract.json') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--introspection') opts.introspection = argv[++i];
    else if (arg === '--url') opts.url = argv[++i];
    else if (arg === '--contract') opts.contract = argv[++i];
    else if (arg === '--header') (opts.headers ??= []).push(argv[++i]);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!opts.introspection && !opts.url) {
    console.error('Usage: check-contract.mjs (--introspection <path> | --url <endpoint>) [--contract <path>] [--header "Name: value"]');
    process.exit(2);
  }
  return opts;
}

async function loadSchema(opts) {
  if (opts.introspection) {
    const raw = JSON.parse(await readFile(opts.introspection, 'utf8'));
    // Tolerate either the bare __schema shape or a full GraphQL response envelope.
    return raw.__schema ?? raw.data?.__schema ?? raw;
  }
  const headers = { 'content-type': 'application/json' };
  for (const h of opts.headers ?? []) {
    const idx = h.indexOf(':');
    if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  }
  const response = await fetch(opts.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });
  if (!response.ok) {
    throw new Error(`Introspection request failed: HTTP ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  if (body.errors) {
    throw new Error(`Introspection query returned errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data.__schema;
}

// -- Minimal type-ref rendering (mirrors web/src/data/introspection.ts typeRefToSDL) --

function typeRefToSDL(ref) {
  if (!ref) return '?';
  if (ref.kind === 'NON_NULL' && ref.ofType) return `${typeRefToSDL(ref.ofType)}!`;
  if (ref.kind === 'LIST' && ref.ofType) return `[${typeRefToSDL(ref.ofType)}]`;
  return ref.name ?? 'String';
}

function findType(schema, name) {
  return schema.types.find((t) => t.name === name);
}

function findField(fields, name) {
  return (fields ?? []).find((f) => f.name === name);
}

// -- Assertion checks: each returns a list of failure strings (empty = pass) --

function checkArgs(actualArgs, expectedArgs, label) {
  const failures = [];
  for (const expected of expectedArgs) {
    const actual = (actualArgs ?? []).find((a) => a.name === expected.name);
    if (!actual) {
      failures.push(`${label}: missing arg '${expected.name}'`);
      continue;
    }
    const actualSDL = typeRefToSDL(actual.type);
    if (actualSDL !== expected.type) {
      failures.push(
        `${label}: arg '${expected.name}' expected type '${expected.type}', got '${actualSDL}'`,
      );
    }
  }
  return failures;
}

function checkRootField(schema, rootTypeName, assertion) {
  const rootType = findType(schema, rootTypeName);
  if (!rootType) return [`root type '${rootTypeName}' not found in schema`];
  const field = findField(rootType.fields, assertion.field);
  if (!field) return [`${rootTypeName}.${assertion.field}: field not found`];
  return checkArgs(field.args, assertion.args ?? [], `${rootTypeName}.${assertion.field}`);
}

function checkInputFields(schema, assertion) {
  const type = findType(schema, assertion.on);
  if (!type) return [`type '${assertion.on}' not found in schema`];
  const failures = [];
  for (const expected of assertion.fields) {
    const actual = findField(type.inputFields, expected.name);
    if (!actual) {
      failures.push(`${assertion.on}.${expected.name}: input field not found`);
      continue;
    }
    const actualSDL = typeRefToSDL(actual.type);
    if (actualSDL !== expected.type) {
      failures.push(
        `${assertion.on}.${expected.name}: expected type '${expected.type}', got '${actualSDL}'`,
      );
    }
  }
  return failures;
}

function checkFields(schema, assertion) {
  const type = findType(schema, assertion.on);
  if (!type) return [`type '${assertion.on}' not found in schema`];
  const failures = [];
  for (const expected of assertion.fields) {
    const actual = findField(type.fields, expected.name);
    if (!actual) {
      failures.push(`${assertion.on}.${expected.name}: field not found`);
      continue;
    }
    const actualSDL = typeRefToSDL(actual.type);
    if (actualSDL !== expected.type) {
      failures.push(
        `${assertion.on}.${expected.name}: expected type '${expected.type}', got '${actualSDL}'`,
      );
    }
  }
  return failures;
}

function checkEnumValues(schema, assertion) {
  const type = findType(schema, assertion.on);
  if (!type) return [`type '${assertion.on}' not found in schema`];
  const actualNames = new Set((type.enumValues ?? []).map((v) => v.name));
  return assertion.values
    .filter((v) => !actualNames.has(v))
    .map((v) => `${assertion.on}: missing enum value '${v}'`);
}

function runAssertion(schema, assertion) {
  switch (assertion.kind) {
    case 'queryField':
      return checkRootField(schema, schema.queryType.name, assertion);
    case 'mutationField':
      return checkRootField(schema, schema.mutationType.name, assertion);
    case 'inputFields':
      return checkInputFields(schema, assertion);
    case 'fields':
      return checkFields(schema, assertion);
    case 'enumValues':
      return checkEnumValues(schema, assertion);
    default:
      return [`unknown assertion kind '${assertion.kind}'`];
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const contract = JSON.parse(await readFile(opts.contract, 'utf8'));
  const schema = await loadSchema(opts);

  let failedCount = 0;
  console.log(`Checking ${contract.assertions.length} assertions from ${contract.version} contract...\n`);
  for (const assertion of contract.assertions) {
    const failures = runAssertion(schema, assertion);
    if (failures.length === 0) {
      console.log(`  PASS  ${assertion.id}`);
    } else {
      failedCount++;
      console.log(`  FAIL  ${assertion.id}`);
      for (const failure of failures) console.log(`          ${failure}`);
    }
  }

  console.log();
  if (failedCount > 0) {
    console.error(`${failedCount}/${contract.assertions.length} assertion(s) failed.`);
    process.exit(1);
  }
  console.log(`All ${contract.assertions.length} assertions passed.`);
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
