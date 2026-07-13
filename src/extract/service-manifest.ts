// Extracts only a literal `export const corpusManifest` from a repository's
// server/corpus.ts. This deliberately parses source without bundling, importing,
// or evaluating it: scanned repositories are untrusted CI input.

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type {
  Manifest,
  ManifestDataEndpoint,
  ManifestPanel,
  ManifestSkipReason,
  ManifestSource,
} from '../model/contract-graph.ts';

export interface ManifestExtract {
  manifest: Manifest | null;
  source: ManifestSource;
  skipReason?: ManifestSkipReason;
}

type StaticValue =
  | string
  | number
  | boolean
  | null
  | StaticValue[]
  | { [key: string]: StaticValue };

interface StaticValueSuccess {
  value: StaticValue;
}

interface StaticValueFailure {
  reason: 'non-literal-expression';
}

type StaticValueResult = StaticValueSuccess | StaticValueFailure;

/**
 * Parses a corpus manifest without evaluating any node. Only object, array,
 * string, number, boolean, null, parenthesised, and TypeScript assertion nodes
 * are accepted. Imports and every other top-level statement are intentionally
 * ignored, so their side effects cannot run.
 */
export async function extractServiceManifest(
  corpusFileAbs: string,
): Promise<ManifestExtract> {
  let source: string;
  try {
    source = readFileSync(corpusFileAbs, 'utf8');
  } catch {
    return skipped('file-read-error');
  }

  const file = ts.createSourceFile(
    corpusFileAbs,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  // parseDiagnostics exists on compiler-created SourceFiles but is not exposed
  // on TypeScript's public SourceFile interface.
  const parseDiagnostics = (
    file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics.length > 0) return skipped('syntax-error');

  const initializer = findCorpusManifestInitializer(file);
  if (!initializer) return skipped('manifest-not-found');

  const literal = readStaticValue(initializer);
  if ('reason' in literal) return skipped(literal.reason);

  const manifest = coerceManifest(literal.value);
  return manifest
    ? { manifest, source: 'static-ast' }
    : skipped('invalid-manifest');
}

function skipped(reason: ManifestSkipReason): ManifestExtract {
  return { manifest: null, source: 'skipped', skipReason: reason };
}

function findCorpusManifestInitializer(
  sourceFile: ts.SourceFile,
): ts.Expression | null {
  let initializer: ts.Expression | null = null;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'corpusManifest') {
        continue;
      }
      // Multiple declarations would make the exported value ambiguous. Treat it
      // as non-literal rather than selecting one arbitrarily.
      if (initializer || !declaration.initializer) return null;
      initializer = declaration.initializer;
    }
  }
  return initializer;
}

function hasExportModifier(statement: ts.VariableStatement): boolean {
  return statement.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ) ?? false;
}

function readStaticValue(node: ts.Expression): StaticValueResult {
  const expression = unwrapExpression(node);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { value: expression.text };
  }
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text);
    return Number.isFinite(value) ? { value } : { reason: 'non-literal-expression' };
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { value: true };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { value: false };
  if (expression.kind === ts.SyntaxKind.NullKeyword) return { value: null };
  if (ts.isArrayLiteralExpression(expression)) return readStaticArray(expression);
  if (ts.isObjectLiteralExpression(expression)) return readStaticObject(expression);
  return { reason: 'non-literal-expression' };
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function readStaticArray(node: ts.ArrayLiteralExpression): StaticValueResult {
  const values: StaticValue[] = [];
  for (const element of node.elements) {
    if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
      return { reason: 'non-literal-expression' };
    }
    const value = readStaticValue(element);
    if ('reason' in value) return value;
    values.push(value.value);
  }
  return { value: values };
}

function readStaticObject(node: ts.ObjectLiteralExpression): StaticValueResult {
  const value = Object.create(null) as { [key: string]: StaticValue };
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return { reason: 'non-literal-expression' };
    }
    const key = propertyName(property.name);
    if (key === null || Object.hasOwn(value, key)) {
      return { reason: 'non-literal-expression' };
    }
    const propertyValue = readStaticValue(property.initializer);
    if ('reason' in propertyValue) return propertyValue;
    value[key] = propertyValue.value;
  }
  return { value };
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function coerceManifest(value: StaticValue): Manifest | null {
  if (!isStaticObject(value)) return null;
  const service = optionalString(value, 'service');
  if (!service) return null;

  const displayName = optionalString(value, 'displayName');
  const version = optionalString(value, 'version');
  const authValue = optionalString(value, 'auth');
  const cernereProjectKey = optionalString(value, 'cernereProjectKey');
  const corpusApiValue = optionalNumber(value, 'corpusApi');
  if (
    displayName === null ||
    version === null ||
    authValue === null ||
    cernereProjectKey === null ||
    corpusApiValue === null
  ) {
    return null;
  }
  const auth = authValue ?? 'none';
  const corpusApi = corpusApiValue ?? 1;
  if (!Number.isFinite(corpusApi)) return null;

  const data = readDataEndpoints(value.data);
  const panels = readPanels(value.panels);
  if (!data || !panels) return null;

  return {
    service,
    displayName,
    version,
    corpusApi,
    auth,
    cernereProjectKey,
    data,
    panels,
  };
}

function optionalString(
  value: { [key: string]: StaticValue },
  key: string,
): string | undefined | null {
  const field = value[key];
  if (field === undefined || typeof field === 'string') return field;
  return null;
}

function optionalNumber(
  value: { [key: string]: StaticValue },
  key: string,
): number | undefined | null {
  const field = value[key];
  if (field === undefined || typeof field === 'number') return field;
  return null;
}

function readDataEndpoints(value: StaticValue | undefined): ManifestDataEndpoint[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const data: ManifestDataEndpoint[] = [];
  for (const entry of value) {
    if (!isStaticObject(entry)) return null;
    const id = optionalString(entry, 'id');
    const path = optionalString(entry, 'path');
    const scopeValue = optionalString(entry, 'scope');
    if (id === null || path === null || scopeValue === null || !id || !path) return null;
    const scope = scopeValue ?? 'local';
    if (scope !== 'local' && scope !== 'multi') return null;
    data.push({ id, path, scope });
  }
  return data;
}

function readPanels(value: StaticValue | undefined): ManifestPanel[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const panels: ManifestPanel[] = [];
  for (const entry of value) {
    if (!isStaticObject(entry)) return null;
    const id = optionalString(entry, 'id');
    const kind = optionalString(entry, 'kind');
    if (id === null || kind === null || !id || !kind) return null;
    panels.push({ id, kind });
  }
  return panels;
}

function isStaticObject(value: StaticValue): value is { [key: string]: StaticValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
