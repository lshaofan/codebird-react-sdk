# Changelog

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
