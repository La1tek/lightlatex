import assert from 'node:assert/strict';
import { getCompiler, isSafeMainFile, validateCollaboratorRole } from '../dist/shared/validation.js';
import { resolveInside, resolveProjectPath } from '../dist/storage/paths.js';

assert.equal(getCompiler(undefined), 'pdflatex');
assert.equal(getCompiler('xelatex'), 'xelatex');
assert.throws(() => getCompiler('latexmk'), /Unsupported compiler/);

assert.equal(validateCollaboratorRole(undefined), 'viewer');
assert.equal(validateCollaboratorRole('editor'), 'editor');
assert.throws(() => validateCollaboratorRole('owner'), /Role must be viewer or editor/);

assert.equal(isSafeMainFile('main.tex'), true);
assert.equal(isSafeMainFile('chapters/intro.tex'), true);
assert.equal(isSafeMainFile('../main.tex'), false);
assert.equal(isSafeMainFile('/tmp/main.tex'), false);
assert.equal(isSafeMainFile('main.pdf'), false);

const base = '/tmp/lighttex-safe-base';
assert.equal(resolveInside(base, 'a', 'b.tex'), '/tmp/lighttex-safe-base/a/b.tex');
assert.throws(() => resolveInside(base, '..', 'escape.tex'), /Invalid file path/);
assert.throws(() => resolveProjectPath('project-id', '/absolute.tex'), /Invalid file path/);

console.log('unit-shared ok');
