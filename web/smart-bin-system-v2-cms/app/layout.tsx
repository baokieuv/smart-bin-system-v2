import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import ToastHost from "@/components/ui/toast-host";
import { LanguageSwitcher } from "@/components/ui/language-switcher"; // Import component mới
import "./globals.css";
import { Providers } from "@/app/providers";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InnoEco - Trung tâm quản trị",
  description: "Khu vực quản trị danh mục, sản phẩm, đơn hàng, người dùng, thiết bị và thông báo.",
};

const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en" // Ghi chú: Thẻ lang thực tế sẽ được context update động ở phía client
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {recaptchaSiteKey ? (
          <Script
            src={`https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`}
            strategy="afterInteractive"
          />
        ) : null}
        <ToastHost />
        <Providers>
          {/* Nhúng nút chuyển ngôn ngữ toàn cục tại đây */}
          <LanguageSwitcher />
          {children}
        </Providers>
      </body>
    </html>
  );
}