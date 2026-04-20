// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maison Noor Parfums | Perfumes Árabes Premium",
  description: "Perfumes árabes originais com curadoria premium. Entrega rápida e fragrâncias exclusivas.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className="
          min-h-screen
          bg-black
          text-zinc-200
          antialiased
          selection:bg-amber-500
          selection:text-black
        "
      >
        {children}
      </body>
    </html>
  );
}
