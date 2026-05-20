import type { Metadata } from "next";
import CategoriaSeoPage from "@/components/CategoriaSeoPage";

export const metadata: Metadata = {
  title: "Perfumes Árabes Masculinos | Maison Noor Parfums",
  description:
    "Perfumes árabes masculinos originais com curadoria premium Maison Noor. Fragrâncias intensas, amadeiradas, marcantes e sofisticadas.",
  alternates: {
    canonical: "https://www.maisonnoor.com.br/perfumes-arabes-masculinos",
  },
  openGraph: {
    title: "Perfumes Árabes Masculinos | Maison Noor Parfums",
    description:
      "Perfumes árabes masculinos originais com curadoria premium Maison Noor. Fragrâncias intensas, amadeiradas, marcantes e sofisticadas.",
    url: "https://www.maisonnoor.com.br/perfumes-arabes-masculinos",
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
    title: "Perfumes Árabes Masculinos | Maison Noor Parfums",
    description:
      "Perfumes árabes masculinos originais com curadoria premium Maison Noor. Fragrâncias intensas, amadeiradas, marcantes e sofisticadas.",
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
      categoria="masculino"
      titulo="Perfumes Árabes Masculinos"
      subtitulo="Fragrâncias masculinas árabes para quem busca presença, elegância, projeção e uma assinatura marcante em todos os momentos."
      descricaoSeo="Perfumes árabes masculinos originais com curadoria premium Maison Noor. Fragrâncias intensas, amadeiradas, marcantes e sofisticadas."
      headline="Perfumes árabes masculinos intensos e sofisticados"
      chamada="Uma seleção pensada para homens que procuram perfumes árabes marcantes, sofisticados e com presença memorável."
      badge="Perfumes árabes masculinos"
    />
  );
}
