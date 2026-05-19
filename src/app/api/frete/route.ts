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

  pesoKg?: number;
  weight?: number;
  larguraCm?: number;
  width?: number;
  alturaCm?: number;
  height?: number;
  comprimentoCm?: number;
  length?: number;
};

type MelhorEnvioQuote = {
  id?: number | string;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number | string;
  custom_delivery_time?: number | string;
  company?: {
    id?: number | string;
    name?: string;
    picture?: string;
  };
  error?: string;
};

type OpcaoFreteNormalizada = {
  id: string;
  codigo: string;
  nome: string;
  servico: string;
  transportadora: string;
  valor: number;
  valorOriginal: number;
  prazo: string;
  prazoDias: number | null;
  destaque: string;
  freteGratis?: boolean;
};

function somenteNumeros(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function getFreteGratisMinimo() {
  return numeroSeguro(
    process.env.MELHOR_ENVIO_FREE_SHIPPING_MIN_VALUE ||
      process.env.FREE_SHIPPING_MIN_VALUE ||
      process.env.NEXT_PUBLIC_FREE_SHIPPING_MIN_VALUE,
    399
  );
}

function getConfiguracaoPacote(totalItensRaw: unknown) {
  const totalItens = Math.max(1, Math.ceil(Number(totalItensRaw || 1)));

  // Padrão seguro para perfumes/body splash embalados.
  // Pode ser sobrescrito no .env depois, sem mexer no código.
  const pesoPorItemKg = numeroSeguro(process.env.MELHOR_ENVIO_PRODUCT_WEIGHT_KG, 0.45);
  const larguraCm = numeroSeguro(process.env.MELHOR_ENVIO_PACKAGE_WIDTH_CM, 16);
  const alturaBaseCm = numeroSeguro(process.env.MELHOR_ENVIO_PACKAGE_HEIGHT_CM, 12);
  const comprimentoCm = numeroSeguro(process.env.MELHOR_ENVIO_PACKAGE_LENGTH_CM, 22);

  const alturaCm = Math.min(100, alturaBaseCm + Math.max(0, totalItens - 1) * 4);
  const pesoKg = Math.min(30, Math.max(0.3, pesoPorItemKg * totalItens));

  return {
    totalItens,
    pesoKg: Number(pesoKg.toFixed(3)),
    larguraCm: Number(larguraCm.toFixed(1)),
    alturaCm: Number(alturaCm.toFixed(1)),
    comprimentoCm: Number(comprimentoCm.toFixed(1)),
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
        const pacotePadrao = getConfiguracaoPacote(1);

        const width = numeroSeguro(item.larguraCm || item.width, pacotePadrao.larguraCm);
        const height = numeroSeguro(item.alturaCm || item.height, pacotePadrao.alturaCm);
        const length = numeroSeguro(item.comprimentoCm || item.length, pacotePadrao.comprimentoCm);
        const weight = numeroSeguro(item.pesoKg || item.weight, pacotePadrao.pesoKg);

        return {
          id: String(item.id || item.produtoId || `produto-${index + 1}`).slice(0, 64),
          width: Number(width.toFixed(1)),
          height: Number(height.toFixed(1)),
          length: Number(length.toFixed(1)),
          weight: Number(weight.toFixed(3)),
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

function montarPacoteUnicoParaCotacao(body: any) {
  const totalItens = Math.max(1, Math.ceil(Number(body?.totalItens || body?.quantidade || 1)));
  const subtotal = numeroSeguro(body?.subtotal || body?.valor || body?.total, 1);
  const pacote = getConfiguracaoPacote(totalItens);

  return {
    width: pacote.larguraCm,
    height: pacote.alturaCm,
    length: pacote.comprimentoCm,
    weight: pacote.pesoKg,
    insurance_value: Number(subtotal.toFixed(2)),
  };
}

function formatarPrazo(dias: unknown) {
  const numero = Number(dias);

  if (!Number.isFinite(numero) || numero <= 0) {
    return "Prazo a confirmar";
  }

  const arredondado = Math.ceil(numero);
  return arredondado === 1 ? "1 dia útil" : `${arredondado} dias úteis`;
}

function getTransportadorasBloqueadas() {
  const raw = getEnv("MELHOR_ENVIO_BLOCKED_CARRIERS");
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => normalizarTexto(item))
    .filter(Boolean);
}

function transportadoraPermitida(nome: string) {
  const bloqueadas = getTransportadorasBloqueadas();
  if (!bloqueadas.length) return true;

  const texto = normalizarTexto(nome);
  return !bloqueadas.some((bloqueada) => texto.includes(bloqueada));
}

function normalizarCotacoes(cotacoes: MelhorEnvioQuote[], subtotalRaw: unknown) {
  const subtotal = Number(subtotalRaw || 0);
  const minimoFreteGratis = getFreteGratisMinimo();
  const aplicarFreteGratis = subtotal >= minimoFreteGratis;

  const vistos = new Set<string>();

  const opcoes = cotacoes
    .filter((item) => !item?.error)
    .map((item) => {
      const valor = Number(item.custom_price ?? item.price ?? 0);
      const prazo = item.custom_delivery_time ?? item.delivery_time;
      const companyName = String(item.company?.name || "").trim();
      const serviceName = String(item.name || "Entrega").trim();
      const nome = companyName ? `${companyName} ${serviceName}` : serviceName;
      const idBase = String(item.id || `${companyName}-${serviceName}`)
        .replace(/\s+/g, "-")
        .toLowerCase();

      return {
        id: idBase,
        codigo: String(item.id || ""),
        nome,
        servico: serviceName,
        transportadora: companyName,
        valor: Number(valor.toFixed(2)),
        valorOriginal: Number(valor.toFixed(2)),
        prazo: formatarPrazo(prazo),
        prazoDias: Number(prazo) || null,
        destaque: "",
      };
    })
    .filter((item) => item.nome && Number.isFinite(item.valor) && item.valor > 0)
    .filter((item) => transportadoraPermitida(`${item.transportadora} ${item.servico} ${item.nome}`))
    .filter((item) => {
      const chave = `${normalizarTexto(item.nome)}-${item.valor}-${item.prazoDias || "x"}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((a, b) => {
      if (a.valor !== b.valor) return a.valor - b.valor;
      return Number(a.prazoDias || 999) - Number(b.prazoDias || 999);
    }) as OpcaoFreteNormalizada[];

  if (!opcoes.length) return [];

  const menorValor = Math.min(...opcoes.map((item) => item.valor));
  const menorPrazo = Math.min(...opcoes.map((item) => Number(item.prazoDias || 999)));

  return opcoes.slice(0, 6).map((item, index) => {
    let destaque = "Opção de entrega";
    let valor = item.valor;
    let freteGratis = false;

    if (aplicarFreteGratis && item.valor === menorValor) {
      valor = 0;
      freteGratis = true;
      destaque = "Frete grátis";
    } else if (item.valor === menorValor) {
      destaque = "Mais econômico";
    } else if (Number(item.prazoDias || 999) === menorPrazo) {
      destaque = "Entrega mais rápida";
    } else if (index === 0) {
      destaque = "Melhor custo-benefício";
    }

    return {
      ...item,
      valor,
      valorOriginal: item.valorOriginal,
      destaque,
      freteGratis,
    };
  });
}

function extrairMensagemErro(data: any) {
  if (!data) return "";

  if (typeof data === "string") return data;

  const mensagens: string[] = [];

  if (data?.message) mensagens.push(String(data.message));
  if (data?.error) mensagens.push(String(data.error));
  if (data?.erro) mensagens.push(String(data.erro));

  const errors = data?.errors;

  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string") mensagens.push(item);
      if (item?.message) mensagens.push(String(item.message));
      if (item?.description) mensagens.push(String(item.description));
    }
  }

  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    Object.entries(errors).forEach(([campo, valor]) => {
      if (Array.isArray(valor)) {
        valor.forEach((msg) => mensagens.push(`${campo}: ${String(msg)}`));
      } else if (valor) {
        mensagens.push(`${campo}: ${String(valor)}`);
      }
    });
  }

  return Array.from(new Set(mensagens.filter(Boolean))).join(" | ");
}

function calcularFreteFallback(cepOrigem: string, cepDestino: string, subtotalRaw: unknown) {
  const origemBase = Number(cepOrigem.substring(0, 5));
  const destinoBase = Number(cepDestino.substring(0, 5));
  const distancia = Math.abs(destinoBase - origemBase);
  const subtotal = Number(subtotalRaw || 0);
  const minimoFreteGratis = getFreteGratisMinimo();

  let economico = 18.9;
  let expresso = 29.9;
  let prazoEco = 7;
  let prazoExp = 3;

  if (distancia <= 900) {
    economico = 14.9;
    expresso = 22.9;
    prazoEco = 5;
    prazoExp = 2;
  } else if (distancia <= 3000) {
    economico = 22.9;
    expresso = 34.9;
    prazoEco = 8;
    prazoExp = 4;
  } else if (distancia <= 7000) {
    economico = 31.9;
    expresso = 48.9;
    prazoEco = 11;
    prazoExp = 6;
  } else {
    economico = 39.9;
    expresso = 59.9;
    prazoEco = 13;
    prazoExp = 8;
  }

  const freteGratis = subtotal >= minimoFreteGratis;
  const valorEconomico = freteGratis ? 0 : economico;

  return [
    {
      id: "fallback-economico",
      codigo: "fallback-economico",
      nome: "Entrega econômica",
      servico: "Econômica",
      transportadora: "Maison Noor",
      valor: Number(valorEconomico.toFixed(2)),
      valorOriginal: Number(economico.toFixed(2)),
      prazo: formatarPrazo(prazoEco),
      prazoDias: prazoEco,
      destaque: freteGratis ? "Frete grátis" : "Estimativa segura",
      freteGratis,
    },
    {
      id: "fallback-expresso",
      codigo: "fallback-expresso",
      nome: "Entrega expressa",
      servico: "Expressa",
      transportadora: "Maison Noor",
      valor: Number(expresso.toFixed(2)),
      valorOriginal: Number(expresso.toFixed(2)),
      prazo: formatarPrazo(prazoExp),
      prazoDias: prazoExp,
      destaque: "Entrega mais rápida",
      freteGratis: false,
    },
  ];
}

async function cotarMelhorEnvio(endpoint: string, token: string, userAgent: string, payload: any) {
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
  return { response, data };
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
    const pacoteUnico = montarPacoteUnicoParaCotacao(body);
    const subtotal = Number(body?.subtotal || body?.valor || body?.total || 0);
    const endpoint = `${getMelhorEnvioBaseUrl()}/api/v2/me/shipment/calculate`;

    const payloadProdutos = {
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

    let { response, data } = await cotarMelhorEnvio(endpoint, token, userAgent, payloadProdutos);

    // Segunda tentativa usando package único. Isso evita erro em algumas transportadoras
    // quando a validação de products fica restritiva.
    if (!response.ok) {
      console.error("Erro Melhor Envio com products:", {
        status: response.status,
        data,
        payload: payloadProdutos,
      });

      const payloadPacote = {
        from: {
          postal_code: cepOrigem,
        },
        to: {
          postal_code: cepDestino,
        },
        package: pacoteUnico,
        options: {
          receipt: false,
          own_hand: false,
          collect: false,
          insurance_value: Math.max(1, Number(subtotal || 1)),
        },
      };

      const tentativaPacote = await cotarMelhorEnvio(endpoint, token, userAgent, payloadPacote);
      response = tentativaPacote.response;
      data = tentativaPacote.data;

      if (!response.ok) {
        console.error("Erro Melhor Envio com package:", {
          status: response.status,
          data,
          payload: payloadPacote,
        });
      }
    }

    const cotacoes = response.ok ? (Array.isArray(data) ? data : data?.data || []) : [];
    const opcoes = normalizarCotacoes(cotacoes, subtotal);
    const freteGratisMinimo = getFreteGratisMinimo();

    if (opcoes.length) {
      return NextResponse.json({
        origem: cepOrigem,
        destino: cepDestino,
        subtotal,
        plataforma: "melhor_envio",
        freteGratisMinimo,
        faltaParaFreteGratis: Math.max(0, Number((freteGratisMinimo - subtotal).toFixed(2))),
        freteGratisDisponivel: subtotal >= freteGratisMinimo,
        pacote: {
          produtos,
          pacoteUnico,
        },
        opcoes,
        raw: process.env.NODE_ENV === "development" ? data : undefined,
      });
    }

    const mensagemMelhorEnvio =
      extrairMensagemErro(data) ||
      "O Melhor Envio não retornou opções disponíveis para esse CEP.";

    const permitirFallback =
      getEnv("MELHOR_ENVIO_ALLOW_FALLBACK", "true").toLowerCase() !== "false";

    if (permitirFallback) {
      const opcoesFallback = calcularFreteFallback(cepOrigem, cepDestino, subtotal);

      return NextResponse.json({
        origem: cepOrigem,
        destino: cepDestino,
        subtotal,
        plataforma: "fallback_maison_noor",
        fallback: true,
        aviso:
          "Cotação automática indisponível no Melhor Envio para este CEP. Exibimos uma estimativa segura para não travar o checkout.",
        erroMelhorEnvio: mensagemMelhorEnvio,
        freteGratisMinimo,
        faltaParaFreteGratis: Math.max(0, Number((freteGratisMinimo - subtotal).toFixed(2))),
        freteGratisDisponivel: subtotal >= freteGratisMinimo,
        pacote: {
          produtos,
          pacoteUnico,
        },
        opcoes: opcoesFallback,
      });
    }

    return NextResponse.json(
      {
        erro: mensagemMelhorEnvio,
        detalhes: data,
      },
      { status: response.status || 422 }
    );
  } catch (error) {
    console.error("Erro ao calcular frete Melhor Envio:", error);

    return NextResponse.json(
      { erro: "Erro ao calcular frete pelo Melhor Envio." },
      { status: 500 }
    );
  }
}
