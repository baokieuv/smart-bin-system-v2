"use client";

import type { ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { LanguageProvider } from "@/lib/language";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const content = <LanguageProvider>{children}</LanguageProvider>;

  if (!clientId) {
    return content;
  }

  return <GoogleOAuthProvider clientId={clientId}>{content}</GoogleOAuthProvider>;
}