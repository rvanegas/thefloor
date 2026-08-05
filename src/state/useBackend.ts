import { useEffect, useReducer } from 'react';
import { backend } from '../mock/backend';

/**
 * Re-renders the caller whenever backend state changes. The backend also emits
 * on a short interval while a session is live, which keeps floor countdowns,
 * cooldowns, and elapsed time ticking without each view owning a timer.
 */
export function useBackendState(): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => backend.subscribe(bump), []);
  return version;
}
