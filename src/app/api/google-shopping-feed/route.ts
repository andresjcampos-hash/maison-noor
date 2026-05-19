// src/app/api/google-shopping-feed/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = "https://www.maisonnoor.com.br";
const DEFAULT_IMAGE = `${SITE_URL}/produtos/sem-imagem.png`;

type ProdutoFirebase = {
  nome?: string;
  marca?: string;
  volumeMl?: number;
  categoria?: string;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean | string;
  observacoes?: string;
  descricao?: string;
  tipo?: string;

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

  notasTopo?: string;
  notasCoracao?: string;
  notasFundo?: string;
  familiaOlfativa?: string;
};

function escapeXml(valor: unknown) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function limparTexto(valor: unknown, limite = 5000) {
  return String(valor ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function numeroSeguro(valor: unknown, fallback = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
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

function urlAbsoluta(valor?: string) {
  const texto = String(valor || "").trim();

  if (!texto) return DEFAULT_IMAGE;
  if (texto.startsWith("http://") || texto.startsWith("https://")) return texto;

  return `${SITE_URL}${texto.startsWith("/") ? texto : `/${texto}`}`;
}

function getImagens(produto: ProdutoFirebase) {
  const slug = slugify(produto.nome || "produto-maison-noor");

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
  ];

  const limpas = candidatas
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map(urlAbsoluta);

  return Array.from(new Set(limpas));
}

function categoriaGoogle(produto: ProdutoFirebase) {
  const texto = `${produto.nome || ""} ${produto.tipo || ""} ${produto.categoria || ""}`.toLowerCase();

  if (texto.includes("creme") || texto.includes("hidratante")) {
    return "Health & Beauty > Personal Care > Cosmetics > Skin Care > Lotion & Moisturizer";
  }

  if (texto.includes("body splash") || texto.includes("splash")) {
    return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
  }

  return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
}

function productType(produto: ProdutoFirebase) {
  const categoria = limparTexto(produto.categoria || "Unissex", 80);
  const tipo = limparTexto(produto.tipo || "Perfume", 80);

  return `Maison Noor > ${tipo} > ${categoria}`;
}

function montarDescricao(produto: ProdutoFirebase) {
  const partes = [
    produto.descricao,
    produto.observacoes,
    produto.familiaOlfativa ? `Família olfativa: ${produto.familiaOlfativa}.` : "",
    produto.notasTopo ? `Notas de saída: ${produto.notasTopo}.` : "",
    produto.notasCoracao ? `Notas de coração: ${produto.notasCoracao}.` : "",
    produto.notasFundo ? `Notas de fundo: ${produto.notasFundo}.` : "",
    produto.volumeMl ? `Volume: ${produto.volumeMl}ml.` : "",
    "Produto original com curadoria premium Maison Noor.",
  ];

  return limparTexto(partes.filter(Boolean).join(" "), 5000);
}

function produtoAtivo(data: ProdutoFirebase) {
  const ativo = data.ativo;
  if (ativo === false) return false;
  if (String(ativo).toLowerCase() === "false") return false;
  return true;
}

function montarItemXml(id: string, produto: ProdutoFirebase) {
  const nome = limparTexto(produto.nome || "Produto Maison Noor", 150);
  const marca = limparTexto(produto.marca || "Maison Noor", 70);
  const preco = numeroSeguro(produto.precoVenda, 0);
  const estoque = numeroSeguro(produto.estoque, 0);
  const reservado = numeroSeguro(produto.reservado, 0);
  const disponivel = Math.max(0, estoque - reservado);
  const imagens = getImagens(produto);
  const imagemPrincipal = imagens[0] || DEFAULT_IMAGE;
  const urlProduto = `${SITE_URL}/produto/${encodeURIComponent(id)}`;
  const titulo = produto.volumeMl ? `${nome} ${produto.volumeMl}ml` : nome;
  const descricao = montarDescricao(produto);

  const adicionais = imagens
    .slice(1, 10)
    .map((img) => `      <g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
    .join("\n");

  return `    <item>
      <g:id>${escapeXml(id)}</g:id>
      <g:title>${escapeXml(titulo)}</g:title>
      <g:description>${escapeXml(descricao)}</g:description>
      <g:link>${escapeXml(urlProduto)}</g:link>
      <g:image_link>${escapeXml(imagemPrincipal)}</g:image_link>
${adicionais ? `${adicionais}\n` : ""}      <g:availability>${disponivel > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${preco.toFixed(2)} BRL</g:price>
      <g:condition>new</g:condition>
      <g:brand>${escapeXml(marca)}</g:brand>
      <g:identifier_exists>false</g:identifier_exists>
      <g:google_product_category>${escapeXml(categoriaGoogle(produto))}</g:google_product_category>
      <g:product_type>${escapeXml(productType(produto))}</g:product_type>
      <g:adult>no</g:adult>
    </item>`;
}

export async function GET() {
  try {
    const snap = await getDocs(collection(db, "products"));

    const itens: string[] = [];

    snap.forEach((documento) => {
      const data = documento.data() as ProdutoFirebase;

      if (!produtoAtivo(data)) return;

      const nome = limparTexto(data.nome || "", 150);
      const preco = numeroSeguro(data.precoVenda, 0);

      if (!nome) return;
      if (preco <= 0) return;

      itens.push(montarItemXml(documento.id, data));
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Maison Noor Parfums</title>
    <link>${SITE_URL}</link>
    <description>Feed de produtos da Maison Noor Parfums para Google Merchant Center</description>
${itens.join("\n")}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar feed Google Shopping:", error);

    const xmlErro = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Maison Noor Parfums</title>
    <link>${SITE_URL}</link>
    <description>Erro ao gerar feed de produtos.</description>
  </channel>
</rss>`;

    return new NextResponse(xmlErro, {
      status: 500,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
}
