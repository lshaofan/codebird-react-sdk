import { useCodeBirdAuth } from './use-codebird-auth';

export function useCodeBirdUser() {
  const auth = useCodeBirdAuth();
  const profile = auth.user?.profile ?? {};

  return {
    id: typeof profile.sub === 'string' ? profile.sub : null,
    name: typeof profile.name === 'string' ? profile.name : null,
    username: typeof profile.username === 'string' ? profile.username : null,
    email: typeof profile.email === 'string' ? profile.email : null,
    phoneNumber: typeof profile.phone_number === 'string' ? profile.phone_number : null,
    avatar: typeof profile.picture === 'string' ? profile.picture : null,
    rawClaims: profile,
  };
}
