import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = {
  core: path.join(packageRoot, 'core'),
  react: path.join(packageRoot, 'react'),
  showcase: path.join(packageRoot, 'showcase'),
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

function boundaryViolation(sourceArea, target) {
  if (sourceArea === 'core' && (isInside(target, roots.react) || isInside(target, roots.showcase))) {
    return 'core must not depend on React or showcase modules';
  }
  if (sourceArea === 'react' && isInside(target, roots.core) && target !== roots.core) {
    return 'React must consume core through the public core entry';
  }
  if (sourceArea === 'showcase' && isInside(target, roots.react) && target !== roots.react) {
    return 'showcase must consume React through the public React entry';
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
      const reason = boundaryViolation(sourceArea, target);
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
