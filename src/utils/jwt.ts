function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return decodeURIComponent(
      Array.from(window.atob(padded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
  }

  return Buffer.from(padded, 'base64').toString('utf8');
}

type JwtPayload = {
  aud?: string | string[];
  exp?: number;
};

const DEFAULT_EXPIRY_SKEW_MS = 60_000;

function parseJwtPayload(token: string): JwtPayload | null {
  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(segments[1] ?? '')) as JwtPayload;
  } catch {
    return null;
  }
}

export function tokenHasAudience(token: string, audience: string) {
  const payload = parseJwtPayload(token);
  if (!payload) {
    return false;
  }

  const tokenAudience = payload.aud;

  if (typeof tokenAudience === 'string') {
    return tokenAudience === audience;
  }

  if (Array.isArray(tokenAudience)) {
    return tokenAudience.includes(audience);
  }

  return false;
}

export function tokenCanBeUsed(token: string, audience?: string, expirySkewMs = DEFAULT_EXPIRY_SKEW_MS) {
  const payload = parseJwtPayload(token);
  if (!payload) {
    return false;
  }

  if (audience && !tokenHasAudience(token, audience)) {
    return false;
  }

  if (typeof payload.exp !== 'number') {
    return true;
  }

  return payload.exp * 1000 > Date.now() + expirySkewMs;
}
