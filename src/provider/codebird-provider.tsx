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
import { CodeBirdTokenRequestError, requestToken } from '../utils/token';

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

function buildRecoveredRefreshAuthStateError(cause: Error) {
  const recoveryError = new Error(
    'Failed to refresh access token. Cleared local auth state and continued unauthenticated.',
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

function currentTokenCanBeUsed(token?: string, audience?: string) {
  if (!token) {
    return false;
  }

  if (!token.includes('.')) {
    return !audience;
  }

  return tokenCanBeUsed(token, audience);
}

function cloneUserPreservingPrototype<T extends object>(user: T): T {
  return Object.assign(
    Object.create(Object.getPrototypeOf(user) ?? Object.prototype),
    user,
  ) as T;
}

function shouldClearAuthStateForTokenRefreshFailure(error: unknown) {
  return error instanceof CodeBirdTokenRequestError && error.code === 'invalid_grant';
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

        userRef.current = loadedUser;
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

  const parsedOrganization = useMemo(
    () => parseOrganizationClaims(user?.profile ?? {}),
    [user],
  );

  const currentOrganizationId = resolveCurrentOrganizationId(
    parsedOrganization,
    config.defaultOrganizationId,
    selectedOrganizationId,
  );

  async function clearLocalAuthStateAfterRefreshFailure(cause: Error) {
    userRef.current = null;
    issuedTokenCacheRef.current.clear();
    inFlightIssuedTokenRequestsRef.current.clear();
    setUser(null);
    setError(null);

    const nextError = buildRecoveredRefreshAuthStateError(cause);

    try {
      await recoverLocalAuthState(manager);
      config.onError?.(nextError);
      return;
    } catch (recoveryCause) {
      const recoveryError =
        recoveryCause instanceof Error ? recoveryCause : new Error('Failed to recover local auth state');
      const combinedError = new Error(
        `Failed to clear local auth state after refresh token failure: ${recoveryError.message}`,
      ) as Error & { cause?: unknown };
      combinedError.cause = cause;
      setError(combinedError);
      config.onError?.(combinedError);
    }
  }

  async function persistTokens(input: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
    scope?: string;
  }) {
    if (!userRef.current) {
      return;
    }

    const hasAccessTokenChanged =
      typeof input.accessToken === 'string' && input.accessToken !== userRef.current.access_token;
    const hasRefreshTokenChanged =
      typeof input.refreshToken === 'string' && input.refreshToken !== userRef.current.refresh_token;
    const nextExpiresAt =
      typeof input.expiresIn === 'number' && Number.isFinite(input.expiresIn)
        ? Math.floor(Date.now() / 1000) + Math.max(0, Math.floor(input.expiresIn))
        : undefined;
    const hasExpiryChanged =
      typeof nextExpiresAt === 'number' && nextExpiresAt !== userRef.current.expires_at;
    const hasTokenTypeChanged =
      typeof input.tokenType === 'string' && input.tokenType !== userRef.current.token_type;
    const hasScopeChanged = typeof input.scope === 'string' && input.scope !== userRef.current.scope;

    if (!hasAccessTokenChanged && !hasRefreshTokenChanged && !hasExpiryChanged && !hasTokenTypeChanged && !hasScopeChanged) {
      return;
    }

    const nextUser = Object.assign(
      cloneUserPreservingPrototype(userRef.current),
      ...(hasAccessTokenChanged ? [{ access_token: input.accessToken }] : []),
      ...(hasRefreshTokenChanged ? [{ refresh_token: input.refreshToken }] : []),
      ...(hasExpiryChanged ? [{ expires_at: nextExpiresAt }] : []),
      ...(hasTokenTypeChanged ? [{ token_type: input.tokenType }] : []),
      ...(hasScopeChanged ? [{ scope: input.scope }] : []),
    );

    userRef.current = nextUser;
    setUser(nextUser);
    await manager.storeUser?.(nextUser);
  }

  async function queueTokenRequest(input: {
    resource?: string;
    organizationId?: string;
    persistAccessToken?: boolean;
    cacheKey?: string;
  }): Promise<string | null> {
    const requestKey = input.cacheKey ?? buildIssuedTokenCacheKey(input.resource, input.organizationId);
    const existingRequest = inFlightIssuedTokenRequestsRef.current.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    const pending = tokenRequestQueueRef.current.then(async () => {
      if (input.persistAccessToken) {
        const currentAccessToken = userRef.current?.access_token ?? user?.access_token ?? null;
        if (currentTokenCanBeUsed(currentAccessToken ?? undefined, input.resource)) {
        return currentAccessToken ?? null;
      }
      }

      if (requestKey) {
        const cachedToken = issuedTokenCacheRef.current.get(requestKey);
        if (currentTokenCanBeUsed(cachedToken, input.resource)) {
          return cachedToken ?? null;
        }
      }

      const currentUser = userRef.current ?? user;
      const refreshToken = currentUser?.refresh_token;

      if (!refreshToken) {
        return null;
      }

      let payload;
      try {
        payload = await requestToken({
          endpoint: config.endpoint,
          appId: config.appId,
          refreshToken,
          organizationId: input.organizationId,
          resource: input.resource,
        });
      } catch (cause) {
        if (shouldClearAuthStateForTokenRefreshFailure(cause)) {
          await clearLocalAuthStateAfterRefreshFailure(
            cause instanceof Error ? cause : new Error('Failed to refresh token'),
          );
          return null;
        }

        throw cause;
      }

      await persistTokens({
        accessToken: input.persistAccessToken ? payload.access_token : undefined,
        refreshToken: payload.refresh_token,
        expiresIn: payload.expires_in,
        tokenType: payload.token_type,
        scope: payload.scope,
      });
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
    }) ?? null;
  }

  async function ensureFreshAccessToken(resource?: string): Promise<string | null> {
    const currentAccessToken = userRef.current?.access_token ?? user?.access_token ?? null;

    if (!currentAccessToken) {
      return null;
    }

    if (currentTokenCanBeUsed(currentAccessToken ?? undefined, resource)) {
      return currentAccessToken ?? null;
    }

    return (
      (await queueTokenRequest({
        resource,
        persistAccessToken: true,
      })) ?? null
    );
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
        return ensureFreshAccessToken(targetResource);
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
        const accessToken = await ensureFreshAccessToken(config.defaultResource);

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
        const accessToken = await ensureFreshAccessToken(config.defaultResource);

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
