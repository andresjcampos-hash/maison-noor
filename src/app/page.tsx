"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CSSProperties } from "react";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, User } from "firebase/auth";

type CategoriaCRM = "masculino" | "feminino" | "unissex" | "kits-presente";

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
  imageUrl?: string;
  ordemVitrine?: number;
  ordem?: number;
  posicao?: number;
  position?: number;
  destaque?: boolean;
  tipo?: string;
};

type ProdutoCarrinho = {
  id: string;
  nome: string;
  preco: number;
  imagem: string;
  tamanho: string;
};


const CART_KEYS = [
  "maison_noor_sacola",
  "maison_noor_sacola_v1",
  "maison_noor_cart",
  "maison_noor_cart_v1",
  "cart",
  "cartItems",
  "sacola",
  "sacolaItems",
  "maison_cart",
  "maison_noor_bag",
] as const;

function getCartFromStorage(): ProdutoCarrinho[] {
  if (typeof window === "undefined") return [];

  const normalize = (item: any): ProdutoCarrinho | null => {
    const nome = String(item?.nome ?? item?.name ?? item?.title ?? "").trim();
    const preco = Number(item?.preco ?? item?.precoVenda ?? item?.price ?? item?.valor ?? 0);

    if (!nome || !Number.isFinite(preco) || preco < 0) return null;

    return {
      id: String(item?.id ?? item?.produtoId ?? item?.slug ?? nome),
      nome,
      preco,
      imagem: String(item?.imagem ?? item?.imageUrl ?? item?.image ?? "/produtos/hero-perfume.png"),
      tamanho: String(item?.tamanho ?? "Maison Noor"),
    };
  };

  const candidatos: ProdutoCarrinho[][] = [];

  for (const key of CART_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      const normalizados = parsed
        .map(normalize)
        .filter(Boolean) as ProdutoCarrinho[];

      if (normalizados.length) candidatos.push(normalizados);
    } catch (_) {}
  }

  if (!candidatos.length) return [];

  candidatos.sort((a, b) => {
    const totalA = a.reduce((acc, item) => acc + Number(item.preco || 0), 0);
    const totalB = b.reduce((acc, item) => acc + Number(item.preco || 0), 0);
    return totalB - totalA || b.length - a.length;
  });

  return candidatos[0];
}

function saveCartToStorage(items: ProdutoCarrinho[]) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify(
    items.map((item) => ({
      id: item.id,
      produtoId: item.id,
      nome: item.nome,
      preco: Number(item.preco ?? 0),
      precoVenda: Number(item.preco ?? 0),
      imagem: item.imagem,
      imageUrl: item.imagem,
      tamanho: item.tamanho,
      quantidade: 1,
      qtd: 1,
    }))
  );

  if (!items.length) {
    for (const key of CART_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event("storage"));
    return;
  }

  for (const key of CART_KEYS) {
    window.localStorage.setItem(key, payload);
  }

  window.dispatchEvent(new Event("storage"));
}

type HeroBanner = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  image?: string;
  align?: "left" | "center";
  mobilePosition?: string;
};

type NavItem = {
  label: string;
  href?: string;
  targetId?: string;
  action?: () => void;
};

type ClienteSite = {
  uid: string;
  nome?: string;
  email?: string;
  favoritos?: string[];
};

const productsCollection = collection(db, "products");
const clientesVipCollection = collection(db, "clientes_vip");

const depoimentosMaisonNoor = [
  {
    nome: "Cliente Maison Noor",
    frase: "Atendimento impecável e fragrâncias realmente marcantes. A experiência foi premium do início ao fim.",
  },
  {
    nome: "Compra via WhatsApp",
    frase: "Recebi ajuda para escolher o perfume ideal e o pedido chegou com apresentação muito elegante.",
  },
  {
    nome: "Presente especial",
    frase: "Escolhi para presentear e foi um sucesso. A curadoria da Maison Noor faz diferença.",
  },
];

const LINKS_PAGBANK: Record<string, string> = {};

const categorias = [
  "Todos",
  "Femininos",
  "Masculinos",
  "Unissex",
  "Presentes",
  "Promoções",
  "Cremes",
  "Família Olfativa",
];

const trustBadges = [
  {
    icon: "✦",
    title: "Produtos originais",
    text: "Curadoria premium em perfumes árabes.",
  },
  {
    icon: "🚚",
    title: "Envio rápido",
    text: "Fechamento prático pelo WhatsApp.",
  },
  {
    icon: "🔒",
    title: "Compra segura",
    text: "Pedido salvo e acompanhamento na conta.",
  },
  {
    icon: "💬",
    title: "Atendimento VIP",
    text: "Suporte real para escolher sua fragrância.",
  },
];

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function calcularPix(preco: number) {
  return preco * 0.95;
}

