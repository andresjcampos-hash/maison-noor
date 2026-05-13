"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type CategoriaCRM = "masculino" | "feminino" | "unissex" | "kits-presente";

type ProdutoFirebase = {
  id: string;
  nome: string;
  marca?: string;
  volumeMl?: number;
  categoria?: CategoriaCRM;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  createdAt?: any;
  updatedAt?: any;
  observacoes?: string;
  imagem?: string;
  imageUrl?: string;
  ordemVitrine?: number;
  ordem?: number;
  posicao?: number;
  position?: number;
  destaque?: boolean;
  tipo?: string;
  novo?: boolean;
  novidade?: boolean;
  lancamento?: boolean;
  reposicao?: boolean;
};

type ProdutoPronto = ProdutoFirebase & {
  disponivel: number;
  precoFinal: number;
  categoriaSite: string;
  imagemFinal: string;
  tamanho: string;
  indisponivel: boolean;
  isNovidadeReal: boolean;
};

const productsCollection = collection(db, "products");

function formatarMoeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
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

function categoriaSite(categoria?: CategoriaCRM): string {
  if (categoria === "feminino") return "Feminino";
  if (categoria === "masculino") return "Masculino";
  if (categoria === "unissex") return "Unissex";
  if (categoria === "kits-presente") return "Presente";
  return "Maison Noor";
}

function getImagemProduto(produto: ProdutoFirebase): string {
  if (produto.imagem) return produto.imagem;
  if (produto.imageUrl) return produto.imageUrl;
  const slug = slugify(produto.nome);
  return slug ? `/produtos/${slug}.png` : "/produtos/sem-imagem.png";
}

function getProdutoTime(valor: any) {
  if (!valor) return 0;
  if (typeof valor?.toDate === "function") return valor.toDate().getTime();
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? data.getTime() : 0;
}

function getProdutoOrdem(produto: any) {
  const ordem = Number(
    produto.ordemVitrine ?? produto.ordem ?? produto.posicao ?? produto.position ?? 9999
  );
  return Number.isFinite(ordem) ? ordem : 9999;
}

function isProdutoNovidade(produto: ProdutoFirebase) {
  const texto = `${produto.nome || ""} ${produto.marca || ""} ${produto.observacoes || ""} ${produto.tipo || ""}`.toLowerCase();

  return Boolean(
    produto.novo ||
      produto.novidade ||
      produto.lancamento ||
      produto.reposicao ||
      texto.includes("novidade") ||
      texto.includes("lançamento") ||
      texto.includes("lancamento") ||
      texto.includes("reposição") ||
      texto.includes("reposicao")
  );
}

function getSeloProduto(produto: ProdutoPronto) {
  if (produto.novo || produto.novidade || produto.lancamento) return "Novo";
  if (produto.reposicao) return "Reposição";
  if (produto.destaque) return "Destaque";
  return produto.isNovidadeReal ? "Novidade" : "Selecionado";
}

function getEssencia(produto: ProdutoPronto) {
  const texto = `${produto.nome || ""} ${produto.observacoes || ""} ${produto.tipo || ""}`.toLowerCase();

  if (texto.includes("oud") || texto.includes("ambar") || texto.includes("âmbar")) return "Intenso e sofisticado";
  if (texto.includes("yara") || texto.includes("candy") || texto.includes("baunilha")) return "Doce e envolvente";
  if (texto.includes("fresh") || texto.includes("citr") || texto.includes("fresco")) return "Fresco e elegante";
  if (produto.categoria === "masculino") return "Marcante e refinado";
  if (produto.categoria === "feminino") return "Delicado e memorável";
  return "Curadoria premium";
}

