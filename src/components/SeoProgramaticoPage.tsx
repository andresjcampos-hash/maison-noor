"use client";

import Link from "next/link";

type Config = {
  slug: string;
  titulo: string;
  descricao: string;
};

type Props = {
  config: Config;
};

export default function SeoProgramaticoPage({ config }: Props) {
  if (!config) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(215,192,160,0.20), transparent 26%), linear-gradient(180deg, #F8F2EA 0%, #F5EFE6 100%)",
        color: "#2B2B2B",
        fontFamily: "Arial, sans-serif",
        padding: "36px 18px",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", marginBottom: 20, color: "#9B7441", textDecoration: "none", fontWeight: 800 }}>
          ← Voltar para Maison Noor
        </Link>

        <section
          style={{
            borderRadius: 32,
            padding: "34px 28px",
            border: "1px solid #EADBC8",
            background:
              "radial-gradient(circle at top right, rgba(212,175,119,0.18), transparent 34%), linear-gradient(135deg, #1F1A14, #3A2A1E)",
            color: "#FFF7EE",
            boxShadow: "0 24px 54px rgba(48,34,20,0.14)",
            marginBottom: 26,
          }}
        >
          <p style={{ margin: "0 0 10px", color: "#D8B178", fontSize: 12, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Guia Maison Noor
          </p>

          <h1 style={{ margin: "0 0 14px", fontSize: "clamp(30px, 5vw, 54px)", lineHeight: 1.02, fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {config.titulo}
          </h1>

          <p style={{ margin: 0, maxWidth: 760, color: "rgba(255,247,238,0.78)", fontSize: 16, lineHeight: 1.8 }}>
            {config.descricao}
          </p>
        </section>

        <section style={{ borderRadius: 28, padding: 22, border: "1px solid #EADBC8", background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)", boxShadow: "0 18px 38px rgba(48,34,20,0.08)" }}>
          <h2 style={{ margin: "0 0 10px", color: "#2F2721", fontSize: 28, fontFamily: "Georgia, 'Times New Roman', serif" }}>
            Curadoria Maison Noor
          </h2>

          <p style={{ margin: 0, color: "#6F6258", fontSize: 15, lineHeight: 1.8 }}>
            Encontre fragrâncias árabes originais com atendimento consultivo, seleção premium e experiência de boutique.
          </p>

          <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/" style={{ padding: "13px 18px", borderRadius: 999, background: "linear-gradient(135deg, #D8B178, #BD9055)", color: "#2A2018", textDecoration: "none", fontWeight: 900 }}>
              Ver catálogo completo
            </Link>

            <Link href="/blog" style={{ padding: "13px 18px", borderRadius: 999, border: "1px solid #D8C1A2", color: "#6B523A", textDecoration: "none", fontWeight: 900, background: "#FFF9F1" }}>
              Ler guias no blog
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}