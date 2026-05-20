import type { Metadata } from "next";
import Link from "next/link";
import { seoProgramaticoPages } from "@/data/seo-programatico";

export const metadata: Metadata = {
  title: "Guias de Perfumes Árabes | Maison Noor Parfums",
  description:
    "Guias Maison Noor sobre perfumes árabes doces, amadeirados, com baunilha, âmbar, alta fixação e presentes.",
  alternates: {
    canonical: "https://www.maisonnoor.com.br/seo-perfumes",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SeoPerfumesHubPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(212,175,119,0.20), transparent 28%), linear-gradient(180deg, #F8F2EA, #F4E9DA)",
        color: "#2F2721",
        fontFamily: "Inter, Arial, sans-serif",
        padding: "46px 18px",
      }}
    >
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Link
          href="/"
          style={{ color: "#9B7441", textDecoration: "none", fontWeight: 800, fontSize: 14 }}
        >
          ← Voltar para Maison Noor
        </Link>

        <div
          style={{
            marginTop: 18,
            borderRadius: 32,
            border: "1px solid rgba(216,193,162,0.35)",
            background:
              "radial-gradient(circle at top right, rgba(212,175,119,0.20), transparent 32%), linear-gradient(135deg, #18120D, #33261B)",
            color: "#FFF7EE",
            padding: 34,
            boxShadow: "0 28px 60px rgba(34,24,15,0.18)",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              color: "#C89A5D",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            SEO Maison Noor
          </p>
          <h1
            style={{
              margin: "0 0 12px",
              color: "#FFF7EE",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 48,
              lineHeight: 1.02,
              letterSpacing: "-0.055em",
            }}
          >
            Guias de perfumes árabes
          </h1>
          <p style={{ margin: 0, color: "rgba(255,247,238,0.78)", maxWidth: 760, fontSize: 17, lineHeight: 1.65 }}>
            Páginas criadas para ajudar clientes a encontrar fragrâncias por intenção de busca, nota olfativa,
            ocasião e estilo.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          {seoProgramaticoPages.map((page) => (
            <Link
              key={page.slug}
              href={`/${page.slug}`}
              style={{
                textDecoration: "none",
                color: "#2F2721",
                borderRadius: 24,
                border: "1px solid #EADBC8",
                background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
                padding: 20,
                boxShadow: "0 16px 34px rgba(48,34,20,0.08)",
              }}
            >
              <strong style={{ display: "block", fontSize: 18, lineHeight: 1.22, marginBottom: 8 }}>
                {page.h1}
              </strong>
              <span style={{ color: "#6F6258", fontSize: 13, lineHeight: 1.55 }}>{page.subtitulo}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
