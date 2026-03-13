import type { OrganizationContext, OrganizationRoles } from '../types';

function isOrganizationRoles(value: unknown): value is OrganizationRoles {
  return typeof value === 'object' && value !== null;
}

export function parseOrganizationClaims(claims: Record<string, unknown>): OrganizationContext {
  return {
    currentOrganizationId: typeof claims.organization_id === 'string' ? claims.organization_id : null,
    organizationIds: Array.isArray(claims.organizations)
      ? claims.organizations.filter((item): item is string => typeof item === 'string')
      : [],
    organizationRoles: isOrganizationRoles(claims.organization_roles)
      ? claims.organization_roles
      : {},
    isOrganizationAdmin: claims.organization_is_admin === true,
  };
}
