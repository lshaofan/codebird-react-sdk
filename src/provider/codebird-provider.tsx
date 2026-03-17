import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { CodeBirdContext } from '../context/codebird-context';
import type {
  CodeBirdAccountCenterTarget,
  CodeBirdAuthValue,
  CodeBirdGetSessionContextOptions,
  CodeBirdManager,
  CodeBirdManagerUser,
  CodeBirdOpenAccountCenterOptions,
  CodeBirdProviderProps,
  CodeBirdSessionContext,
  CodeBirdSignInOptions,
  OrganizationContext,
} from '../types';
import { validateConfig } from '../utils/config';
import { parseOrganizationClaims } from '../utils/claims';
import { tokenCanBeUsed } from '../utils/jwt';
import { requestToken } from '../utils/token';

const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];
const DEFAULT_ACCOUNT_CENTER_TARGET: CodeBirdAccountCenterTarget = 'overview';

function getStore(storage: CodeBirdProviderProps['storage']) {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return storage === 'sessionStorage' ? window.sessionStorage : window.localStorage;
}

function getStoragePrefix(configVersion?: string) {
  return configVersion ? `oidc.${configVersion}.` : undefined;
}

function createDefaultManager(config: CodeBirdProviderProps): CodeBirdManager {
  const store = getStore(config.storage);
  const prefix = getStoragePrefix(config.configVersion);
  const webStorage = store
    ? new WebStorageStateStore(prefix ? { store, prefix } : { store })
    : undefined;

  return new UserManager({
    authority: config.endpoint,
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
    // oidc-client-ts only serializes client_id into the token request body
    // when an explicit client_authentication mode is configured.
    // For public SPA clients we still need client_id during code exchange,
    // but we must not require a client secret, so client_secret_post is the
    // most compatible option here.
    client_authentication: 'client_secret_post',
    response_type: 'code',
    scope: (config.scopes ?? DEFAULT_SCOPES).join(' '),
    resource: config.defaultResource,
    userStore: webStorage,
    stateStore: webStorage,
    automaticSilentRenew: config.automaticSilentRenew ?? false,
  }) as unknown as CodeBirdManager;
}

function resolveCurrentOrganizationId(
  parsed: OrganizationContext,
  defaultOrganizationId?: string,
  selectedOrganizationId?: string | null,
) {
  return selectedOrganizationId ?? defaultOrganizationId ?? parsed.currentOrganizationId;
}

function buildSignInArgs(config: CodeBirdProviderProps, options?: CodeBirdSignInOptions) {
  const organizationId = options?.organizationId ?? config.defaultOrganizationId;
  const organizationCode = options?.organizationCode;
  const extraQueryParams: Record<string, string> = {};

  if (organizationId) {
    extraQueryParams.organization_id = organizationId;
  }
  if (organizationCode) {
    extraQueryParams.organization_code = organizationCode;
  }

  return {
    ...(Object.keys(extraQueryParams).length > 0 ? { extraQueryParams } : {}),
    ...(options?.resource ? { resource: options.resource } : {}),
    ...(options?.scopes?.length ? { scope: options.scopes.join(' ') } : {}),
  };
}

function buildIssuedTokenCacheKey(resource?: string, organizationId?: string) {
  return [resource ?? '', organizationId ?? ''].join('::');
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, '');
}

function buildTenantEntryUrl(endpoint: string, tenantSlug: string, route: 'sign-in' | 'register' | 'forgot-password') {
  const normalizedTenantSlug = tenantSlug.trim();
  if (!normalizedTenantSlug) {
    throw new Error('tenantSlug is required');
  }

  const url = new URL(normalizeEndpoint(endpoint));
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/t/${encodeURIComponent(normalizedTenantSlug)}/${route}`.replace(/\/{2,}/g, '/');
  return url.toString();
}

async function createAccountCenterSSOTicket(input: {
  endpoint: string;
  accessToken: string;
  options?: CodeBirdOpenAccountCenterOptions;
}) {
  const response = await fetch(`${normalizeEndpoint(input.endpoint)}/api/account/sso-ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: input.options?.target ?? DEFAULT_ACCOUNT_CENTER_TARGET,
      ...(input.options?.organizationId ? { organization_id: input.options.organizationId } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        code?: number;
        message?: string;
        result?: {
          redirect_url?: string;
        };
      }
    | null;

  if (!response.ok || payload?.code !== 0 || !payload?.result?.redirect_url) {
    throw new Error(payload?.message || 'Failed to create Account Center SSO ticket');
  }

  return payload.result.redirect_url;
}

async function fetchSessionContext(input: {
  endpoint: string;
  accessToken: string;
  options?: CodeBirdGetSessionContextOptions;
}) {
  const url = new URL(`${normalizeEndpoint(input.endpoint)}/api/session/context`);
  if (input.options?.organizationId) {
    url.searchParams.set('organization_id', input.options.organizationId);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        code?: number;
        message?: string;
        result?: CodeBirdSessionContext;
      }
    | null;
  const result = payload?.result;

  if (!response.ok || payload?.code !== 0 || !result?.user?.id || !result?.session?.subject) {
    throw new Error(payload?.message || 'Failed to load realtime session context');
  }

  return result;
}

