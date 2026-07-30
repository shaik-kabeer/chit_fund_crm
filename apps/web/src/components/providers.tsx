'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

function createQueryClient() {
  let client: QueryClient;

  const mutationCache = new MutationCache({
    // Any write can affect seats, totals and schedules across several screens,
    // so refresh every active query after a successful mutation.
    onSuccess: () => {
      client.invalidateQueries();
    },
  });

  client = new QueryClient({
    mutationCache,
    defaultOptions: {
      queries: {
        // Financial data must reflect the latest server state, never a stale cache
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  return client;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const hydrate = useAuth((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
