import type { CodeBirdProviderConfig } from '../types';

export function validateConfig(config: Partial<CodeBirdProviderConfig>): asserts config is CodeBirdProviderConfig {
  if (!config.endpoint) {
    throw new Error('endpoint is required');
  }

  if (!config.appId) {
    throw new Error('appId is required');
  }

  if (!config.redirectUri) {
    throw new Error('redirectUri is required');
  }

  if (!config.postLogoutRedirectUri) {
    throw new Error('postLogoutRedirectUri is required');
  }
}
