# Changelog

## 0.2.3

### Fixed

- Fixed SPA authorization code callback flows by explicitly configuring `client_authentication` for the underlying OIDC client.
- Ensured `client_id` is included when exchanging authorization codes at the token endpoint, preventing `invalid_request` errors caused by missing required parameters.

### Notes

- This is a backward-compatible patch release.
- Consumers using SPA login flows should upgrade to `0.2.3` to avoid token exchange failures during OIDC callback handling.
