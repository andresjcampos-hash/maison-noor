import type { Metadata } from "next";
import CategoriaSeoPage from "@/components/CategoriaSeoPage";

export const metadata: Metadata = {
  title: "Perfumes Árabes Unissex | Maison Noor Parfums",
  description:
    "Perfumes árabes unissex originais com curadoria premium Maison Noor. Fragrâncias versáteis, elegantes e marcantes para diferentes estilos.",
  alternates: {
    canonical: "https://www.maisonnoor.com.br/perfumes-arabes-unissex",
  },
  openGraph: {
    title: "Perfumes Árabes Unissex | Maison Noor Parfums",
    description:
      "Perfumes árabes unissex originais com curadoria premium Maison Noor. Fragrâncias versáteis, elegantes e marcantes para diferentes estilos.",
    url: "https://www.maisonnoor.com.br/perfumes-arabes-unissex",
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
    title: "Perfumes Árabes Unissex | Maison Noor Parfums",
    description:
      "Perfumes árabes unissex originais com curadoria premium Maison Noor. Fragrâncias versáteis, elegantes e marcantes para diferentes estilos.",
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

export default function Page() {
  return (
    <CategoriaSeoPage
      categoria="unissex"
      titulo="Perfumes Árabes Unissex"
      subtitulo="Seleção premium de fragrâncias árabes versáteis, refinadas e marcantes para quem deseja elegância sem rótulos."
      descricaoSeo="Perfumes árabes unissex originais com curadoria premium Maison Noor. Fragrâncias versáteis, elegantes e marcantes para diferentes estilos."
      headline="Perfumes árabes unissex para todos os estilos"
      chamada="Uma página estratégica para ranquear perfumes árabes unissex e apresentar opções que combinam com diferentes estilos e ocasiões."
      badge="Perfumes árabes unissex"
    />
  );
}
