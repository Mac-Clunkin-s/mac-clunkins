import { useEffect, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: PostgrestError | null;
}

/** Runs a Supabase query on mount and whenever `deps` changes. RLS decides what comes back. */
export function useSupabaseQuery<T>(
  run: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  deps: unknown[],
): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    run().then(({ data, error }) => {
      if (cancelled) return;
      setState({ data, loading: false, error });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
