import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DashboardAnalytics = {
  pedidos: {
    total: number;
    mes: number;
    faturados: number;
    aguardandoPagamento: number;
    cancelados: number;
    potencialPendente: number;
    conversao: number;
  };
  financeiro: {
    faturamentoTotal: number;
    faturamentoMes: number;
    custoTotal: number;
    lucroTotal: number;
    ticketMedio: number;
    margemVenda: number;
    markup: number;
  };
  estoque: {
    totalProdutos: number;
    ativos: number;
    estoqueFisico: number;
    estoqueReservado: number;
    estoqueDisponivel: number;
    valorCusto: number;
    valorVenda: number;
    semEstoque: number;
    baixoEstoque: number;
    produtosCriticos: any[];
    lucroEstoque: number;
    margemVendaEstoque: number;
    markupEstoque: number;
  };
  rankings: {
    topProdutosLucro: any[];
    topProdutosVenda: any[];
  };
  historico7Dias: any[];
  updatedAt: string;
};

function numberValue(v: any) {
  return Number(v || 0);
}

function isFaturado(status?: string) {
  return ["pago", "enviado", "entregue"].includes(String(status || ""));
}

function getItens(pedido: any) {
  if (Array.isArray(pedido.itens) && pedido.itens.length) return pedido.itens;
  if (Array.isArray(pedido.items) && pedido.items.length) return pedido.items;
  return [];
}

function calcularTotal(pedido: any) {
  const direto = numberValue(pedido.total || pedido.valorTotal || pedido.valor);
  if (direto > 0) return direto;

  const subtotal = getItens(pedido).reduce((acc: number, item: any) => {
    const qtd = numberValue(item.qtd || item.quantidade);
    const preco = numberValue(item.preco || item.precoUnitario);
    return acc + qtd * preco;
  }, 0);

  return Math.max(
    0,
    subtotal - numberValue(pedido.desconto) + numberValue(pedido.frete)
  );
}

function normTexto(valor?: string) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getDate(valor: any): Date | null {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();

  const d = new Date(valor);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateKeyBR(data: Date) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function criarDiasHistorico(qtdDias = 7) {
  const hoje = new Date();

  return Array.from({ length: qtdDias }, (_, index) => {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() - (qtdDias - 1 - index));
    data.setHours(0, 0, 0, 0);

    return {
      id: dateKeyBR(data),
      data: dateKeyBR(data),
      label: data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      pedidos: 0,
      faturados: 0,
      faturamento: 0,
      custo: 0,
      lucro: 0,
      ticketMedio: 0,
    };
  });
}

