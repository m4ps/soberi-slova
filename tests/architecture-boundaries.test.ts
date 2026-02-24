import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type Layer = 'domain' | 'application' | 'adapters' | 'shared' | 'entry';

const TEST_FILE = fileURLToPath(import.meta.url);
const TESTS_DIR = path.dirname(TEST_FILE);
const PROJECT_ROOT = path.resolve(TESTS_DIR, '..');
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'src');

const ALLOWED_IMPORTS: Record<Layer, ReadonlySet<Layer>> = {
  domain: new Set(['domain', 'shared']),
  application: new Set(['application', 'domain', 'shared']),
  adapters: new Set(['adapters', 'application', 'shared']),
  shared: new Set(['shared']),
  entry: new Set(['entry', 'adapters', 'application', 'domain', 'shared']),
};

function detectLayer(filePath: string): Layer {
  const normalizedPath = filePath.split(path.sep).join('/');

  if (normalizedPath.endsWith('/src/main.ts')) {
    return 'entry';
  }

  if (normalizedPath.includes('/src/domain/')) {
    return 'domain';
  }

  if (normalizedPath.includes('/src/application/')) {
    return 'application';
  }

  if (normalizedPath.includes('/src/adapters/')) {
    return 'adapters';
  }

  return 'shared';
}

function collectTypeScriptFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectImportSpecifiers(sourceCode: string): string[] {
  const fromPattern = /(?:import|export)\s[^'"`]*?from\s+['"]([^'"]+)['"]/g;
  const sideEffectPattern = /^\s*import\s+['"]([^'"]+)['"]/gm;
  const specifiers = new Set<string>();

  let match: RegExpExecArray | null;

  while ((match = fromPattern.exec(sourceCode)) !== null) {
    const [, specifier] = match;
    if (specifier) {
      specifiers.add(specifier);
    }
  }

  while ((match = sideEffectPattern.exec(sourceCode)) !== null) {
    const [, specifier] = match;
    if (specifier) {
      specifiers.add(specifier);
    }
  }

  return [...specifiers];
}

function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }

  return null;
}

describe('layered dependency model', () => {
  it('keeps imports inside allowed layer boundaries', () => {
    const files = collectTypeScriptFiles(SOURCE_ROOT);
    const violations: string[] = [];

    for (const filePath of files) {
      const sourceLayer = detectLayer(filePath);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const importSpecifiers = collectImportSpecifiers(fileContent);

      for (const importSpecifier of importSpecifiers) {
        const resolvedImportPath = resolveRelativeImport(filePath, importSpecifier);

        if (!resolvedImportPath) {
          continue;
        }

        const targetLayer = detectLayer(resolvedImportPath);
        const isAllowed = ALLOWED_IMPORTS[sourceLayer].has(targetLayer);

        if (!isAllowed) {
          const fromPath = path.relative(PROJECT_ROOT, filePath);
          const toPath = path.relative(PROJECT_ROOT, resolvedImportPath);
          violations.push(`${fromPath} -> ${toPath}`);
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Layering violations found:\n${violations.join('\n')}`
        : 'No layering violations detected.',
    ).toEqual([]);
  });
});
