import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenCanBeUsed } from './jwt';

function createUnsignedToken(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('tokenCanBeUsed', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows short-lived tokens immediately after issuance', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'));

    const issuedAt = Math.floor(Date.now() / 1000);
    const token = createUnsignedToken({
      aud: 'http://localhost:20000',
      iat: issuedAt,
      exp: issuedAt + 5,
    });

    expect(tokenCanBeUsed(token, 'http://localhost:20000')).toBe(true);
  });

  it('rejects short-lived tokens near expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'));

    const issuedAt = Math.floor(Date.now() / 1000);
    const token = createUnsignedToken({
      aud: 'http://localhost:20000',
      iat: issuedAt,
      exp: issuedAt + 5,
    });

    vi.setSystemTime(new Date('2026-03-17T12:00:04.300Z'));

    expect(tokenCanBeUsed(token, 'http://localhost:20000')).toBe(false);
  });
});
