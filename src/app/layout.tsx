import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getBrand } from "@/lib/settings";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: {
      default: `${brand.businessName} — Visa, Immigration & Travel Assistance`,
      template: `%s · ${brand.businessName}`,
    },
    description:
      "Verified visa information, honest cost estimates, and guided application assistance for travel, study, work, and business worldwide.",
    icons: brand.faviconSvg
      ? { icon: `data:image/svg+xml,${encodeURIComponent(brand.faviconSvg)}` }
      : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <html lang={brand.defaultLocale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
