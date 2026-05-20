"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type CategoriaCRM = "masculino" | "feminino" | "unissex" | "kits-presente";

type ProdutoFirebase = {
  id: string;
  nome: string;
  slug?: string;
  marca?: string;
  volumeMl?: number;
  categoria?: CategoriaCRM;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  observacoes?: string;
  imagem?: string;
  imageUrl?: string;
  tipo?: string;
  familiaOlfativa?: string;
  fixacao?: string;
  descricao?: string;
};

type CategoriaSeoProps = {
  categoria: "feminino" | "masculino" | "unissex" | "body-splash";
  titulo: string;
  subtitulo: string;
  descricaoSeo: string;
  headline: string;
  chamada: string;
  badge: string;
};

const SITE_URL = "https://www.maisonnoor.com.br";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function slugify(texto: string) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getImagemProduto(produto: ProdutoFirebase): string {
  if (produto.imagem) return produto.imagem;
  if (produto.imageUrl) return produto.imageUrl;
  return `/produtos/${slugify(produto.nome)}.png`;
}

function getProdutoUrl(produto: ProdutoFirebase): string {
  return `/produto/${produto.id}`;
}

function getCategoriaLabel(categoria?: CategoriaCRM) {
  if (categoria === "feminino") return "Feminino";
  if (categoria === "masculino") return "Masculino";
  if (categoria === "unissex") return "Unissex";
  return "Maison Noor";
}

function filtrarProduto(produto: ProdutoFirebase, categoria: CategoriaSeoProps["categoria"]) {
  const texto = `${produto.nome || ""} ${produto.marca || ""} ${produto.tipo || ""} ${produto.observacoes || ""} ${produto.descricao || ""}`.toLowerCase();

  if (categoria === "body-splash") {
    return (
      texto.includes("body splash") ||
      texto.includes("bodysplash") ||
      texto.includes("splash") ||
      texto.includes("body")
    );
  }

  return produto.categoria === categoria;
}

function getTextoApoio(categoria: CategoriaSeoProps["categoria"]) {
  if (categoria === "feminino") {
    return "Perfumes árabes femininos com perfis doces, florais, envolventes e sofisticados para quem deseja uma assinatura marcante.";
  }

  if (categoria === "masculino") {
    return "Perfumes árabes masculinos com presença, intensidade, sofisticação e fragrâncias ideais para rotina, noite e ocasiões especiais.";
  }

  if (categoria === "unissex") {
    return "Perfumes árabes unissex para quem busca versatilidade, elegância e fragrâncias marcantes que combinam com diferentes estilos.";
  }

  return "Body splash e cuidados perfumados para rotina, pós-banho e momentos em que você deseja leveza com toque sofisticado.";
}

