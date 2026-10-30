/** Next may expose an internal URL hostname; Host is the destination the browser actually addressed. */
export function requestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = request.headers.get('host');
    if (host === null) return url.origin;
    if (!host || /[\s/@\\?#,]/.test(host)) return null;
    const destination = new URL(`${url.protocol}//${host}`);
    return destination.hostname && !destination.username && !destination.password ? destination.origin : null;
  } catch { return null; }
}

export function isSameOriginRequest(request: Request, allowMissingOrigin = false): boolean {
  const expected = requestOrigin(request);
  if (!expected) return false;
  const origin = request.headers.get('origin');
  return origin === null ? allowMissingOrigin : origin === expected;
}
