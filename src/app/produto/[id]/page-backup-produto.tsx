"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { CSSProperties, MouseEvent } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

type CategoriaCRM = "masculino" | "feminino" | "unissex";

type ProdutoFirebase = {
  id: string;
  nome: string;
  marca?: string;
  volumeMl?: number;
  categoria?: CategoriaCRM;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  observacoes?: string;

  imagem?: string;
  imagem2?: string;
  imagem3?: string;

  imageUrl?: string;
  image2?: string;
  image3?: string;
  imageUrl2?: string;
  imageUrl3?: string;

  foto?: string;
  foto2?: string;
  foto3?: string;

  fotos?: string[];
  imagens?: string[];
  galeria?: string[];

  descricao?: string;
  tipo?: string;

  notasTopo?: string;
  notasCoracao?: string;
  notasFundo?: string;
  familiaOlfativa?: string;
  fixacao?: string;
  projecao?: string;
  ocasiao?: string;
};

type ProdutoCarrinho = {
  id: string;
  nome: string;
  preco: number;
  imagem: string;
  tamanho: string;
};

type ProdutoRelacionado = {
  id: string;
  nome: string;
  marca?: string;
  preco: number;
  imagem: string;
  categoria: string;
  tamanho: string;
};

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

function categoriaSite(categoria?: CategoriaCRM): string {
  if (categoria === "feminino") return "Feminino";
  if (categoria === "masculino") return "Masculino";
  if (categoria === "unissex") return "Unissex";
  return "Unissex";
}

function getImagemPrincipal(produto: ProdutoFirebase): string {
  const slug = slugify(produto.nome);

  return (
    produto.imagem ||
    produto.imageUrl ||
    produto.foto ||
    produto.imagem2 ||
    produto.image2 ||
    produto.imageUrl2 ||
    produto.foto2 ||
    `/produtos/${slug}.png`
  );
}

function getGaleriaImagens(produto: ProdutoFirebase): string[] {
  const slug = slugify(produto.nome);

  const candidatas = [
    produto.imagem,
    produto.imageUrl,
    produto.foto,

    produto.imagem2,
    produto.image2,
    produto.imageUrl2,
    produto.foto2,

    produto.imagem3,
    produto.image3,
    produto.imageUrl3,
    produto.foto3,

    ...(Array.isArray(produto.fotos) ? produto.fotos : []),
    ...(Array.isArray(produto.imagens) ? produto.imagens : []),
    ...(Array.isArray(produto.galeria) ? produto.galeria : []),

    `/produtos/${slug}.png`,
    `/produtos/${slug}.jpg`,
    `/produtos/${slug}.jpeg`,
    `/produtos/${slug}.webp`,

    `/produtos/${slug}-1.png`,
    `/produtos/${slug}-2.png`,
    `/produtos/${slug}-3.png`,

    `/produtos/${slug}-1.jpg`,
    `/produtos/${slug}-2.jpg`,
    `/produtos/${slug}-3.jpg`,

    `/produtos/${slug}_1.png`,
    `/produtos/${slug}_2.png`,
    `/produtos/${slug}_3.png`,
  ];

  const limpas = candidatas
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return Array.from(new Set(limpas)).slice(0, 3);
}

function inferirPerfil(produto: ProdutoFirebase) {
  const familia = String(produto.familiaOlfativa || "").toLowerCase();
  const fixacao = String(produto.fixacao || "").toLowerCase();
  const projecao = String(produto.projecao || "").toLowerCase();

  let perfil = "sofisticado e versátil";
  let sensacao = "elegante, refinada e envolvente";
  let ocasiacao = produto.ocasiao || "eventos, noites especiais e assinatura pessoal";

  if (familia.includes("ambar") || familia.includes("oriental")) {
    perfil = "marcante e envolvente";
    sensacao = "intensa, luxuosa e imponente";
  } else if (familia.includes("amadeir")) {
    perfil = "elegante e sofisticado";
    sensacao = "refinada, madura e confiante";
  } else if (familia.includes("floral")) {
    perfil = "delicado e sofisticado";
    sensacao = "charmosa, feminina e memorável";
  } else if (familia.includes("cítric") || familia.includes("citrico") || familia.includes("aromatic")) {
    perfil = "fresco e moderno";
    sensacao = "leve, limpa e energética";
  }

  if (fixacao.includes("alta") || projecao.includes("alta") || projecao.includes("forte")) {
    ocasiacao = produto.ocasiao || "noite, eventos, encontros e ocasiões de destaque";
  }

  return { perfil, sensacao, ocasiacao };
}

