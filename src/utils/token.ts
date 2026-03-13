export type TokenRequestInput = {
  refreshToken: string;
  organizationId?: string;
  resource?: string;
};

export function buildTokenRequest(input: TokenRequestInput) {
  return {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    ...(input.organizationId ? { organization_id: input.organizationId } : {}),
    ...(input.resource ? { resource: input.resource } : {}),
  };
}

type RequestTokenInput = {
  endpoint: string;
  appId: string;
  refreshToken: string;
  organizationId?: string;
  resource?: string;
};

export type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

const RECENT_TOKEN_RESPONSE_TTL_MS = 2_000;
const inFlightTokenRequests = new Map<string, Promise<TokenResponse>>();
const recentTokenResponses = new Map<string, { payload: TokenResponse; expiresAt: number }>();

function buildTokenRequestKey(input: RequestTokenInput) {
  return [
    input.endpoint,
    input.appId,
    input.refreshToken,
    input.organizationId ?? '',
    input.resource ?? '',
  ].join('::');
}

export async function requestToken(input: RequestTokenInput) {
  const requestKey = buildTokenRequestKey(input);
  const now = Date.now();
  const recent = recentTokenResponses.get(requestKey);

  if (recent && recent.expiresAt > now) {
    return recent.payload;
  }

  const pending = inFlightTokenRequests.get(requestKey);
  if (pending) {
    return pending;
  }

  const requestPromise = (async () => {
  const response = await fetch(`${input.endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      ...buildTokenRequest({
        refreshToken: input.refreshToken,
        organizationId: input.organizationId,
        resource: input.resource,
      }),
      client_id: input.appId,
    }),
  });

  if (!response.ok) {
    let message = 'Failed to refresh token';

    try {
      const payload = (await response.json()) as { error_description?: string; error?: string };
      if (payload.error_description) {
        message = payload.error_description;
      } else if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore non-JSON error payloads and keep the generic message.
    }

    throw new Error(message);
  }

    const payload = (await response.json()) as TokenResponse;
    recentTokenResponses.set(requestKey, {
      payload,
      expiresAt: Date.now() + RECENT_TOKEN_RESPONSE_TTL_MS,
    });
    return payload;
  })();

  inFlightTokenRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightTokenRequests.delete(requestKey);
  }
}
