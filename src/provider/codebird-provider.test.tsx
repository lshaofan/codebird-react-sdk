import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBirdProvider, useCodeBirdAuth, useCodeBirdUser } from '../index';

afterEach(() => {
  vi.restoreAllMocks();
});

function createUnsignedToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

function createWrapper(overrides?: {
  getUser?: () => Promise<{
    access_token?: string;
    refresh_token?: string;
    profile?: Record<string, unknown>;
  } | null>;
  config?: {
    defaultResource?: string;
  };
}) {
  const manager = {
    getUser: overrides?.getUser ?? vi.fn().mockResolvedValue(null),
    storeUser: vi.fn().mockResolvedValue(undefined),
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
      defaultResource={overrides?.config?.defaultResource}
      managerFactory={() => manager}
    >
      {children}
    </CodeBirdProvider>
  );

  return { wrapper, manager };
}

describe('CodeBirdProvider', () => {
  it('does not reload user on parent rerender when config values are unchanged', async () => {
    const manager = {
      getUser: vi.fn().mockResolvedValue(null),
      storeUser: vi.fn().mockResolvedValue(undefined),
      signinRedirect: vi.fn().mockResolvedValue(undefined),
      signinSilent: vi.fn().mockResolvedValue(null),
      signoutRedirect: vi.fn().mockResolvedValue(undefined),
      signinCallback: vi.fn().mockResolvedValue(null),
    };

    function Wrapper({ tick }: { tick: number }) {
      return (
        <div data-tick={tick}>
          <CodeBirdProvider
            endpoint="https://auth.example.com"
            appId="app_1"
            redirectUri="http://localhost:5173/callback"
            postLogoutRedirectUri="http://localhost:5173"
            defaultResource="https://api.example.com"
            managerFactory={() => manager}
          >
            <div>child</div>
          </CodeBirdProvider>
        </div>
      );
    }

    const { rerender } = render(<Wrapper tick={1} />);

    await waitFor(() => {
      expect(manager.getUser).toHaveBeenCalledTimes(1);
    });

    rerender(<Wrapper tick={2} />);

    await waitFor(() => {
      expect(manager.getUser).toHaveBeenCalledTimes(1);
    });
  });

  it('does not queue another user load when parent rerenders before the first load resolves', async () => {
    let resolveUser: ((value: null) => void) | undefined;
    const getUser = vi.fn().mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolveUser = resolve;
        }),
    );

    const manager = {
      getUser,
      storeUser: vi.fn().mockResolvedValue(undefined),
      signinRedirect: vi.fn().mockResolvedValue(undefined),
      signinSilent: vi.fn().mockResolvedValue(null),
      signoutRedirect: vi.fn().mockResolvedValue(undefined),
      signinCallback: vi.fn().mockResolvedValue(null),
    };

    function Wrapper({ tick }: { tick: number }) {
      return (
        <div data-tick={tick}>
          <CodeBirdProvider
            endpoint="https://auth.example.com"
            appId="app_1"
            redirectUri="http://localhost:5173/callback"
            postLogoutRedirectUri="http://localhost:5173"
            defaultResource="https://api.example.com"
            managerFactory={() => manager}
          >
            <div>child</div>
          </CodeBirdProvider>
        </div>
      );
    }

    const { rerender } = render(<Wrapper tick={1} />);

    await waitFor(() => {
      expect(manager.getUser).toHaveBeenCalledTimes(1);
    });

    rerender(<Wrapper tick={2} />);
    expect(manager.getUser).toHaveBeenCalledTimes(1);

    resolveUser?.(null);

    await waitFor(() => {
      expect(manager.getUser).toHaveBeenCalledTimes(1);
    });
  });

  it('recreates the manager when configVersion changes', async () => {
    const managers = {
      v1: {
        getUser: vi.fn().mockResolvedValue(null),
        storeUser: vi.fn().mockResolvedValue(undefined),
        signinRedirect: vi.fn().mockResolvedValue(undefined),
        signinSilent: vi.fn().mockResolvedValue(null),
        signoutRedirect: vi.fn().mockResolvedValue(undefined),
        signinCallback: vi.fn().mockResolvedValue(null),
      },
      v2: {
        getUser: vi.fn().mockResolvedValue(null),
        storeUser: vi.fn().mockResolvedValue(undefined),
        signinRedirect: vi.fn().mockResolvedValue(undefined),
        signinSilent: vi.fn().mockResolvedValue(null),
        signoutRedirect: vi.fn().mockResolvedValue(undefined),
        signinCallback: vi.fn().mockResolvedValue(null),
      },
    };

    function Wrapper({ version }: { version: 'v1' | 'v2' }) {
      return (
        <CodeBirdProvider
          endpoint="https://auth.example.com"
          appId="app_1"
          redirectUri="http://localhost:5173/callback"
          postLogoutRedirectUri="http://localhost:5173"
          configVersion={version}
          managerFactory={() => managers[version]}
        >
          <div>child</div>
        </CodeBirdProvider>
      );
    }

    const { rerender } = render(<Wrapper version="v1" />);

    await waitFor(() => {
      expect(managers.v1.getUser).toHaveBeenCalledTimes(1);
    });

    rerender(<Wrapper version="v2" />);

    await waitFor(() => {
      expect(managers.v2.getUser).toHaveBeenCalledTimes(1);
    });

    expect(managers.v1.getUser).toHaveBeenCalledTimes(1);
  });

  it('recovers from local auth state load errors and continues unauthenticated', async () => {
    const onError = vi.fn();
    const manager = {
      getUser: vi.fn().mockRejectedValue(new Error('Corrupted user state')),
      removeUser: vi.fn().mockResolvedValue(undefined),
      clearStaleState: vi.fn().mockResolvedValue(undefined),
      storeUser: vi.fn().mockResolvedValue(undefined),
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
        onError={onError}
        managerFactory={() => manager}
      >
        {children}
      </CodeBirdProvider>
    );

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
    expect(manager.removeUser).toHaveBeenCalledTimes(1);
    expect(manager.clearStaleState).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed to load user state. Cleared local auth state and continued unauthenticated.',
      }),
    );
  });

  it('returns current access token when default resource audience already matches', async () => {
    const matchingToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'));

    const { wrapper } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: matchingToken,
        refresh_token: 'refresh_token_1',
        profile: {},
      }),
      config: {
        defaultResource: 'https://api.example.com',
      },
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const token = await result.current.getAccessToken('https://api.example.com');

    expect(token).toBe(matchingToken);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it('refreshes token when default resource audience does not match current access token', async () => {
    const mismatchedToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['urn:codebird:api'],
    });
    const refreshedToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: refreshedToken,
        refresh_token: 'refresh_token_2',
      }),
    } as Response);

    const { wrapper, manager } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: mismatchedToken,
        refresh_token: 'refresh_token_1',
        profile: {},
      }),
      config: {
        defaultResource: 'https://api.example.com',
      },
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const token = await result.current.getAccessToken('https://api.example.com');

    expect(token).toBe(refreshedToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body?.toString()).toContain('resource=https%3A%2F%2Fapi.example.com');
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: refreshedToken,
        refresh_token: 'refresh_token_2',
      }),
    );

    fetchMock.mockRestore();
  });

  it('refreshes token when default resource audience matches but current token is expired', async () => {
    const expiredToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const refreshedToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: refreshedToken,
        refresh_token: 'refresh_token_2',
      }),
    } as Response);

    const { wrapper, manager } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: expiredToken,
        refresh_token: 'refresh_token_expired_case',
        profile: {},
      }),
      config: {
        defaultResource: 'https://api.example.com',
      },
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const token = await result.current.getAccessToken('https://api.example.com');

    expect(token).toBe(refreshedToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: refreshedToken,
        refresh_token: 'refresh_token_2',
      }),
    );

    fetchMock.mockRestore();
  });

  it('deduplicates concurrent default resource token refresh requests', async () => {
    const expiredToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const refreshedToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: refreshedToken,
        refresh_token: 'refresh_token_2',
      }),
    } as Response);

    const { wrapper, manager } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: expiredToken,
        refresh_token: 'refresh_token_default_concurrent',
        profile: {},
      }),
      config: {
        defaultResource: 'https://api.example.com',
      },
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const [firstToken, secondToken] = await Promise.all([
      result.current.getAccessToken('https://api.example.com'),
      result.current.getAccessToken('https://api.example.com'),
    ]);

    expect(firstToken).toBe(refreshedToken);
    expect(secondToken).toBe(refreshedToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: refreshedToken,
        refresh_token: 'refresh_token_2',
      }),
    );

    fetchMock.mockRestore();
  });

  it('rotates refresh token between queued organization token requests for different resources', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'organization_token_1',
          refresh_token: 'refresh_token_2',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'organization_token_2',
          refresh_token: 'refresh_token_3',
        }),
      } as Response);

    const { wrapper, manager } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_rotation_case',
        profile: {
          organization_id: 'org_1',
        },
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const [firstToken, secondToken] = await Promise.all([
      result.current.getOrganizationToken('org_1', 'https://api.example.com'),
      result.current.getOrganizationToken('org_1', 'https://audit.example.com'),
    ]);

    expect(firstToken).toBe('organization_token_1');
    expect(secondToken).toBe('organization_token_2');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = fetchMock.mock.calls[0]?.[1]?.body;
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body;

    expect(firstBody?.toString()).toContain('refresh_token=refresh_token_rotation_case');
    expect(secondBody?.toString()).toContain('refresh_token=refresh_token_2');
    expect(firstBody?.toString()).toContain('resource=https%3A%2F%2Fapi.example.com');
    expect(secondBody?.toString()).toContain('resource=https%3A%2F%2Faudit.example.com');
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'refresh_token_2' }),
    );
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'refresh_token_3' }),
    );

    fetchMock.mockRestore();
  });

  it('deduplicates concurrent organization token requests for the same organization and resource', async () => {
    const organizationToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: organizationToken,
        refresh_token: 'refresh_token_2',
      }),
    } as Response);

    const { wrapper, manager } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_org_concurrent',
        profile: {
          organization_id: 'org_1',
        },
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const [firstToken, secondToken] = await Promise.all([
      result.current.getOrganizationToken('org_1', 'https://api.example.com'),
      result.current.getOrganizationToken('org_1', 'https://api.example.com'),
    ]);

    expect(firstToken).toBe(organizationToken);
    expect(secondToken).toBe(organizationToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'refresh_token_2' }),
    );

    fetchMock.mockRestore();
  });

  it('reuses cached organization token when it is still valid', async () => {
    const organizationToken = createUnsignedToken({
      sub: 'user_1',
      aud: ['https://api.example.com'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: organizationToken,
        refresh_token: 'refresh_token_2',
      }),
    } as Response);

    const { wrapper, manager } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_cache_case',
        profile: {
          organization_id: 'org_1',
        },
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstToken = await result.current.getOrganizationToken('org_1', 'https://api.example.com');
    const secondToken = await result.current.getOrganizationToken('org_1', 'https://api.example.com');

    expect(firstToken).toBe(organizationToken);
    expect(secondToken).toBe(organizationToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.storeUser).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'refresh_token_2' }),
    );

    fetchMock.mockRestore();
  });

  it('exposes loading state before auth client is ready', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('passes organization parameters to signinRedirect for organization-scoped login', async () => {
    const { wrapper, manager } = createWrapper();
    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.signIn({
      organizationId: 'org_1',
      scopes: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'urn:codebird:scope:organizations',
        'urn:codebird:scope:organization_roles',
      ],
      resource: 'https://api.example.com',
    });

    expect(manager.signinRedirect).toHaveBeenCalledWith({
      extraQueryParams: {
        organization_id: 'org_1',
      },
      resource: 'https://api.example.com',
      scope:
        'openid profile email offline_access urn:codebird:scope:organizations urn:codebird:scope:organization_roles',
    });
  });

  it('uses defaultOrganizationId when signIn is called without organization options', async () => {
    const manager = {
      getUser: vi.fn().mockResolvedValue(null),
      storeUser: vi.fn().mockResolvedValue(undefined),
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
        defaultOrganizationId="org_default"
        managerFactory={() => manager}
      >
        {children}
      </CodeBirdProvider>
    );

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.signIn();

    expect(manager.signinRedirect).toHaveBeenCalledWith({
      extraQueryParams: {
        organization_id: 'org_default',
      },
    });
  });

  it('maps user profile into stable sdk user shape', async () => {
    const { wrapper } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_1',
        profile: {
          sub: 'user_1',
          name: 'Demo User',
          username: 'demo',
          email: 'demo@example.com',
          phone_number: '13800000000',
          picture: 'https://example.com/avatar.png',
        },
      }),
    });

    const { result } = renderHook(() => useCodeBirdUser(), { wrapper });

    await waitFor(() => {
      expect(result.current.email).toBe('demo@example.com');
    });

    expect(result.current.id).toBe('user_1');
    expect(result.current.name).toBe('Demo User');
    expect(result.current.username).toBe('demo');
    expect(result.current.phoneNumber).toBe('13800000000');
    expect(result.current.avatar).toBe('https://example.com/avatar.png');
  });

  it('opens account center in a new tab after creating an sso ticket', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        code: 0,
        result: {
          ticket: 'ticket_1',
          redirect_url: 'https://auth.example.com/account-center/sso?ticket=ticket_1',
        },
      }),
    } as Response);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);

    const { wrapper } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_1',
        profile: {},
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.openAccountCenter({
      target: 'security',
      organizationId: 'org_1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/account/sso-ticket',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access_token_1',
        }),
        body: JSON.stringify({
          target: 'security',
          organization_id: 'org_1',
        }),
      }),
    );
    expect(openSpy).toHaveBeenCalledWith(
      'https://auth.example.com/account-center/sso?ticket=ticket_1',
      '_blank',
      'noopener,noreferrer',
    );

    fetchMock.mockRestore();
    openSpy.mockRestore();
  });

  it('rejects opening account center when current user has no access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'));
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);

    const { wrapper } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        refresh_token: 'refresh_token_1',
        profile: {},
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(result.current.openAccountCenter()).rejects.toThrow('No authenticated user access token available');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();

    fetchMock.mockRestore();
    openSpy.mockRestore();
  });

  it('loads realtime session context with current access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        code: 0,
        message: 'success',
        result: {
          user: { id: 'user_1' },
          application: { id: 'app_1', name: 'Demo', type: 'SPA', tenant_id: 'default' },
          organization: { id: 'org_1', name: 'Org 1', logo_url: null, is_member: true, is_admin: true, roles: ['admin'] },
          organizations: [{ id: 'org_1', name: 'Org 1', logo_url: null }],
          session: {
            subject: 'user_1',
            client_id: 'app_1',
            scopes: ['openid', 'profile'],
            current_organization_id: 'org_1',
          },
        },
      }),
    } as Response);

    const { wrapper } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_1',
        profile: {},
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const context = await result.current.getSessionContext({
      organizationId: 'org_1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/api/session/context?organization_id=org_1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access_token_1',
        }),
      }),
    );
    expect(context.application?.id).toBe('app_1');
    expect(context.organization?.id).toBe('org_1');

    fetchMock.mockRestore();
  });

  it('rejects loading realtime session context when current user has no access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'));

    const { wrapper } = createWrapper({
      getUser: vi.fn().mockResolvedValue({
        refresh_token: 'refresh_token_1',
        profile: {},
      }),
    });

    const { result } = renderHook(() => useCodeBirdAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(result.current.getSessionContext()).rejects.toThrow('No authenticated user access token available');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });
});
