import type { Metadata } from "next";
import Link from "next/link";
import {
  getSeoProgramaticoBySlug,
  seoProgramaticoPages,
} from "@/data/seo-programatico";
import { adminDb } from "@/lib/firebase-admin";

const SITE_URL = "https://www.maisonnoor.com.br";

type Props = {
  params: {
    slug: string;
  };
};

type ProdutoSeo = {
  id?: string;
  nome?: string;
  slug?: string;
  marca?: string;
  descricao?: string;
  observacoes?: string;
  familiaOlfativa?: string;
  notasSaida?: string;
  notasCoracao?: string;
  notasFundo?: string;
  genero?: string;
  tags?: string[] | string;
  fixacao?: string;
  intensidade?: string;
  precoVenda?: number;
  imagem?: string;
  imageUrl?: string;
  foto?: string;
  categoria?: string;
  ativo?: boolean;
};

function slugify(texto: string) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatarMoeda(valor?: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getImagemProduto(produto: ProdutoSeo) {
  const nomeSlug = slugify(produto.nome || produto.id || "produto");

  return (
    produto.imagem ||
    produto.imageUrl ||
    produto.foto ||
    `/produtos/${nomeSlug}.png`
  );
}

function normalizarTexto(valor: unknown) {
  if (Array.isArray(valor)) return valor.join(" ");
  return String(valor || "");
}

function produtoCombinaComSlug(slug: string, produto: ProdutoSeo) {
  const texto = [
    produto.nome,
    produto.marca,
    produto.descricao,
    produto.observacoes,
    produto.familiaOlfativa,
    produto.notasSaida,
    produto.notasCoracao,
    produto.notasFundo,
    produto.genero,
    produto.categoria,
    produto.fixacao,
    produto.intensidade,
    normalizarTexto(produto.tags),
  ]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const regras: Record<string, string[]> = {
    "perfume-arabe-feminino": ["feminino", "female", "yara", "rose", "ward", "mulher"],
    "perfume-arabe-masculino": ["masculino", "male", "asad", "club", "homem"],
    "perfume-arabe-lattafa": ["lattafa", "yara", "asad", "fakhar", "bade"],
    "perfume-arabe-armaf": ["armaf", "club"],
    "perfume-arabe-al-wataniah": ["al wataniah", "wataniah", "ameerati", "watani"],
    "perfume-arabe-doce": ["doce", "baunilha", "vanilla", "caramelo", "gourmand", "yara", "candy"],
    "perfume-arabe-gourmand": ["gourmand", "baunilha", "vanilla", "caramelo", "doce"],
    "perfume-arabe-baunilha": ["baunilha", "vanilla", "yara"],
    "perfume-arabe-floral": ["floral", "rosa", "rose", "jasmim", "ward"],
    "perfume-arabe-oriental": ["oriental", "ambar", "oud", "especiado"],
    "perfume-arabe-oud": ["oud", "al oud"],
    "perfume-arabe-amadeirado": ["amadeirado", "madeira", "sandal", "sandalo", "oud"],
    "perfume-arabe-ambar": ["ambar", "amber"],
    "perfume-arabe-alta-fixacao": ["alta fixacao", "intense", "elixir", "oud", "extrato"],
    "perfume-arabe-feminino-doce": ["feminino", "female", "doce", "yara", "candy", "rose"],
    "perfume-arabe-masculino-noite": ["masculino", "male", "noite", "asad", "club", "intense"],
    "perfume-arabe-para-presentear": ["presente", "yara", "fakhar", "ameerati", "layaan"],
    "perfume-arabe-para-encontros": ["encontro", "noite", "rose", "yara", "asad", "intense"],
    "perfume-arabe-para-trabalho": ["elegante", "fresh", "fresco", "suave", "clean"],
    "perfume-arabe-para-noite": ["noite", "intense", "asad", "oud", "elixir"],
    "perfume-arabe-feminino-elegante": ["feminino", "female", "elegante", "rose", "ward", "yara", "layaan"],
    "perfume-arabe-masculino-marcante": ["masculino", "male", "marcante", "asad", "club", "oud"],
    "perfume-arabe-unissex": ["unissex", "unisex", "watani", "vulcan"],
    "perfume-arabe-importado": ["lattafa", "armaf", "al wataniah", "maison", "french avenue"],
  };

  const palavras = regras[slug] || [];

  if (!palavras.length) return true;

  return palavras.some((palavra) => texto.includes(palavra));
}

async function buscarProdutosRelacionados(slug: string) {
  try {
    const snapshot = await adminDb.collection("products").limit(90).get();

    const produtos = snapshot.docs
      .map((doc) => {
        const data = doc.data() as ProdutoSeo;
        return {
          ...data,
          id: doc.id,
        };
      })
      .filter((produto) => produto.ativo !== false);

    const relacionados = produtos
      .filter((produto) => produtoCombinaComSlug(slug, produto))
      .slice(0, 8);

    return relacionados.length > 0 ? relacionados : produtos.slice(0, 8);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return [];
  }
}

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

export default async function SeoProgramaticoPage({ params }: Props) {
  const page = getSeoProgramaticoBySlug(params.slug);

  if (!page) {
    return (
      <main
        style={{
          minHeight: "60vh",
          display: "grid",
          placeItems: "center",
          background: "#FBF6EF",
          color: "#24170F",
          padding: "28px 16px",
        }}
      >
        <section
          style={{
            maxWidth: 620,
            width: "100%",
            textAlign: "center",
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 22,
            padding: "28px 20px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28 }}>Página não encontrada</h1>
          <Link href="/" style={{ color: "#9C7440", fontWeight: 800 }}>
            Voltar para a Maison Noor
          </Link>
        </section>
      </main>
    );
  }

  const produtosRelacionados = await buscarProdutosRelacionados(params.slug);

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
        background: "linear-gradient(180deg, #FFF9F1 0%, #FBF6EF 42%, #FFFFFF 100%)",
        color: "#24170F",
        padding: "22px 18px 38px",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <nav
          style={{
            marginBottom: 14,
            fontSize: 14,
            color: "#7C6957",
          }}
        >
          <Link href="/" style={{ color: "#9C7440", textDecoration: "none" }}>
            Início
          </Link>
          <span style={{ margin: "0 9px" }}>/</span>
          <span>{page.h1}</span>
        </nav>

        <section
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #E9DCCB",
            borderRadius: 26,
            padding: "30px 38px",
            boxShadow: "0 14px 42px rgba(60, 38, 18, 0.07)",
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontSize: 11,
              margin: "0 0 10px",
            }}
          >
            Curadoria Maison Noor
          </p>

          <h1
            style={{
              fontSize: "clamp(34px, 4.6vw, 56px)",
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
              margin: 0,
              maxWidth: 820,
            }}
          >
            {page.h1}
          </h1>

          <p
            style={{
              margin: "14px 0 0",
              maxWidth: 720,
              color: "#6D5A48",
              fontSize: "clamp(17px, 1.7vw, 21px)",
              lineHeight: 1.45,
            }}
          >
            {page.subtitulo}
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 9,
              marginTop: 18,
            }}
          >
            {["Perfumes árabes originais", "Curadoria premium", "Alta fixação", "Envio para o Brasil"].map(
              (item) => (
                <span
                  key={item}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "#FFF4E4",
                    border: "1px solid #E5D3BA",
                    color: "#7A5528",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {item}
                </span>
              )
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 18px",
                borderRadius: 999,
                background: "#24170F",
                color: "#FFF",
                textDecoration: "none",
                fontWeight: 900,
                fontSize: 14,
                boxShadow: "0 10px 24px rgba(36,23,15,0.16)",
              }}
            >
              Ver perfumes disponíveis
            </Link>
          </div>
        </section>

        {produtosRelacionados.length > 0 && (
          <section
            style={{
              marginTop: 22,
              background: "#FFF",
              border: "1px solid #E9DCCB",
              borderRadius: 24,
              padding: 22,
              boxShadow: "0 10px 30px rgba(60,38,18,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    color: "#B38B59",
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontSize: 11,
                    margin: "0 0 6px",
                  }}
                >
                  Seleção Maison Noor
                </p>

                <h2
                  style={{
                    fontSize: "clamp(24px, 3vw, 34px)",
                    margin: 0,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Produtos relacionados
                </h2>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              {produtosRelacionados.map((produto) => {
                const produtoSlug =
                  produto.slug || slugify(produto.nome || produto.id || "produto");

                return (
                  <Link
                    key={produto.id}
                    href={`/produto/${produtoSlug}`}
                    style={{
                      textDecoration: "none",
                      color: "#24170F",
                      background: "#FFF9F1",
                      border: "1px solid #EADBC8",
                      borderRadius: 18,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: 150,
                        background: "#FFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 12,
                      }}
                    >
                      <img
                        src={getImagemProduto(produto)}
                        alt={produto.nome || "Perfume Maison Noor"}
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </div>

                    <div style={{ padding: 13 }}>
                      <p
                        style={{
                          color: "#B38B59",
                          fontWeight: 800,
                          fontSize: 11,
                          margin: "0 0 6px",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                        }}
                      >
                        {produto.marca || "Maison Noor"}
                      </p>

                      <h3
                        style={{
                          fontSize: 15,
                          lineHeight: 1.25,
                          margin: 0,
                          minHeight: 38,
                        }}
                      >
                        {produto.nome || "Perfume Maison Noor"}
                      </h3>

                      <p
                        style={{
                          margin: "10px 0 0",
                          fontWeight: 900,
                          fontSize: 17,
                        }}
                      >
                        {produto.precoVenda
                          ? formatarMoeda(produto.precoVenda)
                          : "Consultar"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {[
            {
              title: "Como escolher",
              text: "Considere ocasião, intensidade, notas olfativas e a presença desejada.",
            },
            {
              title: "Por que perfume árabe?",
              text: "Fragrâncias marcantes, frascos elegantes e combinações olfativas envolventes.",
            },
            {
              title: "Curadoria Maison Noor",
              text: "Selecionamos fragrâncias por estilo, sofisticação, fixação e experiência.",
            },
          ].map((card) => (
            <article
              key={card.title}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E9DCCB",
                borderRadius: 20,
                padding: 18,
                boxShadow: "0 10px 28px rgba(60,38,18,0.05)",
              }}
            >
              <h2 style={{ fontSize: 19, margin: "0 0 8px" }}>{card.title}</h2>
              <p style={{ color: "#6D5A48", lineHeight: 1.55, margin: 0 }}>
                {card.text}
              </p>
            </article>
          ))}
        </section>

        <section
          style={{
            marginTop: 18,
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 22,
            padding: 22,
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: 11,
              margin: "0 0 8px",
            }}
          >
            Continue explorando
          </p>

          <h2 style={{ fontSize: 26, margin: "0 0 14px" }}>
            Outras seleções Maison Noor
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 10,
            }}
          >
            {relatedPages.map((item) => (
              <Link
                key={item.slug}
                href={`/${item.slug}`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#FFF9F1",
                  border: "1px solid #EADBC8",
                  color: "#24170F",
                  textDecoration: "none",
                  fontWeight: 800,
                  fontSize: 14,
                  lineHeight: 1.35,
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
