import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BottomNavServer } from "@/components/navigation/bottom-nav-server";
import { FluidWaveLoader } from "@/components/ui/fluid-wave-loader";

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
  title: "Soon ATL",
  description:
    "Soon ATL is work in progress. Ask JP for access or more information.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
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
        <main
          className="flex flex-1 flex-col items-center overflow-y-auto overscroll-contain pb-20"
          style={{
            maskImage: "linear-gradient(to bottom, black calc(100% - 5rem), transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 5rem), transparent)",
          }}
        >{children}</main>
        <BottomNavServer />
        <FluidWaveLoader />
      </body>
    </html>
  );
}
