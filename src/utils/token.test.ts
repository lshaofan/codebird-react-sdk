import { describe, expect, it, vi } from 'vitest';
import { buildTokenRequest, requestToken } from './token';

describe('buildTokenRequest', () => {
  it('builds organization token request payload', () => {
    expect(
      buildTokenRequest({
        refreshToken: 'rt_1',
        organizationId: 'org_1',
        resource: 'https://api.example.com',
      }),
    ).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt_1',
      organization_id: 'org_1',
      resource: 'https://api.example.com',
    });
  });

  it('deduplicates identical in-flight token refresh requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_2',
      }),
    } as Response);

    const [first, second] = await Promise.all([
      requestToken({
        endpoint: 'https://auth.example.com',
        appId: 'app_1',
        refreshToken: 'rt_1',
        organizationId: 'org_1',
        resource: 'https://api.example.com',
      }),
      requestToken({
        endpoint: 'https://auth.example.com',
        appId: 'app_1',
        refreshToken: 'rt_1',
        organizationId: 'org_1',
        resource: 'https://api.example.com',
      }),
    ]);

    expect(first.access_token).toBe('access_token_1');
    expect(second.refresh_token).toBe('refresh_token_2');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRestore();
  });
});