function calcularParcela(preco: number) {
  return preco / 3;
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


function getPagBankLink(produto: ProdutoFirebase) {
  const chavePorId = LINKS_PAGBANK[String(produto.id || "")];
  if (chavePorId) return chavePorId;

  const chavePorSlug = LINKS_PAGBANK[slugify(produto.nome)];
  if (chavePorSlug) return chavePorSlug;

  return "";
}

function getFallbackPagamentoWhatsapp(produto: any) {
  return `https://wa.me/5512982389658?text=${encodeURIComponent(
    `Olá! Quero comprar o perfume ${produto.nome} 😍

Vi no site e fiquei interessado.
Pode me enviar as opções de pagamento?`
  )}`;
}

function categoriaSite(categoria?: CategoriaCRM): string {
  if (categoria === "feminino") return "Femininos";
  if (categoria === "masculino") return "Masculinos";
  if (categoria === "unissex") return "Unissex";
  if (categoria === "kits-presente") return "Kits Presente";
  return "Unissex";
}

function getImagemProduto(produto: ProdutoFirebase): string {
  if (produto.imagem) return produto.imagem;
  if (produto.imageUrl) return produto.imageUrl;

  const slug = slugify(produto.nome);
  return `/produtos/${slug}.png`;
}

function ehKit(produto: ProdutoFirebase) {
  const texto = `${produto.nome || ""} ${produto.observacoes || ""}`.toLowerCase();
  return produto.categoria === "kits-presente" || texto.includes("kit") || texto.includes("cesta") || texto.includes("presente");
}

function ehPromocao(produto: ProdutoFirebase) {
  const texto = `${produto.nome || ""} ${produto.observacoes || ""}`.toLowerCase();
  return (
    texto.includes("promo") ||
    texto.includes("oferta") ||
    texto.includes("desconto")
  );
}


function getBadgeProduto(produto: any, index: number) {
  if (produto.isPromocao) return "Seleção especial";
  if (produto.isKit) return "Presente ideal";
  if (index === 0) return "Mais desejado";
  return "";
}

function getCardEssencia(produto: ProdutoFirebase & { categoriaSite?: string; nome?: string; observacoes?: string }) {
  const texto = `${produto.nome || ""} ${produto.observacoes || ""}`.toLowerCase();

  if (texto.includes("oud") || texto.includes("ambar") || texto.includes("âmbar") || texto.includes("oriental")) {
    return "Intenso e sofisticado";
  }

  if (texto.includes("yara") || texto.includes("floral") || produto.categoriaSite === "Femininos") {
    return "Delicado e envolvente";
  }

  if (produto.categoriaSite === "Masculinos") {
    return "Marcante e elegante";
  }

  if (produto.categoriaSite === "Unissex") {
    return "Versátil e refinado";
  }

  return "Elegância em cada borrifada";
}


function categoriaDescricao(categoria: string) {
  if (categoria === "Todos") return "Coleção completa Maison Noor";
  if (categoria === "Femininos") return "Fragrâncias delicadas e marcantes";
  if (categoria === "Masculinos") return "Seleção intensa e sofisticada";
  if (categoria === "Unissex") return "Versatilidade premium para todos os estilos";
  if (categoria === "Presentes") return "Kits, cestas e combinações especiais para presentear com elegância";
  if (categoria === "Promoções") return "Ofertas especiais por tempo limitado";
  if (categoria === "Cremes") return "Cuidados perfumados e texturas sofisticadas";
  return "Explore os perfumes por notas e famílias olfativas";
}

function getProdutoTime(valor: any) {
  if (!valor) return 0;
  if (typeof valor?.toDate === "function") return valor.toDate().getTime();

  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? data.getTime() : 0;
}

function getProdutoOrdem(produto: any) {
  const ordem = Number(
    produto.ordemVitrine ??
      produto.ordem ??
      produto.posicao ??
      produto.position ??
      9999
  );

  return Number.isFinite(ordem) ? ordem : 9999;
}

export default function HomePage() {
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState("Todos");
  const [sacola, setSacola] = useState<ProdutoCarrinho[]>([]);
  const [produtos, setProdutos] = useState<ProdutoFirebase[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [windowWidth, setWindowWidth] = useState<number>(1280);
  const [heroIndex, setHeroIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [showMegaMenu, setShowMegaMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [favoritosIds, setFavoritosIds] = useState<string[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [favoritoLoadingId, setFavoritoLoadingId] = useState<string | null>(null);
  let whatsappTooltipTimer: number | null = null;

  function handleWhatsappEnter() {
    if (typeof window === "undefined") return;
    whatsappTooltipTimer = window.setTimeout(() => {
      setShowWhatsappTooltip(true);
    }, 800);
  }

  function handleWhatsappLeave() {
    if (typeof window !== "undefined" && whatsappTooltipTimer) {
      window.clearTimeout(whatsappTooltipTimer);
    }
    setShowWhatsappTooltip(false);
  }
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showWhatsappTooltip, setShowWhatsappTooltip] = useState(false);
  const [depoimentoIndex, setDepoimentoIndex] = useState(0);
  const [showMiniCart, setShowMiniCart] = useState(false);
  const [vipModalOpen, setVipModalOpen] = useState(false);
  const [vipLoading, setVipLoading] = useState(false);
  const [vipSuccess, setVipSuccess] = useState(false);
  const [vipForm, setVipForm] = useState({
    nome: "",
    whatsapp: "",
    email: "",
    preferencia: "Masculino",
    estilo: "Intenso",
  });
  const [mounted, setMounted] = useState(false);
  const [debouncedBusca, setDebouncedBusca] = useState("");
  const [visibleProductsCount, setVisibleProductsCount] = useState(10);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedBusca(busca);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => setWindowWidth(window.innerWidth);
    const handleScroll = () => setScrolled(window.scrollY > 20);

    handleResize();
    handleScroll();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncCart = () => setSacola(getCartFromStorage());
    syncCart();

    window.addEventListener("storage", syncCart);
    window.addEventListener("focus", syncCart);

    return () => {
      window.removeEventListener("storage", syncCart);
      window.removeEventListener("focus", syncCart);
    };
  }, []);

  useEffect(() => {
    saveCartToStorage(sacola);
  }, [sacola]);


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (!user) {
        setClienteNome("");
        setFavoritosIds([]);
        return;
      }

      try {
        const ref = doc(db, "clientes", user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as ClienteSite;
          setClienteNome(data.nome || user.displayName || user.email?.split("@")[0] || "Cliente");
          setFavoritosIds(Array.isArray(data.favoritos) ? data.favoritos : []);
        } else {
          setClienteNome(user.displayName || user.email?.split("@")[0] || "Cliente");
          setFavoritosIds([]);
        }
      } catch {
        setClienteNome(user.displayName || user.email?.split("@")[0] || "Cliente");
        setFavoritosIds([]);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!headerMenuRef.current?.contains(event.target as Node)) {
        setShowMegaMenu(false);
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMegaMenu(false);
        setMobileMenuOpen(false);
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function carregarProdutos() {
      setLoadingProdutos(true);

      try {
        const q = query(productsCollection);
        const snapshot = await getDocs(q);

        if (cancelled) return;

        const arr: ProdutoFirebase[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as any;
          arr.push({
            id: d.id,
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
            imageUrl: data.imageUrl,
            ordemVitrine: data.ordemVitrine,
            ordem: data.ordem,
            posicao: data.posicao,
            position: data.position,
            destaque: data.destaque,
            tipo: data.tipo,
          });
        });

        setProdutos(arr);
      } catch (error) {
        console.error("Erro ao carregar produtos da Home:", error);
      } finally {
        if (!cancelled) setLoadingProdutos(false);
      }
    }

    carregarProdutos();

    return () => {
      cancelled = true;
    };
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1100;

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) {
      setVisibleProductsCount(6);
      return;
    }

    if (isTablet) {
      setVisibleProductsCount(8);
      return;
    }

    setVisibleProductsCount(10);
  }, [isMobile, isTablet, categoriaAtiva]);

  const produtosProntos = useMemo(() => {
    return produtos
      .map((produto) => {
        const estoque = Number(produto.estoque) || 0;
        const reservado = Number(produto.reservado) || 0;
        const disponivel = Math.max(0, estoque - reservado);
        const preco = Number(produto.precoVenda) || 0;

        return {
          ...produto,
          disponivel,
          precoFinal: preco,
          categoriaSite: categoriaSite(produto.categoria),
          imagemFinal: getImagemProduto(produto),
          tamanho: produto.volumeMl ? `${produto.volumeMl}ml` : "—",
          indisponivel: disponivel <= 0,
          isKit: ehKit(produto),
          isPromocao: ehPromocao(produto),
        };
      })
      .filter((produto) => produto.ativo !== false)
      .filter((produto) => produto.precoFinal > 0)
      .sort((a, b) => {
        // 1) Produtos disponíveis sempre primeiro; indisponíveis ficam no final
        if (a.indisponivel !== b.indisponivel) {
          return a.indisponivel ? 1 : -1;
        }

        // 2) Destaques primeiro, caso o campo exista no CRM/Firebase
        const destaqueA = a.destaque === true ? 1 : 0;
        const destaqueB = b.destaque === true ? 1 : 0;
        if (destaqueA !== destaqueB) return destaqueB - destaqueA;

        // 3) Ordem manual da vitrine, se existir: ordemVitrine, ordem, posicao ou position
        const ordemA = getProdutoOrdem(a);
        const ordemB = getProdutoOrdem(b);
        if (ordemA !== ordemB) return ordemA - ordemB;

        // 4) Mais novos primeiro, usando createdAt. Não usa updatedAt para não subir produto editado no CRM
        const criadoA = getProdutoTime(a.createdAt);
        const criadoB = getProdutoTime(b.createdAt);
        if (criadoA !== criadoB) return criadoB - criadoA;

        // 5) Fallback alfabético
        return String(a.nome || "").localeCompare(String(b.nome || ""));
      });
  }, [produtos]);

  const heroBanners = useMemo<HeroBanner[]>(() => {
    return [
      {
        id: "namorados-1",
        eyebrow: "Dia dos Namorados",
        title: "Prepare-se para\nsurpreender quem faz\nseu coração acelerar.",
        subtitle: "O Dia dos Namorados Maison Noor está chegando com fragrâncias inesquecíveis.",
        ctaLabel: "Escolher presente",
        ctaHref: "#produtos",
        image: "/banners/banner-namorados-maison-noor.jpg",
        align: "left",
        mobilePosition: "58% center",
      },
      {
        id: "colecao-2",
        eyebrow: "Coleção Maison Noor",
        title: "Fragrâncias que\nimpressionam.",
        subtitle: "Perfumes árabes selecionados para quem busca presença, elegância e personalidade.",
        ctaLabel: "Explorar coleção",
        ctaHref: "#produtos",
        image: "/banners/perfumes.jpg",
        align: "left",
        mobilePosition: "62% center",
      },
      {
        id: "compra-segura-3",
        eyebrow: "Compra segura",
        title: "Sofisticação com\natendimento VIP.",
        subtitle: "Escolha sua fragrância, adicione à sacola e finalize com segurança pelo checkout ou WhatsApp.",
        ctaLabel: "Comprar agora",
        ctaHref: "#produtos",
        image: "/banners/perfumes.png",
        align: "left",
        mobilePosition: "64% center",
      },
    ];
  }, []);

  useEffect(() => {
    if (heroBanners.length <= 1) return;

    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroBanners.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [heroBanners.length]);

  useEffect(() => {
    if (depoimentosMaisonNoor.length <= 1) return;
    const timer = window.setInterval(() => {
      setDepoimentoIndex((prev) => (prev + 1) % depoimentosMaisonNoor.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const produtosFiltrados = useMemo(() => {
    const termo = debouncedBusca.trim().toLowerCase();

    return produtosProntos.filter((produto) => {
      const bateBusca =
        !termo ||
        produto.nome.toLowerCase().includes(termo) ||
        String(produto.marca || "").toLowerCase().includes(termo) ||
        String(produto.categoriaSite || "").toLowerCase().includes(termo) ||
        String((produto as any).tipo || "").toLowerCase().includes(termo);

      let bateCategoria = false;

      const textoCategoriaLivre = `${produto.nome || ""} ${produto.marca || ""} ${produto.observacoes || ""} ${String((produto as any).tipo || "")}`.toLowerCase();

      if (categoriaAtiva === "Todos") bateCategoria = true;
      else if (categoriaAtiva === "Presentes") bateCategoria = produto.isKit;
      else if (categoriaAtiva === "Promoções") bateCategoria = produto.isPromocao;
      else if (categoriaAtiva === "Cremes") bateCategoria = textoCategoriaLivre.includes("creme") || textoCategoriaLivre.includes("body lotion") || textoCategoriaLivre.includes("hidratante");
      else if (categoriaAtiva === "Família Olfativa") bateCategoria = textoCategoriaLivre.includes("olfativa") || textoCategoriaLivre.includes("amadeir") || textoCategoriaLivre.includes("oriental") || textoCategoriaLivre.includes("floral") || textoCategoriaLivre.includes("cítrico") || textoCategoriaLivre.includes("citrico") || textoCategoriaLivre.includes("adocicado") || textoCategoriaLivre.includes("aquático") || textoCategoriaLivre.includes("aquatico") || textoCategoriaLivre.includes("ambar") || textoCategoriaLivre.includes("âmbar") || textoCategoriaLivre.includes("aromático") || textoCategoriaLivre.includes("aromatico");
      else bateCategoria = produto.categoriaSite === categoriaAtiva;

      return bateBusca && bateCategoria;
    });
  }, [debouncedBusca, categoriaAtiva, produtosProntos]);

  const produtosPresentes = useMemo(() => {
    return produtosProntos.filter((produto) => {
      const textoLivre = `${produto.nome || ""} ${produto.observacoes || ""}`.toLowerCase();
      return (
        produto.categoria === "kits-presente" ||
        produto.categoriaSite === "Kits Presente" ||
        produto.isKit ||
        textoLivre.includes("cesta") ||
        textoLivre.includes("dia das maes") ||
        textoLivre.includes("dia das mães")
      );
    });
  }, [produtosProntos]);


  const produtosVisiveis = useMemo(() => {
    return produtosFiltrados.slice(0, visibleProductsCount);
  }, [produtosFiltrados, visibleProductsCount]);

  const canShowMoreProdutos = produtosFiltrados.length > visibleProductsCount;


  function abrirProduto(produtoId: string) {
    if (typeof window === "undefined" || !produtoId) return;
    window.location.href = `/produto/${produtoId}`;
  }

  function scrollToSection(targetId: string) {
    if (typeof window === "undefined") return;

    const element = document.getElementById(targetId);
    if (!element) return;

    setShowMegaMenu(false);
    setMobileMenuOpen(false);

    const headerOffset = isMobile ? 112 : scrolled ? 108 : 168;
    const elementTop = element.getBoundingClientRect().top + window.scrollY;
    const finalTop = Math.max(0, elementTop - headerOffset);

    window.history.replaceState(null, "", `#${targetId}`);
    window.scrollTo({ top: finalTop, behavior: "smooth" });
  }

  function selecionarCategoria(categoria: string) {
    setCategoriaAtiva(categoria);
    setShowMegaMenu(false);
    setMobileMenuOpen(false);
    setTimeout(() => scrollToSection("produtos"), 40);
  }

  function adicionarSacola(produto: ProdutoCarrinho) {
    setSacola((prev) => {
      const next = [...prev, produto];
      saveCartToStorage(next);
      return next;
    });

    setShowMiniCart(true);

    if (typeof window !== "undefined") {
      window.setTimeout(() => setShowMiniCart(false), 2400);
    }
  }

  function removerDaSacola(index: number) {
    setSacola((prev) => {
      const next = prev.filter((_, i) => i !== index);
      saveCartToStorage(next);
      return next;
    });
  }

  function atualizarVipField(campo: "nome" | "whatsapp" | "email" | "preferencia" | "estilo", valor: string) {
    setVipForm((prev) => ({
      ...prev,
      [campo]: campo === "whatsapp" ? valor.replace(/[^\d()+\-\s]/g, "").slice(0, 20) : valor,
    }));
  }

  function abrirWhatsappVip() {
    if (typeof window === "undefined") return;

    const mensagem = encodeURIComponent(
      "Olá! Acabei de entrar para o Clube VIP Maison Noor ✨ Quero conhecer as fragrâncias disponíveis."
    );

    window.setTimeout(() => {
      window.open(`https://wa.me/5512982389658?text=${mensagem}`, "_blank");
    }, 900);
  }

  async function enviarCadastroVip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vipForm.nome.trim() || !vipForm.whatsapp.trim()) return;

    setVipLoading(true);

    const payload = {
      nome: vipForm.nome.trim(),
      whatsapp: vipForm.whatsapp.trim(),
      email: vipForm.email.trim(),
      preferencia: vipForm.preferencia,
      estilo: vipForm.estilo,
      origem: "site-maison-noor",
      createdAt: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    };

    try {
      await addDoc(clientesVipCollection, payload);

      if (typeof window !== "undefined") {
        const historico = JSON.parse(window.localStorage.getItem("maison_noor_clientes_vip_local") || "[]");
        historico.unshift({
          ...payload,
          createdAt: new Date().toISOString(),
        });
        window.localStorage.setItem("maison_noor_clientes_vip_local", JSON.stringify(historico.slice(0, 100)));
      }

      setVipSuccess(true);
      setVipForm({
        nome: "",
        whatsapp: "",
        email: "",
        preferencia: "Masculino",
        estilo: "Intenso",
      });

      abrirWhatsappVip();

      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          setVipModalOpen(false);
          setVipSuccess(false);
        }, 1800);
      }
    } catch (error) {
      if (typeof window !== "undefined") {
        const historico = JSON.parse(window.localStorage.getItem("maison_noor_clientes_vip_local") || "[]");
        historico.unshift({
          ...payload,
          createdAt: new Date().toISOString(),
          pendenteSync: true,
        });
        window.localStorage.setItem("maison_noor_clientes_vip_local", JSON.stringify(historico.slice(0, 100)));
      }
      setVipSuccess(true);
      abrirWhatsappVip();
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          setVipModalOpen(false);
          setVipSuccess(false);
        }, 1800);
      }
    } finally {
      setVipLoading(false);
    }
  }


  function getPrimeiroNome(nome: string) {
    return nome.trim().split(" ")[0] || "Cliente";
  }

  function ehFavorito(produtoId: string) {
    return favoritosIds.includes(produtoId);
  }

  async function toggleFavorito(produto: ProdutoFirebase) {
    if (!currentUser) {
      if (typeof window !== "undefined") {
        window.location.href = "/minha-conta";
      }
      return;
    }

    const produtoId = String(produto.id || "");
    if (!produtoId) return;

    setFavoritoLoadingId(produtoId);

    try {
      const ref = doc(db, "clientes", currentUser.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(ref, {
          uid: currentUser.uid,
          nome: clienteNome || currentUser.displayName || "",
          email: currentUser.email || "",
          telefone: "",
          tipo: "cliente",
          vip: false,
          favoritos: [produtoId],
          carrinho: [],
          createdAt: serverTimestamp(),
          ultimoLogin: serverTimestamp(),
        });
        setFavoritosIds([produtoId]);
      } else {
        const jaFavorito = favoritosIds.includes(produtoId);
        await updateDoc(ref, {
          favoritos: jaFavorito ? arrayRemove(produtoId) : arrayUnion(produtoId),
          ultimoLogin: serverTimestamp(),
        });
        setFavoritosIds((prev) =>
          prev.includes(produtoId)
            ? prev.filter((id) => id !== produtoId)
            : [...prev, produtoId]
        );
      }
    } finally {
      setFavoritoLoadingId(null);
    }
  }

  async function handleLogoutCliente() {
    setAccountMenuOpen(false);
    await signOut(auth);
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }

  function navegarHero(direcao: "anterior" | "proximo") {
    if (!heroBanners.length) return;

    if (direcao === "anterior") {
      setHeroIndex((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);
      return;
    }

    setHeroIndex((prev) => (prev + 1) % heroBanners.length);
  }

  const navItems: NavItem[] = [
    { label: "Início", targetId: "inicio", action: () => scrollToSection("inicio") },
    { label: "Produtos", targetId: "produtos", action: () => scrollToSection("produtos") },
    { label: "Maison Noor", targetId: "maison-noor", action: () => scrollToSection("maison-noor") },
  ];

  const quantidadeSacola = sacola.length;
  const totalSacola = sacola.reduce((acc, item) => acc + item.preco, 0);
  const heroAtual = heroBanners[heroIndex];

  return (
    <main id="inicio" style={styles.page}>
      
      <header
        style={{
          ...styles.headerShell,
          top: isMobile ? "8px" : scrolled ? "8px" : "14px",
          padding: isMobile ? "0 8px" : scrolled ? "0 14px" : "0 18px",
        }}
      >
        <div
          ref={headerMenuRef}
          style={{
            ...styles.header,
            ...(scrolled ? styles.headerScrolled : styles.headerAtTop),
            padding: isMobile
              ? "12px 12px 12px"
              : isTablet
              ? scrolled
                ? "12px 16px 12px"
                : "14px 16px 14px"
              : scrolled
              ? "9px 18px 9px"
              : "16px 22px 16px",
          }}
        >
          <div
            style={{
              ...styles.headerTopRow,
              gridTemplateColumns: isMobile ? "1fr auto" : "auto 1fr auto",
              gap: isMobile ? "12px" : "18px",
            }}
          >
            <div
              style={{
                ...styles.brandBlock,
                justifyContent: isMobile ? "flex-start" : "flex-start",
                minWidth: isMobile ? undefined : "270px",
              }}
            >
              <Image
                src="/logo-maison-noor.png"
                alt="Maison Noor"
                width={82}
                height={82}
                priority
                sizes="(max-width: 767px) 62px, (max-width: 1100px) 72px, 82px"
                style={{
                  ...styles.logoImage,
                  height: isMobile ? (scrolled ? "52px" : "62px") : scrolled ? "58px" : "82px",
                  width: isMobile ? (scrolled ? "52px" : "62px") : scrolled ? "58px" : "82px",
                }}
              />

              <div style={styles.brandTextWrap}>
                <span style={styles.brandKicker}>Maison Noor</span>
                <span
                  style={{
                    ...styles.brandTitle,
                    fontSize: isMobile ? (scrolled ? "18px" : "20px") : scrolled ? "20px" : "25px",
                  }}
                >
                  Parfums
                </span>
                {!isMobile && !scrolled && (
                  <span style={styles.brandSubline}>Curadoria premium em perfumes árabes</span>
                )}
              </div>
            </div>

            {!isMobile && (
              <nav style={styles.desktopNav} aria-label="Navegação principal">
                {navItems.map((item) => {
                  if (item.href) {
                    return (
                      <a key={item.label} href={item.href} style={styles.desktopNavLink}>
                        {item.label}
                      </a>
                    );
                  }

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.action}
                      style={styles.desktopNavButton}
                    >
                      {item.label}
                    </button>
                  );
                })}

                <div style={styles.dropdownWrap}>
                  <button
                    type="button"
                    onClick={() => setShowMegaMenu((prev) => !prev)}
                    style={{
                      ...styles.dropdownTrigger,
                      ...(showMegaMenu ? styles.dropdownTriggerActive : {}),
                    }}
                    aria-expanded={showMegaMenu}
                    aria-haspopup="true"
                  >
                    Categorias
                    <span
                      style={{
                        ...styles.dropdownCaret,
                        transform: showMegaMenu ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      ▾
                    </span>
                  </button>

                  {showMegaMenu && (
                    <div style={styles.dropdownPanel}>
                      <div style={styles.dropdownPanelHeader}>
                        <span style={styles.dropdownKicker}>Explorar categorias</span>
                        <span style={styles.dropdownText}>Selecione uma coleção para ir direto aos perfumes.</span>
                      </div>

                      <div style={styles.megaMenuGrid}>
                        {categorias.map((categoria) => {
                          const ativa = categoriaAtiva === categoria;
                          return (
                            <button
                              key={categoria}
                              type="button"
                              onClick={() => selecionarCategoria(categoria)}
                              style={{
                                ...styles.megaMenuItem,
                                ...(categoria === "Presentes" ? styles.megaMenuGiftItem : {}),
                                ...(ativa ? styles.megaMenuItemActive : {}),
                              }}
                            >
                              <span style={{
                                ...styles.megaMenuItemTitle,
                                ...(categoria === "Presentes" ? styles.megaMenuGiftTitle : {}),
                              }}>{categoria === "Presentes" ? "🎁 Presentes" : categoria}</span>
                              <span style={{
                                ...styles.megaMenuItemText,
                                ...(categoria === "Presentes" ? styles.megaMenuGiftText : {}),
                              }}>{categoriaDescricao(categoria)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </nav>
            )}

            <div style={styles.headerActionsRight}>
              {!isMobile && (
                <div style={styles.headerSocials}>
                  <a
                    href="https://instagram.com/maison.noor.parfums"
                    target="_blank"
                    rel="noreferrer"
                    style={styles.iconLink}
                    aria-label="Instagram"
                    title="Instagram"
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                    </svg>
                  </a>
                </div>
              )}

              {!isMobile && (
                <a href="/minha-conta" style={{ ...styles.cartBadge, ...(favoritosIds.length > 0 ? styles.cartBadgeActive : {}) }} title="Favoritos">
                  <span style={styles.favoriteHeart}>♥</span>
                  <span style={styles.cartCount} suppressHydrationWarning>{mounted ? favoritosIds.length : 0}</span>
                </a>
              )}

              <button type="button" onClick={() => setShowMiniCart((prev) => !prev)} style={{ ...styles.cartBadge, ...(quantidadeSacola > 0 ? styles.cartBadgeActive : {}) }} title="Sacola">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.cartIcon}>
                  <path d="M6 7h12l-1 11H7L6 7Z" />
                  <path d="M9 7a3 3 0 0 1 6 0" />
                </svg>
                <span style={styles.cartCount} suppressHydrationWarning>{mounted ? quantidadeSacola : 0}</span>
              </button>

              {!isMobile && (
                currentUser ? (
                  <div style={styles.accountMenuWrap}>
                    <button
                      type="button"
                      onClick={() => setAccountMenuOpen((prev) => !prev)}
                      style={{
                        ...styles.accountButton,
                        ...(accountMenuOpen ? styles.accountButtonActive : {}),
                      }}
                    >
                      Olá, {mounted ? getPrimeiroNome(clienteNome || "Cliente") : "Cliente"} <span style={styles.dropdownCaret}>▾</span>
                    </button>

                    {accountMenuOpen && (
                      <div style={styles.accountDropdown}>
                        <a href="/minha-conta" style={styles.accountDropdownLink}>Minha conta</a>
                        <a href="/minha-conta" style={styles.accountDropdownLink}>Favoritos ({mounted ? favoritosIds.length : 0})</a>
                        <button type="button" onClick={handleLogoutCliente} style={styles.accountDropdownButton}>Sair</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <a href="/minha-conta" style={styles.loginLink}>
                    Entrar
                  </a>
                )
              )}

              {isMobile ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen((prev) => !prev);
                    setShowMegaMenu(false);
                    setAccountMenuOpen(false);
                  }}
                  style={{
                    ...styles.mobileMenuButton,
                    ...(mobileMenuOpen ? styles.mobileMenuButtonActive : {}),
                  }}
                  aria-label="Abrir menu"
                  aria-expanded={mobileMenuOpen}
                >
                  ☰
                </button>
              ) : null}
            </div>
          </div>

          <div
            style={{
              ...styles.searchWrap,
              ...(scrolled && !isMobile ? styles.searchWrapCollapsed : {}),
              marginTop: isMobile ? "12px" : scrolled ? "6px" : "14px",
            }}
          >
            <input
              type="text"
              placeholder="Buscar perfume, categoria ou tipo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{
                ...styles.searchInput,
                fontSize: isMobile ? "15px" : "16px",
                height: scrolled && !isMobile ? "44px" : "54px",
              }}
            />
            <span style={styles.searchIcon}>⌕</span>
          </div>

          {isMobile && mobileMenuOpen && (
            <div style={styles.mobileMenuPanel}>
              <div style={styles.mobileMenuLinks}>
                {navItems.map((item) =>
                  item.href ? (
                    <a
                      key={item.label}
                      href={item.href}
                      style={styles.mobileMenuLink}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        item.action?.();
                        setMobileMenuOpen(false);
                      }}
                      style={styles.mobileMenuAction}
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>

              <div style={styles.mobileMenuSection}>
                <div style={styles.mobileMenuTitle}>Categorias</div>
                <div style={styles.mobileCategoryGrid}>
                  {categorias.map((categoria) => {
                    const ativa = categoriaAtiva === categoria;
                    return (
                      <button
                        key={categoria}
                        onClick={() => {
                          selecionarCategoria(categoria);
                          setMobileMenuOpen(false);
                        }}
                        style={{
                          ...styles.categoryButton,
                          ...(ativa ? styles.categoryButtonActive : {}),
                          fontSize: "12px",
                          padding: "10px 12px",
                        }}
                      >
                        {categoria}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={styles.mobileAccountPanel}>
                <div style={styles.mobileAccountTitle}>
                  {currentUser ? `Olá, ${mounted ? getPrimeiroNome(clienteNome || "Cliente") : "Cliente"}` : "Área do cliente"}
                </div>
                <div style={styles.mobileAccountActions}>
                  <a href="/minha-conta" style={styles.mobileSocialLink}>
                    {currentUser ? "Minha conta" : "Entrar"}
                  </a>
                  {currentUser ? (
                    <button type="button" onClick={handleLogoutCliente} style={styles.mobileMenuAction}>
                      Sair
                    </button>
                  ) : (
                    <a href="/login" style={styles.mobileSocialLink}>
                      CRM
                    </a>
                  )}
                </div>
              </div>

              <div style={styles.mobileMenuFooter}>
                <a
                  href="https://instagram.com/maison.noor.parfums"
                  target="_blank"
                  rel="noreferrer"
                  style={styles.mobileSocialLink}
                >
                  Instagram
                </a>
                <a
                  href="https://wa.me/5512982389658"
                  target="_blank"
                  rel="noreferrer"
                  style={styles.mobileSocialLink}
                >
                  WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      <section
        style={{
          ...styles.heroSection,
          padding: isMobile
            ? "188px 14px 18px"
            : isTablet
            ? "214px 20px 22px"
            : scrolled
            ? "132px 28px 24px"
            : "238px 28px 24px",
        }}
      >
        <div style={styles.heroCarouselWrap}>

          <button
            type="button"
            onClick={() => navegarHero("anterior")}
            style={{
              ...styles.heroArrow,
              left: isMobile ? "10px" : "18px",
              width: isMobile ? "42px" : "48px",
              height: isMobile ? "42px" : "48px",
              fontSize: isMobile ? "24px" : "28px",
            }}
            aria-label="Slide anterior"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={() => navegarHero("proximo")}
            style={{
              ...styles.heroArrow,
              right: isMobile ? "10px" : "18px",
              width: isMobile ? "42px" : "48px",
              height: isMobile ? "42px" : "48px",
              fontSize: isMobile ? "24px" : "28px",
            }}
            aria-label="Próximo slide"
          >
            ›
          </button>

          <div
            style={{
              ...styles.heroBanner,
              minHeight: isMobile ? "350px" : "360px",
              padding: isMobile ? "30px 50px 28px" : "40px 30px",
              borderRadius: isMobile ? "24px" : "28px",
              alignItems: heroAtual?.align === "center" ? "center" : "flex-start",
              textAlign: heroAtual?.align === "center" ? "center" : "left",
              justifyContent: "flex-start",
              backgroundPosition: isMobile
                ? heroAtual?.mobilePosition || "center center"
                : "center center",
              backgroundImage: heroAtual?.image
                ? isMobile
                  ? `linear-gradient(90deg, rgba(12,10,8,0.90) 0%, rgba(12,10,8,0.70) 48%, rgba(12,10,8,0.22) 100%), url(${heroAtual.image})`
                  : `linear-gradient(90deg, rgba(12,10,8,0.84) 0%, rgba(12,10,8,0.56) 34%, rgba(12,10,8,0.18) 100%), url(${heroAtual.image})`
                : undefined,
              animation: isMobile ? undefined : "maisonHeroZoom 9s ease-in-out infinite alternate",
            }}
          >
            <div
              style={{
                ...styles.heroOverlayContent,
                maxWidth: isMobile ? "100%" : "620px",
                paddingLeft: isMobile ? 0 : "26px",
                animation: "maisonFadeUp 0.8s ease",
              }}
            >
              <p style={styles.heroEyebrow}>{heroAtual?.eyebrow}</p>
              <h1
                style={{
                  ...styles.heroTitle,
                  fontSize: isMobile ? "27px" : isTablet ? "34px" : "42px",
                  maxWidth: isMobile ? "280px" : "620px",
                  lineHeight: isMobile ? 1.08 : 1.06,
                }}
              >
                {(heroAtual?.title || "").split("\n").map((line, index) => (
                  <span key={index} style={{ display: "block" }}>
                    {line}
                  </span>
                ))}
              </h1>

              <p
                style={{
                  ...styles.heroSubtitle,
                  fontSize: isMobile ? "13px" : "15px",
                  maxWidth: isMobile ? "270px" : "520px",
                  marginTop: "8px",
                  lineHeight: isMobile ? 1.45 : 1.6,
                }}
              >
                {heroAtual?.subtitle}
              </p>

              <div style={styles.heroBannerActions}>
                <a
                  href={heroAtual?.ctaHref || "#produtos"}
                  style={{
                    ...styles.heroPrimaryButton,
                    ...(isMobile
                      ? {
                          minWidth: "220px",
                          maxWidth: "100%",
                          padding: "13px 18px",
                          fontSize: "15px",
                          borderRadius: "14px",
                        }
                      : {}),
                  }}
                >
                  {heroAtual?.ctaLabel || "Ver coleção"}
                </a>
                {!isMobile && (
                  <a href="#produtos" style={styles.heroSecondaryButton}>
                    Ver seleção completa
                  </a>
                )}
              </div>
            </div>
          </div>

          <div style={styles.heroDots}>
            {heroBanners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => setHeroIndex(index)}
                style={{
                  ...styles.heroDot,
                  ...(heroIndex === index ? styles.heroDotActive : {}),
                }}
                aria-label={`Ir para banner ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          ...styles.trustStripSection,
          padding: isMobile ? "0 14px 24px" : isTablet ? "0 20px 28px" : "0 28px 30px",
        }}
      >
        <div
          style={{
            ...styles.trustStrip,
            gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: isMobile ? "10px" : "14px",
          }}
        >
          {trustBadges.map((badge) => (
            <div key={badge.title} style={styles.trustBadgeCard}>
              <span style={styles.trustBadgeIcon}>{badge.icon}</span>
              <div>
                <strong style={styles.trustBadgeTitle}>{badge.title}</strong>
                <p style={styles.trustBadgeText}>{badge.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          ...styles.comingSoonSection,
          padding: isMobile ? "0 14px 18px" : isTablet ? "0 20px 22px" : "0 28px 26px",
        }}
      >
        <div
          style={{
            ...styles.comingSoonCard,
            padding: isMobile ? "18px 18px" : isTablet ? "20px 26px" : "22px 30px",
          }}
        >
          <div style={styles.comingSoonGlowOne} />
          <div style={styles.comingSoonGlowTwo} />

          <div
            style={{
              ...styles.comingSoonContent,
              maxWidth: isMobile ? "100%" : "760px",
            }}
          >
            <p style={styles.comingSoonKicker}>Em breve na Maison Noor</p>
            <h2
              style={{
                ...styles.comingSoonTitle,
                fontSize: isMobile ? "22px" : isTablet ? "26px" : "30px",
              }}
            >
              Novas fragrâncias exclusivas estão chegando.
            </h2>
            <p
              style={{
                ...styles.comingSoonText,
                fontSize: isMobile ? "13px" : "14px",
              }}
            >
              Seleções árabes premium escolhidas para surpreender quem busca presença,
              sofisticação e autenticidade. Prepare-se para novidades especiais na Maison Noor.
            </p>

            {!isMobile && (
              <span style={styles.comingSoonNote}>
                Coleções selecionadas • Curadoria premium • Atendimento VIP
              </span>
            )}
          </div>
        </div>
      </section>

      {false && produtosPresentes.length > 0 && (
        <section
          id="presentes"
          style={{
            ...styles.deferSection,
            ...styles.section,
            padding: isMobile
              ? "18px 14px 32px"
              : isTablet
              ? "20px 20px 38px"
              : "24px 28px 44px",
          }}
        >
          <div style={styles.presentesSectionCard}>
            <div
              style={{
                ...styles.sectionHeaderPremium,
                marginBottom: isMobile ? "18px" : "22px",
              }}
            >
              <div>
                <p style={styles.kicker}>Especial Dia dos Namorados</p>
                <h2
                  style={{
                    ...styles.sectionTitle,
                    fontSize: isMobile ? "24px" : isTablet ? "28px" : "32px",
                    marginBottom: "6px",
                  }}
                >
                  Fragrâncias para marcar momentos inesquecíveis
                </h2>
                <p style={styles.presentesSubtitle}>
                  Presentes sofisticados para transformar o Dia dos Namorados em uma lembrança inesquecível.
                </p>
              </div>

              {!isMobile && (
                <button
                  type="button"
                  onClick={() => selecionarCategoria("Presentes")}
                  style={styles.presentesViewAllButton}
                >
                  Ver presentes especiais
                </button>
              )}
            </div>

            <div
              style={{
                ...styles.grid,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : isTablet
                  ? "repeat(2, 1fr)"
                  : "repeat(4, 1fr)",
                gap: isMobile ? "16px" : "20px",
              }}
            >
              {produtosPresentes.slice(0, isMobile ? 4 : 8).map((produto, index) => (
                <article
                  key={`presente-${produto.id}`}
                  style={{
                    ...styles.card,
                    ...(produto.indisponivel ? styles.cardUnavailable : {}),
                    cursor: "pointer",
                  }}
                  onClick={() => abrirProduto(produto.id)}
                  onMouseEnter={(e) => {
                    if (isMobile) return;
                    e.currentTarget.style.transform = "translateY(-8px)";
                    e.currentTarget.style.boxShadow = "0 24px 46px rgba(80, 48, 32, 0.14)";
                    e.currentTarget.style.borderColor = "#D5A65E";
                    const img = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                    if (img) img.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (isMobile) return;
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 16px 34px rgba(48,34,20,0.08)";
                    e.currentTarget.style.borderColor = produto.indisponivel ? "#E7D8D0" : "#EADBC8";
                    const img = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                    if (img) img.style.transform = "scale(1)";
                  }}
                >
                  <Link href={`/produto/${produto.id}`} style={styles.productImageLink}>
                    <div
                      style={{
                        ...styles.cardImageWrap,
                        height: isMobile ? "180px" : "170px",
                      }}
                    >
                      <span style={styles.presentesBadge}>Edição romântica</span>

                      <img
                  decoding="async"
                        src={produto.imagemFinal}
                        loading="lazy"
                        alt={produto.nome}
                        style={{
                          ...styles.cardImage,
                          ...(produto.indisponivel ? styles.cardImageUnavailable : {}),
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/produtos/hero-perfume.png";
                        }}
                      />
                    </div>
                  </Link>

                  <div style={styles.cardContent}>
                    <div style={styles.cardTopBlock}>
                      <p style={styles.cardBrand}>Seleção Romântica Maison Noor</p>

                      <Link href={`/produto/${produto.id}`} style={styles.productTitleLink}>
                        <h3
                          style={{
                            ...styles.cardTitle,
                            fontSize: isMobile ? "18px" : "16px",
                            minHeight: isMobile ? "auto" : "50px",
                          }}
                        >
                          {produto.nome}
                        </h3>
                      </Link>

                      <p style={styles.presentesDescription}>
                        Seleção especial Maison Noor para surpreender no Dia dos Namorados com elegância e presença.
                      </p>

                      {produto.indisponivel && <p style={styles.unavailableBadge}>Indisponível</p>}
                    </div>

                    <div style={styles.cardPriceBlock}>
                      <p style={styles.cardPrice}>{formatarMoeda(produto.precoFinal)}</p>
                      <p style={styles.cardTrust}>Presente sofisticado • Curadoria Maison Noor ✨</p>
                    </div>

                    <div style={styles.cardActions}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!produto.indisponivel) {
                            adicionarSacola({
                              id: produto.id,
                              nome: produto.nome,
                              preco: produto.precoFinal,
                              imagem: produto.imagemFinal,
                              tamanho: produto.tamanho,
                            });
                          }
                        }}
                        style={{
                          ...styles.addToCartButton,
                          ...(produto.indisponivel ? styles.disabledButton : {}),
                        }}
                        disabled={produto.indisponivel}
                      >
                        {produto.indisponivel ? "Indisponível" : "Escolher presente"}
                      </button>

                      <a
                        href={`https://wa.me/5512982389658?text=${encodeURIComponent(
                          `Olá! Tenho interesse no presente ${produto.nome} 😍

Vi no site da Maison Noor e gostaria de atendimento VIP para escolher esse presente de Dia dos Namorados.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={styles.cardButton}
                      >
                        Atendimento VIP
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {isMobile && (
              <div style={styles.presentesMobileActions}>
                <button
                  type="button"
                  onClick={() => selecionarCategoria("Presentes")}
                  style={styles.presentesViewAllButton}
                >
                  Ver presentes especiais
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <section
        id="produtos"
        style={{
          ...styles.section,
          padding: isMobile
            ? "22px 14px 34px"
            : isTablet
            ? "24px 20px 38px"
            : "26px 28px 40px",
        }}
      >
        <div style={styles.sectionHeaderPremium}>
          <div>
            <p style={styles.kicker}>Seleção especial</p>
            <h2
              style={{
                ...styles.sectionTitle,
                fontSize: isMobile ? "26px" : isTablet ? "28px" : "32px",
                marginBottom: "4px",
              }}
            >
              Perfumes em destaque
            </h2>
            <p style={styles.sectionSupportText}>
              Escolha sua fragrância, adicione à sacola e finalize com atendimento seguro da Maison Noor.
            </p>
          </div>
          {!isMobile && (
            <div style={styles.selectionInfoCard}>
              <span style={styles.selectionInfoLabel}>Categoria ativa</span>
              <strong style={styles.selectionInfoValue}>{categoriaAtiva}</strong>
            </div>
          )}
        </div>

        {loadingProdutos && <div style={styles.emptyState}>Carregando produtos do CRM...</div>}

        {!loadingProdutos && (busca.trim() || categoriaAtiva !== "Todos") && (
          <p style={styles.searchResultText}>
            {debouncedBusca.trim() ? (
              <>
                Resultados para: <strong>{debouncedBusca}</strong>
              </>
            ) : (
              <>
                Categoria ativa: <strong>{categoriaAtiva}</strong>
              </>
            )}
          </p>
        )}

                {!loadingProdutos && (
          <div
            style={{
              ...styles.grid,
              gridTemplateColumns: isMobile
                ? "1fr"
                : isTablet
                ? "repeat(2, 1fr)"
                : "repeat(5, 1fr)",
              gap: isMobile ? "16px" : "22px",
            }}
          >
            {produtosVisiveis.map((produto, index) => {
              return (
                <article
                  key={produto.id}
                  style={{
                    ...styles.card,
                    ...(produto.indisponivel ? styles.cardUnavailable : {}),
                    cursor: "pointer",
                  }}
                  onClick={() => abrirProduto(produto.id)}
                  onMouseEnter={(e) => {
                    if (isMobile) return;
                    e.currentTarget.style.transform = "translateY(-10px)";
                    e.currentTarget.style.boxShadow = "0 28px 50px rgba(48,34,20,0.12)";
                    e.currentTarget.style.borderColor = "#D9BE93";
                    const img = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                    if (img) img.style.transform = "scale(1.06)";
                    const cta = e.currentTarget.querySelector('[data-cta="whatsapp"]') as HTMLElement | null;
                    if (cta) {
                      cta.style.transform = "translateY(-1px)";
                      cta.style.filter = "brightness(1.02)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isMobile) return;
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 12px 28px rgba(48,34,20,0.07)";
                    e.currentTarget.style.borderColor = produto.indisponivel ? "#E7D8D0" : "#EEE2D3";
                    const img = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                    if (img) img.style.transform = "scale(1)";
                    const cta = e.currentTarget.querySelector('[data-cta="whatsapp"]') as HTMLElement | null;
                    if (cta) {
                      cta.style.transform = "translateY(0)";
                      cta.style.filter = "brightness(1)";
                    }
                  }}
                >
                  <Link href={`/produto/${produto.id}`} style={styles.productImageLink}>
                    <div
                      style={{
                        ...styles.cardImageWrap,
                        height: isMobile ? "180px" : "170px",
                      }}
                    >
                      {getBadgeProduto(produto, index) ? (
                        <span style={styles.productBadge}>{getBadgeProduto(produto, index)}</span>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorito(produto);
                        }}
                        style={{
                          ...styles.favoriteButton,
                          ...(ehFavorito(produto.id) ? styles.favoriteButtonActive : {}),
                          ...(favoritoLoadingId === produto.id ? styles.favoriteButtonLoading : {}),
                        }}
                        aria-label={ehFavorito(produto.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        title={currentUser ? (ehFavorito(produto.id) ? "Remover dos favoritos" : "Adicionar aos favoritos") : "Entrar para salvar favorito"}
                      >
                        {ehFavorito(produto.id) ? "♥" : "♡"}
                      </button>

                      <img
                  decoding="async"
                        src={produto.imagemFinal}
                        loading="lazy"
                        alt={produto.nome}
                        style={{
                          ...styles.cardImage,
                          ...(produto.indisponivel ? styles.cardImageUnavailable : {}),
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/produtos/hero-perfume.png";
                        }}
                      />
                    </div>
                  </Link>

                  <div style={styles.cardContent}>
                    <div style={styles.cardTopBlock}>
                      <p style={styles.cardBrand}>
                        {String((produto as any).tipo || produto.marca || "Eau de Parfum")}
                      </p>

                      <Link href={`/produto/${produto.id}`} style={styles.productTitleLink}>
                        <h3
                          style={{
                            ...styles.cardTitle,
                            fontSize: isMobile ? "18px" : "16px",
                            minHeight: isMobile ? "auto" : "50px",
                          }}
                        >
                          {produto.nome}
                        </h3>
                      </Link>

                      <p style={styles.cardSize}>{produto.tamanho}</p>
                      <p style={styles.cardMood}>{getCardEssencia(produto)}</p>

                      {produto.indisponivel && <p style={styles.unavailableBadge}>Indisponível</p>}
                    </div>

                    <div style={styles.cardPriceBlock}>
                      <p style={styles.cardPrice}>{formatarMoeda(produto.precoFinal)}</p>

                      
                      <p style={styles.cardTrust}>
                        Original • Envio rápido • Atendimento VIP
                      </p>
                    </div>

                    <div style={styles.cardActions}>
                      <button
                      onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!produto.indisponivel) {
                            adicionarSacola({
                              id: produto.id,
                              nome: produto.nome,
                              preco: produto.precoFinal,
                              imagem: produto.imagemFinal,
                              tamanho: produto.tamanho,
                            });
                          }
                        }}
                        style={{
                          ...styles.addToCartButton,
                          ...(produto.indisponivel ? styles.disabledButton : {}),
                        }}
                        disabled={produto.indisponivel}
                      >
                        {produto.indisponivel ? "Indisponível" : "Adicionar à sacola"}
                      </button>

                      <a
                        href={
                          produto.indisponivel
                            ? `https://wa.me/5512982389658?text=${encodeURIComponent(
                                `Olá! Tenho interesse no produto ${produto.nome}, mas vi que ele está indisponível no site. Pode me avisar sobre reposição ou alternativas?`
                              )}`
                            : `https://wa.me/5512982389658?text=${encodeURIComponent(
                                `Olá! Quero comprar o perfume ${produto.nome} 😍

Vi no site e fiquei interessado.
Valor: ${formatarMoeda(produto.precoFinal)}
Pode me passar as opções de pagamento?`
                              )}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        data-cta="whatsapp"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          ...styles.cardButton,
                          ...(produto.indisponivel ? styles.unavailableWhatsButton : {}),
                        }}
                      >
                        {produto.indisponivel ? "Consultar disponibilidade" : "Comprar com atendimento"}
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loadingProdutos && canShowMoreProdutos && (
          <div style={styles.loadMoreWrap}>
            <button
              type="button"
              onClick={() =>
                setVisibleProductsCount((prev) => prev + (isMobile ? 4 : isTablet ? 4 : 5))
              }
              style={styles.loadMoreButton}
            >
              Ver mais produtos
            </button>
            <p style={styles.loadMoreHint}>
              Carregamos poucos produtos por vez para manter a experiência mais leve no celular.
            </p>
          </div>
        )}

        {!loadingProdutos && produtosFiltrados.length === 0 && (
          <div style={styles.emptyState}>Nenhum produto encontrado.</div>
        )}
      </section>

      <section
        style={{
          ...styles.vipSection,
          padding: isMobile ? "0 14px 34px" : isTablet ? "0 20px 38px" : "0 28px 42px",
        }}
      >
        <div
          style={{
            ...styles.vipCard,
            gridTemplateColumns: isMobile ? "1fr" : "1.12fr 0.88fr",
            gap: isMobile ? "20px" : "28px",
            padding: isMobile ? "24px" : "34px",
          }}
        >
          <div style={styles.vipContent}>
            <p style={styles.kicker}>Clube Maison Noor</p>
            <h2
              style={{
                ...styles.sectionTitle,
                color: "#F7E9D4",
                fontSize: isMobile ? "26px" : isTablet ? "29px" : "32px",
                marginBottom: "10px",
              }}
            >
              Cadastre-se e entre para a lista VIP Maison Noor
            </h2>
            <p style={styles.vipText}>
              Receba novidades, reposição dos perfumes mais desejados, ofertas especiais e atendimento prioritário direto da Maison Noor.
            </p>

            <div
              style={{
                ...styles.vipBenefitGrid,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              }}
            >
              <div style={styles.vipBenefitItem}>✦ Aviso de reposição dos perfumes desejados</div>
              <div style={styles.vipBenefitItem}>⌁ Ofertas VIP e seleções especiais</div>
              <div style={styles.vipBenefitItem}>◈ Atendimento prioritário no WhatsApp</div>
              <div style={styles.vipBenefitItem}>✺ Curadoria por perfil olfativo</div>
            </div>
          </div>

          <div style={styles.vipAside}>
            <div style={styles.vipAsideCard}>
              <span style={styles.vipAsideKicker}>Acesso premium</span>
              <strong style={styles.vipAsideTitle}>Entre para o Clube VIP</strong>
              <p style={styles.vipAsideText}>
                Cadastro rápido, elegante e sem atrito. Você compra normalmente e ainda entra para a base VIP da Maison Noor.
              </p>

              <button
                type="button"
                onClick={() => {
                  setVipSuccess(false);
                  setVipModalOpen(true);
                }}
                style={styles.vipPrimaryButton}
              >
                Ganhar acesso VIP
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          ...styles.recommendSection,
          padding: isMobile ? "0 14px 34px" : isTablet ? "0 20px 38px" : "0 28px 42px",
        }}
      >
        <div style={styles.recommendHeader}>
          <div>
            <p style={styles.kicker}>Sugestão Maison Noor</p>
            <h2
              style={{
                ...styles.sectionTitle,
                fontSize: isMobile ? "24px" : isTablet ? "27px" : "30px",
                marginBottom: "6px",
              }}
            >
              Você também pode gostar
            </h2>
            <p style={styles.recommendText}>
              Uma seleção pensada para quem busca presença, sofisticação e assinatura olfativa marcante.
            </p>
          </div>
        </div>

        <div
          style={{
            ...styles.recommendGrid,
            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          }}
        >
          {produtosProntos.slice(0, 3).map((produto) => (
            <Link key={`reco-${produto.id}`} href={`/produto/${produto.id}`} style={styles.recommendCard}>
              <div style={styles.recommendImageWrap}>
                <img
                  decoding="async"
                  src={produto.imagemFinal}
                  loading="lazy"

                  alt={produto.nome}
                  style={styles.recommendImage}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/produtos/hero-perfume.png";
                  }}
                />
              </div>
              <div style={styles.recommendContent}>
                <span style={styles.recommendEyebrow}>{produto.categoriaSite}</span>
                <strong style={styles.recommendTitle}>{produto.nome}</strong>
                <span style={styles.recommendPrice}>{formatarMoeda(produto.precoFinal)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section
        style={{
          ...styles.testimonialSection,
          padding: isMobile ? "0 14px 34px" : isTablet ? "0 20px 38px" : "0 28px 42px",
        }}
      >
        <div style={styles.testimonialCard}>
          <div style={styles.testimonialHeader}>
            <div>
              <p style={styles.kicker}>Confiança Maison Noor</p>
              <h2
                style={{
                  ...styles.sectionTitle,
                  fontSize: isMobile ? "24px" : isTablet ? "27px" : "30px",
                  marginBottom: "6px",
                }}
              >
                O que clientes valorizam na experiência
              </h2>
            </div>
            {!isMobile && (
              <div style={styles.testimonialDots}>
                {depoimentosMaisonNoor.map((_, index) => (
                  <button
                    key={`depoimento-dot-${index}`}
                    type="button"
                    onClick={() => setDepoimentoIndex(index)}
                    style={{
                      ...styles.testimonialDot,
                      ...(depoimentoIndex === index ? styles.testimonialDotActive : {}),
                    }}
                    aria-label={`Ir para depoimento ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={styles.testimonialBody}>
            <div style={styles.testimonialQuoteMark}>“</div>
            <p style={styles.testimonialText}>{depoimentosMaisonNoor[depoimentoIndex].frase}</p>
            <strong style={styles.testimonialAuthor}>{depoimentosMaisonNoor[depoimentoIndex].nome}</strong>
          </div>
        </div>
      </section>

      <section
        id="maison-noor"
        style={{
          ...styles.aboutSection,
          padding: isMobile ? "0 14px 34px" : isTablet ? "0 20px 38px" : "0 28px 40px",
        }}
      >
        <div
          style={{
            ...styles.aboutCard,
            padding: isMobile ? "24px" : "34px",
          }}
        >
          <p style={styles.kicker}>Maison Noor</p>
          <h2
            style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? "25px" : isTablet ? "28px" : "30px",
            }}
          >
            A essência do luxo em cada fragrância
          </h2>
          <p style={styles.sectionText}>
            Trabalhamos com perfumes árabes importados selecionados para quem valoriza identidade,
            sofisticação e presença. Uma experiência elegante do primeiro clique ao atendimento final.
          </p>
        </div>
      </section>

      <section
        style={{
          ...styles.footerHighlights,
          padding: isMobile ? "0 14px 20px" : isTablet ? "0 20px 22px" : "0 28px 24px",
        }}
      >
        <div
          style={{
            ...styles.footerHighlightsInner,
            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          }}
        >
          <div style={styles.footerHighlightCard}>
            <span style={styles.footerHighlightIcon}>✦</span>
            <div>
              <strong style={styles.footerHighlightTitle}>Produtos originais</strong>
              <p style={styles.footerHighlightText}>Curadoria premium com seleção elegante e atendimento próximo.</p>
            </div>
          </div>
          <div style={styles.footerHighlightCard}>
            <span style={styles.footerHighlightIcon}>⌁</span>
            <div>
              <strong style={styles.footerHighlightTitle}>Atendimento rápido</strong>
              <p style={styles.footerHighlightText}>Compra consultiva pelo WhatsApp com suporte direto da Maison Noor.</p>
            </div>
          </div>
          <div style={styles.footerHighlightCard}>
            <span style={styles.footerHighlightIcon}>◈</span>
            <div>
              <strong style={styles.footerHighlightTitle}>Pagamento facilitado</strong>
              <p style={styles.footerHighlightText}>Pix e Cartão com atendimento seguro e fechamento facilitado.</p>
            </div>
          </div>
                  <div style={styles.footerHighlightCard}>
            <span style={styles.footerHighlightIcon}>✺</span>
            <div>
              <strong style={styles.footerHighlightTitle}>Experiência de presente</strong>
              <p style={styles.footerHighlightText}>Embalagem elegante, seleção refinada e curadoria pensada para impressionar.</p>
            </div>
          </div>
        </div>
      </section>

      <footer style={styles.footer}>
        <div
          style={{
            ...styles.footerInner,
            padding: isMobile ? "34px 14px 24px" : isTablet ? "38px 20px 26px" : "42px 28px 28px",
            gap: isMobile ? "26px" : "30px",
          }}
        >
          <div
            style={{
              ...styles.footerTop,
              gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1.25fr 0.9fr 0.9fr 0.95fr",
              gap: isMobile ? "22px" : "28px",
            }}
          >
            <div
              style={{
                ...styles.footerBrandPanel,
                textAlign: isMobile ? "center" : "left",
                alignItems: isMobile ? "center" : "flex-start",
              }}
            >
              <div
                style={{
                  ...styles.footerBrandBlock,
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: isMobile ? "center" : "flex-start",
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                <Image
                  src="/logo-maison-noor.png"
                  alt="Maison Noor"
                  width={76}
                  height={76}
                  loading="lazy"
                  sizes="76px"
                  style={styles.footerLogo}
                />
                <div>
                  <div style={styles.footerBrand}>Maison Noor Parfums</div>
                  <p style={styles.footerDescription}>
                    Perfumes árabes importados com curadoria premium, elegância e presença do primeiro clique ao atendimento final.
                  </p>
                </div>
              </div>

              <div
                style={{
                  ...styles.footerBadges,
                  justifyContent: isMobile ? "center" : "flex-start",
                }}
              >
                <span style={styles.footerBadge}>Perfumes árabes</span>
                <span style={styles.footerBadge}>Atendimento via WhatsApp</span>
                <span style={styles.footerBadge}>Seleção premium</span>
              </div>
            </div>

            <div style={{ ...styles.footerColumn, alignItems: isMobile ? "center" : "flex-start" }}>
              <h4 style={styles.footerHeading}><span style={styles.footerHeadingIcon}>◈</span> Categorias</h4>
              <button onClick={() => selecionarCategoria("Femininos")} style={{ ...styles.footerButtonLink, textAlign: isMobile ? "center" : "left" }}>Femininos</button>
              <button onClick={() => selecionarCategoria("Masculinos")} style={{ ...styles.footerButtonLink, textAlign: isMobile ? "center" : "left" }}>Masculinos</button>
              <button onClick={() => selecionarCategoria("Unissex")} style={{ ...styles.footerButtonLink, textAlign: isMobile ? "center" : "left" }}>Unissex</button>
              <button onClick={() => selecionarCategoria("Presentes")} style={{ ...styles.footerButtonLink, textAlign: isMobile ? "center" : "left" }}>Presentes</button>
              <button onClick={() => selecionarCategoria("Cremes")} style={{ ...styles.footerButtonLink, textAlign: isMobile ? "center" : "left" }}>Cremes</button>
              <button onClick={() => selecionarCategoria("Família Olfativa")} style={{ ...styles.footerButtonLink, textAlign: isMobile ? "center" : "left" }}>Família Olfativa</button>
            </div>

            <div style={{ ...styles.footerColumn, alignItems: isMobile ? "center" : "flex-start" }}>
              <h4 style={styles.footerHeading}><span style={styles.footerHeadingIcon}>✦</span> Atendimento</h4>
              <a href="https://instagram.com/maison.noor.parfums" target="_blank" rel="noreferrer" style={styles.footerLink}>Instagram</a>
              <a href="https://wa.me/5512982389658" target="_blank" rel="noreferrer" style={styles.footerLink}>WhatsApp</a>
              <span style={styles.footerMutedText}>Seg a sáb • atendimento consultivo</span>
              <a href="/login" style={styles.footerLink}>CRM</a>
            </div>

            <div style={{ ...styles.footerColumn, alignItems: isMobile ? "center" : "flex-start" }}>
              <h4 style={styles.footerHeading}><span style={styles.footerHeadingIcon}>✓</span> Compra segura</h4>
              <div style={{ ...styles.paymentBadges, justifyContent: isMobile ? "center" : "flex-start" }}>
                <span style={styles.paymentBadge}>Pix</span>
                <span style={styles.paymentBadge}>Visa</span>
                <span style={styles.paymentBadge}>Master</span>
                <span style={styles.paymentBadge}>Elo</span>
              </div>
              <div style={{ ...styles.securityBadges, justifyContent: isMobile ? "center" : "flex-start" }}>
                <span style={styles.securityBadge}>Compra protegida</span>
                <span style={styles.securityBadge}>Atendimento real</span>
              </div>
              <p style={{ ...styles.footerDescription, maxWidth: isMobile ? "100%" : "260px" }}>
                Compra prática, pagamento facilitado e atendimento humanizado para você escolher com segurança.
              </p>
            </div>
          </div>

          <div
            style={{
              ...styles.footerBottom,
              paddingTop: isMobile ? "18px" : "20px",
              flexDirection: isMobile ? "column" : "row",
              gap: isMobile ? "10px" : "18px",
            }}
          >
            <span>© 2026 Maison Noor Parfums. Todos os direitos reservados.</span>
            <span>Perfumes árabes importados • Curadoria premium • Maison Noor</span>
          </div>
        </div>
      </footer>

      {showMiniCart && (
        <aside
          style={{
            ...styles.miniCartPanel,
            right: isMobile ? "14px" : "24px",
            bottom: isMobile ? "96px" : "98px",
            width: isMobile ? "calc(100% - 28px)" : "360px",
          }}
        >
          <div style={styles.miniCartHeader}>
            <div>
              <span style={styles.miniCartKicker}>Sua seleção</span>
              <strong style={styles.miniCartTitle}>Sacola Maison Noor</strong>
            </div>
            <button type="button" onClick={() => setShowMiniCart(false)} style={styles.miniCartClose}>
              ×
            </button>
          </div>

          {sacola.length === 0 ? (
            <div style={styles.miniCartEmpty}>Sua sacola está vazia no momento.</div>
          ) : (
            <>
              <div style={styles.miniCartItems}>
                {sacola.slice(-3).reverse().map((item, index) => {
                  const actualIndex = sacola.length - 1 - index;
                  return (
                    <div key={`${item.id}-${index}`} style={styles.miniCartItem}>
                      <div style={styles.miniCartThumbWrap}>
                        <img
                  decoding="async"
                          src={item.imagem}
                          loading="lazy"

                          alt={item.nome}
                          style={styles.miniCartThumb}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/produtos/hero-perfume.png";
                          }}
                        />
                      </div>
                      <div style={styles.miniCartMeta}>
                        <strong style={styles.miniCartItemTitle}>{item.nome}</strong>
                        <span style={styles.miniCartItemSize}>{item.tamanho}</span>
                        <span style={styles.miniCartItemPrice}>{formatarMoeda(item.preco)}</span>
                      </div>
                      <button type="button" onClick={() => removerDaSacola(actualIndex)} style={styles.miniCartRemove}>
                        Remover
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={styles.miniCartFooter}>
                <div style={styles.miniCartFooterTop}>
                  <div>
                    <span style={styles.miniCartTotalLabel}>Subtotal</span>
                    <strong style={styles.miniCartTotalValue}>{formatarMoeda(totalSacola)}</strong>
                  </div>
                </div>

                <div style={styles.miniCartInfo}>
                  Atendimento via WhatsApp • frete e pagamento definidos no fechamento
                </div>

                <div style={styles.miniCartFooterActions}>
                  <button
                    type="button"
                    onClick={() => {
                      saveCartToStorage(sacola);
                      setShowMiniCart(false);
                      window.location.href = "/checkout";
                    }}
                    style={{
                      ...styles.miniCartPayButton,
                      width: "100%",
                      cursor: "pointer",
                    }}
                  >
                    Ir para o checkout
                  </button>
                </div>
              </div>            </>
          )}
        </aside>
      )}

      {vipModalOpen && (
        <div
          style={styles.vipModalOverlay}
          onClick={() => {
            if (!vipLoading) {
              setVipModalOpen(false);
              setVipSuccess(false);
            }
          }}
        >
          <div style={styles.vipModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.vipModalHeader}>
              <div>
                <span style={styles.vipAsideKicker}>Clube Maison Noor</span>
                <h3 style={styles.vipModalTitle}>Entrar para a lista VIP</h3>
                <p style={styles.vipModalText}>
                  Deixe seus dados e receba novidades, reposição e ofertas exclusivas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!vipLoading) {
                    setVipModalOpen(false);
                    setVipSuccess(false);
                  }
                }}
                style={styles.vipModalClose}
                aria-label="Fechar cadastro VIP"
              >
                ×
              </button>
            </div>

            {vipSuccess ? (
              <div style={styles.vipSuccessBox}>
                Cadastro realizado com sucesso. Você agora faz parte do Clube VIP Maison Noor ✨
              </div>
            ) : (
              <form onSubmit={enviarCadastroVip} style={styles.vipForm}>
                <div style={styles.vipFieldGroup}>
                  <label style={styles.vipLabel}>Nome</label>
                  <input
                    value={vipForm.nome}
                    onChange={(e) => atualizarVipField("nome", e.target.value)}
                    placeholder="Seu nome"
                    style={styles.vipInput}
                    required
                  />
                </div>

                <div style={styles.vipFieldGroup}>
                  <label style={styles.vipLabel}>WhatsApp</label>
                  <input
                    value={vipForm.whatsapp}
                    onChange={(e) => atualizarVipField("whatsapp", e.target.value)}
                    placeholder="(12) 99999-9999"
                    style={styles.vipInput}
                    required
                  />
                </div>

                <div style={styles.vipFieldGroup}>
                  <label style={styles.vipLabel}>E-mail <span style={styles.vipOptional}>(opcional)</span></label>
                  <input
                    value={vipForm.email}
                    onChange={(e) => atualizarVipField("email", e.target.value)}
                    placeholder="voce@email.com"
                    type="email"
                    style={styles.vipInput}
                  />
                </div>

                <div
                  style={{
                    ...styles.vipFormGrid,
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <div style={styles.vipFieldGroup}>
                    <label style={styles.vipLabel}>Categoria preferida</label>
                    <select
                      value={vipForm.preferencia}
                      onChange={(e) => atualizarVipField("preferencia", e.target.value)}
                      style={styles.vipSelect}
                    >
                      <option>Masculino</option>
                      <option>Feminino</option>
                      <option>Unissex</option>
                    </select>
                  </div>

                  <div style={styles.vipFieldGroup}>
                    <label style={styles.vipLabel}>Estilo que mais gosta</label>
                    <select
                      value={vipForm.estilo}
                      onChange={(e) => atualizarVipField("estilo", e.target.value)}
                      style={styles.vipSelect}
                    >
                      <option>Intenso</option>
                      <option>Doce</option>
                      <option>Fresco</option>
                      <option>Amadeirado</option>
                    </select>
                  </div>
                </div>

                <button type="submit" style={styles.vipSubmitButton} disabled={vipLoading}>
                  {vipLoading ? "Enviando..." : "Entrar para o Clube VIP"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <a
        href="https://wa.me/5512982389658?text=Olá! Vim pelo site da Maison Noor e gostaria de atendimento."
        target="_blank"
        rel="noreferrer"
        style={{
          ...styles.whatsappFloat,
          right: isMobile ? "14px" : "20px",
          bottom: isMobile ? "84px" : "20px",
          width: isMobile ? "56px" : "62px",
          height: isMobile ? "56px" : "62px",
        }}
        aria-label="Abrir WhatsApp da Maison Noor"
        title="Fale com a Maison Noor no WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
          <path d="M20.52 3.48A11.8 11.8 0 0 0 12.1 0C5.59 0 .3 5.29.3 11.8c0 2.08.54 4.11 1.56 5.9L0 24l6.48-1.7a11.72 11.72 0 0 0 5.62 1.43h.01c6.51 0 11.8-5.29 11.8-11.8 0-3.15-1.23-6.11-3.39-8.45Zm-8.42 18.2h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.85 1.01 1.03-3.75-.23-.38a9.78 9.78 0 0 1-1.5-5.18C2.18 6.38 6.68 1.88 12.1 1.88c2.62 0 5.09 1.02 6.94 2.88a9.75 9.75 0 0 1 2.88 6.94c0 5.42-4.41 9.98-9.82 9.98Zm5.37-7.35c-.29-.15-1.73-.85-2-.95-.27-.1-.47-.15-.67.15-.2.29-.77.95-.94 1.14-.17.2-.35.22-.64.08-.29-.15-1.23-.45-2.34-1.43-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.59.13-.13.29-.35.44-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.29-1.04 1.01-1.04 2.47 0 1.45 1.07 2.86 1.22 3.06.15.2 2.09 3.19 5.05 4.47.7.3 1.25.48 1.68.62.71.23 1.35.2 1.86.12.57-.08 1.73-.71 1.98-1.4.24-.69.24-1.28.17-1.4-.07-.12-.27-.2-.57-.35Z" />
        </svg>
      </a>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    background:
      "radial-gradient(circle at top, rgba(215,192,160,0.22), transparent 24%), #F5EFE6",
    color: "#2B2B2B",
    minHeight: "100vh",
    fontFamily: "Arial, sans-serif",
  },
  headerShell: {
    position: "fixed",
    left: 0,
    right: 0,
    zIndex: 80,
  },
  header: {
    maxWidth: "1360px",
    margin: "0 auto",
    backdropFilter: "blur(18px)",
    background: "rgba(255, 249, 241, 0.86)",
    border: "1px solid rgba(229, 211, 190, 0.95)",
    borderRadius: "24px",
    boxShadow: "0 18px 45px rgba(47, 34, 20, 0.10), inset 0 1px 0 rgba(255,255,255,0.65)",
    transition: "all 0.28s ease",
    position: "relative",
    willChange: "transform, padding, box-shadow",
  },
  headerScrolled: {
    background: "rgba(255, 249, 241, 0.96)",
    boxShadow: "0 12px 32px rgba(47, 34, 20, 0.14), inset 0 1px 0 rgba(255,255,255,0.78)",
    borderRadius: "22px",
    transform: "translateY(0)",
  },
  headerAtTop: {
    background: "rgba(255, 249, 241, 0.78)",
    boxShadow: "0 18px 45px rgba(47, 34, 20, 0.08), inset 0 1px 0 rgba(255,255,255,0.58)",
  },
  headerTopRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: "18px",
  },
  desktopNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    position: "relative",
  },
  desktopNavLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    padding: "0 18px",
    borderRadius: "999px",
    textDecoration: "none",
    color: "#6E5844",
    fontSize: "14px",
    fontWeight: 700,
    border: "1px solid rgba(216, 193, 162, 0.78)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.54), rgba(245,235,222,0.72))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
    transition: "all 0.25s ease",
  },
  desktopNavButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    padding: "0 18px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.54), rgba(245,235,222,0.72))",
    border: "1px solid rgba(216, 193, 162, 0.78)",
    color: "#6E5844",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
    transition: "all 0.22s ease",
  },
  desktopNavButtonActive: {
    background: "linear-gradient(135deg, #D8BE97, #C79D61)",
    color: "#2B2118",
    border: "1px solid #C9A46C",
    boxShadow: "0 10px 22px rgba(120, 87, 45, 0.10)",
  },
  dropdownWrap: {
    position: "relative",
  },
  dropdownTrigger: {
    minHeight: "44px",
    borderRadius: "999px",
    border: "1px solid #D8C1A2",
    padding: "0 20px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(243,228,207,0.88))",
    color: "#6E5844",
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    boxShadow: "0 10px 22px rgba(99, 72, 41, 0.08)",
  },
  dropdownTriggerActive: {
    background: "linear-gradient(135deg, #D8BE97, #C79D61)",
    color: "#2B2118",
  },
  dropdownCaret: {
    fontSize: "12px",
    transition: "transform 0.2s ease",
  },
  dropdownPanel: {
    position: "absolute",
    top: "calc(100% + 14px)",
    right: 0,
    width: "720px",
    maxWidth: "min(720px, 72vw)",
    background: "linear-gradient(180deg, rgba(255,252,248,0.99), rgba(245,235,222,0.99))",
    border: "1px solid rgba(220, 200, 175, 0.95)",
    borderRadius: "24px",
    padding: "18px",
    boxShadow: "0 24px 50px rgba(47, 34, 20, 0.14)",
    zIndex: 10,
  },
  dropdownPanelHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "14px",
  },
  dropdownKicker: {
    color: "#A8844C",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  dropdownText: {
    color: "#746252",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  headerActionsRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
  },
  headerSocials: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  mobileMenuButton: {
    width: "44px",
    height: "44px",
    borderRadius: "999px",
    border: "1px solid #D8C1A2",
    background: "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(243,228,207,0.92))",
    color: "#5E4A39",
    fontSize: "22px",
    cursor: "pointer",
  },
  mobileMenuButtonActive: {
    background: "linear-gradient(135deg, #D8BE97, #C79D61)",
    color: "#2B2118",
  },
  mobileMenuPanel: {
    marginTop: "12px",
    borderTop: "1px solid rgba(237, 227, 214, 0.9)",
    paddingTop: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  mobileMenuLinks: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "10px",
  },
  mobileMenuLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.75)",
    border: "1px solid #E3D3BF",
    textDecoration: "none",
    color: "#5E4A39",
    fontWeight: 700,
    fontSize: "14px",
  },
  mobileMenuAction: {
    minHeight: "44px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.75)",
    border: "1px solid #E3D3BF",
    color: "#5E4A39",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
  mobileMenuActionActive: {
    background: "rgba(216, 190, 151, 0.28)",
    color: "#4E3C2E",
  },
  mobileMenuSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  mobileMenuTitle: {
    color: "#8E6B3E",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  },
  mobileCategoryGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  mobileMenuFooter: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "10px",
  },
  mobileSocialLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "42px",
    borderRadius: "14px",
    textDecoration: "none",
    color: "#6E5844",
    fontWeight: 700,
    fontSize: "13px",
    border: "1px solid #E3D3BF",
    background: "rgba(255,249,241,0.92)",
  },
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  logoImage: {
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid rgba(215, 192, 160, 0.95)",
    boxShadow: "0 14px 32px rgba(60, 42, 23, 0.12), 0 0 0 4px rgba(212, 175, 55, 0.10)",
    transition: "all 0.28s ease",
  },
  brandTextWrap: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.1,
    gap: "4px",
  },
  brandKicker: {
    color: "#A8844C",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  brandTitle: {
    color: "#3D312B",
    fontWeight: 700,
    letterSpacing: "0.01em",
  },
  brandSubline: {
    color: "#7B6654",
    fontSize: "12px",
  },
  searchWrap: {
    position: "relative",
    width: "100%",
    transition: "all 0.28s ease",
  },
  searchWrapCollapsed: {
    maxHeight: 0,
    opacity: 0,
    overflow: "hidden",
    marginTop: 0,
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    borderRadius: "18px",
    border: "1px solid #DFCDB7",
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: "0 54px 0 18px",
    color: "#3D312B",
    outline: "none",
    boxSizing: "border-box",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
  },
  searchIcon: {
    position: "absolute",
    right: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#9C7440",
    fontSize: "22px",
    pointerEvents: "none",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  megaMenuButton: {
    height: "42px",
    borderRadius: "999px",
    border: "1px solid #D8C1A2",
    padding: "0 16px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.65), rgba(243,228,207,0.82))",
    color: "#6E5844",
    fontWeight: 700,
    cursor: "pointer",
  },
  megaMenuButtonActive: {
    background: "linear-gradient(135deg, #D8BE97, #C79D61)",
    color: "#2B2118",
  },
  iconLink: {
    width: "42px",
    height: "42px",
    borderRadius: "999px",
    border: "1px solid #DFCDB7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6E5844",
    backgroundColor: "rgba(255,249,241,0.92)",
    textDecoration: "none",
    boxShadow: "0 8px 18px rgba(99, 72, 41, 0.06)",
  },
  cartBadge: {
    minWidth: "66px",
    height: "42px",
    borderRadius: "999px",
    border: "1px solid #DFCDB7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "#6E5844",
    backgroundColor: "rgba(255,249,241,0.92)",
    fontWeight: 700,
    padding: "0 12px",
    boxShadow: "0 8px 18px rgba(99, 72, 41, 0.06)",
  },
  cartIcon: {
    flexShrink: 0,
  },
  cartCount: {
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1,
  },

  favoriteHeart: {
    color: "#A67A43",
    fontSize: "18px",
    lineHeight: 1,
  },
  accountMenuWrap: {
    position: "relative",
  },
  accountButton: {
    minHeight: "44px",
    borderRadius: "999px",
    border: "1px solid #D8C1A2",
    padding: "0 18px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(243,228,207,0.92))",
    color: "#6E5844",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    boxShadow: "0 8px 18px rgba(99, 72, 41, 0.06)",
  },
  accountButtonActive: {
    background: "linear-gradient(135deg, #D8BE97, #C79D61)",
    color: "#2B2118",
  },
  accountDropdown: {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    minWidth: "220px",
    background: "linear-gradient(180deg, rgba(255,252,248,0.99), rgba(245,235,222,0.99))",
    border: "1px solid rgba(220, 200, 175, 0.95)",
    borderRadius: "18px",
    padding: "10px",
    boxShadow: "0 24px 50px rgba(47, 34, 20, 0.14)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    zIndex: 20,
  },
  accountDropdownLink: {
    minHeight: "42px",
    borderRadius: "12px",
    padding: "0 14px",
    color: "#5E4A39",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    background: "rgba(255,255,255,0.65)",
    border: "1px solid #E3D3BF",
  },
  accountDropdownButton: {
    minHeight: "42px",
    borderRadius: "12px",
    padding: "0 14px",
    color: "#5E4A39",
    fontWeight: 700,
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    background: "rgba(255,255,255,0.65)",
    border: "1px solid #E3D3BF",
    cursor: "pointer",
  },
  mobileAccountPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  mobileAccountTitle: {
    color: "#8E6B3E",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  },
  mobileAccountActions: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "10px",
  },
  cartBadgeActive: {
    background: "linear-gradient(135deg, rgba(255,249,241,0.96), rgba(243,228,207,0.92))",
    border: "1px solid #D8C1A2",
    boxShadow: "0 12px 24px rgba(120, 87, 45, 0.12)",
  },
  loginLink: {
    border: "1px solid #D8C1A2",
    padding: "11px 18px",
    borderRadius: "999px",
    textDecoration: "none",
    color: "#A8844C",
    fontWeight: 700,
    fontSize: "14px",
    backgroundColor: "rgba(255,255,255,0.35)",
    boxShadow: "0 10px 20px rgba(120, 87, 45, 0.06)",
  },
  categoryMenu: {
    marginTop: "14px",
    paddingTop: "14px",
    borderTop: "1px solid rgba(237, 227, 214, 0.9)",
    display: "flex",
    flexWrap: "wrap",
  },
  categoryButton: {
    border: "1px solid #E3D3BF",
    background: "linear-gradient(135deg, #FFFDF9, #F5E8D7)",
    color: "#6E5844",
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderRadius: "999px",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(73, 51, 28, 0.05)",
    transition: "all 0.25s ease",
  },
  categoryButtonActive: {
    background: "linear-gradient(135deg, #D9BE93, #BF9458)",
    color: "#2B2118",
    border: "1px solid #C9A46C",
    boxShadow: "0 12px 20px rgba(141, 102, 52, 0.16)",
  },
  megaMenuPanel: {
    position: "absolute",
    top: "calc(100% + 14px)",
    left: "22px",
    right: "22px",
    background: "linear-gradient(180deg, rgba(255,252,248,0.98), rgba(245,235,222,0.98))",
    border: "1px solid rgba(220, 200, 175, 0.95)",
    borderRadius: "24px",
    padding: "18px",
    boxShadow: "0 24px 50px rgba(47, 34, 20, 0.14)",
  },
  megaMenuGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "14px",
  },
  megaMenuItem: {
    border: "1px solid #E6D7C5",
    borderRadius: "18px",
    padding: "16px",
    background: "rgba(255,255,255,0.72)",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  megaMenuItemActive: {
    background: "linear-gradient(135deg, rgba(217,190,147,0.45), rgba(191,148,88,0.28))",
    border: "1px solid #D1AE7A",
  },
  megaMenuGiftItem: {
    background: "linear-gradient(135deg, rgba(212,175,119,0.18), rgba(255,244,229,0.96))",
    border: "1px solid rgba(205, 167, 106, 0.58)",
    boxShadow: "0 14px 28px rgba(120, 87, 45, 0.08)",
  },
  megaMenuGiftTitle: {
    color: "#8E6431",
  },
  megaMenuGiftText: {
    color: "#7A6550",
  },
  megaMenuItemTitle: {
    color: "#3F312A",
    fontSize: "15px",
    fontWeight: 700,
  },
  megaMenuItemText: {
    color: "#746252",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  heroSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  heroCarouselWrap: {
    position: "relative",
  },
  heroBanner: {
    width: "100%",
    borderRadius: "28px",
    overflow: "hidden",
    backgroundColor: "#EDE5DA",
    backgroundSize: "cover",
    backgroundPosition: "center",
    display: "flex",
    padding: "40px 30px",
    boxSizing: "border-box",
    border: "1px solid #E2D2BF",
    boxShadow: "0 28px 60px rgba(43, 31, 21, 0.10)",
  },
  heroOverlayContent: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    marginLeft: 0,
  },
  heroEyebrow: {
    margin: "0 0 10px",
    color: "#FFFFFF",
    fontSize: "14px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    textShadow: "0 2px 12px rgba(0,0,0,0.18)",
  },
  heroTitle: {
    margin: "0 0 12px",
    color: "#FFFFFF",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    textShadow: "0 4px 24px rgba(0,0,0,0.20)",
  },
  heroSubtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.96)",
    lineHeight: 1.6,
    textShadow: "0 2px 18px rgba(0,0,0,0.18)",
  },
  heroBannerActions: {
    marginTop: "22px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  heroPrimaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D8B46E, #B9853C)",
    color: "#241A12",
    textDecoration: "none",
    padding: "14px 26px",
    borderRadius: "14px",
    fontWeight: 800,
    fontSize: "16px",
    minWidth: "220px",
    boxShadow: "0 16px 30px rgba(185, 133, 60, 0.28)",
    border: "1px solid rgba(255, 232, 184, 0.55)",
    transition: "transform 0.22s ease, filter 0.22s ease, box-shadow 0.22s ease",
  },
  heroSecondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    textDecoration: "none",
    padding: "14px 22px",
    borderRadius: "14px",
    fontWeight: 700,
    fontSize: "15px",
    border: "1px solid rgba(255,255,255,0.24)",
    backdropFilter: "blur(8px)",
    transition: "transform 0.22s ease, background 0.22s ease",
  },
  heroArrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: "48px",
    height: "48px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.16)",
    color: "#FFFFFF",
    cursor: "pointer",
    fontSize: "28px",
    lineHeight: "1",
    zIndex: 5,
    backdropFilter: "blur(4px)",
  },
  heroDots: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "10px",
    marginTop: "14px",
  },
  heroDot: {
    width: "12px",
    height: "12px",
    borderRadius: "999px",
    border: "none",
    backgroundColor: "#C8B9A4",
    cursor: "pointer",
  },
  heroDotActive: {
    width: "28px",
    backgroundColor: "#111111",
  },
  kicker: {
    margin: 0,
    color: "#B1874E",
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  section: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  deferSection: {
    contentVisibility: "auto",
    containIntrinsicSize: "900px",
  },
  trustStripSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  trustStrip: {
    display: "grid",
  },
  trustBadgeCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    borderRadius: "20px",
    border: "1px solid #E6D7C5",
    background: "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(244,234,220,0.92))",
    boxShadow: "0 12px 26px rgba(62, 44, 24, 0.06)",
    padding: "15px 16px",
  },
  trustBadgeIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: "16px",
    flexShrink: 0,
    boxShadow: "0 10px 18px rgba(120, 87, 45, 0.10)",
  },
  trustBadgeTitle: {
    display: "block",
    color: "#3E3027",
    fontSize: "14px",
    lineHeight: 1.25,
    marginBottom: "3px",
  },
  trustBadgeText: {
    margin: 0,
    color: "#78695B",
    fontSize: "12px",
    lineHeight: 1.45,
  },
  sectionHeaderPremium: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "20px",
    marginBottom: "22px",
  },
  selectionInfoCard: {
    minWidth: "190px",
    borderRadius: "18px",
    padding: "14px 16px",
    border: "1px solid #E2D2BF",
    background: "linear-gradient(180deg, #FFF9F1, #F0E2D1)",
    boxShadow: "0 10px 24px rgba(48,34,20,0.06)",
    textAlign: "right",
  },
  selectionInfoLabel: {
    display: "block",
    color: "#907965",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "6px",
  },
  selectionInfoValue: {
    color: "#3A2F29",
    fontSize: "18px",
  },
  sectionTitle: {
    margin: "8px 0 10px",
    color: "#3A2F29",
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  sectionText: {
    margin: 0,
    color: "#6D6157",
    fontSize: "16px",
    lineHeight: 1.7,
  },
  sectionSupportText: {
    margin: "2px 0 0",
    color: "#75685C",
    fontSize: "14px",
    lineHeight: 1.6,
    maxWidth: "560px",
  },
  comingSoonSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  comingSoonCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "22px",
    border: "1px solid rgba(216, 193, 162, 0.16)",
    background: "linear-gradient(135deg, rgba(19,15,12,0.98), rgba(42,31,22,0.98))",
    boxShadow: "0 14px 34px rgba(34, 24, 15, 0.14)",
    color: "#F6E9D6",
  },
  comingSoonGlowOne: {
    position: "absolute",
    top: "-90px",
    right: "-60px",
    width: "220px",
    height: "220px",
    borderRadius: "999px",
    background: "rgba(212, 175, 119, 0.14)",
    filter: "blur(22px)",
  },
  comingSoonGlowTwo: {
    position: "absolute",
    bottom: "-110px",
    left: "-80px",
    width: "220px",
    height: "220px",
    borderRadius: "999px",
    background: "rgba(255, 244, 220, 0.07)",
    filter: "blur(24px)",
  },
  comingSoonContent: {
    position: "relative",
    zIndex: 2,
  },
  comingSoonKicker: {
    margin: "0 0 8px",
    color: "#D8BE97",
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
  },
  comingSoonTitle: {
    margin: "0 0 8px",
    color: "#FFF6EB",
    lineHeight: 1.08,
    fontWeight: 800,
    letterSpacing: "-0.04em",
  },
  comingSoonText: {
    margin: "0 0 10px",
    color: "rgba(246, 233, 214, 0.78)",
    lineHeight: 1.55,
    maxWidth: "660px",
  },
  comingSoonActions: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  comingSoonButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "42px",
    padding: "0 20px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: "14px",
    boxShadow: "0 14px 28px rgba(120, 87, 45, 0.20)",
    border: "1px solid rgba(255, 232, 184, 0.25)",
  },
  comingSoonNote: {
    color: "rgba(246, 233, 214, 0.62)",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  presentesSectionCard: {
    borderRadius: "28px",
    border: "1px solid rgba(214, 184, 142, 0.72)",
    background: "radial-gradient(circle at top right, rgba(151, 58, 45, 0.10), transparent 34%), linear-gradient(180deg, #FFF9F2, #F6E8D8)",
    boxShadow: "0 22px 48px rgba(62, 44, 24, 0.10)",
    padding: "22px",
  },
  presentesSubtitle: {
    margin: 0,
    color: "#75685C",
    fontSize: "15px",
    lineHeight: 1.65,
    maxWidth: "700px",
  },
  presentesViewAllButton: {
    minHeight: "48px",
    borderRadius: "999px",
    border: "1px solid #D8C1A2",
    padding: "0 22px",
    background: "linear-gradient(135deg, #FFF9F1, #F0DFC8)",
    color: "#6B523A",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(120, 87, 45, 0.08)",
  },
  presentesBadge: {
    position: "absolute",
    top: "14px",
    left: "14px",
    zIndex: 2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 11px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, rgba(120, 38, 38, 0.96), rgba(166, 91, 55, 0.96))",
    color: "#FFF4E4",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    boxShadow: "0 10px 20px rgba(60, 24, 18, 0.16)",
  },
  presentesDescription: {
    margin: "4px 0 0",
    fontSize: "12px",
    color: "#8B7A6A",
    lineHeight: 1.55,
  },
  presentesMobileActions: {
    marginTop: "18px",
    display: "flex",
    justifyContent: "center",
  },
  searchResultText: {
    margin: "0 0 18px",
    color: "#7A6A5C",
    fontSize: "14px",
  },
  grid: {
    display: "grid",
    gap: "22px",
  },
  card: {
    background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
    borderRadius: "26px",
    boxShadow: "0 16px 34px rgba(48,34,20,0.08)",
    transition: "transform 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease",
    border: "1px solid #EADBC8",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    willChange: "transform, box-shadow",
  },
  cardUnavailable: {
    border: "1px solid #E7D8D0",
  },
  productImageLink: {
    textDecoration: "none",
    color: "inherit",
    display: "block",
  },
  productTitleLink: {
    textDecoration: "none",
    color: "inherit",
    display: "block",
  },
  cardImageWrap: {
    width: "100%",
    background: "radial-gradient(circle at center, rgba(212,175,119,0.16), transparent 42%), linear-gradient(180deg, rgba(255,253,249,0.96), rgba(244,234,220,0.72))",
    borderBottom: "1px solid #EFE3D4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "22px 18px 20px",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    maxWidth: "168px",
    maxHeight: "144px",
    objectFit: "contain",
    display: "block",
    mixBlendMode: "multiply",
    filter: "drop-shadow(0 16px 26px rgba(40, 28, 18, 0.14))",
    transition: "transform 0.35s ease",
  },
  productBadge: {
    position: "absolute",
    top: "14px",
    left: "14px",
    zIndex: 2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(24, 18, 12, 0.70)",
    color: "#F6E8D2",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    boxShadow: "0 8px 16px rgba(20,16,12,0.08)",
    backdropFilter: "blur(4px)",
  },
  cardImageUnavailable: {
    opacity: 0.68,
    filter: "grayscale(0.18)",
  },

  favoriteButton: {
    position: "absolute",
    top: "14px",
    right: "14px",
    width: "38px",
    height: "38px",
    borderRadius: "999px",
    border: "1px solid #E3D3BF",
    background: "rgba(255,255,255,0.9)",
    color: "#8B6B46",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    cursor: "pointer",
    zIndex: 3,
    boxShadow: "0 8px 16px rgba(20,16,12,0.08)",
  },
  favoriteButtonActive: {
    color: "#B45E5E",
    border: "1px solid #E9C4C4",
    background: "#FFF7F7",
  },
  favoriteButtonLoading: {
    opacity: 0.7,
    cursor: "wait",
  },
  cardContent: {
    padding: "16px 16px 18px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    flex: 1,
  },
  cardTopBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  cardBrand: {
    margin: 0,
    fontSize: "11px",
    color: "#B1874E",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  cardTitle: {
    margin: 0,
    color: "#3E3027",
    fontWeight: 700,
    lineHeight: 1.12,
    letterSpacing: "-0.02em",
    minHeight: "54px",
  },
  cardPriceBlock: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid #EEE1D0",
  },
  cardPrice: {
    margin: "0 0 2px",
    fontSize: "20px",
    fontWeight: 700,
    color: "#9B7441",
    letterSpacing: "-0.02em",
  },
  cardPix: {
    margin: "4px 0 0",
    fontSize: "14px",
    color: "#5F4A3A",
    fontWeight: 600,
  },
  cardPixHighlight: {
    color: "#A8844C",
    fontWeight: 700,
  },
  cardInstallments: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "#7C6E62",
  },
  cardTrust: {
    margin: "8px 0 0",
    fontSize: "12px",
    color: "#7B6958",
    lineHeight: 1.45,
  },
  cardSize: {
    margin: 0,
    fontSize: "13px",
    color: "#7C6E62",
    fontWeight: 500,
  },
  cardMood: {
    margin: "4px 0 0",
    fontSize: "12px",
    color: "#9B8773",
    fontStyle: "italic",
    letterSpacing: "0.01em",
  },
  unavailableBadge: {
    margin: "8px 0 0",
    display: "inline-flex",
    alignSelf: "flex-start",
    padding: "6px 10px",
    borderRadius: "999px",
    backgroundColor: "#FFF1F1",
    border: "1px solid #F0CFCF",
    color: "#9A3B3B",
    fontSize: "12px",
    fontWeight: 700,
  },
  cardActions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "16px",
  },
  pagbankButton: {
    display: "block",
    width: "100%",
    background: "linear-gradient(135deg, #D4AF6A, #B98A46)",
    padding: "13px",
    textAlign: "center",
    borderRadius: "14px",
    textDecoration: "none",
    color: "#241B14",
    fontWeight: 700,
    boxShadow: "0 12px 24px rgba(120, 87, 45, 0.12)",
    border: "1px solid rgba(155, 116, 65, 0.22)",
  },
  pagbankButtonFallback: {
    background: "linear-gradient(135deg, #EEE3D2, #E5D5BF)",
    color: "#5E4A38",
    border: "1px solid #D8C1A2",
    boxShadow: "none",
  },
  addToCartButton: {
    display: "block",
    width: "100%",
    background: "linear-gradient(180deg, #FFF9F1, #F5E7D4)",
    padding: "13px",
    textAlign: "center",
    borderRadius: "16px",
    border: "1px solid #D8C1A2",
    color: "#6B523A",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78)",
  },
  disabledButton: {
    backgroundColor: "#F1E9DC",
    color: "#9A8A78",
    border: "1px solid #DDD1C0",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  cardButton: {
    display: "block",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    padding: "14px",
    textAlign: "center",
    borderRadius: "16px",
    textDecoration: "none",
    color: "#2B2118",
    fontWeight: 700,
    letterSpacing: "0.01em",
    boxShadow: "0 14px 28px rgba(120, 87, 45, 0.12)",
    transition: "transform 0.25s ease, filter 0.25s ease",
  },
  unavailableWhatsButton: {
    background: "linear-gradient(135deg, #D8C8AF, #CDBA9D)",
    color: "#4A3E33",
  },
  emptyState: {
    marginTop: "20px",
    padding: "30px",
    borderRadius: "18px",
    backgroundColor: "#FFF9F1",
    border: "1px solid #E8D8C5",
    textAlign: "center",
    color: "#7A6A5C",
    fontSize: "16px",
  },
  loadMoreWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "24px",
  },
  loadMoreButton: {
    minHeight: "48px",
    borderRadius: "999px",
    border: "1px solid #D8C1A2",
    padding: "0 22px",
    background: "linear-gradient(135deg, #FFF9F1, #F0DFC8)",
    color: "#6B523A",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(120, 87, 45, 0.08)",
  },
  loadMoreHint: {
    margin: "10px 0 0",
    color: "#8B7A6A",
    fontSize: "12px",
    lineHeight: 1.5,
    textAlign: "center",
  },
  aboutSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  aboutCard: {
    background: "linear-gradient(180deg, #EFE4D6, #EBDCCD)",
    borderRadius: "26px",
    border: "1px solid #E2D2BF",
    boxShadow: "0 12px 28px rgba(90, 67, 39, 0.04)",
  },
  miniCartPanel: {
    position: "fixed",
    zIndex: 130,
    borderRadius: "24px",
    border: "1px solid #E3D1BB",
    background: "rgba(255, 250, 244, 0.97)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 28px 60px rgba(47, 34, 20, 0.18)",
    padding: "18px",
  },
  miniCartHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "14px",
  },
  miniCartKicker: {
    display: "block",
    color: "#AD8451",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "4px",
  },
  miniCartTitle: {
    color: "#3D312B",
    fontSize: "18px",
  },
  miniCartClose: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    border: "1px solid #E2D2BF",
    background: "#FFFDF9",
    color: "#6E5844",
    fontSize: "24px",
    lineHeight: 1,
    cursor: "pointer",
  },
  miniCartEmpty: {
    borderRadius: "18px",
    background: "#FFFDF9",
    border: "1px solid #EEE2D3",
    padding: "18px",
    color: "#75685C",
    fontSize: "14px",
  },
  miniCartItems: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  miniCartItem: {
    display: "grid",
    gridTemplateColumns: "62px 1fr auto",
    gap: "12px",
    alignItems: "center",
    padding: "10px",
    borderRadius: "18px",
    background: "#FFFDF9",
    border: "1px solid #EEE2D3",
  },
  miniCartThumbWrap: {
    width: "62px",
    height: "62px",
    borderRadius: "16px",
    background: "linear-gradient(180deg, rgba(255,252,247,0.8), rgba(243,230,214,0.55))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  miniCartThumb: {
    width: "46px",
    height: "46px",
    objectFit: "contain",
    mixBlendMode: "multiply",
  },
  miniCartMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  miniCartItemTitle: {
    color: "#3F322A",
    fontSize: "14px",
    lineHeight: 1.2,
  },
  miniCartItemSize: {
    color: "#8B7A6A",
    fontSize: "12px",
  },
  miniCartItemPrice: {
    color: "#9B7441",
    fontSize: "13px",
    fontWeight: 700,
  },
  miniCartRemove: {
    border: "none",
    background: "transparent",
    color: "#8B6B46",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  miniCartFooter: {
    marginTop: "14px",
    paddingTop: "14px",
    borderTop: "1px solid #EADBC8",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  miniCartFooterTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniCartInfo: {
    fontSize: "12px",
    color: "#6B5B4D",
    lineHeight: "1.5",
  },
  miniCartFooterActions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  miniCartPayButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 16px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #D4AF6A, #B98A46)",
    color: "#241B14",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "13px",
    whiteSpace: "nowrap",
    border: "1px solid rgba(155, 116, 65, 0.22)",
    boxShadow: "0 12px 24px rgba(120, 87, 45, 0.12)",
  },
  miniCartNotice: {
    color: "#7A6A5C",
    fontSize: "12px",
    lineHeight: 1.45,
    maxWidth: "220px",
    textAlign: "left",
  },
  miniCartTotalLabel: {
    display: "block",
    color: "#8B7A6A",
    fontSize: "12px",
    marginBottom: "4px",
  },
  miniCartTotalValue: {
    color: "#3D312B",
    fontSize: "18px",
  },
  miniCartCheckout: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 16px",
    borderRadius: "14px",
    background: "#EEE3D2",
    color: "#5E4A38",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "13px",
    whiteSpace: "nowrap",
    border: "1px solid #D8C1A2",
  },

  testimonialSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  testimonialCard: {
    borderRadius: "28px",
    border: "1px solid #E6D7C5",
    background: "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(244,234,220,0.96))",
    boxShadow: "0 18px 40px rgba(62, 44, 24, 0.08)",
    padding: "28px",
  },
  testimonialHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "16px",
  },
  testimonialDots: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
  },
  testimonialDot: {
    width: "11px",
    height: "11px",
    borderRadius: "999px",
    border: "none",
    background: "#D2C1AD",
    cursor: "pointer",
  },
  testimonialDotActive: {
    width: "28px",
    background: "#15110D",
  },
  testimonialBody: {
    position: "relative",
    padding: "8px 0 0 0",
  },
  testimonialQuoteMark: {
    fontSize: "64px",
    lineHeight: 1,
    color: "#D0AA74",
    opacity: 0.48,
    marginBottom: "-12px",
  },
  testimonialText: {
    margin: "0 0 16px",
    color: "#47382E",
    fontSize: "22px",
    lineHeight: 1.5,
    maxWidth: "980px",
  },
  testimonialAuthor: {
    color: "#9B7441",
    fontSize: "15px",
  },
  recommendSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  recommendHeader: {
    marginBottom: "18px",
  },
  recommendText: {
    margin: 0,
    color: "#75685C",
    fontSize: "15px",
    lineHeight: 1.7,
  },
  recommendGrid: {
    display: "grid",
    gap: "18px",
  },
  recommendCard: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
    padding: "18px",
    borderRadius: "24px",
    border: "1px solid #E6D7C5",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(247,239,229,0.92))",
    textDecoration: "none",
    color: "#342922",
    boxShadow: "0 14px 30px rgba(62, 44, 24, 0.06)",
  },
  recommendImageWrap: {
    width: "110px",
    height: "110px",
    borderRadius: "20px",
    background: "linear-gradient(180deg, rgba(255,252,247,0.9), rgba(243,230,214,0.65))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #E9DDCE",
    flexShrink: 0,
  },
  recommendImage: {
    width: "84px",
    height: "84px",
    objectFit: "contain",
    mixBlendMode: "multiply",
    filter: "drop-shadow(0 10px 18px rgba(40,28,18,0.12))",
  },
  recommendContent: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  recommendEyebrow: {
    color: "#AE8450",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  recommendTitle: {
    color: "#3F322A",
    fontSize: "20px",
    lineHeight: 1.15,
  },
  recommendPrice: {
    color: "#9D7641",
    fontWeight: 700,
    fontSize: "18px",
  },
  footerHighlights: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  footerHighlightsInner: {
    display: "grid",
    gap: "16px",
  },
  footerHighlightCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: "14px",
    padding: "18px 18px",
    borderRadius: "22px",
    background: "linear-gradient(180deg, rgba(24,19,14,0.96), rgba(34,26,18,0.96))",
    border: "1px solid rgba(216,193,162,0.18)",
    boxShadow: "0 12px 28px rgba(28, 20, 12, 0.12)",
    color: "#F3E8DA",
  },
  footerHighlightIcon: {
    width: "36px",
    height: "36px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #B98C52)",
    color: "#211810",
    fontWeight: 700,
    flexShrink: 0,
  },
  footerHighlightTitle: {
    display: "block",
    color: "#F6E9D6",
    fontSize: "15px",
    marginBottom: "4px",
  },
  footerHighlightText: {
    margin: 0,
    color: "#CCBCAB",
    fontSize: "13px",
    lineHeight: 1.55,
  },
  footer: {
    marginTop: "8px",
    background: "linear-gradient(180deg, #18120D, #0F0B08)",
    color: "#F3E8DA",
    borderTop: "1px solid rgba(216, 193, 162, 0.18)",
  },
  footerInner: {
    maxWidth: "1360px",
    margin: "0 auto",
    display: "grid",
  },
  footerTop: {
    display: "grid",
    alignItems: "flex-start",
  },
  footerBrandPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  footerBrandBlock: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
  },
  footerLogo: {
    width: "76px",
    height: "76px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid rgba(216, 193, 162, 0.30)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
  },
  footerBrand: {
    fontWeight: 700,
    fontSize: "24px",
    color: "#D8BE97",
    marginBottom: "10px",
  },
  footerDescription: {
    margin: 0,
    color: "#C8B9A7",
    fontSize: "14px",
    lineHeight: 1.75,
    maxWidth: "460px",
  },
  footerBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  footerBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "34px",
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid rgba(216,193,162,0.24)",
    background: "rgba(255,255,255,0.04)",
    color: "#E6D3B7",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  footerColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  footerHeading: {
    margin: 0,
    color: "#E5C99C",
    fontSize: "16px",
    fontWeight: 700,
  },
  footerLink: {
    color: "#D9CEC0",
    textDecoration: "none",
    fontSize: "15px",
    lineHeight: 1.5,
  },
  footerMutedText: {
    color: "#AFA08F",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  footerButtonLink: {
    color: "#D9CEC0",
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left",
    fontSize: "15px",
    cursor: "pointer",
    lineHeight: 1.5,
  },
  paymentBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  paymentBadge: {
    minWidth: "58px",
    height: "34px",
    padding: "0 12px",
    borderRadius: "10px",
    border: "1px solid rgba(216,193,162,0.22)",
    background: "rgba(255,255,255,0.05)",
    color: "#F4E7D6",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: 700,
  },
  securityBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  securityBadge: {
    minHeight: "34px",
    padding: "8px 12px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, rgba(216,190,151,0.18), rgba(191,148,88,0.12))",
    border: "1px solid rgba(216,193,162,0.2)",
    color: "#EAD9C2",
    fontSize: "12px",
    fontWeight: 700,
  },
  footerBottom: {
    borderTop: "1px solid rgba(216, 193, 162, 0.14)",
    color: "#BFAE99",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  vipSection: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  vipCard: {
    display: "grid",
    alignItems: "stretch",
    borderRadius: "28px",
    border: "1px solid #E1CFBB",
    background: "linear-gradient(135deg, rgba(24,19,14,0.96), rgba(41,30,20,0.96))",
    boxShadow: "0 24px 56px rgba(34, 24, 15, 0.16)",
    color: "#F6E9D6",
    overflow: "hidden",
  },
  vipContent: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  vipText: {
    margin: 0,
    color: "#D8C5AF",
    fontSize: "16px",
    lineHeight: 1.75,
    maxWidth: "680px",
  },
  vipBenefitGrid: {
    display: "grid",
    gap: "12px",
    marginTop: "8px",
  },
  vipBenefitItem: {
    borderRadius: "16px",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(216,193,162,0.14)",
    color: "#F3E8DA",
    fontSize: "14px",
    lineHeight: 1.55,
  },
  vipAside: {
    display: "flex",
    alignItems: "stretch",
  },
  vipAsideCard: {
    width: "100%",
    borderRadius: "22px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
    padding: "22px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "12px",
  },
  vipAsideKicker: {
    display: "inline-block",
    color: "#D8BE97",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: "6px",
  },
  vipAsideTitle: {
    color: "#FFF6EB",
    fontSize: "26px",
    lineHeight: 1.1,
  },
  vipAsideText: {
    margin: 0,
    color: "#D7C3AD",
    fontSize: "14px",
    lineHeight: 1.7,
  },
  vipPrimaryButton: {
    marginTop: "6px",
    minHeight: "52px",
    borderRadius: "16px",
    border: "1px solid rgba(212, 175, 119, 0.34)",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(120, 87, 45, 0.18)",
  },
  vipModalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 140,
    background: "rgba(17, 13, 10, 0.62)",
    backdropFilter: "blur(5px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
  },
  vipModalCard: {
    width: "100%",
    maxWidth: "620px",
    borderRadius: "28px",
    border: "1px solid #E2D2BF",
    background: "linear-gradient(180deg, #FFF9F1, #F4E8D8)",
    boxShadow: "0 28px 60px rgba(25, 18, 12, 0.24)",
    padding: "24px",
  },
  vipModalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    marginBottom: "16px",
  },
  vipModalTitle: {
    margin: "0 0 8px",
    color: "#3B2F28",
    fontSize: "28px",
    lineHeight: 1.08,
  },
  vipModalText: {
    margin: 0,
    color: "#6E6156",
    fontSize: "14px",
    lineHeight: 1.65,
  },
  vipModalClose: {
    width: "40px",
    height: "40px",
    borderRadius: "999px",
    border: "1px solid #E2D2BF",
    background: "#FFFDF9",
    color: "#6E5844",
    fontSize: "28px",
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  vipForm: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  vipFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  vipFieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  vipLabel: {
    color: "#5E4A38",
    fontSize: "13px",
    fontWeight: 700,
  },
  vipOptional: {
    color: "#8B7A6A",
    fontWeight: 500,
  },
  vipInput: {
    width: "100%",
    minHeight: "48px",
    borderRadius: "14px",
    border: "1px solid #D9C6B0",
    background: "rgba(255,255,255,0.88)",
    padding: "0 14px",
    boxSizing: "border-box",
    color: "#342922",
    fontSize: "15px",
    outline: "none",
  },
  vipSelect: {
    width: "100%",
    minHeight: "48px",
    borderRadius: "14px",
    border: "1px solid #D9C6B0",
    background: "rgba(255,255,255,0.88)",
    padding: "0 14px",
    boxSizing: "border-box",
    color: "#342922",
    fontSize: "15px",
    outline: "none",
  },
  vipSubmitButton: {
    minHeight: "52px",
    borderRadius: "16px",
    border: "1px solid rgba(212, 175, 119, 0.34)",
    background: "linear-gradient(135deg, #1B1612, #2A211A)",
    color: "#FFFFFF",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "6px",
    boxShadow: "0 16px 30px rgba(18,18,18,0.16)",
  },
  vipSuccessBox: {
    borderRadius: "18px",
    border: "1px solid #DCC7AA",
    background: "linear-gradient(180deg, #FFFDF9, #F6EBDD)",
    color: "#3F322A",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: 1.65,
    padding: "22px",
  },
  whatsappFloat: {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "62px",
    height: "62px",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "#FFFFFF",
    boxShadow: "0 18px 34px rgba(22, 163, 74, 0.34)",
    border: "3px solid rgba(255,255,255,0.92)",
    zIndex: 120,
    textDecoration: "none",
    animation: "maisonWhatsappPulse 2.8s infinite",
  },
  whatsappTooltip: {
    position: "absolute",
    right: "76px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "#111111",
    color: "#FFFFFF",
    padding: "10px 14px",
    borderRadius: "12px",
    whiteSpace: "nowrap",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.01em",
    boxShadow: "0 14px 30px rgba(17,17,17,0.18)",
  },
};