function buildManagerConfigKey(config: CodeBirdProviderProps) {
  return [
    config.endpoint,
    config.appId,
    config.redirectUri,
    config.postLogoutRedirectUri,
    (config.scopes ?? DEFAULT_SCOPES).join(' '),
    config.defaultResource ?? '',
    config.defaultOrganizationId ?? '',
    config.configVersion ?? '',
    config.storage ?? 'localStorage',
    config.automaticSilentRenew ? '1' : '0',
  ].join('|');
}

function buildRecoveredAuthStateError(cause: Error) {
  const recoveryError = new Error(
    'Failed to load user state. Cleared local auth state and continued unauthenticated.',
  ) as Error & { cause?: unknown };
  recoveryError.cause = cause;
  return recoveryError;
}

async function recoverLocalAuthState(manager: CodeBirdManager) {
  let recovered = false;

  if (manager.removeUser) {
    await manager.removeUser();
    recovered = true;
  }

  if (manager.clearStaleState) {
    await manager.clearStaleState();
    recovered = true;
  }

  return recovered;
}

export function CodeBirdProvider({
  children,
  managerFactory,
  ...config
}: PropsWithChildren<CodeBirdProviderProps>) {
  validateConfig(config);

  const managerConfigKey = buildManagerConfigKey(config);
  const [manager, setManager] = useState(() => managerFactory?.(config) ?? createDefaultManager(config));
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<CodeBirdManagerUser | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
    config.defaultOrganizationId ?? null,
  );
  const managerConfigKeyRef = useRef(managerConfigKey);
  const userRef = useRef<CodeBirdManagerUser | null>(null);
  const tokenRequestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const issuedTokenCacheRef = useRef<Map<string, string>>(new Map());
  const inFlightIssuedTokenRequestsRef = useRef<Map<string, Promise<string | null>>>(new Map());

  useEffect(() => {
    if (managerConfigKeyRef.current === managerConfigKey) {
      return;
    }

    managerConfigKeyRef.current = managerConfigKey;
    userRef.current = null;
    tokenRequestQueueRef.current = Promise.resolve();
    issuedTokenCacheRef.current.clear();
    inFlightIssuedTokenRequestsRef.current.clear();
    setUser(null);
    setError(null);
    setIsLoading(true);
    setSelectedOrganizationId(config.defaultOrganizationId ?? null);
    setManager(managerFactory?.(config) ?? createDefaultManager(config));
  }, [config.defaultOrganizationId, managerConfigKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const loadedUser = await manager.getUser();

        if (!isMounted) {
          return;
        }

        setUser(loadedUser);
      } catch (cause) {
        if (!isMounted) {
          return;
        }

        const nextError = cause instanceof Error ? cause : new Error('Failed to load user');
        try {
          const recovered = await recoverLocalAuthState(manager);

          if (!isMounted) {
            return;
          }

          if (recovered) {
            userRef.current = null;
            issuedTokenCacheRef.current.clear();
            inFlightIssuedTokenRequestsRef.current.clear();
            setUser(null);
            setError(null);
            config.onError?.(buildRecoveredAuthStateError(nextError));
            return;
          }
        } catch (recoveryCause) {
          const recoveryError =
            recoveryCause instanceof Error ? recoveryCause : new Error('Failed to recover local auth state');
          const combinedError = new Error(
            `Failed to load user state and recover local auth state: ${recoveryError.message}`,
          ) as Error & { cause?: unknown };
          combinedError.cause = nextError;
          setError(combinedError);
          config.onError?.(combinedError);
          return;
        }

        setError(nextError);
        config.onError?.(nextError);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [manager]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const parsedOrganization = useMemo(
    () => parseOrganizationClaims(user?.profile ?? {}),
    [user],
  );

  const currentOrganizationId = resolveCurrentOrganizationId(
    parsedOrganization,
    config.defaultOrganizationId,
    selectedOrganizationId,
  );

  async function persistTokens(nextAccessToken?: string, nextRefreshToken?: string) {
    if (!userRef.current) {
      return;
    }

    const hasAccessTokenChanged =
      typeof nextAccessToken === 'string' && nextAccessToken !== userRef.current.access_token;
    const hasRefreshTokenChanged =
      typeof nextRefreshToken === 'string' && nextRefreshToken !== userRef.current.refresh_token;

    if (!hasAccessTokenChanged && !hasRefreshTokenChanged) {
      return;
    }

    const nextUser = {
      ...userRef.current,
      ...(hasAccessTokenChanged ? { access_token: nextAccessToken } : {}),
      ...(hasRefreshTokenChanged ? { refresh_token: nextRefreshToken } : {}),
    };

    userRef.current = nextUser;
    setUser(nextUser);
    await manager.storeUser?.(nextUser);
  }

  async function queueTokenRequest(input: {
    resource?: string;
    organizationId?: string;
    persistAccessToken?: boolean;
    cacheKey?: string;
  }) {
    const requestKey = input.cacheKey ?? buildIssuedTokenCacheKey(input.resource, input.organizationId);
    const existingRequest = inFlightIssuedTokenRequestsRef.current.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    const pending = tokenRequestQueueRef.current.then(async () => {
      if (input.resource && input.persistAccessToken) {
        const currentAccessToken = userRef.current?.access_token ?? null;
        if (currentAccessToken && tokenCanBeUsed(currentAccessToken, input.resource)) {
          return currentAccessToken;
        }
      }

      if (requestKey) {
        const cachedToken = issuedTokenCacheRef.current.get(requestKey);
        if (cachedToken && tokenCanBeUsed(cachedToken, input.resource)) {
          return cachedToken;
        }
      }

      const currentUser = userRef.current;
      const refreshToken = currentUser?.refresh_token;

      if (!refreshToken) {
        return null;
      }

      const payload = await requestToken({
        endpoint: config.endpoint,
        appId: config.appId,
        refreshToken,
        organizationId: input.organizationId,
        resource: input.resource,
      });

      await persistTokens(input.persistAccessToken ? payload.access_token : undefined, payload.refresh_token);
      if (input.cacheKey && payload.access_token) {
        issuedTokenCacheRef.current.set(input.cacheKey, payload.access_token);
      }
      return payload.access_token ?? null;
    });

    tokenRequestQueueRef.current = pending.then(
      () => undefined,
      () => undefined,
    );

    inFlightIssuedTokenRequestsRef.current.set(requestKey, pending);

    return pending.finally(() => {
      inFlightIssuedTokenRequestsRef.current.delete(requestKey);
    });
  }

  const value = useMemo<CodeBirdAuthValue>(
    () => ({
      isLoading,
      isAuthenticated: Boolean(user?.access_token),
      user,
      error,
      organization: parsedOrganization,
      currentOrganizationId,
      buildTenantSignInUrl: (tenantSlug) => buildTenantEntryUrl(config.endpoint, tenantSlug, 'sign-in'),
      buildTenantRegisterUrl: (tenantSlug) => buildTenantEntryUrl(config.endpoint, tenantSlug, 'register'),
      buildTenantForgotPasswordUrl: (tenantSlug) =>
        buildTenantEntryUrl(config.endpoint, tenantSlug, 'forgot-password'),
      signIn: async (options) => {
        await manager.signinRedirect(buildSignInArgs(config, options));
      },
      signOut: async () => {
        await manager.signoutRedirect();
      },
      refresh: async () => {
        const nextUser = await manager.getUser();
        userRef.current = nextUser;
        setUser(nextUser);
      },
      getAccessToken: async (resource) => {
        const targetResource = resource ?? config.defaultResource;
        const currentAccessToken = userRef.current?.access_token ?? null;

        if (!targetResource) {
          return currentAccessToken;
        }

        if (currentAccessToken && tokenCanBeUsed(currentAccessToken, targetResource)) {
          return currentAccessToken;
        }

        return queueTokenRequest({
          resource: targetResource,
          persistAccessToken: targetResource === config.defaultResource,
        });
      },
      getOrganizationToken: async (organizationId, resource) => {
        const nextOrganizationId = organizationId ?? currentOrganizationId;

        if (!nextOrganizationId) {
          return null;
        }

        const targetResource = resource ?? config.defaultResource;
        const cacheKey = buildIssuedTokenCacheKey(targetResource, nextOrganizationId);
        const cachedToken = issuedTokenCacheRef.current.get(cacheKey);

        if (cachedToken && tokenCanBeUsed(cachedToken, targetResource)) {
          return cachedToken;
        }

        if (cachedToken) {
          issuedTokenCacheRef.current.delete(cacheKey);
        }

        return queueTokenRequest({
          organizationId: nextOrganizationId,
          resource: targetResource,
          cacheKey,
        });
      },
      getSessionContext: async (options) => {
        const accessToken = user?.access_token ?? userRef.current?.access_token;

        if (!accessToken) {
          throw new Error('No authenticated user access token available');
        }

        return fetchSessionContext({
          endpoint: config.endpoint,
          accessToken,
          options,
        });
      },
      openAccountCenter: async (options) => {
        const accessToken = user?.access_token ?? userRef.current?.access_token;

        if (!accessToken) {
          throw new Error('No authenticated user access token available');
        }

        if (typeof window === 'undefined' || typeof window.open !== 'function') {
          throw new Error('Window is not available to open Account Center');
        }

        const redirectUrl = await createAccountCenterSSOTicket({
          endpoint: config.endpoint,
          accessToken,
          options,
        });

        const opened = window.open(redirectUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          throw new Error('Account Center tab was blocked by the browser');
        }
      },
      setCurrentOrganization: (organizationId) => {
        setSelectedOrganizationId(organizationId);
      },
      manager,
    }),
    [config.appId, config.defaultResource, config.endpoint, currentOrganizationId, error, isLoading, manager, parsedOrganization, user],
  );

  return <CodeBirdContext.Provider value={value}>{children}</CodeBirdContext.Provider>;
}
