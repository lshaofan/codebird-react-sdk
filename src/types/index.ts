export type CodeBirdProviderConfig = {
  endpoint: string;
  appId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes?: string[];
  defaultResource?: string;
  defaultOrganizationId?: string;
  configVersion?: string;
  storage?: 'localStorage' | 'sessionStorage';
  automaticSilentRenew?: boolean;
  onError?: (error: Error) => void;
};

export type CodeBirdSignInOptions = {
  organizationId?: string;
  organizationCode?: string;
  resource?: string;
  scopes?: string[];
};

export type CodeBirdAccountCenterTarget = 'overview' | 'profile' | 'security' | 'connections';

export type CodeBirdOpenAccountCenterOptions = {
  target?: CodeBirdAccountCenterTarget;
  organizationId?: string;
};

export type CodeBirdGetSessionContextOptions = {
  organizationId?: string;
};

export type OrganizationRoles = Record<string, string[]>;

export type OrganizationContext = {
  currentOrganizationId: string | null;
  organizationIds: string[];
  organizationRoles: OrganizationRoles;
  isOrganizationAdmin: boolean;
};

export type CodeBirdManagerUser = {
  access_token?: string;
  refresh_token?: string;
  profile?: Record<string, unknown>;
};

export type CodeBirdManager = {
  getUser: () => Promise<CodeBirdManagerUser | null>;
  storeUser?: (user: unknown) => Promise<void>;
  removeUser?: () => Promise<void>;
  clearStaleState?: () => Promise<void>;
  signinRedirect: (args?: {
    extraQueryParams?: Record<string, string | number | boolean>;
    resource?: string;
    scope?: string;
  }) => Promise<void>;
  signinSilent: () => Promise<CodeBirdManagerUser | null>;
  signoutRedirect: () => Promise<void>;
  signinCallback: (url?: string) => Promise<CodeBirdManagerUser | null | undefined>;
};

export type CodeBirdSessionContextUser = {
  id: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  avatar?: string | null;
  updated_at?: number;
};

export type CodeBirdSessionContextApplication = {
  id: string;
  name: string;
  type: string;
  tenant_id: string;
};

export type CodeBirdSessionContextTenant = {
  id: string;
  slug: string;
  name: string;
};

export type CodeBirdSessionContextOrganization = {
  id: string;
  name: string;
  logo_url?: string | null;
  is_member: boolean;
  is_admin: boolean;
  roles: string[];
};

export type CodeBirdSessionContextOrganizationSummary = {
  id: string;
  name: string;
  logo_url?: string | null;
};

export type CodeBirdSessionContextSession = {
  subject: string;
  client_id?: string | null;
  scopes: string[];
  current_organization_id?: string | null;
};

export type CodeBirdSessionContext = {
  tenant?: CodeBirdSessionContextTenant | null;
  user: CodeBirdSessionContextUser;
  application?: CodeBirdSessionContextApplication | null;
  organization?: CodeBirdSessionContextOrganization | null;
  organizations: CodeBirdSessionContextOrganizationSummary[];
  session: CodeBirdSessionContextSession;
};

export type CodeBirdProviderProps = CodeBirdProviderConfig & {
  managerFactory?: (config: CodeBirdProviderConfig) => CodeBirdManager;
  children?: React.ReactNode;
};

export type CodeBirdAuthValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: CodeBirdManagerUser | null;
  error: Error | null;
  organization: OrganizationContext;
  currentOrganizationId: string | null;
  buildTenantSignInUrl: (tenantSlug: string) => string;
  buildTenantRegisterUrl: (tenantSlug: string) => string;
  buildTenantForgotPasswordUrl: (tenantSlug: string) => string;
  signIn: (options?: CodeBirdSignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  getAccessToken: (resource?: string) => Promise<string | null>;
  getOrganizationToken: (organizationId?: string, resource?: string) => Promise<string | null>;
  getSessionContext: (options?: CodeBirdGetSessionContextOptions) => Promise<CodeBirdSessionContext>;
  openAccountCenter: (options?: CodeBirdOpenAccountCenterOptions) => Promise<void>;
  setCurrentOrganization: (organizationId: string | null) => void;
  manager: CodeBirdManager;
};
