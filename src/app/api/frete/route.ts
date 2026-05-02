import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CEP_ORIGEM = "12230000"; // 🔥 COLOCA SEU CEP AQUI

function calcularFrete(cepDestino: string) {
  const cep = cepDestino.replace(/\D/g, "");

  if (!cep || cep.length !== 8) {
    return null;
  }

  const prefixo = Number(cep.substring(0, 2));

  // 🔥 Lógica inteligente por região
  let pac = 15.9;
  let sedex = 24.9;
  let prazoPac = "5 a 8 dias úteis";
  let prazoSedex = "2 a 3 dias úteis";

  if (prefixo >= 10 && prefixo <= 19) {
    pac = 12.9;
    sedex = 19.9;
  } else if (prefixo >= 20 && prefixo <= 29) {
    pac = 14.9;
    sedex = 22.9;
  } else if (prefixo >= 30 && prefixo <= 39) {
    pac = 16.9;
    sedex = 25.9;
  } else if (prefixo >= 70) {
    pac = 19.9;
    sedex = 29.9;
    prazoPac = "7 a 10 dias úteis";
    prazoSedex = "3 a 5 dias úteis";
  }

  return {
    pac: {
      nome: "Correios PAC",
      valor: pac,
      prazo: prazoPac,
    },
    sedex: {
      nome: "Correios Sedex",
      valor: sedex,
      prazo: prazoSedex,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cep = body?.cep;

    if (!cep) {
      return NextResponse.json({ erro: "CEP não informado" }, { status: 400 });
    }

    const frete = calcularFrete(cep);

    if (!frete) {
      return NextResponse.json({ erro: "CEP inválido" }, { status: 400 });
    }

    return NextResponse.json({
      origem: CEP_ORIGEM,
      destino: cep,
      opcoes: frete,
    });
  } catch (error) {
    return NextResponse.json(
      { erro: "Erro ao calcular frete" },
      { status: 500 }
    );
  }
}