async function calcularAnalytics(): Promise<DashboardAnalytics> {
  if (!adminDb) {
    throw new Error("Firebase Admin não configurado");
  }

  const [pedidosSnap, produtosSnap] = await Promise.all([
    adminDb.collection("pedidos").doc("default").collection("lista").get(),
    adminDb.collection("products").get(),
  ]);

  const pedidos = pedidosSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const produtos = produtosSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  const produtosPorNome = new Map<string, any>();

  for (const produto of produtos) {
    produtosPorNome.set(normTexto(produto.nome), produto);
  }

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  let faturamentoTotal = 0;
  let faturamentoMes = 0;
  let custoTotal = 0;
  let lucroTotal = 0;
  let pedidosFaturados = 0;
  let aguardandoPagamento = 0;
  let pedidosCancelados = 0;
  let pedidosMes = 0;
  let potencialPendente = 0;

  const rankingMap = new Map<
    string,
    {
      nome: string;
      quantidade: number;
      receita: number;
      custo: number;
      lucro: number;
      markupPercentual: number;
      margemVendaPercentual: number;
    }
  >();

  const historico7Dias = criarDiasHistorico(7);
  const historicoMap = new Map(historico7Dias.map((dia) => [dia.id, dia]));

  for (const pedido of pedidos as any[]) {
    const total = calcularTotal(pedido);
    const status = String(pedido.status || "");
    const dataPedido = getDate(pedido.createdAt || pedido.updatedAt);
    const diaKey = dataPedido ? dateKeyBR(dataPedido) : "";
    const diaHistorico = diaKey ? historicoMap.get(diaKey) : undefined;

    if (dataPedido && dataPedido >= inicioMes) {
      pedidosMes++;
    }

    if (diaHistorico) {
      diaHistorico.pedidos += 1;
    }

    if (status === "aguardando_pagamento") {
      aguardandoPagamento++;
      potencialPendente += total;
    }

    if (status === "cancelado") {
      pedidosCancelados++;
    }

    if (!isFaturado(status)) continue;

    pedidosFaturados++;
    faturamentoTotal += total;

    if (dataPedido && dataPedido >= inicioMes) {
      faturamentoMes += total;
    }

    if (diaHistorico) {
      diaHistorico.faturados += 1;
      diaHistorico.faturamento += total;
    }

    let custoPedido = 0;
    let lucroPedido = total;

    for (const item of getItens(pedido)) {
      const nome = String(item.nome || "Produto sem nome");
      const key = normTexto(nome);
      const qtd = numberValue(item.qtd || item.quantidade);
      const precoVenda = numberValue(item.preco || item.precoUnitario);

      const produto = produtosPorNome.get(key);
      const custoUnitario = numberValue(
        produto?.precoCompra ||
          produto?.custo ||
          produto?.valorCompra ||
          produto?.precoCusto
      );

      const receitaItem = precoVenda * qtd;
      const custoItem = custoUnitario * qtd;
      const lucroItem = receitaItem - custoItem;

      custoTotal += custoItem;
      lucroTotal += lucroItem;
      custoPedido += custoItem;

      const atual =
        rankingMap.get(key) || {
          nome,
          quantidade: 0,
          receita: 0,
          custo: 0,
          lucro: 0,
          markupPercentual: 0,
          margemVendaPercentual: 0,
        };

      atual.quantidade += qtd;
      atual.receita += receitaItem;
      atual.custo += custoItem;
      atual.lucro += lucroItem;
      atual.markupPercentual = atual.custo > 0 ? (atual.lucro / atual.custo) * 100 : 0;
      atual.margemVendaPercentual = atual.receita > 0 ? (atual.lucro / atual.receita) * 100 : 0;

      rankingMap.set(key, atual);
    }

    lucroPedido = total - custoPedido;

    if (diaHistorico) {
      diaHistorico.custo += custoPedido;
      diaHistorico.lucro += lucroPedido;
      diaHistorico.ticketMedio =
        diaHistorico.faturados > 0
          ? diaHistorico.faturamento / diaHistorico.faturados
          : 0;
    }
  }

  const estoque = produtos.reduce(
    (acc, produto: any) => {
      const estoqueAtual = numberValue(produto.estoque);
      const reservado = numberValue(produto.reservado);
      const disponivel = Math.max(0, estoqueAtual - reservado);
      const custo = numberValue(produto.precoCompra || produto.custo);
      const venda = numberValue(produto.precoVenda || produto.preco);

      acc.totalProdutos++;
      if (produto.ativo !== false) acc.ativos++;
      acc.estoqueFisico += estoqueAtual;
      acc.estoqueReservado += reservado;
      acc.estoqueDisponivel += disponivel;
      acc.valorCusto += custo * estoqueAtual;
      acc.valorVenda += venda * estoqueAtual;

      if (disponivel <= 0) acc.semEstoque++;
      if (disponivel > 0 && disponivel <= 2) acc.baixoEstoque++;

      if (produto.ativo !== false && disponivel <= 2) {
        acc.produtosCriticos.push({
          id: produto.id,
          nome: produto.nome || "Produto sem nome",
          disponivel,
        });
      }

      return acc;
    },
    {
      totalProdutos: 0,
      ativos: 0,
      estoqueFisico: 0,
      estoqueReservado: 0,
      estoqueDisponivel: 0,
      valorCusto: 0,
      valorVenda: 0,
      semEstoque: 0,
      baixoEstoque: 0,
      produtosCriticos: [] as any[],
    }
  );

  estoque.produtosCriticos = estoque.produtosCriticos
    .sort((a: any, b: any) => a.disponivel - b.disponivel)
    .slice(0, 10);

  const lucroEstoque = estoque.valorVenda - estoque.valorCusto;

  const topProdutosLucro = Array.from(rankingMap.values())
    .sort((a, b) => b.lucro - a.lucro)
    .slice(0, 10);

  const topProdutosVenda = Array.from(rankingMap.values())
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  return {
    pedidos: {
      total: pedidos.length,
      mes: pedidosMes,
      faturados: pedidosFaturados,
      aguardandoPagamento,
      cancelados: pedidosCancelados,
      potencialPendente,
      conversao:
        pedidos.length > 0 ? (pedidosFaturados / pedidos.length) * 100 : 0,
    },
    financeiro: {
      faturamentoTotal,
      faturamentoMes,
      custoTotal,
      lucroTotal,
      ticketMedio:
        pedidosFaturados > 0 ? faturamentoTotal / pedidosFaturados : 0,
      margemVenda:
        faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : 0,
      markup: custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0,
    },
    estoque: {
      ...estoque,
      lucroEstoque,
      margemVendaEstoque:
        estoque.valorVenda > 0 ? (lucroEstoque / estoque.valorVenda) * 100 : 0,
      markupEstoque:
        estoque.valorCusto > 0 ? (lucroEstoque / estoque.valorCusto) * 100 : 0,
    },
    rankings: {
      topProdutosLucro,
      topProdutosVenda,
    },
    historico7Dias,
    updatedAt: new Date().toISOString(),
  };
}