export default function NovidadesPage() {
  const [produtos, setProdutos] = useState<ProdutoFirebase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [windowWidth, setWindowWidth] = useState(1280);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function carregarProdutos() {
      setLoading(true);
      try {
        const snapshot = await getDocs(query(productsCollection));
        if (cancelled) return;

        const arr: ProdutoFirebase[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as any;
          arr.push({
            id: d.id,
            nome: data.nome ?? data.name ?? "",
            marca: data.marca,
            volumeMl: data.volumeMl,
            categoria: data.categoria,
            precoVenda: data.precoVenda ?? data.preco ?? data.price,
            estoque: data.estoque,
            reservado: data.reservado ?? 0,
            ativo: data.ativo ?? true,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            observacoes: data.observacoes,
            imagem: data.imagem,
            imageUrl: data.imageUrl,
            ordemVitrine: data.ordemVitrine,
            ordem: data.ordem,
            posicao: data.posicao,
            position: data.position,
            destaque: data.destaque,
            tipo: data.tipo,
            novo: data.novo,
            novidade: data.novidade,
            lancamento: data.lancamento,
            reposicao: data.reposicao,
          });
        });

        setProdutos(arr);
      } catch (error) {
        console.error("Erro ao carregar novidades:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    carregarProdutos();
    return () => {
      cancelled = true;
    };
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1100;

  const produtosProntos = useMemo<ProdutoPronto[]>(() => {
    return produtos
      .map((produto) => {
        const estoque = Number(produto.estoque) || 0;
        const reservado = Number(produto.reservado) || 0;
        const disponivel = Math.max(0, estoque - reservado);
        const precoFinal = Number(produto.precoVenda) || 0;

        return {
          ...produto,
          disponivel,
          precoFinal,
          categoriaSite: categoriaSite(produto.categoria),
          imagemFinal: getImagemProduto(produto),
          tamanho: produto.volumeMl ? `${produto.volumeMl}ml` : "EDP",
          indisponivel: disponivel <= 0,
          isNovidadeReal: isProdutoNovidade(produto),
        };
      })
      .filter((produto) => produto.ativo !== false)
      .filter((produto) => produto.precoFinal > 0)
      .sort((a, b) => {
        if (a.isNovidadeReal !== b.isNovidadeReal) return a.isNovidadeReal ? -1 : 1;
        if (a.indisponivel !== b.indisponivel) return a.indisponivel ? 1 : -1;

        const ordemA = getProdutoOrdem(a);
        const ordemB = getProdutoOrdem(b);
        if (ordemA !== ordemB) return ordemA - ordemB;

        const criadoA = getProdutoTime(a.createdAt);
        const criadoB = getProdutoTime(b.createdAt);
        if (criadoA !== criadoB) return criadoB - criadoA;

        return String(a.nome || "").localeCompare(String(b.nome || ""));
      });
  }, [produtos]);

  const novidadesReais = useMemo(() => produtosProntos.filter((produto) => produto.isNovidadeReal), [produtosProntos]);
  const vitrine = novidadesReais.length ? novidadesReais : produtosProntos.slice(0, 12);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return vitrine;

    return vitrine.filter((produto) => {
      return (
        produto.nome.toLowerCase().includes(termo) ||
        String(produto.marca || "").toLowerCase().includes(termo) ||
        String(produto.tipo || "").toLowerCase().includes(termo) ||
        produto.categoriaSite.toLowerCase().includes(termo)
      );
    });
  }, [busca, vitrine]);

  return (
    <main style={styles.page}>
      <header style={styles.headerShell}>
        <div style={styles.headerInner}>
          <Link href="/" style={styles.brandLink}>
            <Image
              src="/logo-maison-noor.png"
              alt="Maison Noor"
              width={52}
              height={52}
              priority
              style={styles.logo}
            />
            <div>
              <span style={styles.brandKicker}>Maison Noor</span>
              <strong style={styles.brandTitle}>Novidades</strong>
            </div>
          </Link>

          <nav style={styles.headerActions}>
            <Link href="/" style={styles.secondaryButton}>Home</Link>
            <Link href="/#produtos" style={styles.primaryButton}>Ver produtos</Link>
          </nav>
        </div>
      </header>

      <section style={{ ...styles.heroSection, padding: isMobile ? "12px 14px 18px" : "18px 22px 24px" }}>
        <div style={{ ...styles.heroCard, minHeight: isMobile ? "170px" : "210px", padding: isMobile ? "22px 20px" : "30px 38px" }}>
          <div style={styles.heroGlowOne} />
          <div style={styles.heroGlowTwo} />

          <div style={styles.heroContent}>
            <p style={styles.heroKicker}>Lançamentos e reposições</p>
            <h1 style={{ ...styles.heroTitle, fontSize: isMobile ? "30px" : isTablet ? "40px" : "48px" }}>
              Novidades Maison Noor
            </h1>
            <p style={{ ...styles.heroText, fontSize: isMobile ? "14px" : "16px" }}>
              Acompanhe os perfumes que acabaram de chegar, voltaram para estoque ou entraram na curadoria especial.
            </p>

            <div style={styles.heroButtons}>
              <a href="#vitrine" style={styles.goldButton}>Explorar novidades</a>
              <a
                href="https://wa.me/5512982389658?text=Olá! Quero saber quais são as novidades da Maison Noor."
                target="_blank"
                rel="noreferrer"
                style={styles.darkButton}
              >
                Atendimento VIP
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="vitrine" style={{ ...styles.contentSection, padding: isMobile ? "0 14px 26px" : "0 22px 32px" }}>
        <div style={{ ...styles.sectionHeader, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-end" }}>
          <div>
            <p style={styles.kicker}>Vitrine atualizada</p>
            <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? "26px" : "34px" }}>
              {novidadesReais.length ? "Chegaram agora na Maison Noor" : "Seleção recente Maison Noor"}
            </h2>
            <p style={styles.sectionText}>
              {novidadesReais.length
                ? "Produtos marcados no Firebase como novo, novidade, lançamento ou reposição."
                : "Nenhum produto foi marcado como novidade ainda, então exibimos uma seleção recente para a página não ficar vazia."}
            </p>
          </div>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar novidade..."
            style={{ ...styles.searchInput, width: isMobile ? "100%" : "360px" }}
          />
        </div>

        {loading ? (
          <div style={styles.emptyState}>Carregando novidades...</div>
        ) : filtrados.length === 0 ? (
          <div style={styles.emptyState}>Nenhum produto encontrado para essa busca.</div>
        ) : (
          <div
            style={{
              ...styles.grid,
              gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(3, 1fr)" : "repeat(5, 1fr)",
            }}
          >
            {filtrados.map((produto) => (
              <Link key={produto.id} href={`/produto/${produto.id}`} style={styles.card}>
                <div style={styles.imageWrap}>
                  <span style={styles.badge}>{getSeloProduto(produto)}</span>
                  {produto.indisponivel && <span style={styles.stockBadge}>Indisponível</span>}
                  <img
                    src={produto.imagemFinal}
                    alt={produto.nome}
                    loading="lazy"
                    decoding="async"
                    style={styles.productImage}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/produtos/sem-imagem.png";
                    }}
                  />
                </div>

                <div style={styles.cardBody}>
                  <span style={styles.cardCategory}>{produto.categoriaSite}</span>
                  <strong style={styles.cardTitle}>{produto.nome}</strong>
                  <span style={styles.cardMood}>{getEssencia(produto)}</span>
                  <div style={styles.cardMetaRow}>
                    <span style={styles.cardSize}>{produto.tamanho}</span>
                    <span style={styles.cardPrice}>{formatarMoeda(produto.precoFinal)}</span>
                  </div>
                  <span style={styles.cardButton}>Ver fragrância</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer style={styles.footer}>
        <span>© 2026 Maison Noor Parfums</span>
        <Link href="/" style={styles.footerLink}>Voltar para a Home</Link>
      </footer>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 0%, rgba(215,192,160,0.25), transparent 26%), radial-gradient(circle at 88% 8%, rgba(191,148,88,0.13), transparent 24%), #F5EFE6",
    color: "#342922",
    fontFamily: "Inter, Arial, sans-serif",
  },
  headerShell: {
    position: "sticky",
    top: "8px",
    left: 0,
    right: 0,
    zIndex: 50,
    padding: "8px 14px 0",
  },
  headerInner: {
    maxWidth: "1360px",
    margin: "0 auto",
    minHeight: "68px",
    borderRadius: "22px",
    border: "1px solid rgba(229, 211, 190, 0.95)",
    background: "rgba(255, 249, 241, 0.94)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 18px 45px rgba(47, 34, 20, 0.10)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "8px 14px",
  },
  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    textDecoration: "none",
    color: "#342922",
  },
  logo: {
    borderRadius: "999px",
    objectFit: "cover",
    border: "2px solid rgba(215, 192, 160, 0.95)",
    boxShadow: "0 10px 24px rgba(60, 42, 23, 0.12)",
  },
  brandKicker: {
    display: "block",
    color: "#A8844C",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  brandTitle: {
    display: "block",
    color: "#3D312B",
    fontSize: "22px",
    lineHeight: 1.05,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  primaryButton: {
    minHeight: "48px",
    borderRadius: "999px",
    padding: "0 22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1B1612, #2A211A)",
    color: "#F6E9D6",
    textDecoration: "none",
    fontWeight: 900,
    border: "1px solid rgba(216,193,162,0.22)",
  },
  secondaryButton: {
    minHeight: "48px",
    borderRadius: "999px",
    padding: "0 20px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.62)",
    color: "#6E5844",
    textDecoration: "none",
    fontWeight: 800,
    border: "1px solid #E2D2BF",
  },
  heroSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "34px",
    background: "radial-gradient(circle at 82% 22%, rgba(216,180,110,0.22), transparent 28%), linear-gradient(135deg, #18120D, #2A2118)",
    border: "1px solid rgba(216,193,162,0.20)",
    boxShadow: "0 28px 68px rgba(30, 21, 12, 0.18)",
    color: "#FFF8EE",
  },
  heroGlowOne: {
    position: "absolute",
    width: "360px",
    height: "360px",
    right: "-90px",
    top: "-100px",
    borderRadius: "999px",
    background: "rgba(212,175,119,0.18)",
    filter: "blur(28px)",
  },
  heroGlowTwo: {
    position: "absolute",
    width: "280px",
    height: "280px",
    left: "-100px",
    bottom: "-110px",
    borderRadius: "999px",
    background: "rgba(255,244,220,0.08)",
    filter: "blur(30px)",
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
    maxWidth: "760px",
  },
  heroKicker: {
    margin: "0 0 14px",
    color: "#E8C99A",
    fontSize: "13px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.22em",
  },
  heroTitle: {
    margin: 0,
    color: "#FFF8EE",
    lineHeight: 1.02,
    fontFamily: "Georgia, 'Times New Roman', serif",
    letterSpacing: "-0.055em",
  },
  heroText: {
    margin: "12px 0 0",
    color: "rgba(255,248,238,0.80)",
    lineHeight: 1.5,
    maxWidth: "680px",
  },
  heroButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "18px",
  },
  goldButton: {
    minHeight: "44px",
    borderRadius: "14px",
    padding: "0 20px",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    boxShadow: "0 16px 30px rgba(120, 87, 45, 0.22)",
  },
  darkButton: {
    minHeight: "44px",
    borderRadius: "14px",
    padding: "0 20px",
    background: "rgba(255,255,255,0.08)",
    color: "#FFF8EE",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.18)",
  },
  contentSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    marginBottom: "16px",
  },
  kicker: {
    margin: 0,
    color: "#B1874E",
    fontSize: "13px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  },
  sectionTitle: {
    margin: "10px 0 8px",
    color: "#3A2F29",
    lineHeight: 1.08,
    fontFamily: "Georgia, 'Times New Roman', serif",
    letterSpacing: "-0.05em",
  },
  sectionText: {
    margin: 0,
    color: "#6D6157",
    fontSize: "16px",
    lineHeight: 1.65,
    maxWidth: "690px",
  },
  searchInput: {
    minHeight: "46px",
    borderRadius: "18px",
    border: "1px solid #DFCDB7",
    background: "rgba(255,255,255,0.86)",
    color: "#342922",
    padding: "0 18px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  },
  grid: {
    display: "grid",
    gap: "14px",
  },
  card: {
    minHeight: "100%",
    borderRadius: "20px",
    overflow: "hidden",
    border: "1px solid #EADBC8",
    background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
    boxShadow: "0 16px 34px rgba(48,34,20,0.08)",
    textDecoration: "none",
    color: "#342922",
    display: "flex",
    flexDirection: "column",
  },
  imageWrap: {
    height: "142px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(circle at center, rgba(212,175,119,0.16), transparent 42%), linear-gradient(180deg, rgba(255,253,249,0.96), rgba(244,234,220,0.72))",
    borderBottom: "1px solid #EFE3D4",
  },
  badge: {
    position: "absolute",
    top: "14px",
    left: "14px",
    zIndex: 2,
    padding: "7px 11px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  stockBadge: {
    position: "absolute",
    top: "14px",
    right: "14px",
    zIndex: 2,
    padding: "7px 11px",
    borderRadius: "999px",
    background: "#FFF1F1",
    color: "#9A3B3B",
    border: "1px solid #F0CFCF",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
  },
  productImage: {
    width: "112px",
    height: "112px",
    objectFit: "contain",
    mixBlendMode: "multiply",
    filter: "drop-shadow(0 16px 26px rgba(40, 28, 18, 0.14))",
  },
  cardBody: {
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
  },
  cardCategory: {
    color: "#B1874E",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  cardTitle: {
    color: "#3E3027",
    fontSize: "16px",
    lineHeight: 1.15,
  },
  cardMood: {
    color: "#8B7A6A",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  cardMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "auto",
    paddingTop: "12px",
    borderTop: "1px solid #EEE1D0",
  },
  cardSize: {
    color: "#7C6E62",
    fontSize: "13px",
    fontWeight: 700,
  },
  cardPrice: {
    color: "#9B7441",
    fontSize: "16px",
    fontWeight: 900,
  },
  cardButton: {
    marginTop: "8px",
    minHeight: "40px",
    borderRadius: "15px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontWeight: 900,
  },
  emptyState: {
    borderRadius: "22px",
    border: "1px solid #E8D8C5",
    background: "#FFF9F1",
    padding: "24px 18px",
    textAlign: "center",
    color: "#75685C",
    fontSize: "17px",
    lineHeight: 1.6,
  },
  footer: {
    borderTop: "1px solid #E2D2BF",
    padding: "18px 22px",
    maxWidth: "1360px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    flexWrap: "wrap",
    color: "#7A6A5C",
  },
  footerLink: {
    color: "#8E6431",
    textDecoration: "none",
    fontWeight: 900,
  },
};
