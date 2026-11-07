import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'out') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

test('public pages, sitemap, and robots do not point at the bench', async () => {
  const pages = [
    'index.html',
    '404.html',
    'about/index.html',
    'games/maxwells-demon/index.html',
    'games/vacuum-maze/index.html',
    'games/fantastic-apparatus/index.html',
    'notebook/index.html',
    'notebook/maxwells-demon/index.html',
    'notebook/vacuum-maze/index.html',
    'notebook/fantastic-apparatus/index.html',
  ];
  for (const rel of pages) {
    const html = await readFile(path.join(root, rel), 'utf8');
    assert.equal(html.includes('href="/test'), false, rel);
    assert.equal(html.includes("href='/test"), false, rel);
    assert.equal(/href="[^"]*test\//.test(html), false, rel);
    assert.equal(html.includes('test-bench.css'), false, rel);
  }
  const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
  assert.equal(sitemap.includes('/test'), false);
  const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/test/);
  assert.match(robots, /Sitemap: https:\/\/gillundlabs\.com\/sitemap\.xml/);
  assert.match(robots, /Allow: \//);
});

test('demo service workers are directory-scoped and are not in the tree', async () => {
  for (const rel of ['play/maxwells-demon/index.html', 'play/vacuum-maze/index.html', 'play/fantastic-apparatus/index.html']) {
    const html = await readFile(path.join(root, rel), 'utf8');
    assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
    assert.equal(/serviceWorker\.register\(\s*['"][^'"]+['"]\s*,\s*\{[^}]*scope\s*:\s*['"]\/['"]/.test(html), false);
    const sw = path.join(root, path.dirname(rel), 'sw.js');
    await assert.rejects(() => readFile(sw));
  }
  await assert.rejects(() => readFile(path.join(root, 'sw.js')));
});

test('private zip seals and package bytes are not in the repository', async () => {
  const example = JSON.parse(await readFile(path.join(root, 'portal', 'packages.manifest.example.json'), 'utf8'));
  for (const entry of Object.values(example)) assert.equal(entry.sha256, '');
  const files = await walk(root);
  const textLike = files.filter((file) => /\.(html|css|js|json|md|txt|xml|example)$/.test(file));
  for (const file of textLike) {
    const text = await readFile(file, 'utf8');
    assert.equal(/md-test-36ec3cdea1.{0,120}[a-f0-9]{64}/s.test(text), false, file);
    assert.equal(/vm-test-full-a4a51186fe.{0,120}[a-f0-9]{64}/s.test(text), false, file);
    assert.equal(/pbkdf2-sha256\$\d+\$[A-Za-z0-9_-]{8,}/.test(text), false, file);
  }
  const packaged = files.filter((file) => file.endsWith('.zip'));
  assert.deepEqual(packaged, []);
});
