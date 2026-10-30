import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Meeting Insights — Interhuman + Recall",
  description:
    "See how a speaker came across: confidence, hesitation, engagement, and conversation quality, detected from a real meeting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "surface !text-foreground !border-0 [&_[data-icon]]:text-foreground",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
