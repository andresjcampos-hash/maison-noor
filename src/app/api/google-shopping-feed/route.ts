import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = "https://www.maisonnoor.com.br";

type ProdutoFirestore = {
  nome?: string;
  marca?: string;
  categoria?: string;
  descricao?: string;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  imagem?: string;
  imagem2?: string;
  imagem3?: string;
  imageUrl?: string;
  foto?: string;
  precoVenda?: number;
  volumeMl?: number;
  familiaOlfativa?: string;
  notasTopo?: string;
  notasCoracao?: string;
  notasFundo?: string;
};

function escaparXml(valor: unknown) {
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

  if (!texto) return `${SITE_URL}/produtos/sem-imagem.png`;
  if (texto.startsWith("http://") || texto.startsWith("https://")) return texto;

  return `${SITE_URL}${texto.startsWith("/") ? texto : `/${texto}`}`;
}

function imagemPrincipal(produto: ProdutoFirestore) {
  const imagem = produto.imagem || produto.imageUrl || produto.foto || produto.imagem2 || produto.imagem3;

  if (imagem) return urlAbsoluta(imagem);

  const slug = slugify(produto.nome || "produto");
  return `${SITE_URL}/produtos/${slug}.png`;
}

function categoriaGoogle(categoria?: string) {
  const valor = String(categoria || "").toLowerCase();

  if (valor.includes("feminino")) return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
  if (valor.includes("masculino")) return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";

  return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
}

function generoGoogle(categoria?: string) {
  const valor = String(categoria || "").toLowerCase();

  if (valor.includes("feminino")) return "female";
  if (valor.includes("masculino")) return "male";

  return "unisex";
}

function disponibilidade(estoque: number, reservado: number) {
  const disponivel = Math.max(0, estoque - reservado);
  return disponivel > 0 ? "in_stock" : "out_of_stock";
}

function montarDescricao(produto: ProdutoFirestore) {
  const partes = [
    produto.descricao,
    produto.familiaOlfativa ? `Família olfativa: ${produto.familiaOlfativa}.` : "",
    produto.notasTopo ? `Notas de saída: ${produto.notasTopo}.` : "",
    produto.notasCoracao ? `Notas de coração: ${produto.notasCoracao}.` : "",
    produto.notasFundo ? `Notas de fundo: ${produto.notasFundo}.` : "",
    produto.volumeMl ? `Volume: ${produto.volumeMl}ml.` : "",
  ];

  const descricao = limparTexto(partes.filter(Boolean).join(" "), 5000);

  return (
    descricao ||
    "Perfume árabe importado com curadoria premium Maison Noor, fragrância sofisticada e atendimento consultivo."
  );
}

export async function GET() {
  try {
    const snapshot = await adminDb.collection("products").get();

    const items = snapshot.docs
      .map((doc) => {
        const produto = doc.data() as ProdutoFirestore;
        const ativo = produto.ativo !== false;
        const nome = limparTexto(produto.nome || "");
        const preco = Number(produto.precoVenda || 0);
        const estoque = Number(produto.estoque || 0);
        const reservado = Number(produto.reservado || 0);

        if (!ativo) return null;
        if (!nome) return null;
        if (!preco || preco <= 0) return null;

        const link = `${SITE_URL}/produto/${doc.id}`;
        const imagem = imagemPrincipal(produto);
        const descricao = montarDescricao(produto);
        const marca = limparTexto(produto.marca || "Maison Noor", 70);
        const categoria = limparTexto(produto.categoria || "unissex", 80);
        const titulo = limparTexto(`${nome}${produto.volumeMl ? ` ${produto.volumeMl}ml` : ""}`, 150);
        const disponibilidadeProduto = disponibilidade(estoque, reservado);

        return `
    <item>
      <g:id>${escaparXml(doc.id)}</g:id>
      <g:title>${escaparXml(titulo)}</g:title>
      <g:description>${escaparXml(descricao)}</g:description>
      <g:link>${escaparXml(link)}</g:link>
      <g:image_link>${escaparXml(imagem)}</g:image_link>
      <g:availability>${disponibilidadeProduto}</g:availability>
      <g:price>${preco.toFixed(2)} BRL</g:price>
      <g:condition>new</g:condition>
      <g:brand>${escaparXml(marca)}</g:brand>
      <g:product_type>${escaparXml(`Perfumes Árabes > ${categoria}`)}</g:product_type>
      <g:google_product_category>${escaparXml(categoriaGoogle(produto.categoria))}</g:google_product_category>
      <g:gender>${generoGoogle(produto.categoria)}</g:gender>
      <g:age_group>adult</g:age_group>
      <g:identifier_exists>no</g:identifier_exists>
      <g:adult>no</g:adult>
    </item>`;
      })
      .filter(Boolean)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Maison Noor Parfums</title>
    <link>${SITE_URL}</link>
    <description>Feed de produtos da Maison Noor Parfums para Google Merchant Center</description>
${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar feed Google Shopping:", error);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Maison Noor Parfums</title>
    <link>${SITE_URL}</link>
    <description>Erro ao gerar feed de produtos da Maison Noor Parfums</description>
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 500,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }
}
