import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useCodeBirdAuth } from '../hooks/use-codebird-auth';

export type CodeBirdAuthGuardProps = {
  children: ReactNode;
  loadingFallback?: ReactNode;
  unauthenticatedFallback?: ReactNode;
  onUnauthenticated?: () => void | Promise<void>;
};

export function CodeBirdAuthGuard({
  children,
  loadingFallback = null,
  unauthenticatedFallback = null,
  onUnauthenticated,
}: CodeBirdAuthGuardProps) {
  const auth = useCodeBirdAuth();
  const hasHandledUnauthenticatedRef = useRef(false);

  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated) {
      hasHandledUnauthenticatedRef.current = false;
      return;
    }

    if (!onUnauthenticated || hasHandledUnauthenticatedRef.current) {
      return;
    }

    hasHandledUnauthenticatedRef.current = true;
    void onUnauthenticated();
  }, [auth.isAuthenticated, auth.isLoading, onUnauthenticated]);

  if (auth.isLoading) {
    return <>{loadingFallback}</>;
  }

  if (auth.isAuthenticated) {
    return <>{children}</>;
  }

  return <>{unauthenticatedFallback}</>;
}