export default function CategoriaSeoPage({
  categoria,
  titulo,
  subtitulo,
  descricaoSeo,
  headline,
  chamada,
  badge,
}: CategoriaSeoProps) {
  const [produtos, setProdutos] = useState<ProdutoFirebase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function carregarProdutos() {
      try {
        setLoading(true);
        const snap = await getDocs(query(collection(db, "products")));
        const lista: ProdutoFirebase[] = [];

        snap.forEach((item) => {
          const data = item.data() as any;

          lista.push({
            id: item.id,
            nome: data.nome ?? "",
            slug: data.slug,
            marca: data.marca,
            volumeMl: data.volumeMl,
            categoria: data.categoria,
            precoVenda: data.precoVenda,
            estoque: data.estoque,
            reservado: data.reservado ?? 0,
            ativo: data.ativo ?? true,
            observacoes: data.observacoes,
            imagem: data.imagem,
            imageUrl: data.imageUrl,
            tipo: data.tipo,
            familiaOlfativa: data.familiaOlfativa,
            fixacao: data.fixacao,
            descricao: data.descricao,
          });
        });

        if (!cancelado) setProdutos(lista);
      } catch (error) {
        console.error("Erro ao carregar categoria SEO:", error);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    carregarProdutos();

    return () => {
      cancelado = true;
    };
  }, []);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return produtos
      .map((produto) => {
        const estoque = Number(produto.estoque) || 0;
        const reservado = Number(produto.reservado) || 0;
        const disponivel = Math.max(0, estoque - reservado);

        return {
          ...produto,
          precoFinal: Number(produto.precoVenda) || 0,
          disponivel,
          imagemFinal: getImagemProduto(produto),
          tamanho: produto.volumeMl ? `${produto.volumeMl}ml` : "Maison Noor",
        };
      })
      .filter((produto) => produto.ativo !== false)
      .filter((produto) => produto.precoFinal > 0)
      .filter((produto) => filtrarProduto(produto, categoria))
      .filter((produto) => {
        if (!termo) return true;

        return (
          produto.nome.toLowerCase().includes(termo) ||
          String(produto.marca || "").toLowerCase().includes(termo) ||
          String(produto.tipo || "").toLowerCase().includes(termo) ||
          String(produto.familiaOlfativa || "").toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => {
        if ((a.disponivel <= 0) !== (b.disponivel <= 0)) return a.disponivel <= 0 ? 1 : -1;
        return String(a.nome || "").localeCompare(String(b.nome || ""));
      });
  }, [produtos, categoria, busca]);

  const jsonLd = useMemo(() => {
    const itens = produtosFiltrados.slice(0, 24).map((produto, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}${getProdutoUrl(produto)}`,
      name: produto.nome,
    }));

    return [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: titulo,
        description: descricaoSeo,
        url: typeof window !== "undefined" ? window.location.href : SITE_URL,
        isPartOf: {
          "@type": "WebSite",
          name: "Maison Noor Parfums",
          url: SITE_URL,
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: titulo,
        numberOfItems: produtosFiltrados.length,
        itemListElement: itens,
      },
    ];
  }, [produtosFiltrados, titulo, descricaoSeo]);

  return (
    <main style={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header style={styles.header}>
        <Link href="/" style={styles.logoArea}>
          <img src="/logo-maison-noor.png" alt="Maison Noor Parfums" style={styles.logo} />
          <div>
            <span style={styles.logoKicker}>Maison Noor</span>
            <strong style={styles.logoTitle}>Parfums</strong>
          </div>
        </Link>

        <nav style={styles.nav}>
          <Link href="/" style={styles.navLink}>Início</Link>
          <Link href="/novidades" style={styles.navLink}>Novidades</Link>
          <a href="https://wa.me/5512982389658" target="_blank" rel="noreferrer" style={styles.navCta}>
            WhatsApp
          </a>
        </nav>
      </header>

      <section style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={styles.heroContent}>
          <span style={styles.badge}>{badge}</span>
          <h1 style={styles.title}>{headline}</h1>
          <p style={styles.subtitle}>{subtitulo}</p>

          <div style={styles.heroActions}>
            <a href="#produtos-categoria" style={styles.primaryButton}>Ver produtos</a>
            <Link href="/" style={styles.secondaryButton}>Voltar ao catálogo</Link>
          </div>
        </div>

        <div style={styles.heroCard}>
          <span style={styles.heroCardKicker}>Curadoria SEO Maison Noor</span>
          <strong style={styles.heroCardTitle}>{titulo}</strong>
          <p style={styles.heroCardText}>{chamada}</p>
        </div>
      </section>

      <section style={styles.introSection}>
        <div style={styles.introCard}>
          <h2 style={styles.sectionTitle}>Por que escolher essa seleção?</h2>
          <p style={styles.paragraph}>{getTextoApoio(categoria)}</p>
          <div style={styles.benefits}>
            <span style={styles.benefit}>✦ Produtos originais</span>
            <span style={styles.benefit}>🚚 Envio para o Brasil</span>
            <span style={styles.benefit}>💬 Atendimento consultivo</span>
            <span style={styles.benefit}>🎁 Curadoria premium</span>
          </div>
        </div>
      </section>

      <section id="produtos-categoria" style={styles.productsSection}>
        <div style={styles.sectionHeader}>
          <div>
            <p style={styles.kicker}>Seleção Maison Noor</p>
            <h2 style={styles.sectionTitle}>{titulo}</h2>
          </div>

          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar nesta seleção..."
            style={styles.searchInput}
          />
        </div>

        {loading ? (
          <div style={styles.emptyBox}>Carregando produtos...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div style={styles.emptyBox}>Nenhum produto encontrado nesta categoria.</div>
        ) : (
          <div style={styles.grid}>
            {produtosFiltrados.map((produto) => (
              <article key={produto.id} style={styles.card}>
                <Link href={getProdutoUrl(produto)} style={styles.imageWrap}>
                  <img
                    src={produto.imagemFinal}
                    alt={produto.nome}
                    style={styles.productImage}
                    onError={(event) => {
                      (event.currentTarget as HTMLImageElement).src = "/produtos/sem-imagem.png";
                    }}
                  />
                </Link>

                <div style={styles.cardContent}>
                  <span style={styles.cardBrand}>{produto.marca || produto.tipo || "Maison Noor"}</span>
                  <Link href={getProdutoUrl(produto)} style={styles.productNameLink}>
                    <h3 style={styles.productName}>{produto.nome}</h3>
                  </Link>

                  <div style={styles.tags}>
                    <span style={styles.tag}>{getCategoriaLabel(produto.categoria)}</span>
                    <span style={styles.tag}>{produto.tamanho}</span>
                    {produto.fixacao ? <span style={styles.tag}>{produto.fixacao}</span> : null}
                  </div>

                  <strong style={styles.price}>{formatarMoeda(produto.precoFinal)}</strong>

                  <div style={styles.actions}>
                    <Link href={getProdutoUrl(produto)} style={styles.viewButton}>
                      Ver detalhes
                    </Link>
                    <a
                      href={`https://wa.me/5512982389658?text=${encodeURIComponent(
                        `Olá! Tenho interesse no produto ${produto.nome} que vi na página ${titulo}. Pode me ajudar?`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.whatsappButton}
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.seoTextSection}>
        <div style={styles.seoTextCard}>
          <h2 style={styles.sectionTitle}>Maison Noor: perfumes árabes premium com atendimento consultivo</h2>
          <p style={styles.paragraph}>
            A Maison Noor Parfums trabalha com uma seleção de fragrâncias árabes originais para quem busca presença,
            elegância e uma experiência de compra mais segura. Nossa curadoria ajuda você a escolher o perfume ideal
            por estilo, ocasião, intensidade e perfil olfativo.
          </p>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 0%, rgba(215,192,160,0.24), transparent 28%), radial-gradient(circle at 88% 8%, rgba(191,148,88,0.12), transparent 24%), #F5EFE6",
    color: "#2B2B2B",
    fontFamily: "Inter, Arial, sans-serif",
  },
  header: {
    maxWidth: "1320px",
    margin: "0 auto",
    padding: "18px 18px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
    flexWrap: "wrap",
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    textDecoration: "none",
  },
  logo: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid rgba(215, 192, 160, 0.95)",
  },
  logoKicker: {
    display: "block",
    color: "#A8844C",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  logoTitle: {
    display: "block",
    color: "#3D312B",
    fontSize: "24px",
    lineHeight: 1,
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  navLink: {
    minHeight: "42px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "0 14px",
    border: "1px solid #DFCDB7",
    background: "rgba(255,249,241,0.86)",
    color: "#6E5844",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: "14px",
  },
  navCta: {
    minHeight: "42px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "0 16px",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: "14px",
  },
  hero: {
    maxWidth: "1320px",
    margin: "18px auto 0",
    padding: "44px 24px",
    borderRadius: "32px",
    border: "1px solid rgba(216, 193, 162, 0.34)",
    background:
      "radial-gradient(circle at top right, rgba(212,175,119,0.22), transparent 32%), linear-gradient(135deg, #17110C, #2B2118)",
    color: "#F6E9D6",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)",
    gap: "26px",
    position: "relative",
    overflow: "hidden",
    boxSizing: "border-box",
  },
  heroGlow: {
    position: "absolute",
    right: "-80px",
    top: "-80px",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background: "rgba(212, 175, 119, 0.16)",
    filter: "blur(18px)",
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
  },
  badge: {
    display: "inline-flex",
    borderRadius: "999px",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(216,193,162,0.18)",
    color: "#D8BE97",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: {
    margin: "14px 0 12px",
    color: "#FFF6EB",
    fontSize: "clamp(34px, 5vw, 58px)",
    lineHeight: 1.02,
    letterSpacing: "-0.055em",
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  subtitle: {
    margin: 0,
    maxWidth: "760px",
    color: "rgba(246, 233, 214, 0.78)",
    fontSize: "17px",
    lineHeight: 1.75,
  },
  heroActions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "24px",
  },
  primaryButton: {
    minHeight: "50px",
    borderRadius: "16px",
    padding: "0 22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    textDecoration: "none",
    fontWeight: 900,
  },
  secondaryButton: {
    minHeight: "50px",
    borderRadius: "16px",
    padding: "0 22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.08)",
    color: "#F6E9D6",
    textDecoration: "none",
    border: "1px solid rgba(216,193,162,0.18)",
    fontWeight: 800,
  },
  heroCard: {
    position: "relative",
    zIndex: 2,
    borderRadius: "24px",
    border: "1px solid rgba(216,193,162,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))",
    padding: "24px",
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  heroCardKicker: {
    color: "#D8BE97",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    marginBottom: "8px",
  },
  heroCardTitle: {
    color: "#FFF6EB",
    fontSize: "25px",
    lineHeight: 1.15,
    marginBottom: "10px",
  },
  heroCardText: {
    margin: 0,
    color: "rgba(246, 233, 214, 0.74)",
    fontSize: "14px",
    lineHeight: 1.65,
  },
  introSection: {
    maxWidth: "1320px",
    margin: "22px auto 0",
    padding: "0 18px",
  },
  introCard: {
    borderRadius: "26px",
    border: "1px solid #E6D7C5",
    background: "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(244,234,220,0.92))",
    padding: "24px",
    boxShadow: "0 14px 30px rgba(62, 44, 24, 0.07)",
  },
  sectionTitle: {
    margin: "0 0 8px",
    color: "#3A2F29",
    lineHeight: 1.12,
    fontWeight: 800,
    letterSpacing: "-0.04em",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(25px, 3vw, 34px)",
  },
  paragraph: {
    margin: 0,
    color: "#6D6157",
    fontSize: "15px",
    lineHeight: 1.75,
  },
  benefits: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "16px",
  },
  benefit: {
    borderRadius: "999px",
    border: "1px solid #E3D3BF",
    background: "rgba(255,255,255,0.72)",
    padding: "9px 12px",
    color: "#6B523A",
    fontSize: "12px",
    fontWeight: 900,
  },
  productsSection: {
    maxWidth: "1320px",
    margin: "26px auto 0",
    padding: "0 18px 34px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "16px",
    marginBottom: "18px",
    flexWrap: "wrap",
  },
  kicker: {
    margin: "0 0 6px",
    color: "#B1874E",
    fontSize: "13px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  searchInput: {
    minWidth: "min(100%, 340px)",
    height: "48px",
    borderRadius: "16px",
    border: "1px solid #DFCDB7",
    background: "rgba(255,255,255,0.82)",
    padding: "0 15px",
    color: "#3D312B",
    outline: "none",
    boxSizing: "border-box",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
  },
  card: {
    borderRadius: "26px",
    border: "1px solid #EADBC8",
    background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
    boxShadow: "0 16px 34px rgba(48,34,20,0.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  imageWrap: {
    height: "220px",
    background:
      "radial-gradient(circle at center, rgba(212,175,119,0.16), transparent 42%), linear-gradient(180deg, rgba(255,253,249,0.96), rgba(244,234,220,0.72))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "22px",
    borderBottom: "1px solid #EFE3D4",
  },
  productImage: {
    width: "100%",
    height: "100%",
    maxWidth: "170px",
    objectFit: "contain",
    mixBlendMode: "multiply",
    filter: "drop-shadow(0 16px 26px rgba(40, 28, 18, 0.14))",
  },
  cardContent: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: 1,
  },
  cardBrand: {
    color: "#B1874E",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  productNameLink: {
    textDecoration: "none",
  },
  productName: {
    margin: 0,
    color: "#3E3027",
    fontSize: "18px",
    lineHeight: 1.16,
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  tag: {
    borderRadius: "999px",
    border: "1px solid #E6D7C5",
    background: "rgba(255,255,255,0.72)",
    color: "#8B6B46",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "6px 8px",
  },
  price: {
    color: "#9B7441",
    fontSize: "22px",
    lineHeight: 1,
  },
  actions: {
    marginTop: "auto",
    display: "grid",
    gap: "9px",
  },
  viewButton: {
    minHeight: "44px",
    borderRadius: "14px",
    background: "linear-gradient(180deg, #FFF9F1, #F5E7D4)",
    border: "1px solid #D8C1A2",
    color: "#6B523A",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: "14px",
  },
  whatsappButton: {
    minHeight: "44px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#2B2118",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: "14px",
  },
  emptyBox: {
    padding: "28px",
    borderRadius: "22px",
    border: "1px solid #E8D8C5",
    background: "#FFF9F1",
    textAlign: "center",
    color: "#7A6A5C",
    fontWeight: 800,
  },
  seoTextSection: {
    maxWidth: "1320px",
    margin: "0 auto",
    padding: "0 18px 40px",
  },
  seoTextCard: {
    borderRadius: "26px",
    border: "1px solid #E2D2BF",
    background: "linear-gradient(180deg, #EFE4D6, #EBDCCD)",
    padding: "26px",
  },
};
