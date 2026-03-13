import { useCodeBirdAuth } from './use-codebird-auth';

export function useOrganization() {
  const auth = useCodeBirdAuth();

  return {
    currentOrganizationId: auth.currentOrganizationId,
    organizationIds: auth.organization.organizationIds,
    organizationRoles: auth.organization.organizationRoles,
    isOrganizationAdmin: auth.organization.isOrganizationAdmin,
    setCurrentOrganization: auth.setCurrentOrganization,
  };
}
