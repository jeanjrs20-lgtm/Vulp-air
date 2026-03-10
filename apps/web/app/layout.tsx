import "./globals.css";
import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { Providers } from "@/components/providers";

const sora = Sora({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "VULP AIR FieldOps",
  description: "Plataforma interna para gestao de checklists, POPs e Field Service"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={sora.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
