import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CEP_ORIGEM = "12230000"; // CEP origem Maison Noor

function somenteNumeros(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function calcularFrete(cepDestinoRaw: string, subtotalRaw?: number) {
  const cepDestino = somenteNumeros(cepDestinoRaw);
  const cepOrigem = somenteNumeros(CEP_ORIGEM);
  const subtotal = Number(subtotalRaw || 0);

  if (!cepDestino || cepDestino.length !== 8) {
    return null;
  }

  if (!cepOrigem || cepOrigem.length !== 8) {
    return null;
  }

  const origemBase = Number(cepOrigem.substring(0, 5));
  const destinoBase = Number(cepDestino.substring(0, 5));
  const distanciaSimples = Math.abs(destinoBase - origemBase);

  let mini = 14.9;
  let pac = 18.9;
  let sedex = 28.9;

  let prazoMini = "5 a 9 dias úteis";
  let prazoPac = "4 a 8 dias úteis";
  let prazoSedex = "1 a 3 dias úteis";

  if (distanciaSimples <= 800) {
    mini = 12.9;
    pac = 15.9;
    sedex = 23.9;
    prazoMini = "4 a 7 dias úteis";
    prazoPac = "3 a 6 dias úteis";
    prazoSedex = "1 a 2 dias úteis";
  } else if (distanciaSimples <= 2500) {
    mini = 15.9;
    pac = 18.9;
    sedex = 27.9;
    prazoMini = "5 a 8 dias úteis";
    prazoPac = "4 a 7 dias úteis";
    prazoSedex = "2 a 3 dias úteis";
  } else if (distanciaSimples <= 5000) {
    mini = 18.9;
    pac = 22.9;
    sedex = 32.9;
    prazoMini = "6 a 10 dias úteis";
    prazoPac = "5 a 9 dias úteis";
    prazoSedex = "2 a 4 dias úteis";
  } else if (distanciaSimples <= 9000) {
    mini = 22.9;
    pac = 27.9;
    sedex = 38.9;
    prazoMini = "7 a 12 dias úteis";
    prazoPac = "6 a 10 dias úteis";
    prazoSedex = "3 a 5 dias úteis";
  } else {
    mini = 25.9;
    pac = 31.9;
    sedex = 44.9;
    prazoMini = "8 a 13 dias úteis";
    prazoPac = "7 a 12 dias úteis";
    prazoSedex = "4 a 6 dias úteis";
  }

  // Ajuste por valor do pedido
  if (subtotal >= 399) {
    pac = Math.max(0, pac - 5);
    mini = Math.max(0, mini - 4);
  }

  return {
    mini: {
      id: "mini",
      nome: "Correios Mini Envios",
      valor: Number(mini.toFixed(2)),
      prazo: prazoMini,
      destaque: "Opção econômica",
    },
    pac: {
      id: "pac",
      nome: "Correios PAC",
      valor: Number(pac.toFixed(2)),
      prazo: prazoPac,
      destaque: "Mais escolhido",
    },
    sedex: {
      id: "sedex",
      nome: "Correios Sedex",
      valor: Number(sedex.toFixed(2)),
      prazo: prazoSedex,
      destaque: "Entrega mais rápida",
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const cep = body?.cep;
    const subtotal = Number(body?.subtotal || body?.valor || body?.total || 0);

    if (!cep) {
      return NextResponse.json(
        { erro: "CEP não informado" },
        { status: 400 }
      );
    }

    const frete = calcularFrete(cep, subtotal);

    if (!frete) {
      return NextResponse.json(
        { erro: "CEP inválido" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      origem: CEP_ORIGEM,
      destino: somenteNumeros(cep),
      subtotal,
      opcoes: frete,
    });
  } catch (error) {
    console.error("Erro ao calcular frete:", error);

    return NextResponse.json(
      { erro: "Erro ao calcular frete" },
      { status: 500 }
    );
  }
}