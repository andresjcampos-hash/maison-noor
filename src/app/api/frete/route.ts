import { NextResponse } from "next/server";
import tabelasFreteRaw from "@/data/melhor-envio-tabelas-maison-noor.json";

export const dynamic = "force-dynamic";

type ItemFrete = {
  id?: string;
  nome?: string;
  quantidade?: number;
  qtd?: number;
  preco?: number;
  pesoKg?: number;
  weight?: number;
  larguraCm?: number;
  width?: number;
  alturaCm?: number;
  height?: number;
  comprimentoCm?: number;
  length?: number;
};

type LinhaTabela = (string | number)[];

type TabelaLocal = {
  servicoOriginal: string;
  linhas: LinhaTabela[];
};

const tabelasFrete = tabelasFreteRaw as {
  origem?: string;
  tables: Record<string, TabelaLocal>;
};

const CEP_ORIGEM =
  String(process.env.MELHOR_ENVIO_ORIGIN_CEP || process.env.CEP_ORIGEM || tabelasFrete.origem || "12230000").replace(/\D/g, "");

const FRETE_GRATIS_MINIMO = Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_MIN_VALUE || 399);

// Margem operacional da Maison Noor: embalagem, proteção, etiqueta, manuseio e pequenas diferenças de peso/cubagem.
// Pode ajustar depois na Vercel com MELHOR_ENVIO_FRETE_MARGEM=8.9, por exemplo.
const MARGEM_OPERACIONAL_FRETE = Number(process.env.MELHOR_ENVIO_FRETE_MARGEM || 6.9);

