import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

type ProdutoDoc = {
  nome?: string;
  slug?: string;
  updatedAt?: string;
};

function gerarSlug(texto: string): string {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function gerarSlugComFallback(nome: string, id: string): string {
  const base = gerarSlug(nome);
  return base || `produto-${id}`;
}

export async function GET(req: NextRequest) {
  try {
    const tokenUrl = req.nextUrl.searchParams.get("token") || "";
    const tokenEnv = process.env.ADMIN_MAISON_TOKEN || "";

    if (!tokenEnv) {
      return NextResponse.json(
        {
          ok: false,
          erro: "ADMIN_MAISON_TOKEN não configurado na Vercel.",
        },
        { status: 500 },
      );
    }

    if (tokenUrl !== tokenEnv) {
      return NextResponse.json(
        {
          ok: false,
          erro: "Token inválido.",
        },
        { status: 401 },
      );
    }

    const snap = await adminDb.collection("products").get();

    const slugsUsados = new Map<string, string>();
    const atualizados: Array<{
      id: string;
      nome: string;
      slugAnterior?: string;
      slugNovo: string;
    }> = [];
    const ignorados: Array<{
      id: string;
      nome: string;
      motivo: string;
    }> = [];

    snap.docs.forEach((doc) => {
      const data = doc.data() as ProdutoDoc;
      const slugAtual = String(data.slug || "").trim();

      if (slugAtual) {
        slugsUsados.set(slugAtual, doc.id);
      }
    });

    for (const produtoDoc of snap.docs) {
      const data = produtoDoc.data() as ProdutoDoc;
      const id = produtoDoc.id;
      const nome = String(data.nome || "").trim();
      const slugAnterior = String(data.slug || "").trim();

      if (!nome) {
        ignorados.push({
          id,
          nome: "",
          motivo: "Produto sem nome.",
        });
        continue;
      }

      if (slugAnterior) {
        ignorados.push({
          id,
          nome,
          motivo: "Produto já tinha slug.",
        });
        continue;
      }

      const baseSlug = gerarSlugComFallback(nome, id);
      let slugFinal = baseSlug;
      let contador = 2;

      while (slugsUsados.has(slugFinal) && slugsUsados.get(slugFinal) !== id) {
        slugFinal = `${baseSlug}-${contador}`;
        contador += 1;
      }

      slugsUsados.set(slugFinal, id);

      await produtoDoc.ref.update({
        slug: slugFinal,
        updatedAt: new Date().toISOString(),
      });

      atualizados.push({
        id,
        nome,
        slugAnterior: slugAnterior || undefined,
        slugNovo: slugFinal,
      });
    }

    return NextResponse.json({
      ok: true,
      totalProdutos: snap.size,
      totalAtualizados: atualizados.length,
      totalIgnorados: ignorados.length,
      atualizados,
      ignorados,
    });
  } catch (error) {
    console.error("Erro ao gerar slugs dos produtos:", error);

    return NextResponse.json(
      {
        ok: false,
        erro: "Erro ao gerar slugs dos produtos.",
      },
      { status: 500 },
    );
  }
}
