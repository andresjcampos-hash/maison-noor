import type { Metadata } from "next";
import CategoriaSeoPage from "@/components/CategoriaSeoPage";

export const metadata: Metadata = {
  title: "Perfumes Árabes Femininos | Maison Noor Parfums",
  description:
    "Perfumes árabes femininos originais com curadoria premium Maison Noor. Fragrâncias doces, florais, marcantes e sofisticadas com envio para o Brasil.",
  alternates: {
    canonical: "https://www.maisonnoor.com.br/perfumes-arabes-femininos",
  },
  openGraph: {
    title: "Perfumes Árabes Femininos | Maison Noor Parfums",
    description:
      "Perfumes árabes femininos originais com curadoria premium Maison Noor. Fragrâncias doces, florais, marcantes e sofisticadas com envio para o Brasil.",
    url: "https://www.maisonnoor.com.br/perfumes-arabes-femininos",
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
    title: "Perfumes Árabes Femininos | Maison Noor Parfums",
    description:
      "Perfumes árabes femininos originais com curadoria premium Maison Noor. Fragrâncias doces, florais, marcantes e sofisticadas com envio para o Brasil.",
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
      categoria="feminino"
      titulo="Perfumes Árabes Femininos"
      subtitulo="Seleção premium de fragrâncias femininas árabes para quem busca elegância, doçura, sofisticação e uma assinatura olfativa inesquecível."
      descricaoSeo="Perfumes árabes femininos originais com curadoria premium Maison Noor. Fragrâncias doces, florais, marcantes e sofisticadas com envio para o Brasil."
      headline="Perfumes árabes femininos para marcar presença"
      chamada="Uma página criada para fortalecer a busca por perfumes árabes femininos e apresentar os produtos certos para quem procura feminilidade, presença e luxo árabe."
      badge="Perfumes árabes femininos"
    />
  );
}
