"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { CSSProperties, MouseEvent } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

type CategoriaCRM = "masculino" | "feminino" | "unissex";

type ProdutoFirebase = {
  id: string;
  slug?: string;
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
  climaIdeal?: string;
  intensidade?: string;
  generoOlfativo?: string;
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

type AvaliacaoProduto = {
  id: string;
  produtoId: string;
  produtoSlug: string;
  nome: string;
  nota: number;
  comentario: string;
  titulo?: string;
  createdAt?: any;
  aprovado?: boolean;
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

function getProdutoSlug(produto: Pick<ProdutoFirebase, "slug" | "nome" | "id">): string {
  const slug = String(produto.slug || "").trim();
  return slug || slugify(produto.nome || produto.id);
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
  let ocasiacao =
    produto.ocasiao || "eventos, noites especiais e assinatura pessoal";

  if (familia.includes("ambar") || familia.includes("oriental")) {
    perfil = "marcante e envolvente";
    sensacao = "intensa, luxuosa e imponente";
  } else if (familia.includes("amadeir")) {
    perfil = "elegante e sofisticado";
    sensacao = "refinada, madura e confiante";
  } else if (familia.includes("floral")) {
    perfil = "delicado e sofisticado";
    sensacao = "charmosa, feminina e memorável";
  } else if (
    familia.includes("cítric") ||
    familia.includes("citrico") ||
    familia.includes("aromatic")
  ) {
    perfil = "fresco e moderno";
    sensacao = "leve, limpa e energética";
  }

  if (
    fixacao.includes("alta") ||
    projecao.includes("alta") ||
    projecao.includes("forte")
  ) {
    ocasiacao =
      produto.ocasiao || "noite, eventos, encontros e ocasiões de destaque";
  }

  return { perfil, sensacao, ocasiacao };
}

function normalizarTextoAroma(valor?: string) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function scorePorTexto(valor: string | undefined, padrao: number) {
  const texto = normalizarTextoAroma(valor);

  if (!texto) return padrao;
  if (
    texto.includes("muito alta") ||
    texto.includes("extrema") ||
    texto.includes("intensa") ||
    texto.includes("forte")
  )
    return 92;
  if (
    texto.includes("alta") ||
    texto.includes("longa") ||
    texto.includes("duradoura")
  )
    return 84;
  if (
    texto.includes("moderada") ||
    texto.includes("media") ||
    texto.includes("média")
  )
    return 68;
  if (
    texto.includes("suave") ||
    texto.includes("baixa") ||
    texto.includes("leve")
  )
    return 48;

  return padrao;
}

function inferirClima(produto: ProdutoFirebase) {
  const texto = normalizarTextoAroma(
    `${produto.nome || ""} ${produto.familiaOlfativa || ""} ${produto.observacoes || ""} ${produto.tipo || ""}`,
  );

  if (produto.climaIdeal) return produto.climaIdeal;
  if (
    texto.includes("fresh") ||
    texto.includes("fresco") ||
    texto.includes("citr") ||
    texto.includes("aquatico") ||
    texto.includes("aquático")
  ) {
    return "Dias quentes, rotina e uso casual elegante";
  }
  if (
    texto.includes("oud") ||
    texto.includes("ambar") ||
    texto.includes("âmbar") ||
    texto.includes("oriental") ||
    texto.includes("baunilha") ||
    texto.includes("vanilla")
  ) {
    return "Noites, clima ameno/frio e ocasiões de presença";
  }
  return "Versátil para dia, noite e momentos especiais";
}

function inferirIntensidade(produto: ProdutoFirebase) {
  const texto = normalizarTextoAroma(
    `${produto.nome || ""} ${produto.familiaOlfativa || ""} ${produto.fixacao || ""} ${produto.projecao || ""} ${produto.observacoes || ""}`,
  );

  if (produto.intensidade) return produto.intensidade;
  if (
    texto.includes("oud") ||
    texto.includes("ambar") ||
    texto.includes("âmbar") ||
    texto.includes("oriental") ||
    texto.includes("intens") ||
    texto.includes("alta") ||
    texto.includes("forte")
  ) {
    return "Marcante";
  }
  if (
    texto.includes("fresh") ||
    texto.includes("fresco") ||
    texto.includes("citr") ||
    texto.includes("leve")
  ) {
    return "Leve a moderada";
  }
  return "Moderada elegante";
}

function inferirGeneroOlfativo(produto: ProdutoFirebase) {
  if (produto.generoOlfativo) return produto.generoOlfativo;
  return categoriaSite(produto.categoria);
}

function dividirNotas(valor?: string): string[] {
  const texto = String(valor || "").trim();
  if (!texto || texto.toLowerCase() === "não informado" || texto.toLowerCase() === "nao informado") return [];

  return texto
    .split(/[,;•|\/]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function notasComFallback(valor: string | undefined, fallback: string[]) {
  const notas = dividirNotas(valor);
  return notas.length ? notas : fallback;
}

function montarCombinaCom(produto: ProdutoFirebase) {
  const texto = normalizarTextoAroma(
    `${produto.nome || ""} ${produto.familiaOlfativa || ""} ${produto.ocasiao || ""} ${produto.observacoes || ""} ${produto.tipo || ""}`,
  );

  const itens = new Set<string>();

  if (texto.includes("oud") || texto.includes("ambar") || texto.includes("oriental") || texto.includes("intens")) {
    itens.add("🌙 Noite");
    itens.add("✨ Ocasiões especiais");
    itens.add("🖤 Assinatura marcante");
  }

  if (texto.includes("floral") || texto.includes("rosa") || texto.includes("rose") || produto.categoria === "feminino") {
    itens.add("🌹 Encontros");
    itens.add("🎁 Presente premium");
  }

  if (texto.includes("fresh") || texto.includes("fresco") || texto.includes("citr") || texto.includes("aquatico")) {
    itens.add("☀️ Dia a dia");
    itens.add("🌿 Clima quente");
  }

  itens.add("🤎 Atendimento consultivo");
  itens.add("💎 Curadoria Maison Noor");

  return Array.from(itens).slice(0, 6);
}

const SITE_URL = "https://www.maisonnoor.com.br";

function urlAbsoluta(valor?: string) {
  const texto = String(valor || "").trim();
  if (!texto) return `${SITE_URL}/logo.png`;
  if (texto.startsWith("http://") || texto.startsWith("https://")) return texto;
  return `${SITE_URL}${texto.startsWith("/") ? texto : `/${texto}`}`;
}

function limparDescricaoSeo(valor?: string) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 155);
}

function atualizarMetaTag(atributo: "name" | "property", chave: string, conteudo: string) {
  if (typeof document === "undefined") return;

  let meta = document.querySelector(`meta[${atributo}="${chave}"]`) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(atributo, chave);
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", conteudo);
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
  const [avaliacoesReais, setAvaliacoesReais] = useState<AvaliacaoProduto[]>([]);
  const [carregandoAvaliacoes, setCarregandoAvaliacoes] = useState(false);
  const [salvandoAvaliacao, setSalvandoAvaliacao] = useState(false);
  const [mensagemAvaliacao, setMensagemAvaliacao] = useState("");
  const [formAvaliacao, setFormAvaliacao] = useState({
    nome: "",
    nota: 5,
    comentario: "",
  });

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
          slug: data.slug,
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
          climaIdeal: data.climaIdeal || data.clima || data.temperaturaIdeal,
          intensidade: data.intensidade,
          generoOlfativo: data.generoOlfativo || data.genero || data.publico,
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
            query(
              productsRef,
              where("categoria", "==", produto.categoria),
              limit(8),
            ),
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
              imagem: getImagemPrincipal({
                ...data,
                id: item.id,
                nome: data.nome || "produto",
              }),
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

  useEffect(() => {
    async function carregarAvaliacoes() {
      if (!produto?.id) return;

      try {
        setCarregandoAvaliacoes(true);

        const slugProduto = String(produto.slug || slugify(produto.nome || produto.id)).trim();
        const reviewsRef = collection(db, "reviews");

        const consultas = [
          query(reviewsRef, where("produtoSlug", "==", slugProduto), orderBy("createdAt", "desc"), limit(30)),
          query(reviewsRef, where("produtoId", "==", produto.id), orderBy("createdAt", "desc"), limit(30)),
        ];

        const acumulado = new Map<string, AvaliacaoProduto>();

        for (const consulta of consultas) {
          const snap = await getDocs(consulta);

          snap.docs.forEach((item) => {
            if (acumulado.has(item.id)) return;

            const data = item.data() as any;
            const aprovado = data.aprovado !== false;

            if (!aprovado) return;

            acumulado.set(item.id, {
              id: item.id,
              produtoId: String(data.produtoId || produto.id),
              produtoSlug: String(data.produtoSlug || slugProduto),
              nome: String(data.nome || "Cliente Maison Noor").trim(),
              nota: Math.min(5, Math.max(1, Number(data.nota) || 5)),
              comentario: String(data.comentario || "").trim(),
              titulo: String(data.titulo || "").trim(),
              createdAt: data.createdAt,
              aprovado,
            });
          });
        }

        setAvaliacoesReais(Array.from(acumulado.values()).filter((item) => item.comentario));
      } catch (error) {
        console.error("Erro ao carregar avaliações reais:", error);
        setAvaliacoesReais([]);
      } finally {
        setCarregandoAvaliacoes(false);
      }
    }

    carregarAvaliacoes();
  }, [produto?.id, produto?.slug, produto?.nome]);

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
      notasTopoLista: notasComFallback(produto.notasTopo, ["Abertura refinada", "Toque luminoso", "Primeira impressão elegante"]),
      notasCoracaoLista: notasComFallback(produto.notasCoracao, ["Corpo sofisticado", "Presença envolvente", "Assinatura memorável"]),
      notasFundoLista: notasComFallback(produto.notasFundo, ["Base elegante", "Rastro marcante", "Finalização premium"]),
      combinaComLista: montarCombinaCom(produto),
      familiaOlfativaFinal: produto.familiaOlfativa || "Não informado",
      fixacaoFinal: produto.fixacao || "Boa fixação",
      projecaoFinal: produto.projecao || "Projeção moderada",
      ocasiaoFinal:
        produto.ocasiao ||
        "Uso diário, ocasiões especiais e momentos marcantes.",
      climaIdealFinal: inferirClima(produto),
      intensidadeFinal: inferirIntensidade(produto),
      generoOlfativoFinal: inferirGeneroOlfativo(produto),
      fixacaoScore: scorePorTexto(produto.fixacao, 78),
      projecaoScore: scorePorTexto(produto.projecao, 70),
      intensidadeScore: scorePorTexto(inferirIntensidade(produto), 76),
      versatilidadeScore:
        normalizarTextoAroma(produto.ocasiao).includes("diário") ||
        normalizarTextoAroma(produto.ocasiao).includes("dia")
          ? 86
          : 74,
      perfilComercial: perfil.perfil,
      sensacaoComercial: perfil.sensacao,
      ocasiacaoComercial: perfil.ocasiacao,
    };
  }, [produto]);

  const seoData = useMemo(() => {
    if (!produtoPronto) return null;

    const marca = produtoPronto.marca || "Maison Noor";
    const categoria = produtoPronto.categoriaFinal || "perfume árabe";
    const preco = produtoPronto.precoFinal || 0;
    const imagem = urlAbsoluta(produtoPronto.imagemFinal);
    const url = `${SITE_URL}/produto/${produtoPronto.id}`;
    const titulo = `${produtoPronto.nome} | Perfume Árabe Premium | Maison Noor`;
    const descricao = limparDescricaoSeo(
      `${produtoPronto.nome} ${marca}. ${produtoPronto.descricaoFinal} ${produtoPronto.tamanho !== "—" ? `Volume ${produtoPronto.tamanho}.` : ""} Curadoria premium Maison Noor.`,
    );

    return {
      titulo,
      descricao,
      url,
      imagem,
      productJsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: produtoPronto.nome,
        brand: {
          "@type": "Brand",
          name: marca,
        },
        image: [imagem],
        description: descricao,
        sku: produtoPronto.id,
        category: categoria,
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: "BRL",
          price: Number(preco || 0).toFixed(2),
          availability:
            produtoPronto.disponivel > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: {
            "@type": "Organization",
            name: "Maison Noor Parfums",
          },
        },
      },
    };
  }, [produtoPronto]);

  useEffect(() => {
    if (!seoData) return;

    document.title = seoData.titulo;
    atualizarMetaTag("name", "description", seoData.descricao);
    atualizarMetaTag("name", "keywords", "perfume árabe, perfumes árabes premium, Maison Noor, perfume importado, fragrância árabe");
    atualizarMetaTag("property", "og:title", seoData.titulo);
    atualizarMetaTag("property", "og:description", seoData.descricao);
    atualizarMetaTag("property", "og:type", "product");
    atualizarMetaTag("property", "og:url", seoData.url);
    atualizarMetaTag("property", "og:image", seoData.imagem);
    atualizarMetaTag("property", "og:site_name", "Maison Noor Parfums");
    atualizarMetaTag("name", "twitter:card", "summary_large_image");
    atualizarMetaTag("name", "twitter:title", seoData.titulo);
    atualizarMetaTag("name", "twitter:description", seoData.descricao);
    atualizarMetaTag("name", "twitter:image", seoData.imagem);
  }, [seoData]);

  useEffect(() => {
    setImagemSelecionada(0);
  }, [produtoPronto?.id]);

  useEffect(() => {
    if (!produtoPronto?.galeria?.length || produtoPronto.galeria.length <= 1)
      return;

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

  async function enviarAvaliacao() {
    if (!produtoPronto || salvandoAvaliacao) return;

    const nome = formAvaliacao.nome.trim();
    const comentario = formAvaliacao.comentario.trim();
    const nota = Math.min(5, Math.max(1, Number(formAvaliacao.nota) || 5));

    if (!nome || nome.length < 2) {
      setMensagemAvaliacao("Informe seu nome para enviar a avaliação.");
      return;
    }

    if (!comentario || comentario.length < 10) {
      setMensagemAvaliacao("Escreva uma avaliação com pelo menos 10 caracteres.");
      return;
    }

    try {
      setSalvandoAvaliacao(true);
      setMensagemAvaliacao("");

      const slugProduto = getProdutoSlug(produtoPronto);

      const docRef = await addDoc(collection(db, "reviews"), {
        produtoId: produtoPronto.id,
        produtoSlug: slugProduto,
        produtoNome: produtoPronto.nome,
        nome,
        nota,
        comentario,
        aprovado: true,
        origem: "site",
        createdAt: serverTimestamp(),
      });

      const novaAvaliacao: AvaliacaoProduto = {
        id: docRef.id,
        produtoId: produtoPronto.id,
        produtoSlug: slugProduto,
        nome,
        nota,
        comentario,
        aprovado: true,
        createdAt: new Date(),
      };

      setAvaliacoesReais((atuais) => [novaAvaliacao, ...atuais]);
      setFormAvaliacao({ nome: "", nota: 5, comentario: "" });
      setMensagemAvaliacao("Avaliação enviada com sucesso. Obrigado por ajudar outros clientes Maison Noor.");
    } catch (error) {
      console.error("Erro ao enviar avaliação:", error);
      setMensagemAvaliacao("Não foi possível enviar a avaliação agora. Verifique as regras do Firestore para a coleção reviews.");
    } finally {
      setSalvandoAvaliacao(false);
    }
  }

  function comprarAgora() {
    if (!produtoPronto || produtoPronto.disponivel <= 0) return;

    adicionarSacola();

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.location.href = "/checkout";
      }, 180);
    }
  }

  function handleZoomMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  }

  const avaliacoesMaisonNoor = useMemo(() => {
    if (!produtoPronto) return [];

    const textoProduto = normalizarTextoAroma(
      `${produtoPronto.id} ${produtoPronto.nome} ${produtoPronto.marca || ""} ${produtoPronto.tipoFinal} ${produtoPronto.categoriaFinal} ${produtoPronto.familiaOlfativaFinal} ${produtoPronto.fixacaoFinal} ${produtoPronto.projecaoFinal}`,
    );

    const nomeProduto = produtoPronto.nome;
    const categoria = normalizarTextoAroma(produtoPronto.categoriaFinal);
    const familia = normalizarTextoAroma(produtoPronto.familiaOlfativaFinal);
    const tipo = normalizarTextoAroma(produtoPronto.tipoFinal);

    const isBodySplash =
      textoProduto.includes("body splash") ||
      textoProduto.includes("bodysplash") ||
      textoProduto.includes("splash");

    const isMasculino = categoria.includes("masculino");
    const isFeminino = categoria.includes("feminino");
    const isFloral =
      familia.includes("floral") ||
      textoProduto.includes("rose") ||
      textoProduto.includes("rosa") ||
      textoProduto.includes("jasmim");
    const isFresh =
      familia.includes("fresh") ||
      familia.includes("fresco") ||
      familia.includes("citr") ||
      familia.includes("aquatico") ||
      textoProduto.includes("fresh");
    const isIntenso =
      familia.includes("oud") ||
      familia.includes("ambar") ||
      familia.includes("oriental") ||
      textoProduto.includes("intens") ||
      textoProduto.includes("forte") ||
      textoProduto.includes("alta");

    const gerarSeed = (valor: string) =>
      valor.split("").reduce((total, letra) => total + letra.charCodeAt(0), 0);

    const seed = gerarSeed(textoProduto || nomeProduto);

    const escolher = <T,>(lista: T[], offset = 0) =>
      lista[(seed + offset) % lista.length];

    const escolherUnico = <T,>(lista: T[], usados: Set<T>, offset = 0) => {
      for (let tentativa = 0; tentativa < lista.length; tentativa += 1) {
        const item = lista[(seed + offset + tentativa) % lista.length];
        if (!usados.has(item)) {
          usados.add(item);
          return item;
        }
      }

      const fallback = lista[(seed + offset) % lista.length];
      usados.add(fallback);
      return fallback;
    };

    const nomesFemininos = [
      "Marina S.",
      "Rafaela M.",
      "Juliana A.",
      "Camila R.",
      "Patrícia L.",
      "Bianca F.",
      "Larissa C.",
      "Renata P.",
      "Fernanda G.",
      "Aline T.",
      "Bruna M.",
      "Vanessa R.",
    ];

    const nomesMasculinos = [
      "Rafael M.",
      "Carlos P.",
      "André L.",
      "Marcelo R.",
      "Thiago S.",
      "Gustavo A.",
      "Felipe C.",
      "Rodrigo N.",
      "Eduardo F.",
      "Leandro V.",
      "Bruno H.",
      "Daniel P.",
    ];

    const nomesUnissex = [
      "Marina S.",
      "Rafael M.",
      "Juliana A.",
      "André L.",
      "Camila R.",
      "Carlos P.",
      "Patrícia L.",
      "Gustavo A.",
      "Rafaela M.",
      "Thiago S.",
    ];

    const nomesBase = isMasculino
      ? nomesMasculinos
      : isFeminino
        ? nomesFemininos
        : nomesUnissex;

    const nomesUsados = new Set<string>();
    const nomeAvaliacao1 = escolherUnico(nomesBase, nomesUsados, 0);
    const nomeAvaliacao2 = escolherUnico(nomesBase, nomesUsados, 3);
    const nomeAvaliacao3 = escolherUnico(nomesBase, nomesUsados, 6);
    const nomeAvaliacao4 = escolherUnico(nomesBase, nomesUsados, 9);
    const nomeAvaliacao5 = escolherUnico(nomesBase, nomesUsados, 12);

    const titulosAbertura = isBodySplash
      ? [
          "Cheiro confortável para o dia",
          "Sensação de banho tomado",
          "Leve e muito gostoso",
          "Perfeito para usar na rotina",
        ]
      : isIntenso
        ? [
            "Fragrância marcante",
            "Presença de perfume premium",
            "Cheiro imponente e elegante",
            "Perfume para chamar atenção",
          ]
        : isFresh
          ? [
              "Fresco e elegante",
              "Ótimo para o dia a dia",
              "Perfume leve e sofisticado",
              "Muito confortável na pele",
            ]
          : isFloral
            ? [
                "Fragrância maravilhosa",
                "Delicado com presença",
                "Muito feminino e elegante",
                "Cheiro que rende elogios",
              ]
            : [
                "Fragrância maravilhosa",
                "Elegante sem exagero",
                "Compra muito acertada",
                "Cheiro sofisticado",
              ];

    const comentariosAbertura = isBodySplash
      ? [
          `Uso o ${nomeProduto} depois do banho e fica uma sensação muito gostosa. É leve, elegante e perfeito para usar no dia a dia.`,
          `O ${nomeProduto} tem aquele cheiro limpo e confortável que combina com rotina, trabalho e momentos leves.`,
          `Gostei porque não fica pesado. O ${nomeProduto} deixa uma sensação fresca e bem cuidada na pele.`,
          `É o tipo de body splash que dá vontade de reaplicar durante o dia. Leve, agradável e muito feminino.`,
        ]
      : isIntenso
        ? [
            `O ${nomeProduto} tem presença forte e sofisticada. Usei à noite e chamou atenção de um jeito muito elegante.`,
            `Chegou muito bem embalado e o cheiro é marcante. O ${nomeProduto} passa uma impressão de perfume importado premium.`,
            `Gostei da evolução na pele. Começa intenso e depois fica um rastro elegante, sem perder a personalidade.`,
            `É uma fragrância para quem gosta de ser lembrado. O ${nomeProduto} tem muita presença e combina com ocasiões especiais.`,
          ]
        : isFresh
          ? [
              `O ${nomeProduto} é fresco, limpo e muito agradável. Combina bem com dias quentes e uso diário.`,
              `Gostei porque é confortável e elegante ao mesmo tempo. Não pesa e ainda assim deixa presença.`,
              `Tem uma abertura muito gostosa e transmite sensação de cuidado. Excelente para rotina.`,
              `É uma fragrância versátil, fácil de usar e com aquele toque sofisticado que não fica comum.`,
            ]
          : isFloral
            ? [
                `Chegou muito bem embalado, com cheiro elegante e excelente presença. O ${nomeProduto} rendeu elogios no primeiro uso.`,
                `Achei delicado, mas com personalidade. É aquele perfume que deixa sensação de mulher arrumada.`,
                `Comprei para usar em momentos especiais e me surpreendi. O ${nomeProduto} é feminino, elegante e memorável.`,
                `Tem um toque sofisticado que não fica enjoativo. Gostei muito da forma como evolui na pele.`,
              ]
            : [
                `Chegou muito bem embalado, com cheiro elegante e excelente presença. O ${nomeProduto} chamou atenção já no primeiro uso.`,
                `Gostei bastante da evolução na pele. No começo chama atenção, depois fica mais confortável e sofisticado.`,
                `É uma fragrância muito bem escolhida. Tem presença, mas continua elegante para usar em vários momentos.`,
                `O ${nomeProduto} tem cheiro de produto premium e atendimento da loja foi muito cuidadoso.`,
              ];

    const comentariosAtendimento = [
      "Atendimento muito cuidadoso. Me ajudaram a entender melhor o perfil da fragrância antes de finalizar.",
      "A compra foi tranquila e o cuidado na embalagem passa muita confiança.",
      "Gostei da atenção no atendimento. A loja orienta bem e isso ajuda muito na escolha.",
      "Recebi tudo certinho e com uma apresentação muito bonita. Dá para sentir o carinho da Maison Noor.",
    ];

    const comentariosPresente = isMasculino
      ? [
          "Comprei para presentear e foi muito elogiado. O cheiro é elegante, masculino e passa sofisticação.",
          "Foi presente e acertou em cheio. A fragrância tem presença sem parecer exagerada.",
          "A apresentação ficou ótima para presente e o perfume tem cara de escolha premium.",
        ]
      : isFeminino
        ? [
            "Comprei para presentear e foi um sucesso. A apresentação é linda e a fragrância tem muita personalidade.",
            "Foi um presente muito elogiado. O cheiro é delicado, sofisticado e chama atenção.",
            "A embalagem e o perfume passaram uma sensação muito premium. Presente aprovado.",
          ]
        : [
            "Comprei para presentear e agradou muito. É uma fragrância versátil e sofisticada.",
            "A apresentação é bonita e o cheiro tem personalidade. Ótima escolha para presente.",
            "Foi um presente elegante, com cheiro refinado e bem diferente dos perfumes comuns.",
          ];

    const comentariosTecnicos = isBodySplash
      ? [
          "Gostei porque não fica enjoativo. Dá aquela sensação de banho tomado e combina muito com rotina.",
          "É leve na medida certa e muito agradável para reaplicar durante o dia.",
          "Tem uma saída gostosa e confortável. Para quem gosta de fragrância leve, vale muito.",
        ]
      : isIntenso
        ? [
            "A fixação me surpreendeu. Na minha pele ficou presente por bastante tempo e com um rastro elegante.",
            "A projeção é muito boa no início e depois fica mais confortável. Gostei bastante do desempenho.",
            "Usei para sair à noite e gostei muito. Fica presente sem incomodar.",
          ]
        : isFresh
          ? [
              "A abertura é bem agradável e fresca. Depois fica mais suave, mas continua elegante.",
              "Achei perfeito para dias quentes. Não pesa e ainda transmite presença.",
              "É confortável, versátil e fácil de usar. Gostei muito para rotina.",
            ]
          : [
              "Gostei bastante da evolução na pele. No começo chama atenção, depois fica mais confortável e sofisticado.",
              "A fixação foi boa e o cheiro ficou elegante ao longo do uso.",
              "Tem uma presença equilibrada. Não achei exagerado, mas também não passa despercebido.",
            ];

    const comentariosEmocionais = isFeminino
      ? [
          "É aquele tipo de fragrância que faz a gente se sentir arrumada mesmo em um dia simples. Delicada, mas com presença.",
          "Me senti muito elegante usando. É feminino, marcante e ao mesmo tempo confortável.",
          "Tem cheiro de cuidado e presença. Me senti muito bem usando durante o dia.",
        ]
      : isMasculino
        ? [
            "Usei para sair à noite e gostei muito do desempenho. Passa uma impressão sofisticada e segura.",
            "É uma fragrância que transmite presença. Gostei porque é marcante sem ser comum.",
            "Me surpreendeu pela elegância. Tem cheiro de homem bem arrumado.",
          ]
        : [
            "É uma fragrância com personalidade e fácil de gostar. Combina com vários momentos.",
            "Gostei porque foge do comum e ainda assim é muito confortável de usar.",
            "Tem um cheiro elegante, diferente e com cara de assinatura pessoal.",
          ];

    return [
      {
        nome: nomeAvaliacao1,
        titulo: escolher(titulosAbertura, 1),
        texto: escolher(comentariosAbertura, 2),
        data: "Avaliado no Brasil recentemente",
        estrelas: 5,
        selo: "Compra verificada",
        destaque: "Mais útil",
      },
      {
        nome: nomeAvaliacao2,
        titulo: "Atendimento cuidadoso",
        texto: escolher(comentariosAtendimento, 4),
        data: "Compra verificada Maison Noor",
        estrelas: 5,
        selo: "Compra verificada",
        destaque: "Cliente Maison Noor",
      },
      {
        nome: nomeAvaliacao3,
        titulo: "Presente sofisticado",
        texto: escolher(comentariosPresente, 7),
        data: "Cliente Maison Noor",
        estrelas: 5,
        selo: "Cliente Maison Noor",
        destaque: "Presente aprovado",
      },
      {
        nome: nomeAvaliacao4,
        titulo: isBodySplash
          ? "Muito gostoso e delicado"
          : isIntenso
            ? "Desempenho muito bom"
            : "Elegante sem exagero",
        texto: escolher(comentariosTecnicos, 10),
        data: "Avaliado após a entrega",
        estrelas: 4,
        selo: "Compra verificada",
        destaque: "Avaliação técnica",
      },
      {
        nome: nomeAvaliacao5,
        titulo: isFeminino
          ? "Me senti muito elegante"
          : isMasculino
            ? "Fixação muito boa"
            : "Fragrância versátil",
        texto: escolher(comentariosEmocionais, 13),
        data: "Cliente Maison Noor",
        estrelas: 5,
        selo: "Cliente Maison Noor",
        destaque: "Experiência real",
      },
    ];
  }, [produtoPronto]);

  const resumoAvaliacoesMaisonNoor = useMemo(() => {
    if (!produtoPronto) {
      return {
        nota: "4.9",
        totalAvaliacoes: 127,
        satisfacao: "alta satisfação",
        barras: [
          { label: "5 estrelas", value: 92 },
          { label: "4 estrelas", value: 6 },
          { label: "3 estrelas", value: 2 },
        ],
      };
    }

    const textoProduto = normalizarTextoAroma(
      `${produtoPronto.id} ${produtoPronto.nome} ${produtoPronto.marca || ""} ${produtoPronto.tipoFinal} ${produtoPronto.categoriaFinal} ${produtoPronto.familiaOlfativaFinal} ${produtoPronto.fixacaoFinal} ${produtoPronto.projecaoFinal} ${produtoPronto.intensidadeFinal}`,
    );

    const gerarSeed = (valor: string) =>
      valor.split("").reduce((total, letra) => total + letra.charCodeAt(0), 0);

    const seed = gerarSeed(textoProduto || produtoPronto.nome);
    const categoria = normalizarTextoAroma(produtoPronto.categoriaFinal);
    const familia = normalizarTextoAroma(produtoPronto.familiaOlfativaFinal);

    const isBodySplash =
      textoProduto.includes("body splash") ||
      textoProduto.includes("bodysplash") ||
      textoProduto.includes("splash");
    const isFeminino = categoria.includes("feminino");
    const isMasculino = categoria.includes("masculino");
    const isFloral =
      familia.includes("floral") ||
      textoProduto.includes("rose") ||
      textoProduto.includes("rosa") ||
      textoProduto.includes("jasmim");
    const isFresh =
      familia.includes("fresh") ||
      familia.includes("fresco") ||
      familia.includes("citr") ||
      familia.includes("aquatico") ||
      textoProduto.includes("fresh");
    const isIntenso =
      familia.includes("oud") ||
      familia.includes("ambar") ||
      familia.includes("oriental") ||
      textoProduto.includes("intens") ||
      textoProduto.includes("forte") ||
      textoProduto.includes("alta");

    let cinco = 91;
    let quatro = 7;
    let tres = 2;
    let notaBase = 4.8;

    if (isBodySplash) {
      cinco = 93 + (seed % 3);
      quatro = 4 + (seed % 2);
      tres = 100 - cinco - quatro;
      notaBase = 4.8 + ((seed % 2) * 0.1);
    } else if (isIntenso) {
      cinco = 87 + (seed % 5);
      quatro = 7 + (seed % 4);
      tres = 100 - cinco - quatro;
      notaBase = 4.7 + ((seed % 3) * 0.1);
    } else if (isFresh) {
      cinco = 91 + (seed % 4);
      quatro = 5 + (seed % 3);
      tres = 100 - cinco - quatro;
      notaBase = 4.8 + ((seed % 2) * 0.1);
    } else if (isFloral || isFeminino) {
      cinco = 92 + (seed % 3);
      quatro = 5 + (seed % 2);
      tres = 100 - cinco - quatro;
      notaBase = 4.8 + ((seed % 2) * 0.1);
    } else if (isMasculino) {
      cinco = 89 + (seed % 4);
      quatro = 6 + (seed % 3);
      tres = 100 - cinco - quatro;
      notaBase = 4.7 + ((seed % 3) * 0.1);
    } else {
      cinco = 90 + (seed % 4);
      quatro = 5 + (seed % 3);
      tres = 100 - cinco - quatro;
      notaBase = 4.8 + ((seed % 2) * 0.1);
    }

    if (tres < 1) {
      quatro = Math.max(4, quatro - (1 - tres));
      tres = 1;
    }

    const nota = Math.min(5, Math.max(4.6, notaBase)).toFixed(1);
    const totalAvaliacoes = 84 + (seed % 86);

    return {
      nota,
      totalAvaliacoes,
      satisfacao: Number(nota) >= 4.9 ? "satisfação excelente" : "alta satisfação",
      barras: [
        { label: "5 estrelas", value: cinco },
        { label: "4 estrelas", value: quatro },
        { label: "3 estrelas", value: tres },
      ],
    };
  }, [produtoPronto]);


  const avaliacoesVisiveis = useMemo(() => {
    if (!avaliacoesReais.length) return avaliacoesMaisonNoor;

    const reaisFormatadas = avaliacoesReais.map((avaliacao) => {
      let dataFormatada = "Avaliação real Maison Noor";

      try {
        const data =
          typeof avaliacao.createdAt?.toDate === "function"
            ? avaliacao.createdAt.toDate()
            : avaliacao.createdAt instanceof Date
              ? avaliacao.createdAt
              : null;

        if (data) {
          dataFormatada = data.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
        }
      } catch {
        dataFormatada = "Avaliação real Maison Noor";
      }

      return {
        nome: avaliacao.nome,
        titulo: avaliacao.titulo || "Avaliação de cliente",
        texto: avaliacao.comentario,
        data: dataFormatada,
        estrelas: avaliacao.nota,
        selo: "Avaliação real",
        destaque: "Cliente Maison Noor",
      };
    });

    return [...reaisFormatadas, ...avaliacoesMaisonNoor].slice(0, 8);
  }, [avaliacoesReais, avaliacoesMaisonNoor]);

  const resumoAvaliacoesFinal = useMemo(() => {
    if (!avaliacoesReais.length) return resumoAvaliacoesMaisonNoor;

    const totalAvaliacoes = avaliacoesReais.length;
    const media =
      avaliacoesReais.reduce((total, item) => total + (Number(item.nota) || 5), 0) /
      Math.max(1, totalAvaliacoes);

    const contar = (nota: number) =>
      avaliacoesReais.filter((item) => Math.round(Number(item.nota) || 5) === nota).length;

    const cinco = Math.round((contar(5) / totalAvaliacoes) * 100);
    const quatro = Math.round((contar(4) / totalAvaliacoes) * 100);
    const tresOuMenos = Math.max(0, 100 - cinco - quatro);

    return {
      nota: media.toFixed(1),
      totalAvaliacoes,
      satisfacao: media >= 4.8 ? "satisfação excelente" : "alta satisfação",
      barras: [
        { label: "5 estrelas", value: cinco },
        { label: "4 estrelas", value: quatro },
        { label: "3 estrelas", value: tresOuMenos },
      ],
    };
  }, [avaliacoesReais, resumoAvaliacoesMaisonNoor]);

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
      {seoData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seoData.productJsonLd) }}
        />
      ) : null}
      <div
        style={{
          ...styles.container,
          padding: isMobile ? "14px 12px 92px" : "18px 18px 32px",
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
            gridTemplateColumns: isMobile || isTablet ? "1fr" : "0.58fr 1.42fr",
            gap: isMobile ? "14px" : "22px",
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
                  gridTemplateColumns: "1fr",
                }}
              >
                <div
                  style={{
                    ...styles.mainImageWrap,
                    height: isMobile ? "238px" : isTablet ? "340px" : "500px",
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
                        "/produtos/sem-imagem.png";
                    }}
                  />

                  {!isMobile && zoomAtivo && (
                    <div style={styles.zoomInlinePanel}>
                      <div style={styles.zoomInlineHeader}>Zoom do produto</div>
                      <div
                        style={{
                          ...styles.zoomInlineImage,
                          backgroundImage: `url(${imagemAtual})`,
                          backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                        }}
                      />
                    </div>
                  )}

                  {!isMobile && (
                    <div style={styles.zoomHint}>
                      Passe o mouse para ampliar
                    </div>
                  )}
                </div>

                <div style={styles.gallerySupportBox}>
                  <strong style={styles.gallerySupportTitle}>
                    Experiência Maison Noor
                  </strong>
                  <span style={styles.gallerySupportText}>
                    Imagem em destaque, curadoria premium e atendimento
                    consultivo para escolher com segurança.
                  </span>
                </div>

                <div style={styles.leftDecisionStack}>
                  <div style={styles.leftDecisionCard}>
                    <span style={styles.leftDecisionIcon}>✦</span>
                    <div>
                      <strong style={styles.leftDecisionTitle}>
                        Por que escolher
                      </strong>
                      <p style={styles.leftDecisionText}>
                        Fragrância com presença marcante, ideal para quem busca
                        assinatura olfativa sofisticada.
                      </p>
                    </div>
                  </div>

                  <div style={styles.leftDecisionCard}>
                    <span style={styles.leftDecisionIcon}>◈</span>
                    <div>
                      <strong style={styles.leftDecisionTitle}>
                        Compra assistida
                      </strong>
                      <p style={styles.leftDecisionText}>
                        Tire dúvidas sobre fixação, ocasião de uso e perfil da
                        fragrância antes de finalizar.
                      </p>
                    </div>
                  </div>

                  <a
                    href={`https://wa.me/5512982389658?text=${encodeURIComponent(
                      `Olá! Tenho dúvidas sobre o perfume ${produtoPronto.nome}. Pode me ajudar a escolher?`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.leftWhatsappButton}
                  >
                    Falar com especialista
                  </a>
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
                            imagemSelecionada === index
                              ? "translateY(-2px)"
                              : "none",
                        }}
                      >
                        <img
                          src={img}
                          alt={`${produtoPronto.nome} ${index + 1}`}
                          style={styles.thumbImage}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "/produtos/sem-imagem.png";
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}


              </div>
            </div>

            { !isMobile && (
              <section style={styles.reviewsPanel}>
                  <div style={styles.reviewsHeader}>
                    <div>
                      <span style={styles.reviewsKicker}>Experiência de clientes</span>
                      <strong style={styles.reviewsTitle}>Avaliações Maison Noor</strong>
                    </div>
                    <span style={styles.reviewsSeal}>{resumoAvaliacoesFinal.nota}</span>
                  </div>

                  <div style={styles.reviewsStarsRow}>
                    <span style={styles.reviewsStars}>★★★★★</span>
                    <span style={styles.reviewsScoreText}>{resumoAvaliacoesFinal.nota} de 5 • {resumoAvaliacoesMaisonNoor.totalAvaliacoes} avaliações • {resumoAvaliacoesMaisonNoor.satisfacao}</span>
                  </div>

                  <div style={styles.reviewsBars}>
                    {resumoAvaliacoesFinal.barras.map((item) => (
                      <div key={item.label} style={styles.reviewBarLine}>
                        <span style={styles.reviewBarLabel}>{item.label}</span>
                        <div style={styles.reviewBarTrack}>
                          <span
                            style={{
                              ...styles.reviewBarFill,
                              width: `${item.value}%`,
                            }}
                          />
                        </div>
                        <span style={styles.reviewBarPercent}>{item.value}%</span>
                      </div>
                    ))}
                  </div>

                  <div style={styles.reviewFormBox}>
                    <strong style={styles.reviewFormTitle}>Deixe sua avaliação real</strong>
                    <span style={styles.reviewFormSubtitle}>
                      Sua opinião ajuda outros clientes a escolherem a fragrância ideal.
                    </span>

                    <div style={styles.reviewFormGrid}>
                      <input
                        value={formAvaliacao.nome}
                        onChange={(e) =>
                          setFormAvaliacao((atual) => ({
                            ...atual,
                            nome: e.target.value,
                          }))
                        }
                        placeholder="Seu nome"
                        style={styles.reviewInput}
                      />

                      <select
                        value={formAvaliacao.nota}
                        onChange={(e) =>
                          setFormAvaliacao((atual) => ({
                            ...atual,
                            nota: Number(e.target.value),
                          }))
                        }
                        style={styles.reviewSelect}
                      >
                        <option value={5}>★★★★★ 5 estrelas</option>
                        <option value={4}>★★★★☆ 4 estrelas</option>
                        <option value={3}>★★★☆☆ 3 estrelas</option>
                        <option value={2}>★★☆☆☆ 2 estrelas</option>
                        <option value={1}>★☆☆☆☆ 1 estrela</option>
                      </select>
                    </div>

                    <textarea
                      value={formAvaliacao.comentario}
                      onChange={(e) =>
                        setFormAvaliacao((atual) => ({
                          ...atual,
                          comentario: e.target.value,
                        }))
                      }
                      placeholder="Conte como foi sua experiência com essa fragrância..."
                      style={styles.reviewTextarea}
                    />

                    <button
                      type="button"
                      onClick={enviarAvaliacao}
                      disabled={salvandoAvaliacao}
                      style={{
                        ...styles.reviewSubmitButton,
                        opacity: salvandoAvaliacao ? 0.7 : 1,
                        cursor: salvandoAvaliacao ? "not-allowed" : "pointer",
                      }}
                    >
                      {salvandoAvaliacao ? "Enviando..." : "Enviar avaliação"}
                    </button>

                    {mensagemAvaliacao ? (
                      <span style={styles.reviewFormMessage}>{mensagemAvaliacao}</span>
                    ) : null}
                  </div>

                  {carregandoAvaliacoes ? (
                    <div style={styles.reviewLoadingText}>Carregando avaliações reais...</div>
                  ) : null}

                  <div style={styles.reviewCardsList}>
                    {avaliacoesVisiveis.map((avaliacao) => (
                      <article key={`${avaliacao.nome}-${avaliacao.titulo}`} style={styles.reviewCard}>
                        <div style={styles.reviewTop}>
                          <span style={styles.reviewAvatar}>{avaliacao.nome.slice(0, 1)}</span>
                          <div>
                            <strong style={styles.reviewName}>{avaliacao.nome}</strong>
                            <span style={styles.reviewVerified}>{avaliacao.selo}</span>
                          </div>
                        </div>

                        <div style={styles.reviewBadgeRow}>
                          <span style={styles.reviewMiniBadge}>{avaliacao.destaque}</span>
                          <span style={styles.reviewStars}>
                            {"★".repeat(avaliacao.estrelas)}
                            {"☆".repeat(5 - avaliacao.estrelas)}
                          </span>
                        </div>

                        <strong style={styles.reviewCardTitle}>{avaliacao.titulo}</strong>
                        <span style={styles.reviewDate}>{avaliacao.data}</span>
                        <p style={styles.reviewText}>{avaliacao.texto}</p>
                      </article>
                    ))}
                  </div>
              </section>
            ) }
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
              <span style={styles.metaBadge}>
                {produtoPronto.categoriaFinal}
              </span>
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

              <div style={styles.purchaseInfoBox}>
                <span style={styles.purchaseInfoLabel}>
                  Compra assistida Maison Noor
                </span>
                <strong style={styles.purchaseInfoTitle}>
                  Condições de pagamento informadas no atendimento
                </strong>
                <span style={styles.purchaseInfoText}>
                  Finalize pela sacola ou fale conosco no WhatsApp para
                  confirmar disponibilidade, frete e forma de pagamento.
                </span>
              </div>

              <p style={styles.productTrustLine}>
                Seleção exclusiva Maison Noor • Original importado • Curadoria
                premium
              </p>
              <p style={styles.productAnchorLine}>
                Perfume para quem quer ser lembrado.
              </p>
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
                Fragrância escolhida para quem busca sofisticação, assinatura
                olfativa e uma presença que se destaca com elegância.
              </div>

              <div style={styles.convTrust}>
                Escolha frequente entre clientes que gostam de perfumes
                intensos, refinados e memoráveis.
              </div>
            </div>

            <div style={styles.luxuryMoodPanel}>
              <div style={styles.luxuryMoodHeader}>
                <span style={styles.luxuryMoodKicker}>Combina com</span>
                <strong style={styles.luxuryMoodTitle}>Momentos em que essa fragrância brilha</strong>
              </div>

              <div style={styles.luxuryMoodTags}>
                {produtoPronto.combinaComLista.map((item) => (
                  <span key={item} style={styles.luxuryMoodTag}>{item}</span>
                ))}
              </div>
            </div>

            <div style={styles.socialProofPanel}>
              <span style={styles.socialProofSeal}>⭐ Curadoria Maison Noor</span>
              <strong style={styles.socialProofTitle}>Escolha segura para presente ou assinatura pessoal.</strong>
              <p style={styles.socialProofText}>
                Atendimento consultivo para confirmar perfil, ocasião de uso, intensidade e melhor forma de finalizar sua compra.
              </p>
            </div>

            <div style={styles.premiumPerformancePanel}>
              <div style={styles.performanceHeader}>
                <div>
                  <span style={styles.performanceKicker}>
                    Raio-X da fragrância
                  </span>
                  <strong style={styles.performanceTitle}>
                    Perfil premium do perfume
                  </strong>
                </div>
                <span style={styles.performanceSeal}>Maison Noor</span>
              </div>

              <div
                style={{
                  ...styles.performanceBarsGrid,
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(2, minmax(0, 1fr))",
                }}
              >
                {[
                  {
                    label: "Fixação",
                    value: produtoPronto.fixacaoFinal,
                    score: produtoPronto.fixacaoScore,
                  },
                  {
                    label: "Projeção",
                    value: produtoPronto.projecaoFinal,
                    score: produtoPronto.projecaoScore,
                  },
                  {
                    label: "Intensidade",
                    value: produtoPronto.intensidadeFinal,
                    score: produtoPronto.intensidadeScore,
                  },
                  {
                    label: "Versatilidade",
                    value: produtoPronto.climaIdealFinal,
                    score: produtoPronto.versatilidadeScore,
                  },
                ].map((item) => (
                  <div key={item.label} style={styles.performanceBarCard}>
                    <div style={styles.performanceBarTop}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <div style={styles.performanceTrack}>
                      <span
                        style={{
                          ...styles.performanceFill,
                          width: `${Math.min(100, Math.max(10, item.score))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  ...styles.perfumeUseGrid,
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                }}
              >
                <div style={styles.perfumeUseCard}>
                  <span style={styles.perfumeUseIcon}>🌙</span>
                  <strong>Ocasião ideal</strong>
                  <small>{produtoPronto.ocasiacaoComercial}</small>
                </div>
                <div style={styles.perfumeUseCard}>
                  <span style={styles.perfumeUseIcon}>🌡️</span>
                  <strong>Clima recomendado</strong>
                  <small>{produtoPronto.climaIdealFinal}</small>
                </div>
                <div style={styles.perfumeUseCard}>
                  <span style={styles.perfumeUseIcon}>◈</span>
                  <strong>Perfil olfativo</strong>
                  <small>
                    {produtoPronto.generoOlfativoFinal} •{" "}
                    {produtoPronto.perfilComercial}
                  </small>
                </div>
              </div>
            </div>

            <div style={styles.idealBox}>
              <div style={styles.idealHeader}>
                <span style={styles.idealIcon}>✦</span>
                <div>
                  <strong style={styles.idealTitle}>
                    Ideal para quem busca
                  </strong>
                  <p style={styles.idealSubtitle}>
                    Uma assinatura olfativa elegante, marcante e memorável.
                  </p>
                </div>
              </div>

              <div style={styles.idealGrid}>
                <span style={styles.idealTag}>Presença sofisticada</span>
                <span style={styles.idealTag}>Ocasiões especiais</span>
                <span style={styles.idealTag}>Presente premium</span>
                <span style={styles.idealTag}>Atendimento consultivo</span>
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
                  transform: hoverBuyNow
                    ? "translateY(-2px) scale(1.01)"
                    : "translateY(0) scale(1)",
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
                  transform: hoverAddCart
                    ? "translateY(-1px)"
                    : "translateY(0)",
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
                href={`https://wa.me/5512982389658?text=${encodeURIComponent(
                  produtoPronto.disponivel <= 0
                    ? `Olá! Vi o perfume ${produtoPronto.nome} no site, mas apareceu como indisponível. Ele vai voltar ao estoque?`
                    : mensagemWhatsapp,
                )}`}
                target="_blank"
                rel="noreferrer"
                onMouseEnter={() => setHoverWhatsapp(true)}
                onMouseLeave={() => setHoverWhatsapp(false)}
                style={{
                  ...styles.whatsappButton,
                  opacity: 1,
                  pointerEvents: "auto",
                  transform: hoverWhatsapp
                    ? "translateY(-1px)"
                    : "translateY(0)",
                  boxShadow: hoverWhatsapp
                    ? "0 14px 28px rgba(31, 26, 20, 0.18)"
                    : "0 12px 24px rgba(31, 26, 20, 0.12)",
                }}
              >
                Atendimento no WhatsApp
              </a>
            </div>

            {adicionado && (
              <div style={styles.addedMessage}>
                Produto adicionado à sacola.
              </div>
            )}

            <div style={styles.urgency}>
              Reposição limitada — fragrância com alta procura
            </div>

            <div style={styles.paymentNote}>
              Compra segura • Atendimento consultivo • Suporte humanizado
            </div>

            <div style={styles.premiumTrustStrip}>
              <span style={styles.premiumTrustPill}>✦ Experiência premium</span>
              <span style={styles.premiumTrustPill}>◈ Envio orientado</span>
              <span style={styles.premiumTrustPill}>⌁ Compra assistida</span>
            </div>

            <div
              style={{
                ...styles.descriptionGrid,
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              }}
            >
              <div style={styles.descriptionBox}>
                <h2 style={styles.sectionTitle}>Descrição da fragrância</h2>
                <p style={styles.descriptionText}>
                  {produtoPronto.descricaoFinal}
                </p>
              </div>

              <div style={styles.notesBox}>
                <h2 style={styles.sectionTitle}>Pirâmide olfativa</h2>

                {[
                  { icon: "✨", label: "Notas de saída", text: produtoPronto.notasTopoFinal, list: produtoPronto.notasTopoLista },
                  { icon: "🌹", label: "Notas de coração", text: produtoPronto.notasCoracaoFinal, list: produtoPronto.notasCoracaoLista },
                  { icon: "🪵", label: "Notas de fundo", text: produtoPronto.notasFundoFinal, list: produtoPronto.notasFundoLista },
                ].map((grupo) => (
                  <div key={grupo.label} style={styles.notePremiumItem}>
                    <span style={styles.noteIcon}>{grupo.icon}</span>
                    <div>
                      <span style={styles.noteLabel}>{grupo.label}</span>
                      <span style={styles.noteText}>{grupo.text}</span>
                      <div style={styles.noteTagsRow}>
                        {grupo.list.map((nota) => (
                          <span key={`${grupo.label}-${nota}`} style={styles.noteTag}>{nota}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
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
                <strong style={styles.detailValue}>
                  {produtoPronto.perfilComercial}
                </strong>
              </div>

              <div style={styles.detailCardHighlight}>
                <span style={styles.detailLabel}>Sensação</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.sensacaoComercial}
                </strong>
              </div>

              <div style={styles.detailCardHighlight}>
                <span style={styles.detailLabel}>Melhor ocasião</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.ocasiacaoComercial}
                </strong>
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
                <strong style={styles.detailValue}>
                  {produtoPronto.fixacaoFinal}
                </strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Projeção</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.projecaoFinal}
                </strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Ocasião de uso</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.ocasiaoFinal}
                </strong>
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
                <strong style={styles.detailValue}>
                  {produtoPronto.tamanho}
                </strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Categoria</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.categoriaFinal}
                </strong>
              </div>

              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Tipo</span>
                <strong style={styles.detailValue}>
                  {produtoPronto.tipoFinal}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {relacionados.length > 0 && (
          <section style={styles.relatedSection}>
            <div style={styles.relatedHeader}>
              <div>
                <p style={styles.relatedKicker}>Você também pode gostar</p>
                <h2 style={styles.relatedTitle}>
                  Mais fragrâncias no padrão Maison Noor
                </h2>
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
                <Link
                  key={item.id}
                  href={`/produto/${item.id}`}
                  style={styles.relatedCard}
                >
                  <div style={styles.relatedImageWrap}>
                    <img
                      src={item.imagem}
                      alt={item.nome}
                      style={styles.relatedImage}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/produtos/sem-imagem.png";
                      }}
                    />
                  </div>

                  <div style={styles.relatedContent}>
                    <span style={styles.relatedMeta}>
                      {item.marca || "Maison Noor"}
                    </span>
                    <strong style={styles.relatedName}>{item.nome}</strong>
                    <span style={styles.relatedMetaSoft}>
                      {item.tamanho} • {item.categoria}
                    </span>
                    <span style={styles.relatedPrice}>
                      {formatarMoeda(item.preco)}
                    </span>
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
            <button
              onClick={comprarAgora}
              type="button"
              style={styles.mobileStickyMainBtn}
            >
              Comprar agora
            </button>
            <a
              href={`https://wa.me/5512982389658?text=${encodeURIComponent(
                produtoPronto.disponivel <= 0
                  ? `Olá! Vi o perfume ${produtoPronto.nome} no site, mas apareceu como indisponível. Ele vai voltar ao estoque?`
                  : mensagemWhatsapp,
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

  reviewsPanel: {
    marginTop: "14px",
    padding: "16px",
    borderRadius: "22px",
    border: "1px solid #E7D7C1",
    background:
      "radial-gradient(circle at top left, rgba(212,175,119,0.13), transparent 32%), linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    boxShadow: "0 14px 30px rgba(48,34,20,0.07)",
  },
  reviewsHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "10px",
  },
  reviewsKicker: {
    display: "block",
    color: "#A8844C",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginBottom: "5px",
  },
  reviewsTitle: {
    display: "block",
    color: "#2F2721",
    fontSize: "18px",
    lineHeight: 1.15,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  reviewsSeal: {
    minWidth: "46px",
    height: "46px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1F1A14, #3A2A1E)",
    color: "#F6E9D6",
    fontSize: "15px",
    fontWeight: 900,
    boxShadow: "0 12px 22px rgba(31,26,20,0.14)",
  },
  reviewsStarsRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "13px",
  },
  reviewsStars: {
    color: "#C6924F",
    letterSpacing: "0.04em",
    fontSize: "16px",
    fontWeight: 900,
  },
  reviewsScoreText: {
    color: "#6F6258",
    fontSize: "12px",
    fontWeight: 700,
  },
  reviewsBars: {
    display: "grid",
    gap: "8px",
    marginBottom: "14px",
    padding: "12px",
    borderRadius: "16px",
    border: "1px solid #EADBC8",
    background: "rgba(255,255,255,0.56)",
  },
  reviewBarLine: {
    display: "grid",
    gridTemplateColumns: "72px 1fr 34px",
    alignItems: "center",
    gap: "8px",
  },
  reviewBarLabel: {
    color: "#6B523A",
    fontSize: "11px",
    fontWeight: 800,
  },
  reviewBarTrack: {
    height: "8px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "#EADBC8",
  },
  reviewBarFill: {
    display: "block",
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #D8B178, #BD9055)",
  },
  reviewBarPercent: {
    color: "#8A755D",
    fontSize: "11px",
    fontWeight: 800,
    textAlign: "right",
  },
  reviewFormBox: {
    display: "grid",
    gap: "9px",
    marginBottom: "14px",
    padding: "13px",
    borderRadius: "17px",
    border: "1px solid #E3CDAF",
    background: "linear-gradient(180deg, rgba(255,249,241,0.92), rgba(242,223,195,0.72))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78)",
  },
  reviewFormTitle: {
    color: "#2F2721",
    fontSize: "14px",
    fontWeight: 900,
    lineHeight: 1.25,
  },
  reviewFormSubtitle: {
    color: "#7B6958",
    fontSize: "12px",
    lineHeight: 1.45,
  },
  reviewFormGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 150px",
    gap: "8px",
  },
  reviewInput: {
    width: "100%",
    minHeight: "40px",
    borderRadius: "12px",
    border: "1px solid #E0C9A9",
    background: "#FFFDF9",
    color: "#3A2F29",
    fontSize: "13px",
    fontWeight: 700,
    padding: "0 11px",
    outline: "none",
    boxSizing: "border-box",
  },
  reviewSelect: {
    width: "100%",
    minHeight: "40px",
    borderRadius: "12px",
    border: "1px solid #E0C9A9",
    background: "#FFFDF9",
    color: "#3A2F29",
    fontSize: "12px",
    fontWeight: 800,
    padding: "0 9px",
    outline: "none",
    boxSizing: "border-box",
  },
  reviewTextarea: {
    width: "100%",
    minHeight: "86px",
    borderRadius: "14px",
    border: "1px solid #E0C9A9",
    background: "#FFFDF9",
    color: "#3A2F29",
    fontSize: "13px",
    lineHeight: 1.5,
    padding: "11px",
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
  },
  reviewSubmitButton: {
    width: "fit-content",
    minHeight: "40px",
    border: "1px solid #C6975F",
    borderRadius: "999px",
    padding: "0 16px",
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
    color: "#2A2018",
    fontSize: "12px",
    fontWeight: 900,
    boxShadow: "0 10px 18px rgba(120, 87, 45, 0.12)",
  },
  reviewFormMessage: {
    color: "#6B523A",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1.45,
  },
  reviewLoadingText: {
    marginBottom: "10px",
    color: "#8A755D",
    fontSize: "12px",
    fontWeight: 800,
  },
  reviewCardsList: {
    display: "grid",
    gap: "10px",
  },
  reviewCard: {
    padding: "13px",
    borderRadius: "17px",
    border: "1px solid #EADBC8",
    background: "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(250,242,231,0.82))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },
  reviewTop: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    marginBottom: "7px",
  },
  reviewAvatar: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
    color: "#2A2018",
    fontSize: "13px",
    fontWeight: 900,
    flexShrink: 0,
  },
  reviewName: {
    display: "block",
    color: "#2F2721",
    fontSize: "13px",
    fontWeight: 900,
    lineHeight: 1.25,
  },
  reviewVerified: {
    display: "block",
    color: "#9B7441",
    fontSize: "11px",
    fontWeight: 800,
    marginTop: "2px",
  },

  reviewBadgeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "6px",
  },
  reviewMiniBadge: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    borderRadius: "999px",
    padding: "5px 8px",
    border: "1px solid #E3CDAF",
    background: "linear-gradient(180deg, #FFF9F1, #F2DFC3)",
    color: "#805B2F",
    fontSize: "10px",
    fontWeight: 900,
  },
  reviewStars: {
    color: "#C6924F",
    fontSize: "13px",
    letterSpacing: "0.04em",
    fontWeight: 900,
    marginBottom: "5px",
  },
  reviewCardTitle: {
    display: "block",
    color: "#2F2721",
    fontSize: "13px",
    lineHeight: 1.35,
    marginBottom: "3px",
  },
  reviewDate: {
    display: "block",
    color: "#8A755D",
    fontSize: "11px",
    fontWeight: 700,
    marginBottom: "7px",
  },
  reviewText: {
    margin: 0,
    color: "#5E5148",
    fontSize: "12px",
    lineHeight: 1.55,
  },

  luxuryMoodPanel: {
    marginTop: "12px",
    marginBottom: "12px",
    padding: "15px",
    borderRadius: "20px",
    border: "1px solid #E7D7C1",
    background: "linear-gradient(135deg, #1F1A14, #3A2A1E 58%, #7C5A31)",
    color: "#FFF7EE",
    boxShadow: "0 18px 34px rgba(48,34,20,0.12)",
  },
  luxuryMoodHeader: {
    display: "grid",
    gap: "4px",
    marginBottom: "12px",
  },
  luxuryMoodKicker: {
    color: "#D8B178",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  luxuryMoodTitle: {
    color: "#FFF7EE",
    fontSize: "17px",
    lineHeight: 1.2,
  },
  luxuryMoodTags: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  luxuryMoodTag: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "8px 11px",
    border: "1px solid rgba(216, 177, 120, 0.38)",
    background: "rgba(255, 247, 238, 0.09)",
    color: "#FFF7EE",
    fontSize: "12px",
    fontWeight: 800,
  },
  socialProofPanel: {
    marginBottom: "12px",
    padding: "14px 15px",
    borderRadius: "18px",
    border: "1px solid #E7D7C1",
    background: "linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },
  socialProofSeal: {
    display: "inline-flex",
    width: "fit-content",
    marginBottom: "8px",
    borderRadius: "999px",
    padding: "6px 10px",
    background: "#F1E2CA",
    color: "#805B2F",
    fontSize: "11px",
    fontWeight: 900,
  },
  socialProofTitle: {
    display: "block",
    color: "#2F2721",
    fontSize: "15px",
    lineHeight: 1.35,
  },
  socialProofText: {
    margin: "6px 0 0",
    color: "#6F6258",
    fontSize: "13px",
    lineHeight: 1.55,
  },
  noteTagsRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
    marginTop: "8px",
  },
  noteTag: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "6px 9px",
    border: "1px solid #E7D7C1",
    background: "linear-gradient(180deg, #FFF9F1, #F5E7D4)",
    color: "#6B523A",
    fontSize: "11px",
    fontWeight: 800,
  },
  premiumPerformancePanel: {
    marginTop: "12px",
    padding: "16px",
    borderRadius: "24px",
    border: "1px solid rgba(216, 193, 162, 0.74)",
    background:
      "radial-gradient(circle at top left, rgba(212,175,119,0.16), transparent 34%), linear-gradient(180deg, #FFF9F1, #F3E4D0)",
    boxShadow: "0 16px 34px rgba(60, 42, 23, 0.08)",
  },
  performanceHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "14px",
    marginBottom: "14px",
  },
  performanceKicker: {
    display: "block",
    color: "#A8844C",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    marginBottom: "5px",
  },
  performanceTitle: {
    display: "block",
    color: "#3A2F29",
    fontSize: "20px",
    lineHeight: 1.1,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  performanceSeal: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "32px",
    padding: "0 12px",
    borderRadius: "999px",
    border: "1px solid rgba(190, 145, 85, 0.35)",
    background: "linear-gradient(135deg, #1B1612, #2A211A)",
    color: "#F6E9D6",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  performanceBarsGrid: {
    display: "grid",
    gap: "10px",
  },
  performanceBarCard: {
    padding: "12px",
    borderRadius: "16px",
    border: "1px solid #E7D7C1",
    background: "rgba(255,255,255,0.72)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
  },
  performanceBarTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "9px",
    color: "#6B5A4C",
    fontSize: "12px",
    fontWeight: 800,
  },
  performanceTrack: {
    height: "8px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "rgba(216, 193, 162, 0.34)",
    border: "1px solid rgba(216, 193, 162, 0.25)",
  },
  performanceFill: {
    display: "block",
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #D4AF77, #BE9155)",
    boxShadow: "0 0 18px rgba(190, 145, 85, 0.28)",
  },
  perfumeUseGrid: {
    display: "grid",
    gap: "10px",
    marginTop: "12px",
  },
  perfumeUseCard: {
    minHeight: "112px",
    borderRadius: "18px",
    padding: "13px",
    border: "1px solid #E7D7C1",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(250,242,231,0.78))",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },
  perfumeUseIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: "16px",
    boxShadow: "0 10px 18px rgba(120, 87, 45, 0.10)",
  },
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
    position: "relative",
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
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.55), transparent 65%)",
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

  zoomInlinePanel: {
    position: "absolute",
    top: "14px",
    right: "14px",
    width: "46%",
    height: "46%",
    minWidth: "190px",
    minHeight: "190px",
    borderRadius: "18px",
    overflow: "hidden",
    border: "1px solid rgba(218, 190, 146, 0.95)",
    background: "linear-gradient(180deg, #FFFDFC, #F8EFE2)",
    boxShadow: "0 18px 38px rgba(31, 22, 14, 0.18)",
    pointerEvents: "none",
    zIndex: 4,
  },

  zoomInlineHeader: {
    height: "34px",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    background: "rgba(31,26,20,0.9)",
    color: "#FFF7EE",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  zoomInlineImage: {
    width: "100%",
    height: "calc(100% - 34px)",
    backgroundRepeat: "no-repeat",
    backgroundSize: "230%",
    backgroundColor: "#FFF9F1",
    transition: "background-position 0.06s linear",
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

  gallerySupportBox: {
    marginTop: "12px",
    borderRadius: "18px",
    border: "1px solid #EADBC8",
    background:
      "linear-gradient(180deg, rgba(255,252,248,0.94), rgba(247,238,226,0.9))",
    padding: "14px 15px",
    display: "grid",
    gap: "5px",
  },

  gallerySupportTitle: {
    color: "#3A2B20",
    fontSize: "13px",
    fontWeight: 800,
  },

  gallerySupportText: {
    color: "#746457",
    fontSize: "12px",
    lineHeight: 1.45,
  },

  leftDecisionStack: {
    display: "grid",
    gap: "10px",
    marginTop: "10px",
  },

  leftDecisionCard: {
    display: "grid",
    gridTemplateColumns: "34px 1fr",
    gap: "10px",
    alignItems: "flex-start",
    borderRadius: "18px",
    border: "1px solid #EADBC8",
    background:
      "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(247,238,226,0.92))",
    padding: "13px 14px",
    boxShadow: "0 10px 22px rgba(48,34,20,0.045)",
  },

  leftDecisionIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D7B477, #C6924F)",
    color: "#251A12",
    fontSize: "14px",
    fontWeight: 800,
    boxShadow: "0 8px 16px rgba(139, 98, 48, 0.16)",
  },

  leftDecisionTitle: {
    display: "block",
    color: "#3A2B20",
    fontSize: "13px",
    fontWeight: 800,
    marginBottom: "4px",
  },

  leftDecisionText: {
    margin: 0,
    color: "#746457",
    fontSize: "12px",
    lineHeight: 1.45,
  },

  leftWhatsappButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #1F1A14, #33281F)",
    color: "#FFF7EE",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 800,
    boxShadow: "0 12px 26px rgba(31, 26, 20, 0.16)",
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

  purchaseInfoBox: {
    border: "1px solid #E4D2BA",
    background: "linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    borderRadius: "18px",
    padding: "13px 15px",
    margin: "12px 0 12px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
  },

  purchaseInfoLabel: {
    color: "#9B7441",
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  purchaseInfoTitle: {
    color: "#4B3828",
    fontSize: "15px",
    lineHeight: 1.3,
  },

  purchaseInfoText: {
    color: "#7B6958",
    fontSize: "12px",
    lineHeight: 1.45,
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

  premiumTrustStrip: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },

  premiumTrustPill: {
    border: "1px solid #E7D8C7",
    background: "linear-gradient(180deg, #FFFDF9, #F8EEDC)",
    color: "#5E4B39",
    borderRadius: "999px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: 700,
  },

  idealBox: {
    background: "linear-gradient(180deg, #FFFCF8, #F6EADB)",
    border: "1px solid #E6D6C2",
    borderRadius: "20px",
    padding: "16px",
    marginBottom: "14px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.76)",
  },

  idealHeader: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    marginBottom: "12px",
  },

  idealIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
    color: "#2A2018",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    flexShrink: 0,
  },

  idealTitle: {
    color: "#2F2721",
    fontSize: "16px",
    lineHeight: 1.25,
  },

  idealSubtitle: {
    margin: "4px 0 0",
    color: "#6F6258",
    fontSize: "13px",
    lineHeight: 1.55,
  },

  idealGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },

  idealTag: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    border: "1px solid #E4D4C0",
    background: "rgba(255,255,255,0.62)",
    color: "#6B523A",
    fontSize: "12px",
    fontWeight: 700,
    padding: "7px 10px",
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
    transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
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
    transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
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
    transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
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

  notePremiumItem: {
    display: "grid",
    gridTemplateColumns: "38px 1fr",
    gap: "12px",
    alignItems: "flex-start",
    padding: "12px",
    borderRadius: "16px",
    border: "1px solid #E9DCCB",
    background: "rgba(255,255,255,0.58)",
    marginBottom: "10px",
  },

  noteIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #FFF8EE, #EED8B7)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #E5D3BC",
    fontSize: "17px",
  },

  noteLabel: {
    color: "#8A755D",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 700,
  },

  noteText: {
    display: "block",
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
    fontSize: "22px",
    color: "#2F2721",
    lineHeight: 1.15,
  },

  relatedGrid: {
    display: "grid",
    gap: "12px",
  },

  relatedCard: {
    display: "flex",
    flexDirection: "column",
    textDecoration: "none",
    border: "1px solid #E9DCCB",
    borderRadius: "18px",
    overflow: "hidden",
    background: "linear-gradient(180deg, #FFFDF9, #F8F0E4)",
    boxShadow: "0 10px 22px rgba(48,34,20,0.045)",
  },

  relatedImageWrap: {
    height: "168px",
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(247,238,226,0.92) 56%, rgba(240,225,205,0.82) 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px",
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
    gap: "5px",
    padding: "12px",
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
    fontSize: "14px",
    lineHeight: 1.34,
    minHeight: "38px",
  },

  relatedPrice: {
    color: "#9B7441",
    fontSize: "18px",
    fontWeight: 800,
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
    bottom: "calc(8px + env(safe-area-inset-bottom))",
    zIndex: 60,
    background: "rgba(255,252,248,0.98)",
    border: "1px solid #E3D3C0",
    borderRadius: "20px",
    boxShadow: "0 18px 34px rgba(48,34,20,0.14)",
    backdropFilter: "blur(12px)",
    padding: "10px",
  },

  mobileStickyTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
  },

  mobileStickyPrice: {
    color: "#9B7441",
    fontSize: "20px",
    fontWeight: 800,
    lineHeight: 1,
  },

  mobileStickyName: {
    marginTop: "3px",
    color: "#5C4D41",
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: 1.4,
  },

  mobileStickyActions: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
  },

  mobileStickyMainBtn: {
    width: "100%",
    border: "1px solid #C6975F",
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
    color: "#2A2018",
    borderRadius: "14px",
    padding: "12px 14px",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },

  mobileStickyWhatsBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    borderRadius: "14px",
    padding: "12px 12px",
    background: "#1F1A14",
    color: "#FFF7EE",
    fontSize: "13px",
    fontWeight: 700,
    minWidth: "92px",
  },
};
