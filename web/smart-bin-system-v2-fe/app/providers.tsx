'use client';

// Provider composition for app-wide contexts such as OAuth.

import { GoogleOAuthProvider } from '@react-oauth/google';
import { ToastProvider } from '@/components/ui/use-toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      <ToastProvider>{children}</ToastProvider>
    </GoogleOAuthProvider>
  );
}