export default function ProdutoPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [produto, setProduto] = useState<ProdutoFirebase | null>(null);
  const [relacionados, setRelacionados] = useState<ProdutoRelacionado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [adicionado, setAdicionado] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(1280);
  const [imagemSelecionada, setImagemSelecionada] = useState(0);
  const [zoomAtivo, setZoomAtivo] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [hoverBuyNow, setHoverBuyNow] = useState(false);
  const [hoverAddCart, setHoverAddCart] = useState(false);
  const [hoverWhatsapp, setHoverWhatsapp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function carregarProduto() {
      if (!id) return;

      try {
        setLoading(true);
        setErro("");

        const ref = doc(db, "products", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setProduto(null);
          setErro("Produto não encontrado.");
          return;
        }

        const data = snap.data() as any;

        setProduto({
          id: snap.id,
          nome: data.nome ?? "",
          marca: data.marca,
          volumeMl: data.volumeMl,
          categoria: data.categoria,
          precoCompra: data.precoCompra,
          precoVenda: data.precoVenda,
          estoque: data.estoque,
          reservado: data.reservado ?? 0,
          ativo: data.ativo ?? true,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          observacoes: data.observacoes,

          imagem: data.imagem,
          imagem2: data.imagem2,
          imagem3: data.imagem3,

          imageUrl: data.imageUrl,
          image2: data.image2,
          image3: data.image3,
          imageUrl2: data.imageUrl2,
          imageUrl3: data.imageUrl3,

          foto: data.foto,
          foto2: data.foto2,
          foto3: data.foto3,

          fotos: data.fotos,
          imagens: data.imagens,
          galeria: data.galeria,

          descricao: data.descricao,
          tipo: data.tipo,

          notasTopo: data.notasTopo,
          notasCoracao: data.notasCoracao,
          notasFundo: data.notasFundo,
          familiaOlfativa: data.familiaOlfativa,
          fixacao: data.fixacao,
          projecao: data.projecao,
          ocasiao: data.ocasiao,
        });
      } catch (e) {
        console.error(e);
        setErro("Não foi possível carregar o produto.");
      } finally {
        setLoading(false);
      }
    }

    carregarProduto();
  }, [id]);

  useEffect(() => {
    async function carregarRelacionados() {
      if (!produto?.id) return;

      try {
        const productsRef = collection(db, "products");
        const consultas = [] as any[];

        if (produto.categoria) {
          consultas.push(
            query(productsRef, where("categoria", "==", produto.categoria), limit(8))
          );
        }
        consultas.push(query(productsRef, limit(8)));

        const acumulado = new Map<string, ProdutoRelacionado>();

        for (const consulta of consultas) {
          const snap = await getDocs(consulta);

          snap.docs.forEach((item) => {
            if (item.id === produto.id) return;

            const data = item.data() as ProdutoFirebase;
            const ativo = data.ativo ?? true;
            const estoque = Number(data.estoque) || 0;
            const reservado = Number(data.reservado) || 0;
            const disponivel = Math.max(0, estoque - reservado);

            if (!ativo || disponivel <= 0) return;
            if (acumulado.has(item.id)) return;

            acumulado.set(item.id, {
              id: item.id,
              nome: data.nome || "Perfume Maison Noor",
              marca: data.marca,
              preco: Number(data.precoVenda) || 0,
              imagem: getImagemPrincipal({ ...data, id: item.id, nome: data.nome || "produto" }),
              categoria: categoriaSite(data.categoria),
              tamanho: data.volumeMl ? `${data.volumeMl}ml` : "—",
            });
          });

          if (acumulado.size >= 4) break;
        }

        setRelacionados(Array.from(acumulado.values()).slice(0, 4));
      } catch (error) {
        console.error("Erro ao carregar relacionados:", error);
        setRelacionados([]);
      }
    }

    carregarRelacionados();
  }, [produto]);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1100;

  const produtoPronto = useMemo(() => {
    if (!produto) return null;

    const estoque = Number(produto.estoque) || 0;
    const reservado = Number(produto.reservado) || 0;
    const disponivel = Math.max(0, estoque - reservado);
    const preco = Number(produto.precoVenda) || 0;
    const galeria = getGaleriaImagens(produto);
    const perfil = inferirPerfil(produto);

    return {
      ...produto,
      disponivel,
      precoFinal: preco,
      imagemFinal: getImagemPrincipal(produto),
      galeria,
      tamanho: produto.volumeMl ? `${produto.volumeMl}ml` : "—",
      categoriaFinal: categoriaSite(produto.categoria),
      descricaoFinal:
        produto.descricao ||
        produto.observacoes ||
        "Fragrância selecionada com curadoria premium Maison Noor, ideal para quem busca presença, sofisticação e elegância.",
      tipoFinal: produto.tipo || produto.marca || "Eau de Parfum",
      statusDisponibilidade: disponivel > 0 ? "Disponível" : "Indisponível",

      notasTopoFinal: produto.notasTopo || "Não informado",
      notasCoracaoFinal: produto.notasCoracao || "Não informado",
      notasFundoFinal: produto.notasFundo || "Não informado",
      familiaOlfativaFinal: produto.familiaOlfativa || "Não informado",
      fixacaoFinal: produto.fixacao || "Boa fixação",
      projecaoFinal: produto.projecao || "Projeção moderada",
      ocasiaoFinal:
        produto.ocasiao || "Uso diário, ocasiões especiais e momentos marcantes.",
      perfilComercial: perfil.perfil,
      sensacaoComercial: perfil.sensacao,
      ocasiacaoComercial: perfil.ocasiacao,
    };
  }, [produto]);

  useEffect(() => {
    setImagemSelecionada(0);
  }, [produtoPronto?.id]);

  useEffect(() => {
    if (!produtoPronto?.galeria?.length || produtoPronto.galeria.length <= 1) return;

    const interval = window.setInterval(() => {
      setImagemSelecionada((prev) => (prev + 1) % produtoPronto.galeria.length);
    }, 3500);

    return () => window.clearInterval(interval);
  }, [produtoPronto?.galeria]);

  function adicionarSacola() {
    if (!produtoPronto) return;

    const imagens = produtoPronto.galeria?.length
      ? produtoPronto.galeria
      : [produtoPronto.imagemFinal];
    const imagemAtual = imagens[imagemSelecionada] || produtoPronto.imagemFinal;

    const item: ProdutoCarrinho = {
      id: produtoPronto.id,
      nome: produtoPronto.nome,
      preco: produtoPronto.precoFinal,
      imagem: imagemAtual,
      tamanho: produtoPronto.tamanho,
    };

    try {
      const chave = "maison_noor_sacola_v1";
      const atual = localStorage.getItem(chave);
      const lista: ProdutoCarrinho[] = atual ? JSON.parse(atual) : [];
      lista.push(item);
      localStorage.setItem(chave, JSON.stringify(lista));
      setAdicionado(true);
      setTimeout(() => setAdicionado(false), 2200);
    } catch (e) {
      console.error("Erro ao salvar na sacola:", e);
    }
  }

  function comprarAgora() {
    if (!produtoPronto || produtoPronto.disponivel <= 0) return;
    adicionarSacola();

    const mensagem = encodeURIComponent(`Olá! Tenho interesse no perfume ${produtoPronto.nome} 😍

Vi no site e fiquei interessado.
Valor: ${formatarMoeda(produtoPronto.precoFinal)}

Pode me passar mais detalhes e as opções de pagamento?`);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.open(`https://wa.me/5512982627108?text=${mensagem}`, "_blank");
      }, 180);
    }
  }

  function handleZoomMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div
          style={{
            ...styles.container,
            padding: isMobile ? "14px 12px 90px" : "18px 18px 24px",
          }}
        >
          <div style={styles.loadingBox}>Carregando produto...</div>
        </div>
      </main>
    );
  }

  if (erro || !produtoPronto) {
    return (
      <main style={styles.page}>
        <div
          style={{
            ...styles.container,
            padding: isMobile ? "14px 12px 90px" : "18px 18px 24px",
          }}
        >
          <div style={styles.errorBox}>
            <h1 style={styles.errorTitle}>Produto não encontrado</h1>
            <p style={styles.errorText}>
              O item que você tentou acessar não foi localizado.
            </p>

            <Link href="/" style={styles.backButton}>
              Voltar para o catálogo
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const imagens = produtoPronto.galeria?.length
    ? produtoPronto.galeria
    : [produtoPronto.imagemFinal];

  const imagemAtual = imagens[imagemSelecionada] || produtoPronto.imagemFinal;

  const mensagemWhatsapp = `Olá! Tenho interesse no perfume ${produtoPronto.nome} 😍

Vi no site e fiquei interessado.
Valor: ${formatarMoeda(produtoPronto.precoFinal)}

Pode me passar mais detalhes e as opções de pagamento?`;

  return (
    <main style={styles.page}>
      <div
        style={{
          ...styles.container,
          padding: isMobile ? "14px 12px 104px" : "18px 18px 32px",
        }}
      >
        <div style={styles.breadcrumb}>
          <Link href="/" style={styles.breadcrumbLink}>
            Início
          </Link>
          <span style={styles.breadcrumbDivider}>/</span>
          <span style={styles.breadcrumbCurrent}>{produtoPronto.nome}</span>
        </div>

        <section
          style={{
            ...styles.productSection,
            gridTemplateColumns: isMobile || isTablet ? "1fr" : "0.84fr 1.16fr",
            gap: isMobile ? "14px" : "18px",
          }}
        >
          <div style={styles.imageColumn}>
            <div
              style={{
                ...styles.imageCard,
                padding: isMobile ? "8px" : "10px",
              }}
            >
              <div
                style={{
                  ...styles.galleryShell,
                  gridTemplateColumns: !isMobile ? "1fr 1fr" : "1fr",
                }}
              >
                <div
                  style={{
                    ...styles.mainImageWrap,
                    height: isMobile ? "260px" : isTablet ? "340px" : "420px",
                  }}
                  onMouseEnter={() => !isMobile && setZoomAtivo(true)}
                  onMouseLeave={() => setZoomAtivo(false)}
                  onMouseMove={handleZoomMove}
                >
                  <div style={styles.mainImageGlow} />
                  <img
                    src={imagemAtual}
                    alt={produtoPronto.nome}
                    style={{
                      ...styles.productImage,
                      cursor: !isMobile ? "zoom-in" : "default",
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "/produtos/hero-perfume.png";
                    }}
                  />

                  {!isMobile && (
                    <div style={styles.zoomHint}>Passe o mouse para ampliar</div>
                  )}
                </div>

                {!isMobile && (
                  <div
                    style={{
                      ...styles.zoomPanel,
                      opacity: zoomAtivo ? 1 : 0.35,
                    }}
                  >
                    <div style={styles.zoomPanelHeader}>
                      {zoomAtivo ? "Zoom premium" : "Passe o mouse na imagem"}
                    </div>
                    <div style={styles.zoomLensWrap}>
                      <div
                        style={{
                          ...styles.zoomPanelImage,
                          backgroundImage: `url(${imagemAtual})`,
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "250%",
                          backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {imagens.length > 1 && (
                <div
                  style={{
                    ...styles.thumbsRow,
                    justifyContent: isMobile ? "center" : "flex-start",
                  }}
                >
                  {imagens.slice(0, 3).map((img, index) => (
                    <button
                      key={`${img}-${index}`}
                      type="button"
                      onClick={() => setImagemSelecionada(index)}
                      style={{
                        ...styles.thumbButton,
                        borderColor:
                          imagemSelecionada === index ? "#C9A46C" : "#E5D6C5",
                        boxShadow:
                          imagemSelecionada === index
                            ? "0 0 0 2px rgba(201,164,108,0.16)"
                            : "none",
                        transform:
                          imagemSelecionada === index ? "translateY(-2px)" : "none",
                      }}
                    >
                      <img
                        src={img}
                        alt={`${produtoPronto.nome} ${index + 1}`}
                        style={styles.thumbImage}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/produtos/hero-perfume.png";
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              ...styles.infoColumn,
              padding: isMobile ? "16px" : "20px",
            }}
          >
            <p style={styles.brand}>{produtoPronto.marca || "Maison Noor"}</p>

            <h1
              style={{
                ...styles.title,
                fontSize: isMobile ? "22px" : isTablet ? "26px" : "28px",
                margin: isMobile ? "0 0 10px" : "0 0 12px",
              }}
            >
              {produtoPronto.nome}
            </h1>

            <div style={styles.metaRow}>
              <span style={styles.metaBadge}>{produtoPronto.tamanho}</span>
              <span style={styles.metaBadge}>{produtoPronto.categoriaFinal}</span>
              <span style={styles.metaBadge}>
                {produtoPronto.marca || "Maison Noor"}
              </span>
            </div>

            <div style={styles.priceBox}>
              <p
                style={{
                  ...styles.price,
                  fontSize: isMobile ? "24px" : isTablet ? "28px" : "32px",
                }}
              >
                {formatarMoeda(produtoPronto.precoFinal)}
              </p>

              <p style={styles.productTrustLine}>
                Seleção exclusiva Maison Noor • Original importado • Curadoria premium
              </p>
              <p style={styles.productAnchorLine}>Perfume para quem quer ser lembrado.</p>
            </div>

            <div style={styles.benefitsGrid}>
              <div style={styles.benefitCard}>✨ Original importado</div>
              <div style={styles.benefitCard}>🚚 Envio rápido</div>
              <div style={styles.benefitCard}>🔥 Alta fixação</div>
              <div style={styles.benefitCard}>🤎 Curadoria Maison Noor</div>
            </div>

            <div style={styles.convBox}>
              <div style={styles.convRow}>
                <span style={styles.convBadge}>🔥 Perfume em destaque</span>
                <span style={styles.convBadgeSoft}>Seleção premium</span>
                <span style={styles.convBadgeSoft}>Presença marcante</span>
              </div>

              <div style={styles.convText}>
                Fragrância escolhida para quem busca sofisticação, assinatura olfativa e uma presença que se destaca com elegância.
              </div>

              <div style={styles.convTrust}>
                Escolha frequente entre clientes que gostam de perfumes intensos, refinados e memoráveis.
              </div>
            </div>

            <div style={styles.statusRow}>
              {produtoPronto.disponivel <= 0 ? (
                <span
                  style={{
                    ...styles.stockBadge,
                    backgroundColor: "#FFF1F1",
                    color: "#9A3B3B",
                    borderColor: "#F2CFCF",
                  }}
                >
                  Indisponível
                </span>
              ) : (
                <span
                  style={{
                    ...styles.stockBadge,
                    backgroundColor: "#F2FBF4",
                    color: "#2D6A34",
                    borderColor: "#CFE7D2",
                  }}
                >
                  Estoque disponível para envio
                </span>
              )}
            </div>

            <div
              style={{
                ...styles.actionsPrimary,
                gridTemplateColumns: isMobile ? "1fr" : "1fr",
              }}
            >
              <button
                onClick={comprarAgora}
                onMouseEnter={() => setHoverBuyNow(true)}
                onMouseLeave={() => setHoverBuyNow(false)}
                style={{
                  ...styles.buyNowButton,
                  transform: hoverBuyNow ? "translateY(-2px) scale(1.01)" : "translateY(0) scale(1)",
                  boxShadow: hoverBuyNow
                    ? "0 18px 34px rgba(120, 87, 45, 0.24)"
                    : "0 16px 30px rgba(120, 87, 45, 0.16)",
                }}
                type="button"
                disabled={produtoPronto.disponivel <= 0}
              >
                Comprar agora
              </button>
            </div>

            <div
              style={{
                ...styles.actionsSecondary,
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              }}
            >
              <button
                onClick={adicionarSacola}
                onMouseEnter={() => setHoverAddCart(true)}
                onMouseLeave={() => setHoverAddCart(false)}
                style={{
                  ...styles.addButton,
                  transform: hoverAddCart ? "translateY(-1px)" : "translateY(0)",
                  boxShadow: hoverAddCart
                    ? "0 12px 24px rgba(120, 87, 45, 0.12), inset 0 1px 0 rgba(255,255,255,0.78)"
                    : "inset 0 1px 0 rgba(255,255,255,0.78)",
                }}
                type="button"
                disabled={produtoPronto.disponivel <= 0}
              >
                Adicionar à sacola
              </button>

              <a
                href={`https://wa.me/5512982627108?text=${encodeURIComponent(
                  produtoPronto.disponivel <= 0
                    ? `Olá! Vi o perfume ${produtoPronto.nome} no site, mas apareceu como indisponível. Ele vai voltar ao estoque?`
                    : mensagemWhatsapp
                )}`}
                target="_blank"
                rel="noreferrer"
                onMouseEnter={() => setHoverWhatsapp(true)}
                onMouseLeave={() => setHoverWhatsapp(false)}
                style={{
                  ...styles.whatsappButton,
                  opacity: 1,
                  pointerEvents: "auto",
                  transform: hoverWhatsapp ? "translateY(-1px)" : "translateY(0)",
                  boxShadow: hoverWhatsapp
                    ? "0 14px 28px rgba(31, 26, 20, 0.18)"
                    : "0 12px 24px rgba(31, 26, 20, 0.12)",
                }}
              >
                Atendimento no WhatsApp
              </a>
            </div>

            {adicionado && (
              <div style={styles.addedMessage}>Produto adicionado à sacola.</div>
            )}

            <div style={styles.urgency}>
              🔥 Estoque baixo — alta saída hoje
            </div>

            <div style={styles.paymentNote}>
              🔒 Atendimento rápido • Pagamento seguro no fechamento • Suporte humanizado
            </div>

            <div
              style={{
                ...styles.descriptionGrid,
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              }}
            >
              <div style={styles.descriptionBox}>
                <h2 style={styles.sectionTitle}>Descrição da fragrância</h2>
                <p style={styles.descriptionText}>{produtoPronto.descricaoFinal}</p>
              </div>

              <div style={styles.notesBox}>
                <h2 style={styles.sectionTitle}>Notas olfativas</h2>

                <div style={styles.noteItem}>
                  <span style={styles.noteLabel}>Saída:</span>
                  <span style={styles.noteText}>{produtoPronto.notasTopoFinal}</span>
                </div>

                <div style={styles.noteItem}>
                  <span style={styles.noteLabel}>Coração:</span>
                  <span style={styles.noteText}>{produtoPronto.notasCoracaoFinal}</span>
                </div>

                <div style={styles.noteItem}>
                  <span style={styles.noteLabel}>Fundo:</span>
                  <span style={styles.noteText}>{produtoPronto.notasFundoFinal}</span>
                </div>
              </div>
            </div>

            <div
              style={{
                ...styles.detailsGridLarge,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
              }}
            >
              <div style={styles.detailCardHighlight}>
                <span style={styles.detailLabel}>Família olfativa</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.familiaOlfativaFinal}
                </strong>
              </div>

              <div style={styles.detailCardHighlight}>
                <span style={styles.detailLabel}>Perfil</span>
                <strong style={styles.detailValue}>{produtoPronto.perfilComercial}</strong>
              </div>

              <div style={styles.detailCardHighlight}>
                <span style={styles.detailLabel}>Sensação</span>
                <strong style={styles.detailValue}>{produtoPronto.sensacaoComercial}</strong>
              </div>

              <div style={styles.detailCardHighlight}>
                <span style={styles.detailLabel}>Melhor ocasião</span>
                <strong style={styles.detailValue}>{produtoPronto.ocasiacaoComercial}</strong>
              </div>
            </div>

            <div
              style={{
                ...styles.detailsGridLarge,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
              }}
            >
              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Fixação</span>
                <strong style={styles.detailValue}>{produtoPronto.fixacaoFinal}</strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Projeção</span>
                <strong style={styles.detailValue}>{produtoPronto.projecaoFinal}</strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Ocasião de uso</span>
                <strong style={styles.detailValue}>{produtoPronto.ocasiaoFinal}</strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Status</span>
                <strong
                  style={{
                    ...styles.detailValue,
                    color: produtoPronto.disponivel > 0 ? "#2D6A34" : "#9A3B3B",
                  }}
                >
                  {produtoPronto.statusDisponibilidade}
                </strong>
              </div>
            </div>

            <div
              style={{
                ...styles.detailsGrid,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
              }}
            >
              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Marca</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.marca || "—"}
                </strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Volume</span>
                <strong style={styles.detailValue}>{produtoPronto.tamanho}</strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Categoria</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.categoriaFinal}
                </strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Tipo</span>
                <strong style={styles.detailValue}>{produtoPronto.tipoFinal}</strong>
              </div>
            </div>
          </div>
        </section>

        {relacionados.length > 0 && (
          <section style={styles.relatedSection}>
            <div style={styles.relatedHeader}>
              <div>
                <p style={styles.relatedKicker}>Você também pode gostar</p>
                <h2 style={styles.relatedTitle}>Mais fragrâncias no padrão Maison Noor</h2>
              </div>
            </div>

            <div
              style={{
                ...styles.relatedGrid,
                gridTemplateColumns: isMobile
                  ? "1fr 1fr"
                  : isTablet
                  ? "repeat(3, 1fr)"
                  : "repeat(4, 1fr)",
              }}
            >
              {relacionados.map((item) => (
                <Link key={item.id} href={`/produto/${item.id}`} style={styles.relatedCard}>
                  <div style={styles.relatedImageWrap}>
                    <img
                      src={item.imagem}
                      alt={item.nome}
                      style={styles.relatedImage}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/produtos/hero-perfume.png";
                      }}
                    />
                  </div>

                  <div style={styles.relatedContent}>
                    <span style={styles.relatedMeta}>{item.marca || "Maison Noor"}</span>
                    <strong style={styles.relatedName}>{item.nome}</strong>
                    <span style={styles.relatedMetaSoft}>
                      {item.tamanho} • {item.categoria}
                    </span>
                    <span style={styles.relatedPrice}>{formatarMoeda(item.preco)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div style={styles.bottomBackWrap}>
          <Link href="/" style={styles.backLink}>
            ← Voltar para o catálogo
          </Link>
        </div>
      </div>

      {isMobile && produtoPronto.disponivel > 0 && (
        <div style={styles.mobileStickyBar}>
          <div style={styles.mobileStickyTop}>
            <div>
              <div style={styles.mobileStickyPrice}>
                {formatarMoeda(produtoPronto.precoFinal)}
              </div>
              <div style={styles.mobileStickyName}>{produtoPronto.nome}</div>
            </div>
          </div>

          <div style={styles.mobileStickyActions}>
            <button onClick={comprarAgora} type="button" style={styles.mobileStickyMainBtn}>
              Comprar agora
            </button>
            <a
              href={`https://wa.me/5512982627108?text=${encodeURIComponent(
                produtoPronto.disponivel <= 0
                  ? `Olá! Vi o perfume ${produtoPronto.nome} no site, mas apareceu como indisponível. Ele vai voltar ao estoque?`
                  : mensagemWhatsapp
              )}`}
              target="_blank"
              rel="noreferrer"
              style={styles.mobileStickyWhatsBtn}
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(215,192,160,0.18), transparent 24%), linear-gradient(180deg, #F8F2EA 0%, #F5EFE6 100%)",
    color: "#2B2B2B",
    fontFamily: "Arial, sans-serif",
  },

  container: {
    maxWidth: "1240px",
    margin: "0 auto",
    padding: "24px 20px 36px",
  },

  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "14px",
    flexWrap: "wrap",
    color: "#7B6B5E",
    fontSize: "14px",
  },

  breadcrumbLink: {
    color: "#A8844C",
    textDecoration: "none",
    fontWeight: 700,
  },

  breadcrumbDivider: {
    color: "#B8A796",
  },

  breadcrumbCurrent: {
    color: "#5E5148",
  },

  productSection: {
    display: "grid",
    gridTemplateColumns: "0.84fr 1.16fr",
    gap: "18px",
    alignItems: "start",
  },

  imageColumn: {
    display: "flex",
    flexDirection: "column",
  },

  imageCard: {
    background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)",
    borderRadius: "28px",
    border: "1px solid #EADBC8",
    padding: "12px",
    boxShadow: "0 18px 38px rgba(48,34,20,0.08)",
    position: "sticky",
    top: "18px",
  },

  galleryShell: {
    display: "grid",
    gap: "12px",
    alignItems: "stretch",
  },

  mainImageWrap: {
    width: "100%",
    borderRadius: "22px",
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(249,239,226,0.9) 58%, rgba(240,225,205,0.8) 100%)",
    overflow: "hidden",
    border: "1px solid #F0E5D7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },

  mainImageGlow: {
    position: "absolute",
    inset: "18px",
    borderRadius: "24px",
    background: "radial-gradient(circle at top, rgba(255,255,255,0.55), transparent 65%)",
    pointerEvents: "none",
  },

  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    padding: "16px",
    boxSizing: "border-box",
    transition: "transform 0.25s ease",
    userSelect: "none",
    position: "relative",
    zIndex: 1,
  },

  zoomHint: {
    position: "absolute",
    bottom: "14px",
    right: "14px",
    background: "rgba(31,26,20,0.86)",
    color: "#fff",
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: 600,
    zIndex: 2,
  },

  zoomPanel: {
    borderRadius: "22px",
    overflow: "hidden",
    border: "1px solid #EADBC8",
    background: "linear-gradient(180deg, #FFFDFC, #F8EFE2)",
    boxShadow: "0 14px 30px rgba(48,34,20,0.09)",
    minHeight: "420px",
    pointerEvents: "none",
    transition: "opacity 0.18s ease",
  },

  zoomPanelHeader: {
    padding: "12px 14px",
    borderBottom: "1px solid #EDE0D1",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#8D724F",
    background: "rgba(255,255,255,0.52)",
  },

  zoomLensWrap: {
    position: "relative",
    height: "calc(100% - 46px)",
    minHeight: "374px",
    overflow: "hidden",
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(247,238,226,0.92) 56%, rgba(240,225,205,0.82) 100%)",
  },

  zoomPanelImage: {
    width: "100%",
    height: "100%",
    display: "block",
    boxSizing: "border-box",
    transition: "background-position 0.08s linear",
  },

  thumbsRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "12px",
  },

  thumbButton: {
    width: "62px",
    height: "62px",
    borderRadius: "16px",
    border: "1px solid #E5D6C5",
    background:
      "linear-gradient(180deg, rgba(255,248,241,1), rgba(247,235,220,1))",
    padding: "5px",
    cursor: "pointer",
    overflow: "hidden",
    transition: "all 0.2s ease",
  },

  thumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    borderRadius: "12px",
    display: "block",
    backgroundColor: "#FCFAF7",
  },

  infoColumn: {
    background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)",
    borderRadius: "28px",
    border: "1px solid #EADBC8",
    padding: "22px",
    boxShadow: "0 18px 38px rgba(48,34,20,0.08)",
  },

  brand: {
    margin: "0 0 8px",
    color: "#A8844C",
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.09em",
  },

  title: {
    margin: "0 0 14px",
    fontSize: "30px",
    lineHeight: 1.02,
    color: "#2F2721",
    fontWeight: 700,
    letterSpacing: "-0.03em",
  },

  metaRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  metaBadge: {
    border: "1px solid #E4D4C0",
    background: "linear-gradient(180deg, #FFF9F1, #F5E7D4)",
    color: "#6B5A4A",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: 700,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },

  priceBox: {
    borderTop: "1px solid #EFE2D3",
    borderBottom: "1px solid #EFE2D3",
    padding: "16px 0",
    marginBottom: "16px",
  },

  price: {
    margin: "0 0 6px",
    fontSize: "32px",
    lineHeight: 1,
    color: "#9B7441",
    fontWeight: 700,
    letterSpacing: "-0.03em",
  },

  statusRow: {
    marginBottom: "14px",
  },

  productTrustLine: {
    margin: 0,
    color: "#7B6958",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  productAnchorLine: {
    margin: "8px 0 0",
    color: "#5E4B39",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.5,
  },

  benefitsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px",
  },

  benefitCard: {
    border: "1px solid #E7D8C7",
    background: "linear-gradient(180deg, #FFFDF9, #F8EEDC)",
    borderRadius: "16px",
    padding: "12px 14px",
    color: "#5E4B39",
    fontSize: "13px",
    fontWeight: 700,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },

  paymentNote: {
    marginBottom: "18px",
    padding: "12px 14px",
    borderRadius: "16px",
    background: "linear-gradient(180deg, #FFF9F1, #F5E7D4)",
    border: "1px solid #E5D3BC",
    color: "#6F6258",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  convBox: {
    background: "linear-gradient(180deg, #FFFDF9, #F6EBDB)",
    border: "1px solid #E9DCCB",
    borderRadius: "18px",
    padding: "15px",
    marginTop: "4px",
    marginBottom: "12px",
  },

  convRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },

  convBadge: {
    background: "#1f1a14",
    color: "#fff",
    padding: "5px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
  },

  convBadgeSoft: {
    background: "#f1e4d2",
    color: "#6b4f2a",
    padding: "5px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
  },

  convText: {
    fontSize: "14px",
    color: "#5b4630",
    marginBottom: "8px",
    lineHeight: 1.6,
  },

  convTrust: {
    fontSize: "13px",
    color: "#7a654c",
    lineHeight: 1.6,
    fontWeight: 600,
  },

  urgency: {
    fontSize: "13px",
    color: "#a94442",
    marginTop: "10px",
    marginBottom: "10px",
    fontWeight: 700,
  },

  socialProof: {
    fontSize: "13px",
    marginTop: "12px",
    color: "#7a654c",
    fontWeight: 500,
    lineHeight: 1.5,
  },

  stockBadge: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: 700,
  },

  actionsPrimary: {
    display: "grid",
    gap: "12px",
    marginBottom: "10px",
  },

  actionsSecondary: {
    display: "grid",
    gap: "12px",
    marginBottom: "16px",
  },

  buyNowButton: {
    width: "100%",
    border: "1px solid #C6975F",
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
    color: "#2A2018",
    borderRadius: "18px",
    padding: "16px 18px",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 16px 30px rgba(120, 87, 45, 0.16)",
  },

  addButton: {
    width: "100%",
    border: "1px solid #D8C1A2",
    background: "linear-gradient(180deg, #FFF9F1, #F5E7D4)",
    color: "#6B523A",
    borderRadius: "16px",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78)",
  },

  whatsappButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    background: "#1F1A14",
    color: "#FFF7EE",
    borderRadius: "16px",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 700,
    letterSpacing: "0.01em",
    boxShadow: "0 12px 24px rgba(31, 26, 20, 0.12)",
  },

  addedMessage: {
    marginBottom: "14px",
    backgroundColor: "#EEF8EE",
    border: "1px solid #D1E8D2",
    color: "#2E6B35",
    padding: "12px 14px",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 700,
  },

  descriptionGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "16px",
    alignItems: "stretch",
  },

  descriptionBox: {
    marginTop: "6px",
    marginBottom: "0",
    padding: "18px",
    border: "1px solid #EBDCCC",
    borderRadius: "20px",
    background: "linear-gradient(180deg, #FFFCF8, #F8F1E8)",
  },

  notesBox: {
    marginBottom: "0",
    padding: "18px",
    border: "1px solid #EBDCCC",
    borderRadius: "20px",
    background: "linear-gradient(180deg, #FFFCF8, #F8F1E8)",
  },

  noteItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "10px",
  },

  noteLabel: {
    color: "#8A755D",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 700,
  },

  noteText: {
    color: "#3A2F29",
    fontSize: "14px",
    lineHeight: 1.6,
  },

  sectionTitle: {
    margin: "0 0 10px",
    fontSize: "20px",
    color: "#3A2F29",
    fontWeight: 700,
  },

  descriptionText: {
    margin: 0,
    color: "#64574E",
    fontSize: "14px",
    lineHeight: 1.72,
  },

  detailsGridLarge: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
    marginBottom: "16px",
  },

  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
  },

  detailCard: {
    background: "linear-gradient(180deg, #FFFCF8, #F8F1E8)",
    border: "1px solid #EBDCCC",
    borderRadius: "18px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  detailCardHighlight: {
    background: "linear-gradient(180deg, #FFF9F1, #F4E6D0)",
    border: "1px solid #E6D2B7",
    borderRadius: "18px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },

  detailLabel: {
    color: "#8A755D",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    fontWeight: 700,
  },

  detailValue: {
    color: "#2F2721",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  relatedSection: {
    marginTop: "22px",
    background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)",
    border: "1px solid #EADBC8",
    borderRadius: "28px",
    padding: "18px",
    boxShadow: "0 18px 38px rgba(48,34,20,0.06)",
  },

  relatedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
  },

  relatedKicker: {
    margin: "0 0 6px",
    color: "#A8844C",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  relatedTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#2F2721",
    lineHeight: 1.15,
  },

  relatedGrid: {
    display: "grid",
    gap: "14px",
  },

  relatedCard: {
    display: "flex",
    flexDirection: "column",
    textDecoration: "none",
    border: "1px solid #E9DCCB",
    borderRadius: "20px",
    overflow: "hidden",
    background: "linear-gradient(180deg, #FFFDF9, #F8F0E4)",
    boxShadow: "0 12px 24px rgba(48,34,20,0.05)",
  },

  relatedImageWrap: {
    height: "200px",
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(247,238,226,0.92) 56%, rgba(240,225,205,0.82) 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px",
    borderBottom: "1px solid #EFE2D3",
  },

  relatedImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },

  relatedContent: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
  },

  relatedMeta: {
    color: "#A8844C",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  relatedMetaSoft: {
    color: "#7B6958",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  relatedName: {
    color: "#2F2721",
    fontSize: "15px",
    lineHeight: 1.4,
    minHeight: "42px",
  },

  relatedPrice: {
    color: "#9B7441",
    fontSize: "20px",
    fontWeight: 700,
    marginTop: "2px",
  },

  bottomBackWrap: {
    marginTop: "16px",
  },

  backLink: {
    textDecoration: "none",
    color: "#A8844C",
    fontWeight: 700,
    fontSize: "14px",
  },

  backButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    marginTop: "12px",
    background: "linear-gradient(135deg, #C9A46C, #B8925A)",
    color: "#2B2B2B",
    borderRadius: "12px",
    padding: "12px 18px",
    fontWeight: 700,
  },

  loadingBox: {
    backgroundColor: "#FFFDFC",
    border: "1px solid #E9DCCB",
    borderRadius: "22px",
    padding: "40px",
    textAlign: "center",
    color: "#6F6258",
    fontSize: "18px",
  },

  errorBox: {
    backgroundColor: "#FFFDFC",
    border: "1px solid #E9DCCB",
    borderRadius: "22px",
    padding: "40px",
    textAlign: "center",
  },

  errorTitle: {
    margin: "0 0 10px",
    color: "#342B25",
    fontSize: "30px",
  },

  errorText: {
    margin: 0,
    color: "#6F6258",
    fontSize: "14px",
    lineHeight: 1.7,
  },

  mobileStickyBar: {
    position: "fixed",
    left: "10px",
    right: "10px",
    bottom: "10px",
    zIndex: 60,
    background: "rgba(255,252,248,0.98)",
    border: "1px solid #E3D3C0",
    borderRadius: "22px",
    boxShadow: "0 20px 40px rgba(48,34,20,0.16)",
    backdropFilter: "blur(12px)",
    padding: "12px",
  },

  mobileStickyTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
  },

  mobileStickyPrice: {
    color: "#9B7441",
    fontSize: "22px",
    fontWeight: 800,
    lineHeight: 1,
  },

  mobileStickyName: {
    marginTop: "4px",
    color: "#5C4D41",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1.4,
  },

  mobileStickyActions: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "10px",
  },

  mobileStickyMainBtn: {
    width: "100%",
    border: "1px solid #C6975F",
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
    color: "#2A2018",
    borderRadius: "16px",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  mobileStickyWhatsBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    borderRadius: "16px",
    padding: "14px 14px",
    background: "#1F1A14",
    color: "#FFF7EE",
    fontSize: "13px",
    fontWeight: 700,
    minWidth: "104px",
  },
};
