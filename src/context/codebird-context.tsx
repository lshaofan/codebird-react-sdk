import { createContext, useContext } from 'react';
import type { CodeBirdAuthValue } from '../types';

export const CodeBirdContext = createContext<CodeBirdAuthValue | null>(null);

export function useCodeBirdContext() {
  const value = useContext(CodeBirdContext);

  if (!value) {
    throw new Error('CodeBirdProvider is required');
  }

  return value;
}
