// Runtime consumer check: Node resolves every published entry point through the
// exports map (self-reference) to the built dist/. Run with
// `npm run test:package` after `npm run build`.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const srcDir = new URL('../src/', import.meta.url);
const distDir = new URL('../dist/', import.meta.url);

const modules = (await readdir(srcDir))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => f.slice(0, -'.ts'.length));

test('the package root resolves to the compiled barrel', async () => {
  const root = await import('@openflow/core');
  assert.equal(typeof root.derive, 'function');
  assert.equal(import.meta.resolve('@openflow/core'), new URL('index.js', distDir).href);
});

test('every source module resolves as @openflow/core/<name>.ts to its compiled file', async () => {
  assert.ok(modules.length > 20, `expected the whole src/, found ${modules.length}`);
  for (const name of modules) {
    const specifier = `@openflow/core/${name}.ts`;
    assert.equal(import.meta.resolve(specifier), new URL(`${name}.js`, distDir).href, specifier);
    await import(specifier);
  }
});

test('deep paths and the barrel share one module instance', async () => {
  const root = await import('@openflow/core');
  const deep = await import('@openflow/core/derive.ts');
  assert.equal(deep.derive, root.derive);
});

test('every declaration that uses OpenFlow.* references the protocol globals itself', async () => {
  // A consumer may import a single deep path, so each file must bring the
  // namespace in on its own rather than relying on a sibling.
  const reference = '/// <reference types="@openflow/protocol/global.d.ts"';
  for (const name of modules) {
    const dts = await readFile(new URL(`${name}.d.ts`, distDir), 'utf8');
    if (/\bOpenFlow\./.test(dts)) {
      assert.ok(dts.startsWith(reference), `dist/${name}.d.ts uses OpenFlow.* without the reference`);
    }
  }
});

test('no test files are published', async () => {
  const dist = await readdir(distDir);
  assert.deepEqual(dist.filter((f) => f.includes('.test.')), []);
});

test('package.json is reachable through the exports map', () => {
  const require = createRequire(import.meta.url);
  assert.equal(require('@openflow/core/package.json').name, '@openflow/core');
});