async function salvarAnalytics(analytics: DashboardAnalytics) {
  if (!adminDb) {
    throw new Error("Firebase Admin não configurado");
  }

  const hoje = dateKeyBR(new Date());
  const historicoHoje =
    analytics.historico7Dias.find((dia) => dia.id === hoje) ||
    analytics.historico7Dias[analytics.historico7Dias.length - 1];

  const batch = adminDb.batch();

  const dashboardRef = adminDb.collection("analytics").doc("dashboard");
  batch.set(dashboardRef, analytics, { merge: true });

  const historyRef = adminDb.collection("analytics_history").doc(hoje);
  batch.set(
    historyRef,
    {
      ...historicoHoje,
      financeiro: analytics.financeiro,
      pedidosResumo: analytics.pedidos,
      estoqueResumo: {
        totalProdutos: analytics.estoque.totalProdutos,
        ativos: analytics.estoque.ativos,
        estoqueDisponivel: analytics.estoque.estoqueDisponivel,
        semEstoque: analytics.estoque.semEstoque,
        baixoEstoque: analytics.estoque.baixoEstoque,
      },
      updatedAt: analytics.updatedAt,
    },
    { merge: true }
  );

  await batch.commit();
}

async function executarRecalculo() {
  const analytics = await calcularAnalytics();
  await salvarAnalytics(analytics);
  return analytics;
}

export async function GET() {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado" },
        { status: 500 }
      );
    }

    const analytics = await executarRecalculo();

    return NextResponse.json({
      ok: true,
      message: "Analytics recalculado com sucesso.",
      analytics,
    });
  } catch (error: any) {
    console.error("Erro ao recalcular analytics:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao recalcular analytics",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado" },
        { status: 500 }
      );
    }

    const analytics = await executarRecalculo();

    return NextResponse.json({
      ok: true,
      message: "Analytics atualizado automaticamente com sucesso.",
      analytics,
    });
  } catch (error: any) {
    console.error("Erro ao atualizar analytics automaticamente:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao atualizar analytics automaticamente",
      },
      { status: 500 }
    );
  }
}
