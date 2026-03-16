import { describe, expect, it } from 'vitest';
import { parseOrganizationClaims } from './claims';

describe('parseOrganizationClaims', () => {
  it('returns normalized organization context from string-array organization roles claims', () => {
    const result = parseOrganizationClaims({
      organizations: ['org_1', 'org_2'],
      organization_roles: ['org_1:admin', 'org_2:member'],
      organization_id: 'org_1',
      organization_is_admin: true,
    });

    expect(result.currentOrganizationId).toBe('org_1');
    expect(result.organizationIds).toEqual(['org_1', 'org_2']);
    expect(result.organizationRoles.org_1).toEqual(['admin']);
    expect(result.organizationRoles.org_2).toEqual(['member']);
    expect(result.isOrganizationAdmin).toBe(true);
  });

  it('ignores legacy object-map organization roles claims', () => {
    const result = parseOrganizationClaims({
      organizations: ['org_1'],
      organization_roles: { org_1: ['admin'] },
      organization_id: 'org_1',
      organization_is_admin: true,
    });

    expect(result.organizationRoles).toEqual({});
    expect(result.isOrganizationAdmin).toBe(true);
  });
});
