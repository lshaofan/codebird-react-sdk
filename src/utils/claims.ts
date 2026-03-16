import type { OrganizationContext, OrganizationRoles } from '../types';

function parseOrganizationRoles(value: unknown): OrganizationRoles {
  if (!Array.isArray(value)) {
    return {};
  }

  return value.reduce<OrganizationRoles>((acc, item) => {
    if (typeof item !== 'string') {
      return acc;
    }

    const separatorIndex = item.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === item.length - 1) {
      return acc;
    }

    const orgId = item.slice(0, separatorIndex);
    const roleName = item.slice(separatorIndex + 1);
    const current = acc[orgId] ?? [];
    acc[orgId] = [...current, roleName];
    return acc;
  }, {});
}

export function parseOrganizationClaims(claims: Record<string, unknown>): OrganizationContext {
  return {
    currentOrganizationId: typeof claims.organization_id === 'string' ? claims.organization_id : null,
    organizationIds: Array.isArray(claims.organizations)
      ? claims.organizations.filter((item): item is string => typeof item === 'string')
      : [],
    organizationRoles: parseOrganizationRoles(claims.organization_roles),
    isOrganizationAdmin: claims.organization_is_admin === true,
  };
}
