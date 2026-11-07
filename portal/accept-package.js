/* Check a Professor-accepted zip and write a sealed file tree.
   This does not upload anything and it refuses to write into the public site. */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRefusedPackage, slotById } from './catalog.js';
import { sealManifest, timingSafeEqual } from './crypto.js';
import { readZip } from './zip.js';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function acceptZipBytes({ bytes, slotId, packagesManifest, sealKey }) {
  const slot = slotById(slotId);
  if (!slot || slot.approval !== 'accepted' || !slot.packageId) {
    throw new Error('That slot has no Professor-accepted package.');
  }
  if (isRefusedPackage(slot.packageId)) throw new Error('That package was refused.');
  const expected = packagesManifest && packagesManifest[slotId];
  if (!expected || expected.packageId !== slot.packageId || !/^[a-f0-9]{64}$/.test(expected.sha256 || '')) {
    throw new Error('The host manifest does not seal this slot.');
  }
  if (typeof sealKey !== 'string' || sealKey.length < 32) throw new Error('The package seal key is missing.');
  const zipSha256 = sha256Hex(bytes);
  if (!timingSafeEqual(zipSha256, expected.sha256)) throw new Error('Zip does not match the accepted seal.');
  const files = readZip(bytes);
  const listed = {};
  for (const file of files) listed[file.name] = { sha256: sha256Hex(file.data), bytes: file.data.length };
  const manifest = await sealManifest({ packageId: slot.packageId, zipSha256, files: listed }, sealKey);
  return { manifest, files };
}

export async function writeAcceptedPackage(result, outDir) {
  const root = path.resolve(outDir);
  await mkdir(path.join(root, 'files'), { recursive: true });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(result.manifest)}\n`);
  for (const file of result.files) {
    const dest = path.resolve(root, 'files', file.name);
    if (!dest.startsWith(path.join(root, 'files') + path.sep)) throw new Error('Unsafe output path.');
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, file.data);
  }
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function assertSafeOut(outDir) {
  const root = repoRoot();
  const resolved = path.resolve(outDir);
  const allowed = path.join(root, 'portal', 'out');
  const insideRepo = resolved === root || resolved.startsWith(root + path.sep);
  const insideAllowed = resolved === allowed || resolved.startsWith(allowed + path.sep);
  if (insideRepo && !insideAllowed) {
    throw new Error('Refusing to write a package into the public site tree. Use portal/out or a directory outside the repository.');
  }
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

async function main() {
  const slot = arg('--slot');
  const zipPath = arg('--zip');
  const out = arg('--out');
  if (!slot || !zipPath || !out) {
    console.error('Usage: node portal/accept-package.js --slot <id> --zip <file> --out <dir>');
    process.exit(1);
  }
  assertSafeOut(out);
  const manifestRaw = process.env.PORTAL_PACKAGES_MANIFEST || '';
  const sealKey = process.env.PORTAL_PACKAGE_SEAL_KEY || '';
  let packagesManifest;
  try {
    packagesManifest = JSON.parse(manifestRaw);
  } catch {
    console.error('PORTAL_PACKAGES_MANIFEST must be JSON in the environment, not in the repository.');
    process.exit(1);
  }
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(zipPath);
  const result = await acceptZipBytes({ bytes, slotId: slot, packagesManifest, sealKey });
  await writeAcceptedPackage(result, out);
  console.log(`Sealed ${result.files.length} files for ${slot}. Upload the directory with the host's private storage tool. Nothing was published.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message || 'The package was not accepted.');
    process.exit(1);
  });
}
