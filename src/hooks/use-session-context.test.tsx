import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeBirdProvider } from '../provider/codebird-provider';
import { useCodeBirdAuth } from './use-codebird-auth';
import { useSessionContext } from './use-session-context';

function createWrapper(getUser?: () => Promise<unknown>) {
  const manager = {
    getUser: getUser ?? vi.fn().mockResolvedValue({
      access_token: 'access_token_1',
      refresh_token: 'refresh_token_1',
      profile: {},
    }),
    storeUser: vi.fn().mockResolvedValue(undefined),
    removeUser: vi.fn().mockResolvedValue(undefined),
    clearStaleState: vi.fn().mockResolvedValue(undefined),
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signinSilent: vi.fn().mockResolvedValue(null),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
    signinCallback: vi.fn().mockResolvedValue(null),
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <CodeBirdProvider
      endpoint="https://auth.example.com"
      appId="app_1"
      redirectUri="http://localhost:5173/callback"
      postLogoutRedirectUri="http://localhost:5173"
      managerFactory={() => manager}
    >
      {children}
    </CodeBirdProvider>
  );

  return { wrapper };
}

describe('useSessionContext', () => {
  it('loads realtime session context on mount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        code: 0,
        message: 'success',
        result: {
          tenant: { id: 'default', slug: 'default', name: '默认租户' },
          user: { id: 'user_1' },
          application: { id: 'app_1', name: 'Demo', type: 'SPA', tenant_id: 'default' },
          organization: null,
          organizations: [],
          session: {
            subject: 'user_1',
            client_id: 'app_1',
            scopes: ['openid'],
            current_organization_id: null,
          },
        },
      }),
    } as Response);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSessionContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.data?.user.id).toBe('user_1');
    expect(result.current.data?.tenant?.slug).toBe('default');

    fetchMock.mockRestore();
  });

  it('does not load when enabled is false until refresh is called', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        code: 0,
        message: 'success',
        result: {
          tenant: { id: 'default', slug: 'default', name: '默认租户' },
          user: { id: 'user_1' },
          application: null,
          organization: null,
          organizations: [],
          session: {
            subject: 'user_1',
            client_id: null,
            scopes: [],
            current_organization_id: null,
          },
        },
      }),
    } as Response);

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        session: useSessionContext({ enabled: false }),
        auth: useCodeBirdAuth(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.session.loading).toBe(false);
      expect(result.current.auth.isLoading).toBe(false);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await result.current.session.refresh();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRestore();
  });
});
