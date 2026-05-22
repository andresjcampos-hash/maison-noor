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

function produtoCombinaComSlug(slug: string, produto: ProdutoSeo) {
  const texto = `${produto.nome || ""} ${produto.marca || ""} ${
    produto.descricao || ""
  } ${produto.observacoes || ""} ${produto.categoria || ""}`.toLowerCase();

  const regras: Record<string, string[]> = {
    "perfume-arabe-feminino": ["feminino", "yara", "rose", "ward"],
    "perfume-arabe-masculino": ["masculino", "asad", "club"],
    "perfume-arabe-lattafa": ["lattafa", "yara", "asad", "fakhar"],
    "perfume-arabe-armaf": ["armaf", "club"],
    "perfume-arabe-doce": ["doce", "baunilha", "caramelo", "yara"],
    "perfume-arabe-baunilha": ["baunilha", "vanilla", "yara"],
    "perfume-arabe-floral": ["rose", "ward", "floral", "rosa"],
    "perfume-arabe-oud": ["oud"],
    "perfume-arabe-alta-fixacao": ["intense", "elixir", "oud"],
  };

  const palavras = regras[slug] || [];

  if (!palavras.length) return true;

  return palavras.some((palavra) => texto.includes(palavra));
}

async function buscarProdutosRelacionados(slug: string) {
  try {
    const snapshot = await adminDb.collection("products").limit(80).get();

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
      description: "Perfumes árabes originais.",
    };
  }

  return {
    title: page.titulo,
    description: page.descricao,
    alternates: {
      canonical: `${SITE_URL}/${page.slug}`,
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
        }}
      >
        <h1>Página não encontrada</h1>
      </main>
    );
  }

  const produtosRelacionados = await buscarProdutosRelacionados(params.slug);

  const relatedPages = seoProgramaticoPages
    .filter((item) => item.slug !== page.slug)
    .slice(0, 8);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #FFF9F1 0%, #FBF6EF 55%, #FFFFFF 100%)",
        color: "#24170F",
        padding: "48px 20px 70px",
      }}
    >
      <section
        style={{
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <section
          style={{
            background: "#FFF",
            border: "1px solid #E9DCCB",
            borderRadius: 34,
            padding: "clamp(32px, 6vw, 72px)",
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
              margin: 0,
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

        {produtosRelacionados.length > 0 && (
          <section
            style={{
              marginTop: 40,
            }}
          >
            <h2
              style={{
                fontSize: 34,
                marginBottom: 24,
              }}
            >
              Produtos relacionados
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 18,
              }}
            >
              {produtosRelacionados.map((produto) => {
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
                      background: "#FFF",
                      border: "1px solid #EADBC8",
                      borderRadius: 24,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: 240,
                        background: "#FFF9F1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
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

                    <div style={{ padding: 18 }}>
                      <p
                        style={{
                          color: "#B38B59",
                          fontWeight: 800,
                          fontSize: 12,
                          marginBottom: 8,
                          textTransform: "uppercase",
                        }}
                      >
                        {produto.marca || "Maison Noor"}
                      </p>

                      <h3
                        style={{
                          fontSize: 18,
                          lineHeight: 1.3,
                          margin: 0,
                        }}
                      >
                        {produto.nome || "Perfume Maison Noor"}
                      </h3>

                      <p
                        style={{
                          marginTop: 14,
                          fontWeight: 900,
                          fontSize: 22,
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
            marginTop: 40,
            background: "#FFF",
            border: "1px solid #EADBC8",
            borderRadius: 28,
            padding: 28,
          }}
        >
          <h2
            style={{
              fontSize: 30,
              marginBottom: 18,
            }}
          >
            Continue explorando
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
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