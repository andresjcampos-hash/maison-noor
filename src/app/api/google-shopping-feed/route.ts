import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = "https://www.maisonnoor.com.br";

type ProdutoFirestore = {
  nome?: string;
  slug?: string;
  marca?: string;
  categoria?: string;
  descricao?: string;
  observacoes?: string;
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
  fixacao?: string;
  projecao?: string;
  ocasiao?: string;
  tipo?: string;
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
  const imagem =
    produto.imagem ||
    produto.imageUrl ||
    produto.foto ||
    produto.imagem2 ||
    produto.imagem3;

  if (imagem) return urlAbsoluta(imagem);

  const slug = slugify(produto.nome || "produto");
  return `${SITE_URL}/produtos/${slug}.png`;
}

function categoriaGoogle(categoria?: string) {
  const valor = String(categoria || "").toLowerCase();

  if (valor.includes("feminino")) {
    return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
  }

  if (valor.includes("masculino")) {
    return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
  }

  return "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne";
}

function generoGoogle(categoria?: string) {
  const valor = String(categoria || "").toLowerCase();

  if (valor.includes("feminino")) return "female";
  if (valor.includes("masculino")) return "male";

  return "unisex";
}

function categoriaTexto(categoria?: string) {
  const valor = String(categoria || "").toLowerCase();

  if (valor.includes("feminino")) return "Feminino";
  if (valor.includes("masculino")) return "Masculino";
  if (valor.includes("unissex")) return "Unissex";

  return "Unissex";
}

function disponibilidade(estoque: number, reservado: number) {
  const disponivel = Math.max(0, estoque - reservado);
  return disponivel > 0 ? "in_stock" : "out_of_stock";
}

function normalizar(valor?: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function marcaNormalizada(produto: ProdutoFirestore) {
  const marca = limparTexto(produto.marca || "", 70);

  if (marca) return marca;

  const nome = normalizar(produto.nome);

  if (nome.includes("yara") || nome.includes("asad") || nome.includes("fakhar")) {
    return "Lattafa";
  }

  if (nome.includes("club de nuit") || nome.includes("armaf")) {
    return "Armaf";
  }

  if (nome.includes("shagaf")) {
    return "Swiss Arabian";
  }

  return "Maison Noor";
}

function temVolumeNoNome(nome: string) {
  return /\b\d{2,3}\s?ml\b/i.test(nome);
}

function montarTituloShopping(produto: ProdutoFirestore) {
  const nome = limparTexto(produto.nome || "", 90);
  const marca = marcaNormalizada(produto);
  const categoria = categoriaTexto(produto.categoria);
  const volume = produto.volumeMl && !temVolumeNoNome(nome) ? `${produto.volumeMl}ml` : "";
  const tipo = limparTexto(produto.tipo || "Eau de Parfum", 40);
  const fixacao = normalizar(produto.fixacao).includes("alta") ? "Alta Fixação" : "Alta Fixação";

  const nomeLower = normalizar(nome);
  const marcaJaNoNome = normalizar(marca) && nomeLower.includes(normalizar(marca));

  const partes = [
    "Perfume Árabe",
    categoria !== "Unissex" ? categoria : "Unissex",
    nome,
    !marcaJaNoNome && marca !== "Maison Noor" ? marca : "",
    volume,
    tipo && !nomeLower.includes(normalizar(tipo)) ? tipo : "",
    fixacao,
  ];

  return limparTexto(
    partes
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " "),
    150,
  );
}

function montarDescricao(produto: ProdutoFirestore) {
  const nome = limparTexto(produto.nome || "Perfume árabe", 90);
  const marca = marcaNormalizada(produto);
  const categoria = categoriaTexto(produto.categoria);
  const volume = produto.volumeMl ? `${produto.volumeMl}ml` : "";
  const familia = limparTexto(produto.familiaOlfativa || "", 120);
  const fixacao = limparTexto(produto.fixacao || "boa fixação", 80);
  const projecao = limparTexto(produto.projecao || "", 80);
  const ocasiao = limparTexto(produto.ocasiao || "uso diário, encontros e ocasiões especiais", 160);

  const descricaoBase =
    produto.descricao ||
    produto.observacoes ||
    `${nome} é um perfume árabe ${categoria.toLowerCase()} com curadoria premium Maison Noor.`;

  const partes = [
    `${nome}${marca ? ` ${marca}` : ""}.`,
    `Perfume árabe ${categoria.toLowerCase()} original com curadoria Maison Noor.`,
    volume ? `Volume: ${volume}.` : "",
    familia ? `Família olfativa: ${familia}.` : "",
    produto.notasTopo ? `Notas de saída: ${produto.notasTopo}.` : "",
    produto.notasCoracao ? `Notas de coração: ${produto.notasCoracao}.` : "",
    produto.notasFundo ? `Notas de fundo: ${produto.notasFundo}.` : "",
    `Fixação: ${fixacao}.`,
    projecao ? `Projeção: ${projecao}.` : "",
    `Indicado para ${ocasiao.toLowerCase()}.`,
    limparTexto(descricaoBase, 900),
    "Compre na Maison Noor Parfums com atendimento consultivo, seleção premium e envio para todo o Brasil.",
  ];

  return limparTexto(partes.filter(Boolean).join(" "), 5000);
}

function montarProductType(produto: ProdutoFirestore) {
  const categoria = categoriaTexto(produto.categoria);
  const marca = marcaNormalizada(produto);

  return limparTexto(`Perfumes Árabes > ${categoria} > ${marca}`, 750);
}

function montarLinkProduto(docId: string, produto: ProdutoFirestore) {
  const slug = limparTexto(produto.slug || "", 120) || slugify(produto.nome || docId);
  return `${SITE_URL}/produto/${slug || docId}`;
}

function montarAdditionalImageLinks(produto: ProdutoFirestore) {
  const imagens = [produto.imagem2, produto.imagem3]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map(urlAbsoluta);

  return imagens
    .map((imagem) => `<g:additional_image_link>${escaparXml(imagem)}</g:additional_image_link>`)
    .join("\n      ");
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

        const link = montarLinkProduto(doc.id, produto);
        const imagem = imagemPrincipal(produto);
        const descricao = montarDescricao(produto);
        const marca = limparTexto(marcaNormalizada(produto), 70);
        const titulo = montarTituloShopping(produto);
        const disponibilidadeProduto = disponibilidade(estoque, reservado);
        const additionalImages = montarAdditionalImageLinks(produto);

        return `
    <item>
      <g:id>${escaparXml(doc.id)}</g:id>
      <g:title>${escaparXml(titulo)}</g:title>
      <g:description>${escaparXml(descricao)}</g:description>
      <g:link>${escaparXml(link)}</g:link>
      <g:image_link>${escaparXml(imagem)}</g:image_link>
      ${additionalImages}
      <g:availability>${disponibilidadeProduto}</g:availability>
      <g:price>${preco.toFixed(2)} BRL</g:price>
      <g:condition>new</g:condition>
      <g:brand>${escaparXml(marca)}</g:brand>
      <g:product_type>${escaparXml(montarProductType(produto))}</g:product_type>
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
