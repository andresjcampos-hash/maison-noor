import type { Metadata } from "next";
import ProdutoClient from "./produto-client";
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

const SITE_URL = "https://www.maisonnoor.com.br";

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
};

type ProdutoSeo = {
  id: string;
  slug?: string;
  nome?: string;
  marca?: string;
  descricao?: string;
  observacoes?: string;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  imagem?: string;
  imageUrl?: string;
  foto?: string;
  categoria?: string;
  volumeMl?: number;
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

function urlAbsoluta(valor?: string) {
  const texto = String(valor || "").trim();
  if (!texto) return `${SITE_URL}/icon.png`;
  if (texto.startsWith("http://") || texto.startsWith("https://")) return texto;
  return `${SITE_URL}${texto.startsWith("/") ? texto : `/${texto}`}`;
}

function limparDescricaoSeo(valor?: string) {
  const descricao = String(valor || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!descricao) {
    return "Perfumes árabes originais com curadoria premium, fragrâncias marcantes, atendimento consultivo e envio para todo o Brasil.";
  }

  return descricao.length > 155 ? `${descricao.slice(0, 152).trim()}...` : descricao;
}

async function getParams(params: PageProps["params"]) {
  return await Promise.resolve(params);
}

async function buscarProdutoPorIdOuSlug(valor: string): Promise<ProdutoSeo | null> {
  const termo = decodeURIComponent(String(valor || "").trim());
  if (!termo) return null;

  const docSnap = await getDoc(doc(db, "products", termo));

  if (docSnap.exists()) {
    const data = docSnap.data() as Omit<ProdutoSeo, "id">;
    return {
      id: docSnap.id,
      ...data,
      slug: data.slug || slugify(data.nome || docSnap.id),
    };
  }

  const slugSnap = await getDocs(
    query(collection(db, "products"), where("slug", "==", termo), limit(1)),
  );

  if (!slugSnap.empty) {
    const item = slugSnap.docs[0];
    const data = item.data() as Omit<ProdutoSeo, "id">;

    return {
      id: item.id,
      ...data,
      slug: data.slug || slugify(data.nome || item.id),
    };
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await getParams(params);
  const produto = await buscarProdutoPorIdOuSlug(id);

  if (!produto) {
    return {
      title: "Produto não encontrado | Maison Noor Parfums",
      description:
        "Produto não encontrado no catálogo Maison Noor Parfums.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const nome = produto.nome || "Perfume Maison Noor";
  const marca = produto.marca || "Maison Noor";
  const slug = produto.slug || slugify(nome || produto.id);
  const url = `${SITE_URL}/produto/${slug}`;
  const imagem = urlAbsoluta(produto.imagem || produto.imageUrl || produto.foto);
  const volume = produto.volumeMl ? ` ${produto.volumeMl}ml` : "";
  const titulo = `${nome}${volume} | ${marca} | Maison Noor Parfums`;
  const descricao = limparDescricaoSeo(
    produto.descricao ||
      produto.observacoes ||
      `${nome} ${marca}. Perfume árabe original com curadoria premium Maison Noor, fragrância marcante e envio para todo o Brasil.`,
  );

  return {
    title: titulo,
    description: descricao,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: titulo,
      description: descricao,
      url,
      siteName: "Maison Noor Parfums",
      locale: "pt_BR",
      type: "website",
      images: [
        {
          url: imagem,
          width: 1200,
          height: 1200,
          alt: nome,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [imagem],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: {
      "product:brand": marca,
      "product:price:currency": "BRL",
      "product:price:amount": String(Number(produto.precoVenda || 0).toFixed(2)),
      "og:price:currency": "BRL",
      "og:price:amount": String(Number(produto.precoVenda || 0).toFixed(2)),
    },
  };
}

export default function ProdutoPage() {
  return <ProdutoClient />;
}
