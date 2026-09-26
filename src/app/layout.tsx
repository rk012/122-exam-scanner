import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AccountMenu } from "@/components/AccountMenu";
import { QaBadge } from "@/components/QaBadge";
import { isQa } from "@/lib/build";
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
  title: isQa ? "[QA] 122 Check-in Scanner" : "122 Check-in Scanner",
  description: "QR check-in scanner for 15-122 exam nights",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <span className="font-semibold">122 Check-in Scanner</span>
          <QaBadge />
          <AccountMenu />
        </header>
        <main className="flex flex-1 flex-col px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
