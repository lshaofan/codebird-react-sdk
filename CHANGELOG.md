# Changelog

## 0.4.2

### Added

- Added tenant-scoped end-user entry helpers: `buildTenantSignInUrl()`, `buildTenantRegisterUrl()`, and `buildTenantForgotPasswordUrl()`.
- Added `tenant { id, slug, name }` to realtime session context types so SDK consumers can resolve tenant-scoped routes explicitly.

### Changed

- Account Center SDK docs now standardize on tenant-scoped routes and keep `openAccountCenter()` as the recommended entry point.

## 0.4.1

### Fixed

- Fixed `getSessionContext()` and `useSessionContext()` to correctly parse the standard `code/message/result` envelope returned by `/api/session/context`.
- Updated tests to validate the real backend response shape instead of a flattened payload.

## 0.4.0

### Added

- Added `getSessionContext()` for loading realtime user/application/organization context with the current access token.
- Added `useSessionContext()` for React pages that need realtime context and refresh capability.
- Added support for opening Account Center through the public SDK API in a new browser tab.

### Changed

- `organization_roles` claims are now parsed using the new string-array format only, for example `["org_123:admin"]`.
- Legacy object-map claims parsing has been removed from the React SDK.
- Existing `useCodeBirdUser()` and organization claims helpers remain available, but realtime authorization decisions should prefer session context.

## 0.3.0

### Added

- Added `openAccountCenter()` to open CodeBird Account Center in a new browser tab for already authenticated users.
- Added support for passing `target` and `organizationId` so third-party apps can route users directly to the intended personal center page and organization context.

### Notes

- This is a backward-compatible feature release.
- The SDK now encapsulates the `/api/account/sso-ticket` flow and opens the returned `redirect_url` with `window.open(..., '_blank')`.

## 0.2.3

### Fixed

- Fixed SPA authorization code callback flows by explicitly configuring `client_authentication` for the underlying OIDC client.
- Ensured `client_id` is included when exchanging authorization codes at the token endpoint, preventing `invalid_request` errors caused by missing required parameters.

### Notes

- This is a backward-compatible patch release.
- Consumers using SPA login flows should upgrade to `0.2.3` to avoid token exchange failures during OIDC callback handling.
