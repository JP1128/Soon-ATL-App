import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BottomNavServer } from "@/components/navigation/bottom-nav-server";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soon ATL — Carpool Coordination",
  description:
    "Coordinate carpools for your weekly events. Drivers and riders matched automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        figtree.variable
      )}
    >
      <body className="flex h-full flex-col overflow-hidden">
        <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain pb-20">{children}</main>
        <BottomNavServer />
      </body>
    </html>
  );
}
