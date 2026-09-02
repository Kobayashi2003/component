import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = {
  core: path.join(packageRoot, 'core'),
  react: path.join(packageRoot, 'react'),
  showcase: path.join(packageRoot, 'showcase'),
};
const coreRoots = {
  epub: path.join(roots.core, 'epub'),
  compatibility: path.join(roots.core, 'epub', 'compatibility'),
  extension: path.join(roots.core, 'extension'),
  extensionModel: path.join(roots.core, 'extension', 'model'),
  features: path.join(roots.core, 'features'),
  runtime: path.join(roots.core, 'runtime'),
};
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    return sourceExtensions.has(path.extname(entry.name)) ? [absolute] : [];
  }));
  return files.flat();
}

function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function importedSpecifiers(source) {
  const matches = [];
  const declarations = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImports = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [declarations, dynamicImports]) {
    for (const match of source.matchAll(pattern)) {
      matches.push({ specifier: match[1], offset: match.index ?? 0 });
    }
  }
  return matches;
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function boundaryViolation(sourceArea, source, target) {
  if (sourceArea === 'core' && (isInside(target, roots.react) || isInside(target, roots.showcase))) {
    return 'core must not depend on React or showcase modules';
  }
  if (sourceArea === 'react' && isInside(target, roots.core) && target !== roots.core) {
    return 'React must consume core through the public core entry';
  }
  if (sourceArea === 'showcase' && isInside(target, roots.react) && target !== roots.react) {
    return 'showcase must consume React through the public React entry';
  }
  if (isInside(source, coreRoots.epub) && isInside(target, coreRoots.runtime)) {
    return 'EPUB processing must not depend on reader runtime modules';
  }
  if (isInside(source, coreRoots.features) && isInside(target, coreRoots.runtime)) {
    return 'reading features must not depend on reader runtime modules';
  }
  if (isInside(source, coreRoots.extension) && isInside(target, coreRoots.features)) {
    return 'generic extension mechanisms must not depend on concrete reading features';
  }
  if (isInside(source, coreRoots.compatibility)
    && isInside(target, coreRoots.extension)
    && target !== coreRoots.extensionModel) {
    return 'EPUB compatibility may reuse extension ordering types, but not feature lifecycle, capability, or event mechanisms';
  }
  return null;
}

const violations = [];
for (const [sourceArea, root] of Object.entries(roots)) {
  for (const file of await collectSourceFiles(root)) {
    const source = await readFile(file, 'utf8');
    for (const imported of importedSpecifiers(source)) {
      if (!imported.specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), imported.specifier);
      const reason = boundaryViolation(sourceArea, file, target);
      if (!reason) continue;
      violations.push({
        file: path.relative(packageRoot, file).replaceAll(path.sep, '/'),
        line: lineNumberAt(source, imported.offset),
        specifier: imported.specifier,
        reason,
      });
    }
  }
}

if (violations.length > 0) {
  console.error('Module boundary violations:');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.specifier}: ${violation.reason}`);
  }
  process.exitCode = 1;
} else {
  console.log('Module boundaries verified.');
}
