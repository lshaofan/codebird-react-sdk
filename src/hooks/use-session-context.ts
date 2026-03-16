import { useEffect, useRef, useState } from 'react';
import type { CodeBirdGetSessionContextOptions, CodeBirdSessionContext } from '../types';
import { useCodeBirdAuth } from './use-codebird-auth';

type UseSessionContextOptions = CodeBirdGetSessionContextOptions & {
  enabled?: boolean;
};

export function useSessionContext(options?: UseSessionContextOptions) {
  const auth = useCodeBirdAuth();
  const enabled = options?.enabled ?? true;
  const organizationId = options?.organizationId;

  const [data, setData] = useState<CodeBirdSessionContext | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  async function refresh() {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const nextData = await auth.getSessionContext({
        organizationId,
      });

      if (requestIdRef.current !== currentRequestId) {
        return null;
      }

      setData(nextData);
      return nextData;
    } catch (cause) {
      if (requestIdRef.current !== currentRequestId) {
        return null;
      }

      const nextError = cause instanceof Error ? cause : new Error('Failed to load session context');
      setError(nextError);
      throw nextError;
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (auth.isLoading) {
      setLoading(true);
      return;
    }

    void refresh();
  }, [auth.isLoading, enabled, organizationId]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
