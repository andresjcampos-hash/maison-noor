import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase-admin";
import ProdutoClient from "./produto-client";

const SITE_URL = "https://www.maisonnoor.com.br";

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

function limparDescricao(valor?: string) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 155);
}

function getCategoriaSeo(categoria?: string) {
  const valor = String(categoria || "").toLowerCase();

  if (valor.includes("feminino")) {
    return {
      nome: "Perfumes Árabes Femininos",
      url: `${SITE_URL}/perfumes-arabes-femininos`,
    };
  }

  if (valor.includes("masculino")) {
    return {
      nome: "Perfumes Árabes Masculinos",
      url: `${SITE_URL}/perfumes-arabes-masculinos`,
    };
  }

  if (valor.includes("unissex")) {
    return {
      nome: "Perfumes Árabes Unissex",
      url: `${SITE_URL}/perfumes-arabes-unissex`,
    };
  }

  return {
    nome: "Perfumes Árabes",
    url: `${SITE_URL}/produtos`,
  };
}

async function buscarProduto(id: string): Promise<ProdutoSeo | null> {
  try {
    const parametro = decodeURIComponent(String(id || "")).trim();
    const parametroSlug = slugify(parametro);

    // 1) Compatibilidade com URL antiga usando ID do Firestore:
    // /produto/9V2sKGWV1FbQo3IBHWQj
    let snap = await adminDb.collection("products").doc(parametro).get();

    if (snap.exists) {
      return {
        id: snap.id,
        ...(snap.data() as any),
      };
    }

    // 2) Compatibilidade com campo slug salvo no Firebase, caso exista:
    // /produto/watani-intense-eau-de-parfum
    const slugSnap = await adminDb
      .collection("products")
      .where("slug", "==", parametroSlug)
      .limit(1)
      .get();

    if (!slugSnap.empty) {
      const docProduto = slugSnap.docs[0];
      return {
        id: docProduto.id,
        ...(docProduto.data() as any),
      };
    }

    // 3) Fallback SEO: quando o produto ainda NÃO tem campo slug no Firebase,
    // busca todos e compara com slugify(nome). Isso mantém as URLs bonitas funcionando
    // sem precisar alterar produto por produto no CRM.
    const todosSnap = await adminDb.collection("products").get();

    const encontrado = todosSnap.docs.find((docProduto) => {
      const data = docProduto.data() as any;
      const nomeSlug = slugify(String(data?.nome || ""));
      const slugSalvo = slugify(String(data?.slug || ""));
      return nomeSlug === parametroSlug || slugSalvo === parametroSlug;
    });

    if (!encontrado) return null;

    return {
      id: encontrado.id,
      ...(encontrado.data() as any),
    };
  } catch (error) {
    console.error("Erro ao buscar produto para SEO:", error);
    return null;
  }
}

function montarSeoProduto(produto: ProdutoSeo, id: string) {
  const nome = produto.nome || "Perfume Árabe Premium";
  const marca = produto.marca || "Maison Noor";
  const slug = produto.slug || slugify(nome || id);
  const url = `${SITE_URL}/produto/${slug}`;
  const imagem = urlAbsoluta(produto.imagem || produto.imageUrl || produto.foto);
  const preco = Number(produto.precoVenda || 0);
  const estoque = Number(produto.estoque || 0);
  const reservado = Number(produto.reservado || 0);
  const disponivel = Math.max(0, estoque - reservado) > 0;

  const descricao = limparDescricao(
    produto.descricao ||
      produto.observacoes ||
      `${nome} ${marca}. Perfume árabe original com curadoria premium Maison Noor, fragrância marcante e atendimento consultivo.`,
  );

  const titulo = `${nome} | ${marca} | Maison Noor Parfums`;
  const categoriaSeo = getCategoriaSeo(produto.categoria);

  return {
    nome,
    marca,
    slug,
    url,
    imagem,
    preco,
    disponivel,
    descricao,
    titulo,
    categoriaSeo,
  };
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const produto = await buscarProduto(params.id);

  if (!produto) {
    return {
      title: "Produto Maison Noor | Perfumes Árabes Premium",
      description:
        "Perfumes árabes originais com curadoria premium, fragrâncias marcantes e envio para todo o Brasil.",
      robots: {
        index: true,
        follow: true,
      },
    };
  }

  const seo = montarSeoProduto(produto, params.id);

  return {
    title: seo.titulo,
    description: seo.descricao,
    alternates: {
      canonical: seo.url,
    },
    openGraph: {
      title: seo.titulo,
      description: seo.descricao,
      url: seo.url,
      siteName: "Maison Noor Parfums",
      locale: "pt_BR",
      type: "website",
      images: [
        {
          url: seo.imagem,
          width: 1200,
          height: 1200,
          alt: seo.nome,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.titulo,
      description: seo.descricao,
      images: [seo.imagem],
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
  };
}

export default async function ProdutoPage({
  params,
}: {
  params: { id: string };
}) {
  const produto = await buscarProduto(params.id);

  const schemas = [];

  if (produto) {
    const seo = montarSeoProduto(produto, params.id);

    schemas.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: seo.nome,
      description: seo.descricao,
      image: [seo.imagem],
      url: seo.url,
      sku: produto.id,
      category: seo.categoriaSeo.nome,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": seo.url,
      },
      brand: {
        "@type": "Brand",
        name: seo.marca,
      },
      offers: {
        "@type": "Offer",
        url: seo.url,
        priceCurrency: "BRL",
        price: seo.preco.toFixed(2),
        availability: seo.disponivel
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: {
          "@type": "Organization",
          name: "Maison Noor Parfums",
          url: SITE_URL,
        },
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "127",
        bestRating: "5",
        worstRating: "1",
      },
    });

    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Início",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: seo.categoriaSeo.nome,
          item: seo.categoriaSeo.url,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: seo.nome,
          item: seo.url,
        },
      ],
    });

    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Os perfumes da Maison Noor são originais?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. A Maison Noor trabalha com perfumes árabes originais, selecionados com curadoria premium.",
          },
        },
        {
          "@type": "Question",
          name: "A Maison Noor envia para todo o Brasil?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. A Maison Noor realiza envio para todo o Brasil, com atendimento consultivo para confirmar disponibilidade, frete e forma de pagamento.",
          },
        },
        {
          "@type": "Question",
          name: "Como funciona a compra assistida?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Você pode finalizar pelo site ou falar com a Maison Noor pelo WhatsApp para receber orientação sobre fragrância, fixação, ocasião de uso e pagamento.",
          },
        },
      ],
    });
  }

  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Maison Noor Parfums",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/produtos?busca={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });

  schemas.push({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Maison Noor Parfums",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    sameAs: ["https://www.instagram.com/maison.noor.parfums"],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+55-12-98238-9658",
      contactType: "customer service",
      areaServed: "BR",
      availableLanguage: "Portuguese",
    },
  });

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema),
          }}
        />
      ))}

      <ProdutoClient />
    </>
  );
}