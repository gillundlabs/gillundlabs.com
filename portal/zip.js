/* Minimal zip reader for the local accept step. Method 0 and method 8 only.
   Paths that leave the package, links, and service-worker scripts are refused. */

import { inflateRawSync } from 'node:zlib';
import { isSafePackagePath } from './crypto.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function findEocd(bytes) {
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

export function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > 200 * 1024 * 1024) throw new Error('Zip is too large.');
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error('Not a zip file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
    throw new Error('Multi-disk zips are not accepted.');
  }
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  if (count === 0xffff || ptr === 0xffffffff) throw new Error('Zip64 archives are not accepted.');
  const files = [];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) throw new Error('Bad central directory.');
    const method = view.getUint16(ptr + 10, true);
    const crc = view.getUint32(ptr + 16, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const external = view.getUint32(ptr + 38, true);
    const localOff = view.getUint32(ptr + 42, true);
    if (compSize === 0xffffffff || localOff === 0xffffffff) throw new Error('Zip64 archives are not accepted.');
    const nameStart = ptr + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > bytes.length) throw new Error('Bad central directory.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(nameStart, nameEnd));
    ptr = nameEnd + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const mode = (external >>> 16) & 0xffff;
    if ((mode & 0o170000) === 0o120000) throw new Error('Symlinks are not accepted.');
    const safe = isSafePackagePath(name) ? name : null;
    if (!safe) throw new Error('Unsafe path in zip.');
    if (/\.(zip|7z|rar)$/i.test(safe)) throw new Error('Nested archives are not accepted.');
    if (seen.has(safe)) throw new Error('Duplicate path in zip.');
    seen.add(safe);
    if (localOff + 30 > bytes.length || view.getUint32(localOff, true) !== 0x04034b50) throw new Error('Bad local header.');
    const flags = view.getUint16(localOff + 6, true);
    if (flags & 1) throw new Error('Encrypted zip entries are not accepted.');
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtra = view.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + localNameLen + localExtra;
    const dataEnd = dataOff + compSize;
    if (dataEnd > bytes.length) throw new Error('Zip entry is truncated.');
    const compressed = bytes.subarray(dataOff, dataEnd);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = new Uint8Array(inflateRawSync(compressed));
    else throw new Error('Unsupported zip method.');
    if (crc32(data) !== crc) throw new Error('Zip entry checksum failed.');
    if (data.length > 25 * 1024 * 1024) throw new Error('A file in the zip is too large.');
    files.push({ name: safe, data });
  }
  if (files.length === 0) throw new Error('Zip has no files.');
  return files;
}
