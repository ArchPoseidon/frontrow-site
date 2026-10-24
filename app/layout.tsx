import type { Metadata } from "next";
import { Suspense } from "react";
import { Big_Shoulders, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Backdrop } from "@/components/shell/Backdrop";
import { SupportChat } from "@/components/support/SupportChat";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FrontRow",
  description: "Be the first to know about a show.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${bigShoulders.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<div aria-hidden className="fixed inset-0 -z-10 bg-background" />}>
          <Backdrop />
        </Suspense>
        {children}
        <SupportChat />
      </body>
    </html>
  );
}
