import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import {ActionConfirmations} from '@/components/action-confirmations';
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goblin Market",
  description: "Маркетплейс аккаунтов, валюты, ключей, подписок и цифровых офферов.",
  icons: {
    icon: "/market/icon.svg",
    shortcut: "/market/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" className={`${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-slate-950">
        <ActionConfirmations/>
        <div className="min-h-screen overflow-x-hidden">
          <SiteHeader />
          <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1400px] min-w-0 flex-col overflow-x-hidden px-3 pb-28 pt-4 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
