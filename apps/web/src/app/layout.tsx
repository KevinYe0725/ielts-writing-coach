import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { LocaleProvider } from "@/components/locale-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IELTS Writing Coach",
    template: "%s · IELTS Writing",
  },
  description: "A low-friction, evidence-based IELTS Writing learning loop.",
  applicationName: "IELTS Writing Coach",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f5f7fb",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <LocaleProvider>
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
