import type { PropsWithChildren } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userManagerMock, webStorageStateStoreMock } = vi.hoisted(() => ({
  userManagerMock: vi.fn(),
  webStorageStateStoreMock: vi.fn(),
}));

vi.mock('oidc-client-ts', () => ({
  UserManager: userManagerMock,
  WebStorageStateStore: webStorageStateStoreMock,
}));

import { CodeBirdProvider } from './codebird-provider';

function TestWrapper({ children }: PropsWithChildren) {
  return (
    <CodeBirdProvider
      endpoint="https://auth.example.com"
      appId="app_1"
      redirectUri="http://localhost:5173/callback"
      postLogoutRedirectUri="http://localhost:5173"
      storage="sessionStorage"
    >
      {children}
    </CodeBirdProvider>
  );
}

describe('CodeBirdProvider storage wiring', () => {
  beforeEach(() => {
    userManagerMock.mockReset();
    webStorageStateStoreMock.mockReset();

    webStorageStateStoreMock.mockImplementation(({ store }) => ({ store }));
    userManagerMock.mockImplementation((settings) => ({
      settings,
      getUser: vi.fn().mockResolvedValue(null),
      signinRedirect: vi.fn().mockResolvedValue(undefined),
      signinSilent: vi.fn().mockResolvedValue(null),
      signoutRedirect: vi.fn().mockResolvedValue(undefined),
      signinCallback: vi.fn().mockResolvedValue(null),
    }));
  });

  it('uses the same configured storage for userStore and stateStore', async () => {
    render(<TestWrapper />);

    await waitFor(() => {
      expect(userManagerMock).toHaveBeenCalledTimes(1);
    });

    const settings = userManagerMock.mock.calls[0]?.[0];
    expect(settings.userStore).toBeDefined();
    expect(settings.stateStore).toBeDefined();
    expect(settings.userStore).toBe(settings.stateStore);
    expect(settings.userStore.store).toBe(window.sessionStorage);
  });

  it('passes defaultResource into the oidc manager settings', async () => {
    render(
      <CodeBirdProvider
        endpoint="https://auth.example.com"
        appId="app_1"
        redirectUri="http://localhost:5173/callback"
        postLogoutRedirectUri="http://localhost:5173"
        defaultResource="https://api.example.com"
        storage="sessionStorage"
      />,
    );

    await waitFor(() => {
      expect(userManagerMock).toHaveBeenCalled();
    });

    const settings = userManagerMock.mock.calls.at(-1)?.[0];
    expect(settings.resource).toBe('https://api.example.com');
  });

  it('uses a versioned storage prefix when configVersion is provided', async () => {
    render(
      <CodeBirdProvider
        endpoint="https://auth.example.com"
        appId="app_1"
        redirectUri="http://localhost:5173/callback"
        postLogoutRedirectUri="http://localhost:5173"
        storage="sessionStorage"
        configVersion="admin-v2"
      />,
    );

    await waitFor(() => {
      expect(webStorageStateStoreMock).toHaveBeenCalled();
    });

    const options = webStorageStateStoreMock.mock.calls.at(-1)?.[0];
    expect(options.prefix).toBe('oidc.admin-v2.');
  });

  it('disables automaticSilentRenew by default', async () => {
    render(
      <CodeBirdProvider
        endpoint="https://auth.example.com"
        appId="app_1"
        redirectUri="http://localhost:5173/callback"
        postLogoutRedirectUri="http://localhost:5173"
        storage="sessionStorage"
      />,
    );

    await waitFor(() => {
      expect(userManagerMock).toHaveBeenCalled();
    });

    const settings = userManagerMock.mock.calls.at(-1)?.[0];
    expect(settings.automaticSilentRenew).toBe(false);
  });

  it('uses client_secret_post so public SPA token exchange still submits client_id', async () => {
    render(
      <CodeBirdProvider
        endpoint="https://auth.example.com"
        appId="app_1"
        redirectUri="http://localhost:5173/callback"
        postLogoutRedirectUri="http://localhost:5173"
        storage="sessionStorage"
      />,
    );

    await waitFor(() => {
      expect(userManagerMock).toHaveBeenCalled();
    });

    const settings = userManagerMock.mock.calls.at(-1)?.[0];
    expect(settings.client_authentication).toBe('client_secret_post');
  });

  it('allows explicitly enabling automaticSilentRenew', async () => {
    render(
      <CodeBirdProvider
        endpoint="https://auth.example.com"
        appId="app_1"
        redirectUri="http://localhost:5173/callback"
        postLogoutRedirectUri="http://localhost:5173"
        storage="sessionStorage"
        automaticSilentRenew
      />,
    );

    await waitFor(() => {
      expect(userManagerMock).toHaveBeenCalled();
    });

    const settings = userManagerMock.mock.calls.at(-1)?.[0];
    expect(settings.automaticSilentRenew).toBe(true);
  });
});
