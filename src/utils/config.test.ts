import { describe, expect, it } from 'vitest';
import { validateConfig } from './config';

describe('validateConfig', () => {
  it('throws when endpoint is missing', () => {
    expect(() =>
      validateConfig({
        appId: 'app_1',
        redirectUri: 'http://localhost:5173/callback',
        postLogoutRedirectUri: 'http://localhost:5173',
      }),
    ).toThrow('endpoint is required');
  });
});