function somenteNumeros(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

function numeroSeguro(valor: unknown, fallback = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
}

function arredondarPremium(valor: number) {
  const base = Math.max(0, valor);
  // Arredondamento visual premium: 22,91 vira 22,90; 23,40 vira 22,90; 23,60 vira 23,90.
  // A margem operacional já protege a loja, então não precisamos sempre arredondar para cima.
  const arredondado = Math.max(0, Math.round(base) - 0.1);
  return Number(arredondado.toFixed(2));
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferirPacotePorItem(item: ItemFrete) {
  const nome = normalizarTexto(item.nome);
  const qtd = Math.max(1, numeroSeguro(item.quantidade ?? item.qtd, 1));

  const pesoInformado = numeroSeguro(item.pesoKg ?? item.weight, 0);
  const larguraInformada = numeroSeguro(item.larguraCm ?? item.width, 0);
  const alturaInformada = numeroSeguro(item.alturaCm ?? item.height, 0);
  const comprimentoInformado = numeroSeguro(item.comprimentoCm ?? item.length, 0);

  if (pesoInformado > 0 && larguraInformada > 0 && alturaInformada > 0 && comprimentoInformado > 0) {
    return {
      qtd,
      pesoKg: pesoInformado,
      alturaCm: alturaInformada,
      larguraCm: larguraInformada,
      comprimentoCm: comprimentoInformado,
    };
  }

  const isBodySplash = nome.includes("body splash") || nome.includes("bodysplash") || nome.includes("splash");
  const isCreme = nome.includes("creme") || nome.includes("hidratante") || nome.includes("body cream");
  const isKit = nome.includes("kit") || nome.includes("combo") || nome.includes("presente");

  if (isKit) {
    return { qtd, pesoKg: 1.25, alturaCm: 14, larguraCm: 22, comprimentoCm: 24 };
  }

  if (isBodySplash || isCreme) {
    return { qtd, pesoKg: 0.75, alturaCm: 10, larguraCm: 12, comprimentoCm: 24 };
  }

  // Padrão Maison Noor: perfume em caixa + proteção premium + margem de cubagem.
  return { qtd, pesoKg: 0.9, alturaCm: 12, larguraCm: 18, comprimentoCm: 18 };
}

function montarPacote(itens: ItemFrete[]) {
  const lista = Array.isArray(itens) && itens.length ? itens : [{ nome: "Produto Maison Noor", quantidade: 1 }];

  let pesoKg = 0;
  let alturaCm = 12;
  let larguraCm = 18;
  let comprimentoCm = 18;
  let totalUnidades = 0;

  for (const item of lista) {
    const pkg = inferirPacotePorItem(item);
    totalUnidades += pkg.qtd;
    pesoKg += pkg.pesoKg * pkg.qtd;
    alturaCm = Math.max(alturaCm, pkg.alturaCm);
    larguraCm = Math.max(larguraCm, pkg.larguraCm);
    comprimentoCm = Math.max(comprimentoCm, pkg.comprimentoCm);
  }

  // Ajuste simples para múltiplos itens dentro da mesma caixa.
  if (totalUnidades > 1) {
    larguraCm += Math.min(10, (totalUnidades - 1) * 4);
    comprimentoCm += Math.min(8, (totalUnidades - 1) * 3);
    alturaCm += Math.min(6, Math.floor((totalUnidades - 1) / 2) * 3);
  }

  return {
    pesoKg: Math.max(0.75, Number(pesoKg.toFixed(3))),
    alturaCm: Math.ceil(alturaCm),
    larguraCm: Math.ceil(larguraCm),
    comprimentoCm: Math.ceil(comprimentoCm),
  };
}

function calcularPesoTaxadoGramas(pacote: ReturnType<typeof montarPacote>, fatorCubagem: number) {
  const pesoRealGramas = pacote.pesoKg * 1000;
  const fator = fatorCubagem > 0 ? fatorCubagem : 6000;
  const pesoCubadoGramas = ((pacote.alturaCm * pacote.larguraCm * pacote.comprimentoCm) / fator) * 1000;
  return Math.ceil(Math.max(pesoRealGramas, pesoCubadoGramas));
}

function prazoTexto(min: number, max: number) {
  if (!min && !max) return "Prazo a confirmar";
  if (min === max || !max) return `${min} dia${min === 1 ? "" : "s"} útil${min === 1 ? "" : "eis"}`;
  return `${min} a ${max} dias úteis`;
}


function regiaoCep(cepDestino: string) {
  const prefixo = Number(String(cepDestino || "").replace(/\D/g, "").slice(0, 2));

  if (prefixo >= 1 && prefixo <= 19) return "sudeste_sp";
  if (prefixo >= 20 && prefixo <= 39) return "sudeste";
  if (prefixo >= 40 && prefixo <= 59) return "nordeste";
  if (prefixo >= 60 && prefixo <= 69) return "nordeste_norte";
  if (prefixo >= 70 && prefixo <= 79) return "centro_oeste";
  if (prefixo >= 80 && prefixo <= 99) return "sul";

  return "indefinida";
}

function margemPrazoSeguranca(servico: string, nomeTabela: string, cepDestino: string) {
  const texto = normalizarTexto(`${nomeTabela} ${servico}`);
  const regiao = regiaoCep(cepDestino);

  let min = 1;
  let max = 2;

  if (texto.includes("sedex")) {
    min = 1;
    max = 2;
  } else if (texto.includes("pac")) {
    min = 1;
    max = 2;
  } else if (texto.includes("jadlog") || texto.includes("package") || texto.includes(".com")) {
    min = 1;
    max = 2;
  } else if (texto.includes("loggi")) {
    min = 1;
    max = 2;
  }

  // Margem logística realista para evitar promessa curta demais no checkout.
  // Sul, Nordeste, Norte e Centro-Oeste costumam sofrer mais variação de coleta, triagem e interiorização.
  if (["sul", "nordeste", "nordeste_norte", "centro_oeste"].includes(regiao)) {
    min += 1;
    max += 1;
  }

  return { min, max };
}

function aplicarPrazoSeguro(
  prazoMinOriginal: number,
  prazoMaxOriginal: number,
  servico: string,
  nomeTabela: string,
  cepDestino: string
) {
  const baseMin = Math.max(1, Number(prazoMinOriginal || prazoMaxOriginal || 1));
  const baseMax = Math.max(baseMin, Number(prazoMaxOriginal || prazoMinOriginal || baseMin));
  const margem = margemPrazoSeguranca(servico, nomeTabela, cepDestino);

  const min = Math.max(1, baseMin + margem.min);
  const max = Math.max(min, baseMax + margem.max);

  return { min, max };
}

function nomeExibicao(servico: string, nomeTabela: string) {
  const base = `${nomeTabela} ${servico}`.toLowerCase();

  if (base.includes("sedex")) return "Correios SEDEX";
  if (base.includes("pac")) return "Correios PAC";
  if (base.includes("package centralizado")) return "Jadlog Package Centralizado";
  if (base.includes("package")) return "Jadlog Package";
  if (base.includes(".com") || base.includes(" com")) return "Jadlog .Com";
  if (base.includes("loggi")) return "Loggi Express";

  return nomeTabela.replace(/^Jadlog\s+/i, "Jadlog ");
}

function prioridadeServico(nome: string) {
  const texto = normalizarTexto(nome);
  if (texto.includes("pac")) return 1;
  if (texto.includes("package centralizado")) return 2;
  if (texto.includes("package")) return 3;
  if (texto.includes("loggi")) return 4;
  if (texto.includes("sedex")) return 5;
  if (texto.includes(".com")) return 6;
  return 9;
}

function montarDestaque(nome: string, valorFinal: number, menorValor: number, prazoDias: number, menorPrazo: number) {
  const texto = normalizarTexto(nome);

  if (valorFinal === menorValor) return "Mais econômico";
  if (prazoDias === menorPrazo) return "Entrega mais rápida";
  if (texto.includes("sedex")) return "Premium";
  if (texto.includes("pac")) return "Correios";
  if (texto.includes("jadlog")) return "Opção de entrega";
  if (texto.includes("loggi")) return "Entrega parceira";

  return "Opção de entrega";
}

function consultarTabelaLocal(cepDestino: string, pacote: ReturnType<typeof montarPacote>, subtotal: number) {
  const cepNumero = Number(cepDestino);
  const opcoes: any[] = [];

  for (const [nomeTabela, tabela] of Object.entries(tabelasFrete.tables || {})) {
    let melhor: {
      linha: LinhaTabela;
      pesoTaxadoGramas: number;
    } | null = null;

    for (const linha of tabela.linhas) {
      const cepIni = numeroSeguro(linha[0], 0);
      const cepFim = numeroSeguro(linha[1], 0);
      const pesoMin = numeroSeguro(linha[2], 0);
      const pesoMax = numeroSeguro(linha[3], 0);
      const fatorCubagem = numeroSeguro(linha[7], 6000);

      if (!cepIni || !cepFim || !pesoMax) continue;
      if (cepNumero < cepIni || cepNumero > cepFim) continue;

      const pesoTaxadoGramas = calcularPesoTaxadoGramas(pacote, fatorCubagem);

      if (pesoTaxadoGramas >= pesoMin && pesoTaxadoGramas <= pesoMax) {
        melhor = { linha, pesoTaxadoGramas };
        break;
      }
    }

    if (!melhor) continue;

    const precoBase = numeroSeguro(melhor.linha[4], 0);
    const prazoMinOriginal = numeroSeguro(melhor.linha[5], 0);
    const prazoMaxOriginal = numeroSeguro(melhor.linha[6], 0);
    const servico = String(melhor.linha[8] || tabela.servicoOriginal || nomeTabela);
    const nome = nomeExibicao(servico, nomeTabela);
    const prazoSeguro = aplicarPrazoSeguro(prazoMinOriginal, prazoMaxOriginal, servico, nomeTabela, cepDestino);
    const valorOriginal = arredondarPremium(precoBase + MARGEM_OPERACIONAL_FRETE);
    const prazoDias = prazoSeguro.max || prazoSeguro.min || null;

    opcoes.push({
      id: `${normalizarTexto(nome).replace(/[^a-z0-9]+/g, "_")}_${opcoes.length}`,
      nome,
      servico,
      transportadora: nome.split(" ")[0],
      prazo: prazoTexto(prazoSeguro.min, prazoSeguro.max),
      prazoDias,
      prazoOriginal: prazoTexto(prazoMinOriginal, prazoMaxOriginal),
      valor: valorOriginal,
      valorOriginal,
      freteGratis: false,
      pesoTaxadoGramas: melhor.pesoTaxadoGramas,
      fonte: "tabela_melhor_envio",
    });
  }

  if (!opcoes.length) return [];

  // Remove duplicados: quando a tabela possui várias faixas válidas para o mesmo serviço,
  // mantemos apenas a melhor opção por nome de entrega.
  const melhoresPorServico = new Map<string, any>();

  for (const opcao of opcoes) {
    const chave = normalizarTexto(opcao.nome).replace(/[^a-z0-9]+/g, "_");
    const atual = melhoresPorServico.get(chave);

    if (!atual) {
      melhoresPorServico.set(chave, opcao);
      continue;
    }

    const valorOpcao = Number(opcao.valor || 0);
    const valorAtual = Number(atual.valor || 0);
    const prazoOpcao = Number(opcao.prazoDias || 999);
    const prazoAtual = Number(atual.prazoDias || 999);

    if (valorOpcao < valorAtual || (valorOpcao === valorAtual && prazoOpcao < prazoAtual)) {
      melhoresPorServico.set(chave, opcao);
    }
  }

  const opcoesUnicas = Array.from(melhoresPorServico.values()).map((opcao, index) => ({
    ...opcao,
    id: `${normalizarTexto(opcao.nome).replace(/[^a-z0-9]+/g, "_")}_${index}`,
  }));

  opcoesUnicas.sort((a, b) => {
    const valorDiff = Number(a.valor) - Number(b.valor);
    if (valorDiff !== 0) return valorDiff;
    return Number(a.prazoDias || 999) - Number(b.prazoDias || 999);
  });

  const menorValor = Math.min(...opcoesUnicas.map((o) => Number(o.valor)));
  const menorPrazo = Math.min(...opcoesUnicas.map((o) => Number(o.prazoDias || 999)));

  const comDestaque = opcoesUnicas.map((opcao) => ({
    ...opcao,
    destaque: montarDestaque(opcao.nome, Number(opcao.valor), menorValor, Number(opcao.prazoDias || 999), menorPrazo),
  }));

  // Frete grátis inteligente: aplica somente no frete econômico para não prejudicar a margem.
  if (subtotal >= FRETE_GRATIS_MINIMO) {
    const elegivel = comDestaque.find((opcao) => Number(opcao.valorOriginal) <= 65) || comDestaque[0];
    if (elegivel) {
      elegivel.valor = 0;
      elegivel.freteGratis = true;
      elegivel.destaque = "Frete grátis";
    }
  }

  return comDestaque
    .sort((a, b) => {
      if (a.freteGratis && !b.freteGratis) return -1;
      if (!a.freteGratis && b.freteGratis) return 1;

      const valorDiff = Number(a.valor) - Number(b.valor);
      if (valorDiff !== 0) return valorDiff;

      return prioridadeServico(a.nome) - prioridadeServico(b.nome);
    })
    .slice(0, 6);
}

function fallbackRegional(cepDestino: string, pacote: ReturnType<typeof montarPacote>, subtotal: number) {
  const prefixo = Number(cepDestino.slice(0, 2));
  const peso = pacote.pesoKg;

  let economico = 34.9;
  let expresso = 52.9;
  let prazoEco = "5 a 8 dias úteis";
  let prazoExp = "2 a 4 dias úteis";

  if (prefixo >= 1 && prefixo <= 19) {
    economico = 24.9;
    expresso = 39.9;
    prazoEco = "3 a 6 dias úteis";
    prazoExp = "1 a 3 dias úteis";
  } else if (prefixo >= 20 && prefixo <= 39) {
    economico = 32.9;
    expresso = 48.9;
    prazoEco = "4 a 7 dias úteis";
    prazoExp = "2 a 4 dias úteis";
  } else if (prefixo >= 40 && prefixo <= 59) {
    economico = 54.9;
    expresso = 89.9;
    prazoEco = "7 a 12 dias úteis";
    prazoExp = "4 a 8 dias úteis";
  } else if (prefixo >= 60 && prefixo <= 69) {
    economico = 64.9;
    expresso = 109.9;
    prazoEco = "8 a 14 dias úteis";
    prazoExp = "5 a 10 dias úteis";
  } else if (prefixo >= 70 && prefixo <= 79) {
    economico = 48.9;
    expresso = 79.9;
    prazoEco = "6 a 10 dias úteis";
    prazoExp = "3 a 7 dias úteis";
  } else if (prefixo >= 80 && prefixo <= 99) {
    economico = 42.9;
    expresso = 68.9;
    prazoEco = "5 a 9 dias úteis";
    prazoExp = "3 a 6 dias úteis";
  }

  if (peso > 1) {
    const acrescimo = Math.ceil((peso - 1) * 9);
    economico += acrescimo;
    expresso += acrescimo * 1.4;
  }

  const gratis = subtotal >= FRETE_GRATIS_MINIMO && economico <= 65;

  return [
    {
      id: "fallback_economico",
      nome: "Entrega econômica Maison Noor",
      servico: "fallback",
      transportadora: "Maison Noor",
      prazo: prazoEco,
      prazoDias: null,
      valor: gratis ? 0 : arredondarPremium(economico),
      valorOriginal: arredondarPremium(economico),
      freteGratis: gratis,
      destaque: gratis ? "Frete grátis" : "Opção econômica",
      fonte: "fallback_regional",
    },
    {
      id: "fallback_expresso",
      nome: "Entrega expressa Maison Noor",
      servico: "fallback",
      transportadora: "Maison Noor",
      prazo: prazoExp,
      prazoDias: null,
      valor: arredondarPremium(expresso),
      valorOriginal: arredondarPremium(expresso),
      freteGratis: false,
      destaque: "Entrega mais rápida",
      fonte: "fallback_regional",
    },
  ];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const cep = somenteNumeros(body?.cep || body?.cepDestino || body?.postalCode);
    const subtotal = numeroSeguro(body?.subtotal ?? body?.valor ?? body?.total, 0);
    const itens = Array.isArray(body?.itens) ? body.itens : [];

    if (!CEP_ORIGEM || CEP_ORIGEM.length !== 8) {
      return NextResponse.json(
        { erro: "CEP de origem inválido. Configure CEP_ORIGEM ou MELHOR_ENVIO_ORIGIN_CEP." },
        { status: 500 }
      );
    }

    if (!cep || cep.length !== 8) {
      return NextResponse.json({ erro: "CEP inválido" }, { status: 400 });
    }

    const pacote = montarPacote(itens);
    const opcoesTabela = consultarTabelaLocal(cep, pacote, subtotal);
    const opcoes = opcoesTabela.length ? opcoesTabela : fallbackRegional(cep, pacote, subtotal);

    return NextResponse.json({
      origem: CEP_ORIGEM,
      destino: cep,
      subtotal,
      pacote,
      fonte: opcoesTabela.length ? "tabelas_melhor_envio" : "fallback_maison_noor",
      opcoes,
    });
  } catch (error) {
    console.error("Erro ao calcular frete por tabela:", error);

    return NextResponse.json(
      { erro: "Erro ao calcular frete" },
      { status: 500 }
    );
  }
}
