import type { Metadata } from "next";
import Link from "next/link";
import {
  getSeoProgramaticoBySlug,
  seoProgramaticoPages,
} from "@/data/seo-programatico";

const SITE_URL = "https://www.maisonnoor.com.br";

type Props = {
  params: {
    slug: string;
  };
};

export function generateStaticParams() {
  return seoProgramaticoPages.map((item) => ({
    slug: item.slug,
  }));
}

export function generateMetadata({ params }: Props): Metadata {
  const page = getSeoProgramaticoBySlug(params.slug);

  if (!page) {
    return {
      title: "Maison Noor Parfums",
      description: "Perfumes árabes originais com curadoria premium.",
    };
  }

  return {
    title: page.titulo,
    description: page.descricao,
    alternates: {
      canonical: `${SITE_URL}/${page.slug}`,
    },
    openGraph: {
      title: page.titulo,
      description: page.descricao,
      url: `${SITE_URL}/${page.slug}`,
      siteName: "Maison Noor Parfums",
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default function SeoProgramaticoPage({ params }: Props) {
  const page = getSeoProgramaticoBySlug(params.slug);

  if (!page) {
    return (
      <main
        style={{
          minHeight: "70vh",
          display: "grid",
          placeItems: "center",
          padding: "40px 20px",
          background: "#FBF6EF",
          color: "#24170F",
        }}
      >
        <section
          style={{
            maxWidth: 720,
            width: "100%",
            textAlign: "center",
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 28,
            padding: "42px 28px",
            boxShadow: "0 18px 60px rgba(60, 38, 18, 0.08)",
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            Maison Noor
          </p>
          <h1 style={{ fontSize: 34, marginBottom: 12 }}>
            Página não encontrada
          </h1>
          <p style={{ color: "#6D5A48", marginBottom: 24 }}>
            A página que você tentou acessar não está disponível.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              padding: "14px 22px",
              borderRadius: 999,
              background: "#B38B59",
              color: "#FFF",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Voltar para a Maison Noor
          </Link>
        </section>
      </main>
    );
  }

  const relatedPages = seoProgramaticoPages
    .filter((item) => item.slug !== page.slug)
    .slice(0, 8);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.h1,
    description: page.descricao,
    url: `${SITE_URL}/${page.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Maison Noor Parfums",
      url: SITE_URL,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Início",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.h1,
          item: `${SITE_URL}/${page.slug}`,
        },
      ],
    },
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(179,139,89,0.18), transparent 35%), linear-gradient(180deg, #FFF9F1 0%, #FBF6EF 55%, #FFFFFF 100%)",
        color: "#24170F",
        padding: "48px 20px 70px",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <section
        style={{
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <nav
          aria-label="Breadcrumb"
          style={{
            marginBottom: 28,
            fontSize: 14,
            color: "#7C6957",
          }}
        >
          <Link href="/" style={{ color: "#9C7440", textDecoration: "none" }}>
            Início
          </Link>
          <span style={{ margin: "0 10px" }}>/</span>
          <span>{page.h1}</span>
        </nav>

        <section
          style={{
            background: "rgba(255,255,255,0.88)",
            border: "1px solid #E9DCCB",
            borderRadius: 34,
            padding: "clamp(32px, 6vw, 72px)",
            boxShadow: "0 24px 80px rgba(60, 38, 18, 0.10)",
            overflow: "hidden",
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            Curadoria Maison Noor
          </p>

          <h1
            style={{
              fontSize: "clamp(38px, 7vw, 72px)",
              lineHeight: 1,
              letterSpacing: "-0.05em",
              margin: 0,
              maxWidth: 900,
            }}
          >
            {page.h1}
          </h1>

          <p
            style={{
              marginTop: 22,
              maxWidth: 780,
              color: "#6D5A48",
              fontSize: "clamp(18px, 2.2vw, 24px)",
              lineHeight: 1.55,
            }}
          >
            {page.subtitulo}
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 30,
            }}
          >
            {["Perfumes árabes originais", "Curadoria premium", "Alta fixação", "Envio para o Brasil"].map(
              (item) => (
                <span
                  key={item}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 999,
                    background: "#FFF4E4",
                    border: "1px solid #E5D3BA",
                    color: "#7A5528",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {item}
                </span>
              )
            )}
          </div>

          <div style={{ marginTop: 34 }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 24px",
                borderRadius: 999,
                background: "#24170F",
                color: "#FFF",
                textDecoration: "none",
                fontWeight: 900,
                boxShadow: "0 14px 34px rgba(36,23,15,0.20)",
              }}
            >
              Ver perfumes disponíveis
            </Link>
          </div>
        </section>

        <section
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          {[
            {
              title: "Como escolher",
              text: "Escolha considerando ocasião, intensidade, notas olfativas e o tipo de presença que você deseja transmitir.",
            },
            {
              title: "Por que perfume árabe?",
              text: "Perfumes árabes são conhecidos por propostas marcantes, frascos elegantes e combinações olfativas envolventes.",
            },
            {
              title: "Curadoria Maison Noor",
              text: "Selecionamos fragrâncias pensando em estilo, sofisticação, fixação e experiência de uso.",
            },
          ].map((card) => (
            <article
              key={card.title}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E9DCCB",
                borderRadius: 24,
                padding: 24,
                boxShadow: "0 14px 40px rgba(60,38,18,0.06)",
              }}
            >
              <h2 style={{ fontSize: 22, marginBottom: 10 }}>{card.title}</h2>
              <p style={{ color: "#6D5A48", lineHeight: 1.65 }}>{card.text}</p>
            </article>
          ))}
        </section>

        <section
          style={{
            marginTop: 34,
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 28,
            padding: 28,
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            Continue explorando
          </p>
          <h2 style={{ fontSize: 30, marginBottom: 18 }}>
            Outras seleções Maison Noor
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 12,
            }}
          >
            {relatedPages.map((item) => (
              <Link
                key={item.slug}
                href={`/${item.slug}`}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: "#FFF9F1",
                  border: "1px solid #EADBC8",
                  color: "#24170F",
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                {item.h1}
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}