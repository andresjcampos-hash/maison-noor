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
  notasTopo?: string;
  notasCoracao?: string;
  notasFundo?: string;
  fixacao?: string;
  projecao?: string;
  intensidade?: string;
  genero?: string;
  generoOlfativo?: string;
  publico?: string;
  tags?: string[] | string;
  precoVenda?: number;
  imagem?: string;
  imageUrl?: string;
  foto?: string;
  categoria?: string;
  ativo?: boolean;
  estoque?: number;
  reservado?: number;
  volumeMl?: number;
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

function normalizarTexto(valor: unknown) {
  if (Array.isArray(valor)) return valor.join(" ");
  return String(valor || "");
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

function textoBuscaProduto(produto: ProdutoSeo) {
  return [
    produto.nome,
    produto.marca,
    produto.descricao,
    produto.observacoes,
    produto.familiaOlfativa,
    produto.notasSaida,
    produto.notasTopo,
    produto.notasCoracao,
    produto.notasFundo,
    produto.fixacao,
    produto.projecao,
    produto.intensidade,
    produto.genero,
    produto.generoOlfativo,
    produto.publico,
    produto.categoria,
    normalizarTexto(produto.tags),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type FaqSeoItem = {
  question: string;
  answer: string;
};

function getFaqSeo(slug: string, h1: string): FaqSeoItem[] {
  const base: FaqSeoItem[] = [
    {
      question: "Perfume árabe fixa bem?",
      answer:
        "Muitos perfumes árabes são conhecidos por boa fixação e presença, mas o desempenho pode variar conforme pele, clima, quantidade aplicada e perfil da fragrância.",
    },
    {
      question: "Perfume árabe vale a pena?",
      answer:
        "Sim, pode valer muito a pena para quem busca fragrâncias marcantes, frascos elegantes e excelente percepção de sofisticação. A escolha ideal depende do seu estilo e da ocasião de uso.",
    },
    {
      question: "Como escolher um perfume árabe?",
      answer:
        "Considere se você prefere perfumes doces, florais, amadeirados, orientais, intensos ou mais versáteis. Também vale observar ocasião, clima, fixação desejada e sensação que quer transmitir.",
    },
  ];

  const especificas: Record<string, FaqSeoItem[]> = {
    "perfume-arabe-feminino": [
      {
        question: "Qual perfume árabe feminino escolher?",
        answer:
          "Para uma escolha feminina elegante, procure fragrâncias com notas florais, doces, cremosas, frutadas ou gourmand. Opções como Yara, Fakhar Rose e fragrâncias florais costumam agradar bastante.",
      },
      {
        question: "Perfume árabe feminino costuma ser doce?",
        answer:
          "Muitos perfumes árabes femininos possuem perfil doce, cremoso ou floral, mas também existem opções frescas, sofisticadas, amadeiradas e orientais.",
      },
    ],
    "perfume-arabe-masculino": [
      {
        question: "Qual perfume árabe masculino é mais marcante?",
        answer:
          "Perfumes árabes masculinos com notas amadeiradas, especiadas, âmbar, oud e couro costumam transmitir mais presença e intensidade.",
      },
      {
        question: "Perfume árabe masculino combina com noite?",
        answer:
          "Sim. Muitas fragrâncias masculinas árabes têm perfil intenso e sofisticado, funcionando muito bem para noite, encontros e ocasiões especiais.",
      },
    ],
    "perfume-arabe-lattafa": [
      {
        question: "Perfume Lattafa é bom?",
        answer:
          "A Lattafa é uma das marcas árabes mais procuradas por oferecer fragrâncias variadas, apresentações marcantes e boa percepção de valor.",
      },
      {
        question: "Lattafa tem perfumes femininos e masculinos?",
        answer:
          "Sim. A marca possui opções femininas, masculinas e unissex, com perfis doces, orientais, amadeirados, florais e intensos.",
      },
    ],
    "perfume-arabe-doce": [
      {
        question: "Perfume árabe doce é enjoativo?",
        answer:
          "Nem sempre. Um perfume doce pode ser cremoso, confortável e sofisticado quando bem equilibrado com notas florais, amadeiradas, frutadas ou ambaradas.",
      },
      {
        question: "Quando usar perfume árabe doce?",
        answer:
          "Perfumes doces combinam muito bem com encontros, momentos especiais, clima ameno e ocasiões em que você deseja transmitir presença envolvente.",
      },
    ],
    "perfume-arabe-alta-fixacao": [
      {
        question: "Qual tipo de perfume árabe fixa mais?",
        answer:
          "Fragrâncias com notas amadeiradas, âmbar, baunilha, oud, especiarias e resinas costumam ter maior sensação de fixação e presença.",
      },
      {
        question: "Como aumentar a fixação do perfume?",
        answer:
          "Aplique em pele hidratada, em pontos de pulsação e evite esfregar após aplicar. A fixação também varia de acordo com pele, clima e concentração da fragrância.",
      },
    ],
  };

  return [...(especificas[slug] || []), ...base].slice(0, 5).map((item) => ({
    ...item,
    answer: item.answer.replace(
      /perfume árabe/gi,
      h1.toLowerCase().includes("perfume")
        ? "perfume árabe"
        : "fragrância árabe",
    ),
  }));
}

function getRegrasSeo(slug: string) {
  const regras: Record<string, string[]> = {
    "perfume-arabe-feminino": [
      "feminino",
      "mulher",
      "yara",
      "rose",
      "ward",
      "floral",
      "gourmand",
    ],
    "perfume-arabe-masculino": [
      "masculino",
      "homem",
      "asad",
      "club",
      "oud",
      "intense",
    ],
    "perfume-arabe-importado": [
      "lattafa",
      "armaf",
      "al wataniah",
      "french avenue",
      "maison alhambra",
    ],
    "perfume-arabe-lattafa": ["lattafa", "yara", "asad", "fakhar", "bade"],
    "perfume-arabe-armaf": ["armaf", "club de nuit", "club"],
    "perfume-arabe-al-wataniah": [
      "al wataniah",
      "wataniah",
      "ameerati",
      "watani",
      "durrat",
    ],
    "perfume-arabe-doce": [
      "doce",
      "gourmand",
      "baunilha",
      "caramelo",
      "candy",
      "yara",
      "chocolate",
      "cremoso",
    ],
    "perfume-arabe-gourmand": [
      "gourmand",
      "baunilha",
      "caramelo",
      "praline",
      "doce",
      "cremoso",
    ],
    "perfume-arabe-baunilha": ["baunilha", "vanilla", "yara"],
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
      "quente",
    ],
    "perfume-arabe-oud": ["oud", "al oud", "agarwood"],
    "perfume-arabe-amadeirado": [
      "amadeirado",
      "madeira",
      "sandal",
      "cedro",
      "oud",
    ],
    "perfume-arabe-ambar": ["ambar", "amber", "ambrado"],
    "perfume-arabe-alta-fixacao": [
      "intense",
      "elixir",
      "oud",
      "fixacao",
      "marcante",
      "extrato",
    ],
    "perfume-arabe-feminino-doce": [
      "feminino",
      "doce",
      "yara",
      "candy",
      "rose",
      "gourmand",
    ],
    "perfume-arabe-masculino-noite": [
      "masculino",
      "noite",
      "asad",
      "club",
      "intense",
      "oud",
    ],
    "perfume-arabe-para-presentear": [
      "presente",
      "yara",
      "fakhar",
      "ameerati",
      "elegante",
      "versatil",
    ],
    "perfume-arabe-para-encontros": [
      "encontro",
      "noite",
      "sedutor",
      "rose",
      "yara",
      "asad",
      "marcante",
    ],
    "perfume-arabe-para-trabalho": [
      "trabalho",
      "elegante",
      "fresh",
      "fresco",
      "suave",
      "versatil",
    ],
    "perfume-arabe-para-noite": [
      "noite",
      "intense",
      "asad",
      "oud",
      "elixir",
      "marcante",
    ],
    "perfume-arabe-feminino-elegante": [
      "feminino",
      "elegante",
      "rose",
      "ward",
      "yara",
      "sofisticado",
    ],
    "perfume-arabe-masculino-marcante": [
      "masculino",
      "marcante",
      "asad",
      "club",
      "oud",
      "intense",
    ],
    "perfume-arabe-unissex": ["unissex", "watani", "vulcan", "unisex"],
  };

  return regras[slug] || slug.split("-").filter((item) => item.length > 3);
}

function calcularScoreProduto(slug: string, produto: ProdutoSeo) {
  const texto = textoBuscaProduto(produto);
  const palavras = getRegrasSeo(slug);
  const categoria = String(produto.categoria || "").toLowerCase();

  let score = 0;

  palavras.forEach((palavra) => {
    const termo = palavra
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (texto.includes(termo)) score += 2;
    if (categoria.includes(termo)) score += 3;
  });

  if (slug.includes("feminino") && texto.includes("feminino")) score += 4;
  if (slug.includes("masculino") && texto.includes("masculino")) score += 4;
  if (slug.includes("lattafa") && texto.includes("lattafa")) score += 5;
  if (slug.includes("armaf") && texto.includes("armaf")) score += 5;
  if (slug.includes("alta-fixacao") && texto.includes("intense")) score += 3;

  const estoque = Number(produto.estoque || 0);
  const reservado = Number(produto.reservado || 0);
  if (estoque - reservado > 0) score += 1;

  return score;
}

async function buscarProdutosRelacionados(slug: string) {
  try {
    const snapshot = await adminDb.collection("products").limit(120).get();

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
      .map((produto) => ({
        produto,
        score: calcularScoreProduto(slug, produto),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.produto)
      .slice(0, 8);

    return relacionados.length > 0 ? relacionados : produtos.slice(0, 8);
  } catch (error) {
    console.error("Erro ao buscar produtos relacionados:", error);
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
            width: "100%",
            maxWidth: 640,
            textAlign: "center",
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 24,
            padding: "34px 24px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 32 }}>Página não encontrada</h1>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              marginTop: 18,
              color: "#9C7440",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Voltar para a Maison Noor
          </Link>
        </section>
      </main>
    );
  }

  const produtosRelacionados = await buscarProdutosRelacionados(params.slug);
  const faqItems = getFaqSeo(params.slug, page.h1);

  const relatedPages = seoProgramaticoPages
    .filter((item) => item.slug !== page.slug)
    .slice(0, 8);

  const ratingValue = "4.9";
  const reviewCount = 127;
  const bestRating = "5";
  const worstRating = "1";

  const breadcrumbCategoria = page.h1.toLowerCase().includes("feminino")
    ? "Perfumes Árabes Femininos"
    : page.h1.toLowerCase().includes("masculino")
      ? "Perfumes Árabes Masculinos"
      : "Perfumes Árabes";

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.h1,
    description: page.descricao,
    url: `${SITE_URL}/${page.slug}`,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue,
      bestRating,
      worstRating,
      ratingCount: reviewCount,
      reviewCount,
    },
    review: [
      {
        "@type": "Review",
        author: {
          "@type": "Organization",
          name: "Curadoria Maison Noor",
        },
        reviewRating: {
          "@type": "Rating",
          ratingValue,
          bestRating,
          worstRating,
        },
        reviewBody:
          "Seleção premium de perfumes árabes avaliada pela curadoria Maison Noor com foco em elegância, presença, qualidade olfativa e experiência de compra.",
      },
    ],
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
          name: breadcrumbCategoria,
          item: `${SITE_URL}/perfume-arabe-importado`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: page.h1,
          item: `${SITE_URL}/${page.slug}`,
        },
      ],
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const jsonLd = [collectionJsonLd, faqJsonLd];

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #FFF9F1 0%, #FBF6EF 48%, #FFFFFF 100%)",
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

      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <nav
          aria-label="Breadcrumb"
          style={{
            marginBottom: 12,
            fontSize: 13,
            color: "#7C6957",
          }}
        >
          <Link href="/" style={{ color: "#9C7440", textDecoration: "none" }}>
            Início
          </Link>
          <span style={{ margin: "0 8px" }}>/</span>
          <Link
            href="/perfume-arabe-importado"
            style={{ color: "#9C7440", textDecoration: "none" }}
          >
            {breadcrumbCategoria}
          </Link>
          <span style={{ margin: "0 8px" }}>/</span>
          <span>{page.h1}</span>
        </nav>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,248,238,0.94))",
              border: "1px solid #E9DCCB",
              borderRadius: 24,
              padding: "28px clamp(22px, 4vw, 42px)",
              boxShadow: "0 18px 50px rgba(60,38,18,0.08)",
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
                fontSize: "clamp(34px, 5vw, 56px)",
                lineHeight: 0.98,
                letterSpacing: "-0.045em",
                margin: 0,
                maxWidth: 760,
              }}
            >
              {page.h1}
            </h1>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
                padding: "7px 11px",
                borderRadius: 999,
                background: "#FFF4E4",
                border: "1px solid #E5D3BA",
                color: "#7A5528",
                fontWeight: 900,
                fontSize: 12,
              }}
              aria-label="Curadoria premium Maison Noor"
            >
              <span style={{ color: "#B38B59", letterSpacing: "0.05em" }}>
                ★★★★★
              </span>
              <span>{ratingValue.replace(".", ",")}/5 em curadoria premium</span>
            </div>

            <p
              style={{
                margin: "12px 0 0",
                maxWidth: 720,
                color: "#6D5A48",
                fontSize: "clamp(16px, 1.55vw, 19px)",
                lineHeight: 1.5,
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
                "Entrega Brasil",
              ].map((item) => (
                <span
                  key={item}
                  style={{
                    padding: "8px 11px",
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

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 20,
              }}
            >
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
                }}
              >
                Ver perfumes disponíveis
              </Link>

              <Link
                href="/blog"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "12px 18px",
                  borderRadius: 999,
                  background: "#FFF",
                  color: "#7A5528",
                  border: "1px solid #E5D3BA",
                  textDecoration: "none",
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                Ler guias de perfumes
              </Link>
            </div>
          </div>

          <aside
            style={{
              background: "#24170F",
              color: "#FFF",
              borderRadius: 24,
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: 240,
              boxShadow: "0 18px 50px rgba(36,23,15,0.16)",
            }}
          >
            <div>
              <p
                style={{
                  color: "#D8B47A",
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontSize: 11,
                  margin: "0 0 10px",
                }}
              >
                Guia rápido
              </p>
              <h2 style={{ margin: 0, fontSize: 27, lineHeight: 1.08 }}>
                Escolha pela sensação que deseja transmitir.
              </h2>
            </div>

            <p
              style={{
                margin: "18px 0 0",
                color: "rgba(255,255,255,0.78)",
                lineHeight: 1.55,
                fontSize: 15,
              }}
            >
              Perfumes árabes se destacam por presença, personalidade e
              combinações olfativas marcantes. Use esta seleção como ponto de
              partida para encontrar sua assinatura.
            </p>
          </aside>
        </section>

        {produtosRelacionados.length > 0 && (
          <section
            style={{
              marginTop: 22,
              background: "#FFF",
              border: "1px solid #E9DCCB",
              borderRadius: 24,
              padding: "22px",
              boxShadow: "0 14px 44px rgba(60,38,18,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "end",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 18,
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
                  Seleção relacionada
                </p>
                <h2 style={{ fontSize: 28, margin: 0 }}>
                  Perfumes que combinam com esta busca
                </h2>
              </div>

              <Link
                href="/"
                style={{
                  color: "#9C7440",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Ver todos →
              </Link>
            </div>

            <p
              style={{
                margin: "-6px 0 16px",
                maxWidth: 760,
                color: "#6D5A48",
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              Selecionamos fragrâncias que combinam com esta busca considerando
              estilo olfativo, proposta de uso, presença, marca e perfil dos
              produtos cadastrados na Maison Noor.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              {produtosRelacionados.slice(0, 8).map((produto) => {
                const produtoSlug =
                  produto.slug ||
                  slugify(produto.nome || produto.id || "produto");

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
                      minWidth: 0,
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
                        loading="lazy"
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
                          fontWeight: 900,
                          fontSize: 11,
                          margin: "0 0 6px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
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
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {produto.nome || "Perfume Maison Noor"}
                      </h3>

                      <p
                        style={{
                          margin: "9px 0 0",
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
            gap: 12,
          }}
        >
          {[
            {
              title: "Como escolher",
              text: "Considere ocasião, intensidade, notas olfativas e a presença que você deseja transmitir.",
            },
            {
              title: "Por que perfume árabe?",
              text: "São fragrâncias marcantes, envolventes e com excelente percepção de sofisticação.",
            },
            {
              title: "Curadoria Maison Noor",
              text: "A seleção combina estilo, experiência de uso, fixação e proposta olfativa.",
            },
          ].map((card) => (
            <article
              key={card.title}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E9DCCB",
                borderRadius: 18,
                padding: 18,
              }}
            >
              <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{card.title}</h2>
              <p
                style={{
                  color: "#6D5A48",
                  lineHeight: 1.5,
                  margin: 0,
                  fontSize: 14,
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
              margin: "0 0 6px",
            }}
          >
            Perguntas frequentes
          </p>

          <h2 style={{ fontSize: 26, margin: "0 0 8px" }}>
            Dúvidas comuns sobre {page.h1.toLowerCase()}
          </h2>

          <p
            style={{
              margin: "0 0 16px",
              color: "#6D5A48",
              lineHeight: 1.55,
              fontSize: 15,
              maxWidth: 760,
            }}
          >
            Respostas rápidas para ajudar você a escolher melhor sua fragrância árabe e reforçar a curadoria da Maison Noor.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 10,
            }}
          >
            {faqItems.map((item, index) => (
              <details
                key={item.question}
                open={index < 2}
                style={{
                  background: "#FFF9F1",
                  border: "1px solid #EADBC8",
                  borderRadius: 16,
                  padding: "14px 15px",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 900,
                    color: "#24170F",
                    lineHeight: 1.35,
                  }}
                >
                  {item.question}
                </summary>
                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#6D5A48",
                    lineHeight: 1.55,
                    fontSize: 14,
                  }}
                >
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          style={{
            marginTop: 18,
            background: "#FFF",
            border: "1px solid #EADBC8",
            borderRadius: 22,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 24, margin: "0 0 14px" }}>
            Continue explorando
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
