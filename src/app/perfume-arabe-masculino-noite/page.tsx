import type { Metadata } from "next";
import SeoProgramaticoPage from "@/components/SeoProgramaticoPage";
import { getSeoProgramaticoBySlug } from "@/data/seo-programatico";

const config = getSeoProgramaticoBySlug("perfume-arabe-masculino-noite");
const pageUrl = config
  ? `https://www.maisonnoor.com.br/${config.slug}`
  : "https://www.maisonnoor.com.br";

export const metadata: Metadata = {
  title: config?.titulo || "Maison Noor Parfums",
  description:
    config?.descricao ||
    "Perfumes árabes originais com curadoria premium Maison Noor.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: config?.titulo || "Maison Noor Parfums",
    description:
      config?.descricao ||
      "Perfumes árabes originais com curadoria premium Maison Noor.",
    url: pageUrl,
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
    title: config?.titulo || "Maison Noor Parfums",
    description:
      config?.descricao ||
      "Perfumes árabes originais com curadoria premium Maison Noor.",
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
  if (!config) return null;
  return <SeoProgramaticoPage config={config} />;
}
