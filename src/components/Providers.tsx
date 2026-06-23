"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { PresenceProvider } from "./PresenceProvider";
import ReflectionGate from "./ReflectionGate";

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <PresenceProvider>
          {children}
          <ReflectionGate />
        </PresenceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
