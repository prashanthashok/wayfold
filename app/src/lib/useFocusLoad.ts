import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export interface LoadState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

/**
 * Runs `load` whenever the screen gains focus (so lists refresh after you save and navigate
 * back) and returns its result. `load` must be stable (wrap in useCallback).
 */
export function useFocusLoad<T>(load: () => Promise<T>): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: undefined, error: null, loading: true });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().then(
        (data) => !cancelled && setState({ data, error: null, loading: false }),
        (error: unknown) =>
          !cancelled &&
          setState((s) => ({
            data: s.data,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          })),
      );
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  return state;
}
