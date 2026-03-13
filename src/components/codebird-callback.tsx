import { useEffect, useRef, useState } from 'react';
import { useCodeBirdAuth } from '../hooks/use-codebird-auth';
import { toCodeBirdError } from '../utils/errors';

export function CodeBirdCallback() {
  const auth = useCodeBirdAuth();
  const [callbackError, setCallbackError] = useState<Error | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function handleCallback() {
      if (handledRef.current) {
        return;
      }

      handledRef.current = true;

      try {
        await auth.manager.signinCallback(window.location.href);
        await auth.refresh();
      } catch (error) {
        if (isMounted) {
          setCallbackError(toCodeBirdError(error, 'Failed to handle callback'));
        }
      }
    }

    void handleCallback();

    return () => {
      isMounted = false;
    };
  }, [auth]);

  if (callbackError) {
    return <div>{callbackError.message}</div>;
  }

  return <div>Callback processing...</div>;
}
