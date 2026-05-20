import type { Metadata } from "next";
import CategoriaSeoPage from "@/components/CategoriaSeoPage";

export const metadata: Metadata = {
  title: "Body Splash Perfumado | Maison Noor Parfums",
  description:
    "Body splash e cuidados perfumados Maison Noor. Fragrâncias leves, confortáveis e sofisticadas para rotina, pós-banho e presente.",
  alternates: {
    canonical: "https://www.maisonnoor.com.br/body-splash",
  },
  openGraph: {
    title: "Body Splash Perfumado | Maison Noor Parfums",
    description:
      "Body splash e cuidados perfumados Maison Noor. Fragrâncias leves, confortáveis e sofisticadas para rotina, pós-banho e presente.",
    url: "https://www.maisonnoor.com.br/body-splash",
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
    title: "Body Splash Perfumado | Maison Noor Parfums",
    description:
      "Body splash e cuidados perfumados Maison Noor. Fragrâncias leves, confortáveis e sofisticadas para rotina, pós-banho e presente.",
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
      categoria="body-splash"
      titulo="Body Splash Perfumado"
      subtitulo="Seleção de body splash e cuidados perfumados para quem busca leveza, conforto, sensação de banho tomado e presença delicada."
      descricaoSeo="Body splash e cuidados perfumados Maison Noor. Fragrâncias leves, confortáveis e sofisticadas para rotina, pós-banho e presente."
      headline="Body splash perfumado para rotina e cuidado diário"
      chamada="Uma página para fortalecer buscas por body splash e apresentar opções leves, perfumadas e sofisticadas da Maison Noor."
      badge="Body splash Maison Noor"
    />
  );
}
