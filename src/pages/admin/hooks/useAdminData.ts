import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, Result } from '../api';

export interface AdminData<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

/** Runs an api.ts loader on mount, when `deps` change, and on reload(). */
export function useAdminData<T>(run: () => PromiseLike<Result<T>>, deps: unknown[]): AdminData<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: ApiError | null }>({
    data: null, loading: true, error: null,
  });
  const [tick, setTick] = useState(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(runRef.current()).then((r) => {
      if (!cancelled) setState({ data: r.data, loading: false, error: r.error });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
