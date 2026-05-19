// src/app/api/google-shopping-feed/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = "https://www.maisonnoor.com.br";
const DEFAULT_IMAGE = `${SITE_URL}/produtos/sem-imagem.png`;

type CategoriaCRM = "masculino" | "feminino" | "unissex";

type ProdutoFirebase = {
  id: string;
  nome?: string;
  marca?: string;
  volumeMl?: number;
  categoria?: CategoriaCRM;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
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

function somenteTexto(valor: unknown) {
  return String(valor ?? "")
    .replace(/\s+/g, " ")
    .trim();
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

function getImagemPrincipal(produto: ProdutoFirebase) {
  const slug = slugify(produto.nome || "produto");

  const imagem =
    produto.imagem ||
    produto.imageUrl ||
    produto.foto ||
    produto.imagem2 ||
    produto.image2 ||
    produto.imageUrl2 ||
    produto.foto2 ||
    produto.imagem3 ||
    produto.image3 ||
    produto.imageUrl3 ||
    produto.foto3 ||
    (Array.isArray(produto.fotos) ? produto.fotos[0] : "") ||
    (Array.isArray(produto.imagens) ? produto.imagens[0] : "") ||
    (Array.isArray(produto.galeria) ? produto.galeria[0] : "") ||
    `/produtos/${slug}.png`;

  return urlAbsoluta(imagem);
}

function getImagensAdicionais(produto: ProdutoFirebase) {
  const slug = slugify(produto.nome || "produto");

  const imagens = [
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
    `/produtos/${slug}-1.png`,
    `/produtos/${slug}-2.png`,
    `/produtos/${slug}-3.png`,
  ]
    .map((item) => urlAbsoluta(item))
    .filter((item) => item && item !== DEFAULT_IMAGE);

  return Array.from(new Set(imagens)).slice(0, 10);
}

function categoriaGoogle(categoria?: CategoriaCRM) {
  if (categoria === "masculino") return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
  if (categoria === "feminino") return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
  return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
}

function generoGoogle(categoria?: CategoriaCRM) {
  if (categoria === "masculino") return "male";
  if (categoria === "feminino") return "female";
  return "unisex";
}

function montarDescricao(produto: ProdutoFirebase) {
  const partes = [
    produto.descricao,
    produto.observacoes,
    produto.familiaOlfativa ? `Família olfativa: ${produto.familiaOlfativa}.` : "",
    produto.notasTopo ? `Notas de saída: ${produto.notasTopo}.` : "",
    produto.notasCoracao ? `Notas de coração: ${produto.notasCoracao}.` : "",
    produto.notasFundo ? `Notas de fundo: ${produto.notasFundo}.` : "",
    "Perfume árabe original com curadoria premium Maison Noor.",
  ];

  const texto = somenteTexto(partes.filter(Boolean).join(" "));

  return texto || "Perfume árabe original com curadoria premium Maison Noor.";
}

function formatarPreco(preco: number) {
  return `${preco.toFixed(2)} BRL`;
}

export async function GET() {
  try {
    const produtosRef = collection(db, "products");

    let snap;
    try {
      snap = await getDocs(query(produtosRef, where("ativo", "==", true)));
    } catch {
      snap = await getDocs(produtosRef);
    }

    const itens = snap.docs
      .map((docSnap) => {
        const data = docSnap.data() as ProdutoFirebase;

        const produto: ProdutoFirebase = {
          ...data,
          id: docSnap.id,
        };

        const nome = somenteTexto(produto.nome || "Perfume Maison Noor");
        const preco = Number(produto.precoVenda || 0);
        const estoque = Number(produto.estoque || 0);
        const reservado = Number(produto.reservado || 0);
        const disponivel = Math.max(0, estoque - reservado);
        const ativo = produto.ativo ?? true;

        if (!ativo || preco <= 0 || !nome) return "";

        const link = `${SITE_URL}/produto/${produto.id}`;
        const imagemPrincipal = getImagemPrincipal(produto);
        const imagensAdicionais = getImagensAdicionais(produto).filter(
          (img) => img !== imagemPrincipal,
        );

        const marca = somenteTexto(produto.marca || "Maison Noor");
        const volume = produto.volumeMl ? `${produto.volumeMl}ml` : "";
        const titulo = volume ? `${nome} ${volume}` : nome;
        const descricao = montarDescricao(produto).slice(0, 5000);
        const disponibilidade = disponivel > 0 ? "in_stock" : "out_of_stock";
        const tipoProduto = produto.tipo || "Perfume árabe";

        const imagensXml = imagensAdicionais
          .map((img) => `    <g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
          .join("\n");

        return `  <item>
    <g:id>${escapeXml(produto.id)}</g:id>
    <g:title>${escapeXml(titulo)}</g:title>
    <g:description>${escapeXml(descricao)}</g:description>
    <g:link>${escapeXml(link)}</g:link>
    <g:image_link>${escapeXml(imagemPrincipal)}</g:image_link>
${imagensXml}
    <g:availability>${disponibilidade}</g:availability>
    <g:price>${escapeXml(formatarPreco(preco))}</g:price>
    <g:condition>new</g:condition>
    <g:brand>${escapeXml(marca)}</g:brand>
    <g:google_product_category>${escapeXml(categoriaGoogle(produto.categoria))}</g:google_product_category>
    <g:product_type>${escapeXml(`Perfumes árabes > ${tipoProduto}`)}</g:product_type>
    <g:gender>${escapeXml(generoGoogle(produto.categoria))}</g:gender>
    <g:age_group>adult</g:age_group>
    <g:identifier_exists>no</g:identifier_exists>
    <g:adult>no</g:adult>
  </item>`;
      })
      .filter(Boolean)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Maison Noor Parfums</title>
  <link>${SITE_URL}</link>
  <description>Feed de produtos da Maison Noor Parfums para Google Merchant Center</description>
${itens}
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

    return NextResponse.json(
      {
        erro: "Erro ao gerar feed Google Shopping",
      },
      { status: 500 },
    );
  }
}
