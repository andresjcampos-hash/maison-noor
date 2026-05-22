# Atualização completa — src/app/[slug]/page.tsx

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  getSeoProgramaticoBySlug,
  seoProgramaticoPages,
} from "@/data/seo-programatico";
import { adminDb } from "@/lib/firebase-admin";

const SITE_URL = "https://www.maisonnoor.com.br";

interface Produto {
  id: string;
  nome?: string;
  slug?: string;
  marca?: string;
  descricao?: string;
  precoVenda?: number;
  imagem?: string;
  imageUrl?: string;
  foto?: string;
  categoria?: string;
}

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

function matchProduto(slug: string, produto: Produto) {
  const texto = `${produto.nome || ""} ${produto.marca || ""} ${produto.descricao || ""} ${produto.categoria || ""}`.toLowerCase();

  const regras: Record<string, string[]> = {
    "perfume-arabe-feminino": ["feminino", "yara", "rose", "ward"],
    "perfume-arabe-masculino": ["masculino", "asad", "club", "intense"],
    "perfume-arabe-lattafa": ["lattafa", "yara", "asad", "fakhar"],
    "perfume-arabe-armaf": ["armaf", "club de nuit"],
    "perfume-arabe-doce": ["doce", "baunilha", "caramelo", "gourmand", "yara"],
    "perfume-arabe-baunilha": ["baunilha", "vanilla", "yara"],
    "perfume-arabe-amadeirado": ["madeira", "amadeirado", "oud"],
    "perfume-arabe-oud": ["oud"],
    "perfume-arabe-feminino-doce": ["feminino", "doce", "yara", "rose"],
    "perfume-arabe-alta-fixacao": ["intense", "extrato", "alta fixação"],
  };

  const keywords = regras[slug] || [];

  return keywords.some((keyword) => texto.includes(keyword));
}

async function getProdutosRelacionados(slug: string) {
  try {
    const snapshot = await adminDb
      .collection("products")
      .where("ativo", "==", true)
      .limit(40)
      .get();

    const produtos = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Produto),
    }));

    const relacionados = produtos
      .filter((produto) => matchProduto(slug, produto))
      .slice(0, 8);

    if (relacionados.length > 0) {
      return relacionados;
    }

    return produtos.slice(0, 8);
  } catch {
    return [];
  }
}

export default async function SeoProgramaticoPage({ params }: Props) {
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
          <h1>Página não encontrada</h1>
        </section>
      </main>
    );
  }

  const produtosRelacionados = await getProdutosRelacionados(params.slug);

  const relatedPages = seoProgramaticoPages
    .filter((item) => item.slug !== page.slug)
    .slice(0, 8);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.h1,
    description: page.descricao,
    url: `${SITE_URL}/${page.slug}`,
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
        </section>

        <section style={{ marginTop: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  color: "#B38B59",
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                Seleção Maison Noor
              </p>

              <h2
                style={{
                  fontSize: "clamp(28px, 5vw, 44px)",
                  margin: 0,
                }}
              >
                Produtos relacionados
              </h2>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
          >
            {produtosRelacionados.map((produto) => {
              const imagem =
                produto.imagem ||
                produto.imageUrl ||
                produto.foto ||
                "/logo-maison-noor.png";

              const slugProduto =
                produto.slug ||
                produto.nome
                  ?.toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");

              return (
                <Link
                  key={produto.id}
                  href={`/produto/${slugProduto}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    background: "#FFF",
                    border: "1px solid #E9DCCB",
                    borderRadius: 24,
                    overflow: "hidden",
                    boxShadow: "0 12px 32px rgba(60,38,18,0.06)",
                    transition: "0.25s ease",
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "1 / 1",
                      background: "#FFF9F1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 20,
                    }}
                  >
                    <img
                      src={imagem}
                      alt={produto.nome || "Perfume Maison Noor"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </div>

                  <div style={{ padding: 20 }}>
                    <p
                      style={{
                        color: "#B38B59",
                        fontWeight: 800,
                        marginBottom: 8,
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {produto.marca || "Maison Noor"}
                    </p>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: 20,
                        lineHeight: 1.3,
                        minHeight: 54,
                      }}
                    >
                      {produto.nome}
                    </h3>

                    <p
                      style={{
                        marginTop: 14,
                        fontWeight: 900,
                        fontSize: 22,
                      }}
                    >
                      {produto.precoVenda
                        ? `R$ ${produto.precoVenda.toFixed(2).replace(".", ",")}`
                        : "Consultar"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
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
```
