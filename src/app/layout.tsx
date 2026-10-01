import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexora — Clear scope. Smoother projects.",
  description: "A local brief-to-scope workspace for independent web teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
