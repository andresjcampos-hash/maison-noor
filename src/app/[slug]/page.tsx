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
  precoVenda?: number | string;
  preco?: number | string;
  imagem?: string;
  imageUrl?: string;
  imagemUrl?: string;
  foto?: string;
  capa?: string;
  categoria?: string;
  familiaOlfativa?: string;
  genero?: string;
  notasSaida?: string | string[];
  notasCoracao?: string | string[];
  notasFundo?: string | string[];
  tags?: string[];
  ativo?: boolean;
};

type ProdutoSeoData = Omit<ProdutoSeo, "id">;

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

function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  if (Array.isArray(valor)) {
    return valor.map(normalizarTexto).join(" ");
  }

  if (typeof valor === "object") {
    return Object.values(valor as Record<string, unknown>)
      .map(normalizarTexto)
      .join(" ");
  }

  return String(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(texto: string) {
  return normalizarTexto(texto)
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatarMoeda(valor?: number | string) {
  const numero = Number(valor || 0);

  if (!numero) return "Consultar";

  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getImagemProduto(produto: ProdutoSeo) {
  const nomeSlug = slugify(produto.nome || produto.id || "produto");

  return (
    produto.imagem ||
    produto.imageUrl ||
    produto.imagemUrl ||
    produto.foto ||
    produto.capa ||
    `/produtos/${nomeSlug}.png`
  );
}

function getTextoBuscaProduto(produto: ProdutoSeo) {
  return normalizarTexto({
    nome: produto.nome,
    marca: produto.marca,
    descricao: produto.descricao,
    observacoes: produto.observacoes,
    categoria: produto.categoria,
    familiaOlfativa: produto.familiaOlfativa,
    genero: produto.genero,
    notasSaida: produto.notasSaida,
    notasCoracao: produto.notasCoracao,
    notasFundo: produto.notasFundo,
    tags: produto.tags,
  });
}

function produtoCombinaComSlug(slug: string, produto: ProdutoSeo) {
  const texto = getTextoBuscaProduto(produto);

  const regras: Record<string, string[]> = {
    "perfume-arabe-feminino": [
      "feminino",
      "mulher",
      "yara",
      "rose",
      "ward",
      "layaan",
      "ameerati",
      "sabah",
      "shagaf",
      "floral",
    ],
    "perfume-arabe-masculino": [
      "masculino",
      "homem",
      "asad",
      "club",
      "intense",
      "fakhar",
      "oud",
      "bourbon",
    ],
    "perfume-arabe-lattafa": [
      "lattafa",
      "yara",
      "asad",
      "fakhar",
      "bade",
      "khamrah",
      "musamam",
    ],
    "perfume-arabe-armaf": ["armaf", "club de nuit", "club"],
    "perfume-arabe-al-wataniah": [
      "al wataniah",
      "wataniah",
      "ameerati",
      "watani",
      "sabah",
      "shagaf",
    ],
    "perfume-arabe-doce": [
      "doce",
      "adocicado",
      "baunilha",
      "caramelo",
      "gourmand",
      "candy",
      "yara",
      "cremoso",
    ],
    "perfume-arabe-gourmand": [
      "gourmand",
      "baunilha",
      "caramelo",
      "doce",
      "candy",
      "praline",
      "cremoso",
    ],
    "perfume-arabe-baunilha": ["baunilha", "vanilla", "yara", "gourmand"],
    "perfume-arabe-floral": [
      "floral",
      "rosa",
      "rose",
      "jasmim",
      "ward",
      "flor",
      "flores",
    ],
    "perfume-arabe-oriental": [
      "oriental",
      "ambar",
      "oud",
      "especiado",
      "especiarias",
      "amadeirado",
    ],
    "perfume-arabe-oud": ["oud", "al oud", "agarwood"],
    "perfume-arabe-amadeirado": [
      "amadeirado",
      "madeira",
      "madeiras",
      "sandal",
      "sandalo",
      "oud",
      "cedro",
    ],
    "perfume-arabe-ambar": ["ambar", "amber", "ambarado", "ambrado"],
    "perfume-arabe-alta-fixacao": [
      "intense",
      "elixir",
      "oud",
      "asad",
      "club",
      "extrato",
      "extrait",
      "alta fixacao",
      "marcante",
    ],
    "perfume-arabe-feminino-doce": [
      "feminino",
      "doce",
      "yara",
      "candy",
      "rose",
      "gourmand",
      "baunilha",
    ],
    "perfume-arabe-masculino-noite": [
      "masculino",
      "noite",
      "asad",
      "club",
      "intense",
      "bourbon",
      "oud",
    ],
    "perfume-arabe-para-presentear": [
      "yara",
      "fakhar",
      "ameerati",
      "layaan",
      "club",
      "asad",
      "presente",
    ],
    "perfume-arabe-para-encontros": [
      "encontro",
      "noite",
      "rose",
      "yara",
      "asad",
      "intense",
      "marcante",
      "envolvente",
    ],
    "perfume-arabe-para-trabalho": [
      "elegante",
      "fresco",
      "suave",
      "delicado",
      "versatil",
      "dia a dia",
    ],
    "perfume-arabe-para-noite": [
      "noite",
      "intense",
      "asad",
      "oud",
      "elixir",
      "marcante",
      "eventos",
    ],
    "perfume-arabe-feminino-elegante": [
      "feminino",
      "elegante",
      "rose",
      "ward",
      "yara",
      "layaan",
      "sofisticada",
    ],
    "perfume-arabe-masculino-marcante": [
      "masculino",
      "marcante",
      "asad",
      "club",
      "oud",
      "intense",
      "bourbon",
    ],
    "perfume-arabe-unissex": ["unissex", "unisex", "watani", "vulcan"],
    "perfume-arabe-importado": [
      "lattafa",
      "armaf",
      "al wataniah",
      "maison",
      "french avenue",
      "asdaaf",
    ],
  };

  const palavras = regras[slug] || [];

  if (!palavras.length) return true;

  return palavras.some((palavra) => texto.includes(normalizarTexto(palavra)));
}

async function buscarProdutosRelacionados(slug: string) {
  try {
    const snapshot = await adminDb.collection("products").limit(120).get();

    const produtos = snapshot.docs
      .map((doc) => {
        const data = doc.data() as ProdutoSeoData;

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
    console.error("Erro ao buscar produtos relacionados:", error);
    return [];
  }
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
          padding: "28px 16px",
          background: "#FBF6EF",
          color: "#24170F",
        }}
      >
        <section
          style={{
            maxWidth: 680,
            width: "100%",
            textAlign: "center",
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 22,
            padding: "30px 22px",
            boxShadow: "0 14px 44px rgba(60, 38, 18, 0.08)",
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: 11,
              marginBottom: 10,
            }}
          >
            Maison Noor
          </p>

          <h1 style={{ fontSize: 30, marginBottom: 10 }}>
            Página não encontrada
          </h1>

          <p style={{ color: "#6D5A48", marginBottom: 20 }}>
            A página que você tentou acessar não está disponível.
          </p>

          <Link
            href="/"
            style={{
              display: "inline-flex",
              padding: "12px 18px",
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
        background:
          "radial-gradient(circle at top left, rgba(179,139,89,0.14), transparent 30%), linear-gradient(180deg, #FFF9F1 0%, #FBF6EF 55%, #FFFFFF 100%)",
        color: "#24170F",
        padding: "22px 16px 46px",
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
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        <nav
          aria-label="Breadcrumb"
          style={{
            marginBottom: 14,
            fontSize: 13,
            color: "#7C6957",
          }}
        >
          <Link href="/" style={{ color: "#9C7440", textDecoration: "none" }}>
            Início
          </Link>
          <span style={{ margin: "0 8px" }}>/</span>
          <span>{page.h1}</span>
        </nav>

        <section
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #E9DCCB",
            borderRadius: 24,
            padding: "clamp(24px, 4vw, 42px)",
            boxShadow: "0 18px 58px rgba(60, 38, 18, 0.08)",
            overflow: "hidden",
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontSize: 11,
              marginBottom: 10,
            }}
          >
            Curadoria Maison Noor
          </p>

          <h1
            style={{
              fontSize: "clamp(34px, 5.2vw, 56px)",
              lineHeight: 1.04,
              letterSpacing: "-0.045em",
              margin: 0,
              maxWidth: 820,
            }}
          >
            {page.h1}
          </h1>

          <p
            style={{
              marginTop: 14,
              maxWidth: 720,
              color: "#6D5A48",
              fontSize: "clamp(16px, 1.6vw, 20px)",
              lineHeight: 1.45,
            }}
          >
            {page.subtitulo}
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 18,
            }}
          >
            {[
              "Perfumes árabes originais",
              "Curadoria premium",
              "Alta fixação",
              "Envio para o Brasil",
            ].map((item) => (
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
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
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
                boxShadow: "0 10px 24px rgba(36,23,15,0.18)",
              }}
            >
              Ver perfumes disponíveis
            </Link>
          </div>
        </section>

        {produtosRelacionados.length > 0 && (
          <section
            style={{
              marginTop: 20,
              background: "#FFF",
              border: "1px solid #E9DCCB",
              borderRadius: 22,
              padding: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 14,
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
                    marginBottom: 6,
                  }}
                >
                  Seleção Maison Noor
                </p>

                <h2 style={{ fontSize: 26, margin: 0 }}>
                  Produtos relacionados
                </h2>
              </div>

              <Link
                href="/"
                style={{
                  color: "#9C7440",
                  fontWeight: 800,
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Ver catálogo completo
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {produtosRelacionados.map((produto) => {
                const produtoSlug =
                  produto.slug || produto.id || slugify(produto.nome || "");
                const imagem = getImagemProduto(produto);

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
                        src={imagem}
                        alt={produto.nome || "Perfume Maison Noor"}
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </div>

                    <div style={{ padding: 12 }}>
                      <p
                        style={{
                          color: "#B38B59",
                          fontWeight: 800,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: 6,
                        }}
                      >
                        {produto.marca || "Maison Noor"}
                      </p>

                      <h3
                        style={{
                          fontSize: 15,
                          lineHeight: 1.25,
                          margin: 0,
                        }}
                      >
                        {produto.nome || "Perfume Maison Noor"}
                      </h3>

                      <p
                        style={{
                          marginTop: 8,
                          fontWeight: 900,
                          fontSize: 17,
                        }}
                      >
                        {formatarMoeda(produto.precoVenda || produto.preco)}
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
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 10px 28px rgba(60,38,18,0.05)",
              }}
            >
              <h2 style={{ fontSize: 19, marginBottom: 8 }}>{card.title}</h2>
              <p
                style={{
                  color: "#6D5A48",
                  lineHeight: 1.55,
                  fontSize: 14,
                  margin: 0,
                }}
              >
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
            padding: 20,
          }}
        >
          <p
            style={{
              color: "#B38B59",
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: 11,
              marginBottom: 8,
            }}
          >
            Continue explorando
          </p>

          <h2 style={{ fontSize: 24, marginBottom: 14 }}>
            Outras seleções Maison Noor
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
