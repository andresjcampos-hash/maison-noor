import type { Metadata } from "next";
import ProdutoClient from "./produto-client";

export const metadata: Metadata = {
  title: "Maison Noor Parfums | Perfumes Árabes Premium",
  description:
    "Perfumes árabes originais com curadoria premium, fragrâncias marcantes, atendimento consultivo e envio para todo o Brasil.",
  alternates: {
    canonical: "https://www.maisonnoor.com.br",
  },
  openGraph: {
    title: "Maison Noor Parfums | Perfumes Árabes Premium",
    description:
      "Perfumes árabes originais com curadoria premium, fragrâncias marcantes, atendimento consultivo e envio para todo o Brasil.",
    url: "https://www.maisonnoor.com.br",
    siteName: "Maison Noor Parfums",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://www.maisonnoor.com.br/icon.png",
        width: 1200,
        height: 1200,
        alt: "Maison Noor Parfums",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Maison Noor Parfums | Perfumes Árabes Premium",
    description:
      "Perfumes árabes originais com curadoria premium, fragrâncias marcantes, atendimento consultivo e envio para todo o Brasil.",
    images: ["https://www.maisonnoor.com.br/icon.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function ProdutoPage() {
  return <ProdutoClient />;
}
