import assert from 'node:assert/strict';
import { getCompiler, isSafeMainFile, isSafeProjectRelativePath, validateCollaboratorRole } from '../dist/shared/validation.js';
import { resolveInside, resolveProjectPath } from '../dist/storage/paths.js';
import { validateZipEntryPath } from '../dist/storage/projectFiles.js';

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
assert.equal(isSafeProjectRelativePath('chapters/intro.tex'), true);
assert.equal(isSafeProjectRelativePath('images/figure.pdf'), true);
assert.equal(isSafeProjectRelativePath('../escape.tex'), false);
assert.equal(isSafeProjectRelativePath('/absolute.tex'), false);

const base = '/tmp/lighttex-safe-base';
assert.equal(resolveInside(base, 'a', 'b.tex'), '/tmp/lighttex-safe-base/a/b.tex');
assert.throws(() => resolveInside(base, '..', 'escape.tex'), /Invalid file path/);
assert.throws(() => resolveProjectPath('project-id', '/absolute.tex'), /Invalid file path/);
assert.doesNotThrow(() => validateZipEntryPath('chapters/intro.tex'));
assert.doesNotThrow(() => validateZipEntryPath('images/figure.pdf'));
assert.throws(() => validateZipEntryPath('../escape.tex'), /Invalid zip entry path/);
assert.throws(() => validateZipEntryPath('/absolute.tex'), /Invalid zip entry path/);

console.log('unit-shared ok');
