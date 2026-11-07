/* Only send the browser back under this bench. Anything else becomes the bench itself. */

export function safeNext(value, base) {
  const home = `${base}/`;
  if (typeof value !== 'string' || value.length === 0) return home;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return home;
  }
  if (decoded.length > 240) return home;
  if (/[\0\\]/.test(decoded) || decoded.includes('//') || decoded.includes('://')) return home;
  const path = decoded.split('?')[0].split('#')[0];
  const allowed = path === base || path === home || path.startsWith(`${base}/play/`);
  if (!allowed) return home;
  const parts = path.split('/');
  if (parts.some((part) => part === '' ? false : part === '.' || part === '..' || part.includes('%'))) return home;
  if (path === base) return home;
  if (path.startsWith(`${base}/play/`) && !path.endsWith('/') && !/\.[a-z0-9]{1,8}$/i.test(path)) return `${path}/`;
  return path;
}
