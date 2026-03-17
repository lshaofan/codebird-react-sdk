import type { ReactNode } from 'react';
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeBirdProvider } from '../provider/codebird-provider';
import { CodeBirdAuthGuard } from './codebird-auth-guard';

function createManager(user: { access_token?: string; profile?: Record<string, unknown> } | null) {
  return {
    getUser: vi.fn().mockResolvedValue(user),
    storeUser: vi.fn().mockResolvedValue(undefined),
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signinSilent: vi.fn().mockResolvedValue(null),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
    signinCallback: vi.fn().mockResolvedValue(null),
  };
}

function createWrapper(manager: ReturnType<typeof createManager>, useStrictMode = false) {
  const content = ({ children }: { children: ReactNode }) => (
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

  if (!useStrictMode) {
    return content;
  }

  return ({ children }: { children: ReactNode }) => <StrictMode>{content({ children })}</StrictMode>;
}

describe('CodeBirdAuthGuard', () => {
  it('renders loading fallback while auth state is loading', () => {
    const manager = createManager(null);
    manager.getUser = vi.fn(() => new Promise(() => undefined));
    const wrapper = createWrapper(manager);

    render(
      <CodeBirdAuthGuard loadingFallback={<div>loading</div>}>
        <div>protected</div>
      </CodeBirdAuthGuard>,
      { wrapper },
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders protected content when authenticated', async () => {
    const manager = createManager({
      access_token: 'token',
      profile: { sub: 'user_1' },
    });
    const wrapper = createWrapper(manager);

    render(
      <CodeBirdAuthGuard unauthenticatedFallback={<div>redirecting</div>}>
        <div>protected</div>
      </CodeBirdAuthGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText('protected')).toBeInTheDocument();
    });

    expect(screen.queryByText('redirecting')).not.toBeInTheDocument();
  });

  it('renders unauthenticated fallback and invokes callback when unauthenticated', async () => {
    const manager = createManager(null);
    const onUnauthenticated = vi.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper(manager);

    const view = render(
      <CodeBirdAuthGuard
        unauthenticatedFallback={<div>redirecting</div>}
        onUnauthenticated={onUnauthenticated}
      >
        <div>protected</div>
      </CodeBirdAuthGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText('redirecting')).toBeInTheDocument();
    });

    expect(within(view.container).queryByText('protected')).not.toBeInTheDocument();
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('invokes onUnauthenticated only once in strict mode', async () => {
    const manager = createManager(null);
    const onUnauthenticated = vi.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper(manager, true);

    render(
      <CodeBirdAuthGuard
        unauthenticatedFallback={<div>redirecting</div>}
        onUnauthenticated={onUnauthenticated}
      >
        <div>protected</div>
      </CodeBirdAuthGuard>,
      { wrapper },
    );

    await waitFor(() => {
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });
  });
});
