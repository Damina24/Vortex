import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VORTEX AI — Creative Operating System for Video",
  description:
    "The first AI video platform that thinks like a marketer, not just a camera. Go from business goal → published, optimized campaign.",
  keywords: [
    "AI video",
    "video generation",
    "marketing",
    "content creation",
    "AI creative director",
  ],
  openGraph: {
    title: "VORTEX AI",
    description:
      "The first AI video platform that thinks like a marketer, not just a camera.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "hsl(var(--background))",
                color: "hsl(var(--foreground))",
                border: "1px solid hsl(var(--border))",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}