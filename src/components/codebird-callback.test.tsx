import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { CodeBirdProvider } from '../provider/codebird-provider';
import { CodeBirdCallback } from './codebird-callback';

describe('CodeBirdCallback', () => {
  it('renders callback processing text and completes signin callback', async () => {
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
        managerFactory={() => manager}
      >
        {children}
      </CodeBirdProvider>
    );

    const { unmount } = render(<CodeBirdCallback />, { wrapper });

    expect(screen.getByText(/callback processing/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(manager.signinCallback).toHaveBeenCalled();
    });

    unmount();
  });

  it('handles callback only once in strict mode', async () => {
    const manager = {
      getUser: vi.fn().mockResolvedValue(null),
      storeUser: vi.fn().mockResolvedValue(undefined),
      signinRedirect: vi.fn().mockResolvedValue(undefined),
      signinSilent: vi.fn().mockResolvedValue(null),
      signoutRedirect: vi.fn().mockResolvedValue(undefined),
      signinCallback: vi.fn().mockResolvedValue(null),
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <CodeBirdProvider
          endpoint="https://auth.example.com"
          appId="app_1"
          redirectUri="http://localhost:5173/callback"
          postLogoutRedirectUri="http://localhost:5173"
          managerFactory={() => manager}
        >
          {children}
        </CodeBirdProvider>
      </StrictMode>
    );

    const { unmount } = render(<CodeBirdCallback />, { wrapper });

    await waitFor(() => {
      expect(manager.signinCallback).toHaveBeenCalledTimes(1);
    });

    unmount();
  });
});
