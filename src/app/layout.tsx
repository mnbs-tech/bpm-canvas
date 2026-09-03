import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ワークフロービルダー",
  description: "スイムレーン形式のワークフロー図を作成・保存できるツール",
};

// Next.js can serve a fully static/prerendered page straight from its route
// cache without invoking proxy.ts - that would let an unauthenticated
// request through. This is a purely client-rendered tool anyway (no benefit
// from static prerendering), so force every request down the dynamic path
// where the Cognito gate always runs.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen flex-col overflow-hidden">{children}</body>
    </html>
  );
}
