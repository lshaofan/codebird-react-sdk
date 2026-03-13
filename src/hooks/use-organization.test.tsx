import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeBirdProvider, useOrganization } from '../index';

describe('useOrganization', () => {
  it('returns current organization context from claims', async () => {
    const manager = {
      getUser: vi.fn().mockResolvedValue({
        access_token: 'access_token_1',
        refresh_token: 'refresh_token_1',
        profile: {
          organizations: ['org_1', 'org_2'],
          organization_roles: {
            org_1: ['admin'],
            org_2: ['member'],
          },
          organization_id: 'org_1',
          organization_is_admin: true,
        },
      }),
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

    const { result } = renderHook(() => useOrganization(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentOrganizationId).toBe('org_1');
    });

    expect(result.current.organizationIds).toEqual(['org_1', 'org_2']);
    expect(result.current.organizationRoles.org_1).toEqual(['admin']);
    expect(result.current.isOrganizationAdmin).toBe(true);
  });
});
