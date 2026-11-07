/* Write the public closed page. GitHub Pages serves this file and cannot run the password check. */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderClosed, GUARD_SCRIPT } from './pages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'test'), { recursive: true });

await writeFile(path.join(root, 'test', 'index.html'), renderClosed({ reason: 'public' }));
await writeFile(path.join(root, 'test', 'portal-sw-guard.js'), GUARD_SCRIPT);
