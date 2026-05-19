import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ItemCarrinhoFrete = {
  id?: string;
  produtoId?: string;
  nome?: string;
  name?: string;
  quantidade?: number;
  qtd?: number;
  preco?: number;
  precoVenda?: number;
  valor?: number;
};

type MelhorEnvioQuote = {
  id?: number | string;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  discount?: string | number;
  currency?: string;
  delivery_time?: number | string;
  custom_delivery_time?: number | string;
  company?: {
    id?: number | string;
    name?: string;
    picture?: string;
  };
  error?: string;
};

function somenteNumeros(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

function getEnv(name: string, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function getMelhorEnvioBaseUrl() {
  const custom = getEnv("MELHOR_ENVIO_API_URL");
  if (custom) return custom.replace(/\/$/, "");

  const env = getEnv("MELHOR_ENVIO_ENV", "production").toLowerCase();

  if (env === "sandbox" || env === "test" || env === "teste") {
    return "https://sandbox.melhorenvio.com.br";
  }

  return "https://www.melhorenvio.com.br";
}

function numeroSeguro(valor: unknown, fallback: number) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : fallback;
}

function getConfiguracaoPacote(totalItensRaw: unknown) {
  const totalItens = Math.max(1, Math.ceil(Number(totalItensRaw || 1)));

  const pesoPorItemKg = numeroSeguro(
    process.env.MELHOR_ENVIO_PRODUCT_WEIGHT_KG,
    0.55
  );

  const larguraCm = numeroSeguro(process.env.MELHOR_ENVIO_PACKAGE_WIDTH_CM, 14);
  const alturaBaseCm = numeroSeguro(process.env.MELHOR_ENVIO_PACKAGE_HEIGHT_CM, 10);
  const comprimentoCm = numeroSeguro(process.env.MELHOR_ENVIO_PACKAGE_LENGTH_CM, 20);

  // Mantém a caixa realista quando houver mais de 1 perfume no pedido.
  const alturaCm = Math.min(100, alturaBaseCm + Math.max(0, totalItens - 1) * 4);
  const pesoKg = Math.min(30, pesoPorItemKg * totalItens);

  return {
    totalItens,
    pesoKg,
    larguraCm,
    alturaCm,
    comprimentoCm,
  };
}

function montarProdutosParaCotacao(body: any) {
  const itens: ItemCarrinhoFrete[] = Array.isArray(body?.itens)
    ? body.itens
    : Array.isArray(body?.items)
      ? body.items
      : [];

  if (itens.length > 0) {
    return itens
      .map((item, index) => {
        const quantidade = Math.max(1, Math.ceil(Number(item.quantidade || item.qtd || 1)));
        const preco = numeroSeguro(item.preco || item.precoVenda || item.valor, 1);
        const pacote = getConfiguracaoPacote(1);

        return {
          id: String(item.id || item.produtoId || `produto-${index + 1}`),
          width: pacote.larguraCm,
          height: pacote.alturaCm,
          length: pacote.comprimentoCm,
          weight: pacote.pesoKg,
          insurance_value: Number(preco.toFixed(2)),
          quantity: quantidade,
        };
      })
      .filter((item) => item.quantity > 0);
  }

  const totalItens = Math.max(1, Math.ceil(Number(body?.totalItens || body?.quantidade || 1)));
  const subtotal = numeroSeguro(body?.subtotal || body?.valor || body?.total, 1);
  const pacote = getConfiguracaoPacote(totalItens);

  return [
    {
      id: "pedido-maison-noor",
      width: pacote.larguraCm,
      height: pacote.alturaCm,
      length: pacote.comprimentoCm,
      weight: pacote.pesoKg,
      insurance_value: Number(subtotal.toFixed(2)),
      quantity: 1,
    },
  ];
}

function formatarPrazo(dias: unknown) {
  const numero = Number(dias);

  if (!Number.isFinite(numero) || numero <= 0) {
    return "Prazo a confirmar";
  }

  const arredondado = Math.ceil(numero);
  return arredondado === 1 ? "1 dia útil" : `${arredondado} dias úteis`;
}

function normalizarCotacoes(cotacoes: MelhorEnvioQuote[]) {
  const opcoes = cotacoes
    .filter((item) => !item?.error)
    .map((item) => {
      const valor = Number(item.custom_price ?? item.price ?? 0);
      const prazo = item.custom_delivery_time ?? item.delivery_time;
      const companyName = String(item.company?.name || "").trim();
      const serviceName = String(item.name || "Entrega").trim();
      const nome = companyName ? `${companyName} ${serviceName}` : serviceName;

      return {
        id: String(item.id || `${companyName}-${serviceName}`).replace(/\s+/g, "-").toLowerCase(),
        codigo: String(item.id || ""),
        nome,
        servico: serviceName,
        transportadora: companyName,
        valor: Number(valor.toFixed(2)),
        prazo: formatarPrazo(prazo),
        prazoDias: Number(prazo) || null,
        destaque: "",
      };
    })
    .filter((item) => item.nome && Number.isFinite(item.valor) && item.valor > 0)
    .sort((a, b) => {
      if (a.valor !== b.valor) return a.valor - b.valor;
      return Number(a.prazoDias || 999) - Number(b.prazoDias || 999);
    });

  if (!opcoes.length) return [];

  const menorValor = Math.min(...opcoes.map((item) => item.valor));
  const menorPrazo = Math.min(...opcoes.map((item) => Number(item.prazoDias || 999)));

  return opcoes.slice(0, 6).map((item, index) => {
    let destaque = "Opção de entrega";

    if (item.valor === menorValor) destaque = "Mais econômico";
    if (Number(item.prazoDias || 999) === menorPrazo) destaque = "Entrega mais rápida";
    if (index === 0 && destaque === "Opção de entrega") destaque = "Mais escolhido";

    return {
      ...item,
      destaque,
    };
  });
}

function extrairMensagemErro(data: any) {
  if (!data) return "";

  if (typeof data === "string") return data;

  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);
  if (data?.erro) return String(data.erro);

  const errors = data?.errors;
  if (Array.isArray(errors)) {
    return errors
      .map((item) => item?.message || item?.description || item)
      .filter(Boolean)
      .join(" | ");
  }

  if (errors && typeof errors === "object") {
    return Object.values(errors).flat().join(" | ");
  }

  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const cepDestino = somenteNumeros(body?.cep || body?.cepDestino || body?.destino);
    const cepOrigem = somenteNumeros(
      process.env.MELHOR_ENVIO_ORIGIN_CEP ||
        process.env.CEP_ORIGEM ||
        process.env.NEXT_PUBLIC_CEP_ORIGEM ||
        "12230000"
    );

    const token = getEnv("MELHOR_ENVIO_TOKEN");
    const userAgent = getEnv(
      "MELHOR_ENVIO_USER_AGENT",
      "Maison Noor (andre_lbatista@outlook.com)"
    );

    if (!cepDestino || cepDestino.length !== 8) {
      return NextResponse.json({ erro: "CEP de destino inválido." }, { status: 400 });
    }

    if (!cepOrigem || cepOrigem.length !== 8) {
      return NextResponse.json({ erro: "CEP de origem inválido." }, { status: 500 });
    }

    if (!token) {
      return NextResponse.json(
        { erro: "Token do Melhor Envio não configurado no servidor." },
        { status: 500 }
      );
    }

    const produtos = montarProdutosParaCotacao(body);

    const payload = {
      from: {
        postal_code: cepOrigem,
      },
      to: {
        postal_code: cepDestino,
      },
      products: produtos,
      options: {
        receipt: false,
        own_hand: false,
        collect: false,
      },
    };

    const endpoint = `${getMelhorEnvioBaseUrl()}/api/v2/me/shipment/calculate`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": userAgent,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Erro Melhor Envio:", {
        status: response.status,
        data,
      });

      return NextResponse.json(
        {
          erro:
            extrairMensagemErro(data) ||
            "Não foi possível calcular o frete pelo Melhor Envio.",
          detalhes: data,
        },
        { status: response.status }
      );
    }

    const cotacoes = Array.isArray(data) ? data : data?.data || [];
    const opcoes = normalizarCotacoes(cotacoes);

    if (!opcoes.length) {
      return NextResponse.json(
        {
          erro: "O Melhor Envio não retornou opções disponíveis para esse CEP.",
          detalhes: data,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      origem: cepOrigem,
      destino: cepDestino,
      subtotal: Number(body?.subtotal || body?.valor || body?.total || 0),
      plataforma: "melhor_envio",
      opcoes,
      raw: process.env.NODE_ENV === "development" ? data : undefined,
    });
  } catch (error) {
    console.error("Erro ao calcular frete Melhor Envio:", error);

    return NextResponse.json(
      { erro: "Erro ao calcular frete pelo Melhor Envio." },
      { status: 500 }
    );
  }
}
