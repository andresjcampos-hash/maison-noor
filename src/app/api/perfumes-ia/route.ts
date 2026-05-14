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

function montarPalavrasChave(familia: string, body: PerfilPayload) {
  const texto = normalizarTexto(
    `${familia} ${body.genero || ""} ${body.intensidade || ""} ${body.estilo || ""} ${body.ocasiao || ""} ${body.clima || ""} ${body.preferencia || ""}`
  );

  const keywords = new Set<string>();

  if (texto.includes("doce") || texto.includes("gourmand") || texto.includes("baunilha")) {
    ["doce", "gourmand", "baunilha", "vanilla", "yara", "candy", "rose", "ward", "sabah"].forEach((item) => keywords.add(item));
  }

  if (texto.includes("amadeir") || texto.includes("oud") || texto.includes("intenso")) {
    ["oud", "amadeirado", "wood", "ambar", "oriental", "asad", "club", "bade", "fakhar", "intense"].forEach((item) => keywords.add(item));
  }

  if (texto.includes("fresco") || texto.includes("calor") || texto.includes("dia")) {
    ["fresco", "fresh", "aqua", "citrico", "cítrico", "hawas", "blue"].forEach((item) => keywords.add(item));
  }

  if (texto.includes("noite") || texto.includes("encontro") || texto.includes("sedutor")) {
    ["intenso", "intense", "oud", "asad", "elixir", "black", "club", "oriental"].forEach((item) => keywords.add(item));
  }

  if (normalizarTexto(body.genero).includes("feminino")) {
    ["feminino", "rose", "ward", "yara", "sabah"].forEach((item) => keywords.add(item));
  }

  if (normalizarTexto(body.genero).includes("masculino")) {
    ["masculino", "asad", "hawas", "club", "fakhar"].forEach((item) => keywords.add(item));
  }

  if (normalizarTexto(body.genero).includes("unissex")) {
    ["unissex", "oud", "oriental", "bade"].forEach((item) => keywords.add(item));
  }

  return Array.from(keywords).slice(0, 14);
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

    let familia = "Elegante / Versátil";
    let descricao =
      "Você combina com fragrâncias equilibradas, sofisticadas e versáteis.";
    let intensidadeSugerida = "Moderada";
    let ocasiaoSugerida = "Uso diário e ocasiões especiais";
    let sugestaoAtendimento =
      "Buscar perfumes versáteis, com presença elegante e assinatura olfativa refinada.";

    if (
      perfil.includes("doce") ||
      perfil.includes("baunilha") ||
      perfil.includes("gourmand")
    ) {
      familia = "Doce / Gourmand";
      descricao =
        "Seu perfil combina com perfumes doces, envolventes e memoráveis.";
      intensidadeSugerida = "Moderada a intensa";
      ocasiaoSugerida = "Encontros, noite e momentos especiais";
      sugestaoAtendimento =
        "Priorizar fragrâncias adocicadas, cremosas, femininas ou unissex com fundo marcante.";
    } else if (
      perfil.includes("amadeirado") ||
      perfil.includes("oud") ||
      perfil.includes("intenso")
    ) {
      familia = "Amadeirado / Intenso";
      descricao =
        "Seu perfil combina com perfumes marcantes, sofisticados e de alta presença.";
      intensidadeSugerida = "Intensa";
      ocasiaoSugerida = "Noite, eventos e presença pessoal";
      sugestaoAtendimento =
        "Indicar fragrâncias com madeira, oud, âmbar, especiarias ou perfil oriental sofisticado.";
    } else if (
      perfil.includes("fresco") ||
      perfil.includes("dia") ||
      perfil.includes("calor")
    ) {
      familia = "Fresco / Versátil";
      descricao =
        "Seu perfil combina com fragrâncias leves, elegantes e fáceis de usar no dia a dia.";
      intensidadeSugerida = "Leve a moderada";
      ocasiaoSugerida = "Dia a dia, trabalho e clima quente";
      sugestaoAtendimento =
        "Sugerir perfumes frescos, cítricos, aromáticos ou limpos, com boa versatilidade.";
    } else if (
      perfil.includes("noite") ||
      perfil.includes("encontro") ||
      perfil.includes("sedutor")
    ) {
      familia = "Noturno / Marcante";
      descricao =
        "Seu perfil combina com perfumes intensos, sensuais e perfeitos para ocasiões especiais.";
      intensidadeSugerida = "Moderada a intensa";
      ocasiaoSugerida = "Noite, encontro e eventos";
      sugestaoAtendimento =
        "Buscar opções com rastro marcante, boa fixação e apelo emocional para momentos especiais.";
    }

    return NextResponse.json({
      sucesso: true,
      perfil: {
        familia,
        descricao,
        intensidadeSugerida,
        ocasiaoSugerida,
        sugestaoAtendimento,
        palavrasChave: montarPalavrasChave(familia, body),
        tags: [
          body.genero || "Unissex",
          body.intensidade || intensidadeSugerida,
          body.estilo || "Elegante",
          body.ocasiao || ocasiaoSugerida,
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
