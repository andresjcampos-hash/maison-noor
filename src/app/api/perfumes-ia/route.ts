import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PerfilPayload = {
  genero?: string;
  intensidade?: string;
  estilo?: string;
  ocasiao?: string;
  clima?: string;
  preferencia?: string;
};

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PerfilPayload;

    const perfil = [
      body.genero,
      body.intensidade,
      body.estilo,
      body.ocasiao,
      body.clima,
      body.preferencia,
    ]
      .map(normalizarTexto)
      .join(" ");

    let familia = "Elegante";
    let descricao =
      "Você combina com fragrâncias equilibradas, sofisticadas e versáteis.";

    if (
      perfil.includes("doce") ||
      perfil.includes("baunilha") ||
      perfil.includes("gourmand")
    ) {
      familia = "Doce / Gourmand";
      descricao =
        "Seu perfil combina com perfumes doces, envolventes e memoráveis.";
    } else if (
      perfil.includes("amadeirado") ||
      perfil.includes("oud") ||
      perfil.includes("intenso")
    ) {
      familia = "Amadeirado / Intenso";
      descricao =
        "Seu perfil combina com perfumes marcantes, sofisticados e de alta presença.";
    } else if (
      perfil.includes("fresco") ||
      perfil.includes("dia") ||
      perfil.includes("calor")
    ) {
      familia = "Fresco / Versátil";
      descricao =
        "Seu perfil combina com fragrâncias leves, elegantes e fáceis de usar no dia a dia.";
    } else if (
      perfil.includes("noite") ||
      perfil.includes("encontro") ||
      perfil.includes("sedutor")
    ) {
      familia = "Noturno / Marcante";
      descricao =
        "Seu perfil combina com perfumes intensos, sensuais e perfeitos para ocasiões especiais.";
    }

    return NextResponse.json({
      sucesso: true,
      perfil: {
        familia,
        descricao,
        tags: [
          body.genero || "Unissex",
          body.intensidade || "Equilibrado",
          body.estilo || "Elegante",
          body.ocasiao || "Uso especial",
        ],
      },
      mensagem:
        "Perfil olfativo analisado com sucesso pela Perfume IA Maison Noor.",
    });
  } catch (error) {
    console.error("Erro na Perfume IA:", error);

    return NextResponse.json(
      {
        sucesso: false,
        mensagem: "Não foi possível analisar o perfil olfativo agora.",
      },
      { status: 500 }
    );
  }
}