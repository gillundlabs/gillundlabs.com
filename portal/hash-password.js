/* Print a password-check record to stdout. The password is read from stdin, never from arguments. */

import { hashPassword, MIN_ITERATIONS } from './crypto.js';

const username = process.env.PORTAL_USERNAME || '';
const iterations = Number(process.env.PORTAL_KDF_ITERATIONS || MIN_ITERATIONS);

if (!/^[A-Za-z0-9._@-]{1,64}$/.test(username)) {
  console.error('Set PORTAL_USERNAME. Pipe the password on stdin. Neither is stored by this command.');
  process.exit(1);
}
if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > 2000000) {
  console.error(`PORTAL_KDF_ITERATIONS must be at least ${MIN_ITERATIONS}.`);
  process.exit(1);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
if (password.length < 1 || password.length > 1024) {
  console.error('The password from stdin was empty or too long.');
  process.exit(1);
}

const passwordHash = await hashPassword(password, iterations);
process.stdout.write(`${JSON.stringify({ username, passwordHash, iterations })}\n`);
