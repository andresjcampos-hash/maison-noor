"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  limit,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type StatusPedido =
  | "rascunho"
  | "aguardando_pagamento"
  | "pago"
  | "enviado"
  | "entregue"
  | "cancelado";

type PedidoItem = {
  nome?: string;
  qtd?: number;
  quantidade?: number;
  preco?: number;
  precoUnitario?: number;
};

type Pedido = {
  id: string;
  numero?: number;
  numeroPedido?: string;
  numeroSite?: string;
  clienteNome?: string;
  nome?: string;
  telefone?: string;
  origem?: string;
  itens?: PedidoItem[];
  items?: PedidoItem[];
  desconto?: number;
  frete?: number;
  total?: number;
  valor?: number;
  valorTotal?: number;
  status?: StatusPedido;
  formaPagamento?: string;
  dataVencimento?: any;
  pagamentos?: { forma?: string; valor?: number }[];
  visualizado?: boolean;
  alertaNovoPedido?: boolean;
  statusInterno?: string;
  prioridade?: "baixa" | "normal" | "alta" | "urgente";
  followUpFeito?: boolean;
  followUpAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

type Produto = {
  id: string;
  nome?: string;
  marca?: string;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  updatedAt?: any;
};

type InsightTipo = "critico" | "alerta" | "sucesso" | "info";

type Insight = {
  tipo: InsightTipo;
  titulo: string;
  descricao: string;
  acao?: string;
  href?: string;
};

type AnalyticsProdutoRanking = {
  nome?: string;
  quantidade?: number;
  receita?: number;
  custo?: number;
  lucro?: number;
  markupPercentual?: number;
  margemVendaPercentual?: number;
};

type AnalyticsDashboard = {
  pedidos?: {
    total?: number;
    mes?: number;
    faturados?: number;
    aguardandoPagamento?: number;
    cancelados?: number;
    potencialPendente?: number;
    conversao?: number;
  };
  financeiro?: {
    faturamentoTotal?: number;
    faturamentoMes?: number;
    custoTotal?: number;
    lucroTotal?: number;
    ticketMedio?: number;
    margemVenda?: number;
    markup?: number;
  };
  estoque?: {
    totalProdutos?: number;
    ativos?: number;
    estoqueFisico?: number;
    estoqueReservado?: number;
    estoqueDisponivel?: number;
    valorCusto?: number;
    valorVenda?: number;
    semEstoque?: number;
    baixoEstoque?: number;
    lucroEstoque?: number;
    margemVendaEstoque?: number;
    markupEstoque?: number;
    produtosCriticos?: Array<{
      id?: string;
      nome?: string;
      disponivel?: number;
    }>;
  };
  rankings?: {
    topProdutosLucro?: AnalyticsProdutoRanking[];
    topProdutosVenda?: AnalyticsProdutoRanking[];
  };
  historico7Dias?: AnalyticsHistoryDay[];
  updatedAt?: string;
};

type AnalyticsHistoryDay = {
  id?: string;
  data?: string;
  label?: string;
  pedidos?: number;
  faturados?: number;
  faturamento?: number;
  receita?: number;
  custo?: number;
  lucro?: number;
  ticketMedio?: number;
  updatedAt?: any;
};

function formatBRL(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pedidoCodigo(p: Pedido) {
  if (p.numeroPedido) return p.numeroPedido;
  if (p.numeroSite) return p.numeroSite;
  if (typeof p.numero === "number" && p.numero > 0) {
    return p.numero.toString().padStart(4, "0");
  }
  return p.id?.slice(-6) || "—";
}

function getItens(p: Pedido) {
  return Array.isArray(p.itens) && p.itens.length ? p.itens : p.items || [];
}

function calcularTotal(p: Pedido) {
  const direto = Number(p.total || p.valorTotal || p.valor || 0);
  if (direto > 0) return direto;

  const subtotal = getItens(p).reduce((acc, item) => {
    const qtd = Number(item.qtd || item.quantidade || 0);
    const preco = Number(item.preco || item.precoUnitario || 0);
    return acc + qtd * preco;
  }, 0);

  return Math.max(0, subtotal - Number(p.desconto || 0) + Number(p.frete || 0));
}

function normTexto(valor?: string) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function precoCompraProduto(p?: Produto) {
  const data = (p || {}) as any;
  return (
    Number(
      data.precoCompra ??
        data.custo ??
        data.cost ??
        data.valorCompra ??
        data.precoCusto ??
        0,
    ) || 0
  );
}

function precoVendaProduto(p?: Produto) {
  const data = (p || {}) as any;
  return (
    Number(
      data.precoVenda ?? data.price ?? data.preco ?? data.valorVenda ?? 0,
    ) || 0
  );
}

function encontrarProdutoPorItem(item: PedidoItem, produtos: Produto[]) {
  const nomeItem = normTexto(item.nome);
  if (!nomeItem) return undefined;
  return produtos.find((produto) => normTexto(produto.nome) === nomeItem);
}

function calcularPedidoFinanceiroReal(pedido: Pedido, produtos: Produto[]) {
  const totalVenda = calcularTotal(pedido);
  const itens = getItens(pedido);

  const custoProdutos = itens.reduce((acc, item) => {
    const produto = encontrarProdutoPorItem(item, produtos);
    const qtd = Math.max(0, Number(item.qtd || item.quantidade || 0));
    const custoUnitario = precoCompraProduto(produto);
    return acc + custoUnitario * qtd;
  }, 0);

  const lucro = totalVenda - custoProdutos;
  const markupPercentual =
    custoProdutos > 0 ? (lucro / custoProdutos) * 100 : 0;
  const margemVendaPercentual = totalVenda > 0 ? (lucro / totalVenda) * 100 : 0;

  return {
    totalVenda,
    custoProdutos,
    lucro,
    markupPercentual,
    margemVendaPercentual,
  };
}

function normalizarData(valor?: any): Date | null {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (typeof valor === "string" || typeof valor === "number") {
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? data : null;
  }
  return null;
}

function isPedidoNovo(p: Pedido) {
  return (
    p.alertaNovoPedido === true ||
    p.visualizado === false ||
    p.statusInterno === "novo_pedido" ||
    (p.origem === "site" &&
      p.status === "aguardando_pagamento" &&
      p.visualizado !== true)
  );
}

function horasDesde(valor?: any) {
  const data = normalizarData(valor);
  if (!data) return 0;
  return Math.max(0, (Date.now() - data.getTime()) / 1000 / 60 / 60);
}

function isPendenteParado(p: Pedido) {
  return (
    p.status === "aguardando_pagamento" &&
    horasDesde(p.createdAt || p.updatedAt) >= 24
  );
}

function isPagoParado(p: Pedido) {
  return p.status === "pago" && horasDesde(p.updatedAt || p.createdAt) >= 24;
}

function isEnviadoParado(p: Pedido) {
  return p.status === "enviado" && horasDesde(p.updatedAt || p.createdAt) >= 72;
}

function isFaturado(p: Pedido) {
  return (
    p.status === "pago" || p.status === "enviado" || p.status === "entregue"
  );
}

function inputDateFromAny(valor?: any): string {
  if (!valor) return "";
  if (typeof valor?.toDate === "function") {
    const d = valor.toDate();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  const raw = String(valor || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function isPedidoAPrazo(p: Pedido) {
  const formaTexto = String(p.formaPagamento || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    formaTexto.includes("prazo") ||
    formaTexto.includes("fiado") ||
    formaTexto.includes("depois") ||
    (p.pagamentos || []).some((pg) => pg.forma === "a_prazo")
  );
}

function isAPrazoPendente(p: Pedido) {
  return p.status === "aguardando_pagamento" && isPedidoAPrazo(p);
}

function diasAteVencimento(valor?: any): number | null {
  const input = inputDateFromAny(valor);
  if (!input) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const vencimento = new Date(`${input}T12:00:00`);
  vencimento.setHours(0, 0, 0, 0);

  return Math.ceil(
    (vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function statusVencimentoPedido(
  p: Pedido,
): "sem_vencimento" | "vencido" | "hoje" | "breve" | "ok" {
  if (!isAPrazoPendente(p)) return "sem_vencimento";
  const dias = diasAteVencimento(p.dataVencimento);
  if (dias === null) return "sem_vencimento";
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  if (dias <= 2) return "breve";
  return "ok";
}

function vencimentoTextoPedido(p: Pedido) {
  const input = inputDateFromAny(p.dataVencimento);
  if (!input) return "Sem vencimento";
  const dataBR = new Date(`${input}T12:00:00`).toLocaleDateString("pt-BR");
  const dias = diasAteVencimento(p.dataVencimento);
  if (dias === null) return dataBR;
  if (dias < 0) return `${dataBR} • atrasado há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return `${dataBR} • vence hoje`;
  return `${dataBR} • vence em ${dias} dia(s)`;
}

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    rascunho: "Rascunho",
    aguardando_pagamento: "Aguardando",
    pago: "Pago",
    enviado: "Enviado",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };
  return map[String(status || "")] || "Sem status";
}

function limparTelefone(telefone?: string) {
  return String(telefone || "").replace(/\D/g, "");
}

function whatsappPedido(p: Pedido) {
  const telefone = limparTelefone(p.telefone);
  const numero = pedidoCodigo(p);
  const nome = p.clienteNome || p.nome || "Cliente";
  const total = formatBRL(calcularTotal(p));

  const mensagem = encodeURIComponent(
    `Olá, ${nome}! Tudo bem? Aqui é da Maison Noor Parfums. Estou passando para acompanhar seu pedido #${numero} no valor de ${total}. Posso te ajudar com alguma informação?`,
  );

  if (telefone.length >= 10)
    return `https://wa.me/55${telefone}?text=${mensagem}`;
  return `https://wa.me/?text=${mensagem}`;
}

function classificarPrioridade(p: Pedido): Pedido["prioridade"] {
  if (p.prioridade) return p.prioridade;
  if (isPendenteParado(p) || isPagoParado(p)) return "urgente";
  if (p.status === "aguardando_pagamento") return "alta";
  if (isPedidoNovo(p)) return "alta";
  return "normal";
}

type PeriodoDashboard = "hoje" | "ontem" | "7d" | "30d" | "mes";

type DashboardPeriodRange = {
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
};

function inicioDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function chaveDataLocal(data: Date) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function labelDataCurta(data: Date) {
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatarPeriodoDashboard(start: Date, end: Date) {
  const mesmoDia = chaveDataLocal(start) === chaveDataLocal(end);
  if (mesmoDia) return start.toLocaleDateString("pt-BR");
  return `${labelDataCurta(start)} → ${labelDataCurta(end)}`;
}

function getDashboardPeriodRange(periodo: PeriodoDashboard): DashboardPeriodRange {
  const agora = new Date();
  let start = inicioDoDia(agora);
  let end = fimDoDia(agora);
  let label = "Hoje";

  if (periodo === "ontem") {
    const ontem = new Date(agora);
    ontem.setDate(agora.getDate() - 1);
    start = inicioDoDia(ontem);
    end = fimDoDia(ontem);
    label = "Ontem";
  }

  if (periodo === "7d") {
    start = inicioDoDia(agora);
    start.setDate(agora.getDate() - 6);
    end = fimDoDia(agora);
    label = "Últimos 7 dias";
  }

  if (periodo === "30d") {
    start = inicioDoDia(agora);
    start.setDate(agora.getDate() - 29);
    end = fimDoDia(agora);
    label = "Últimos 30 dias";
  }

  if (periodo === "mes") {
    start = inicioDoDia(new Date(agora.getFullYear(), agora.getMonth(), 1));
    end = fimDoDia(agora);
    label = "Este mês";
  }

  return {
    label,
    shortLabel: formatarPeriodoDashboard(start, end),
    start,
    end,
  };
}

function dataPedidoParaFiltro(pedido: Pedido) {
  return normalizarData(pedido.createdAt || pedido.updatedAt);
}

function pedidoDentroDoPeriodo(pedido: Pedido, periodo: DashboardPeriodRange) {
  const data = dataPedidoParaFiltro(pedido);
  if (!data) return false;
  return data.getTime() >= periodo.start.getTime() && data.getTime() <= periodo.end.getTime();
}

export default function CrmPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsDashboard | null>(null);
  const [analyticsHistory, setAnalyticsHistory] = useState<
    AnalyticsHistoryDay[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [erro, setErro] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [periodoDashboard, setPeriodoDashboard] =
    useState<PeriodoDashboard>("hoje");

  const periodoSelecionado = useMemo(
    () => getDashboardPeriodRange(periodoDashboard),
    [periodoDashboard],
  );

  const pedidosPeriodo = useMemo(
    () => pedidos.filter((pedido) => pedidoDentroDoPeriodo(pedido, periodoSelecionado)),
    [pedidos, periodoSelecionado],
  );

  useEffect(() => {
    const ref = collection(db, "pedidos", "default", "lista");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((docSnap) => ({
          ...(docSnap.data() as Pedido),
          id: docSnap.id,
        }));

        setPedidos(lista);
        setLoading(false);
        setErro("");
      },
      (error) => {
        console.error("Erro no dashboard em tempo real:", error);
        setErro("Não foi possível carregar os dados do CRM.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const ref = doc(db, "analytics", "dashboard");

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setAnalytics(
          snap.exists() ? (snap.data() as AnalyticsDashboard) : null,
        );
        setLoadingAnalytics(false);
      },
      (error) => {
        console.error("Erro ao carregar analytics do dashboard:", error);
        setAnalytics(null);
        setLoadingAnalytics(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const ref = collection(db, "analytics_history");
    const q = query(ref, orderBy("updatedAt", "desc"), limit(30));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs
          .map((docSnap) => ({
            ...(docSnap.data() as AnalyticsHistoryDay),
            id: docSnap.id,
          }))
          .sort((a, b) =>
            String(a.data || a.id || "").localeCompare(
              String(b.data || b.id || ""),
            ),
          );

        setAnalyticsHistory(lista);
        setLoadingHistory(false);
      },
      (error) => {
        console.error("Erro ao carregar analytics_history:", error);
        setAnalyticsHistory([]);
        setLoadingHistory(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const ref = collection(db, "products");
    const q = query(ref, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((docSnap) => ({
          ...(docSnap.data() as Produto),
          id: docSnap.id,
        }));

        setProdutos(lista);
        setLoadingProdutos(false);
      },
      (error) => {
        console.error("Erro ao carregar produtos no dashboard:", error);
        setLoadingProdutos(false);
      },
    );

    return () => unsubscribe();
  }, []);

  async function atualizarPedido(pedidoId: string, dados: Partial<Pedido>) {
    try {
      setSalvandoId(pedidoId);
      const ref = doc(db, "pedidos", "default", "lista", pedidoId);
      await updateDoc(ref, {
        ...dados,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erro ao atualizar pedido:", error);
      alert("Não foi possível atualizar o pedido agora.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function marcarFollowUp(p: Pedido) {
    await atualizarPedido(p.id, {
      followUpFeito: true,
      followUpAt: serverTimestamp(),
      statusInterno: "follow_up_feito",
      prioridade:
        p.prioridade === "urgente" ? "alta" : p.prioridade || "normal",
    } as Partial<Pedido>);
  }

  async function priorizarPedido(p: Pedido) {
    await atualizarPedido(p.id, {
      prioridade: "urgente",
      statusInterno: "prioridade_urgente",
    });
  }

  async function marcarVisualizado(p: Pedido) {
    await atualizarPedido(p.id, {
      visualizado: true,
      alertaNovoPedido: false,
      statusInterno:
        p.statusInterno === "novo_pedido" ? "visualizado" : p.statusInterno,
    });
  }

  const resumo = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const diaAtual = Math.max(1, agora.getDate());
    const diasNoMes = new Date(
      agora.getFullYear(),
      agora.getMonth() + 1,
      0,
    ).getDate();

    const novos = pedidos.filter(isPedidoNovo);
    const aguardando = pedidos.filter(
      (p) => p.status === "aguardando_pagamento",
    );
    const aPrazoPendentes = pedidos.filter(isAPrazoPendente);
    const aPrazoVencidos = aPrazoPendentes.filter(
      (p) => statusVencimentoPedido(p) === "vencido",
    );
    const aPrazoHoje = aPrazoPendentes.filter(
      (p) => statusVencimentoPedido(p) === "hoje",
    );
    const aPrazoBreve = aPrazoPendentes.filter(
      (p) => statusVencimentoPedido(p) === "breve",
    );
    const parados = pedidos.filter(
      (p) => isPendenteParado(p) || isPagoParado(p) || isEnviadoParado(p),
    );
    const pagos = pedidos.filter((p) => p.status === "pago");
    const faturados = pedidos.filter(isFaturado);
    const enviados = pedidos.filter((p) => p.status === "enviado");
    const entregues = pedidos.filter((p) => p.status === "entregue");

    const pedidosMes = pedidos.filter((p) => {
      const data = normalizarData(p.createdAt);
      return data ? data.getTime() >= inicioMes.getTime() : false;
    });

    const faturamentoMes = pedidosMes
      .filter(isFaturado)
      .reduce((acc, p) => acc + calcularTotal(p), 0);
    const previsaoMes =
      faturamentoMes > 0 ? (faturamentoMes / diaAtual) * diasNoMes : 0;
    const faturamento = faturados.reduce((acc, p) => acc + calcularTotal(p), 0);
    const potencialPendente = aguardando.reduce(
      (acc, p) => acc + calcularTotal(p),
      0,
    );
    const totalAPrazoPendente = aPrazoPendentes.reduce(
      (acc, p) => acc + calcularTotal(p),
      0,
    );
    const totalAPrazoVencido = aPrazoVencidos.reduce(
      (acc, p) => acc + calcularTotal(p),
      0,
    );
    const ticketMedio =
      faturados.length > 0 ? faturamento / faturados.length : 0;
    const conversao =
      pedidos.length > 0 ? (faturados.length / pedidos.length) * 100 : 0;

    const pedidosOrdenadosPorPrioridade = [...pedidos].sort((a, b) => {
      const peso: Record<string, number> = {
        urgente: 4,
        alta: 3,
        normal: 2,
        baixa: 1,
      };
      const pa = peso[classificarPrioridade(a) || "normal"] || 0;
      const pb = peso[classificarPrioridade(b) || "normal"] || 0;
      if (pb !== pa) return pb - pa;
      return (
        horasDesde(b.createdAt || b.updatedAt) -
        horasDesde(a.createdAt || a.updatedAt)
      );
    });

    return {
      novos: novos.length,
      aguardando: aguardando.length,
      parados: parados.length,
      pagos: pagos.length,
      enviados: enviados.length,
      entregues: entregues.length,
      faturamento,
      faturamentoMes,
      previsaoMes,
      potencialPendente,
      totalAPrazoPendente,
      totalAPrazoVencido,
      aPrazoPendentes: aPrazoPendentes.length,
      aPrazoVencidos: aPrazoVencidos.length,
      aPrazoHoje: aPrazoHoje.length,
      aPrazoBreve: aPrazoBreve.length,
      pedidosAPrazoCriticos: [
        ...aPrazoVencidos,
        ...aPrazoHoje,
        ...aPrazoBreve,
      ].slice(0, 5),
      totalGeral: pedidos.reduce((acc, p) => acc + calcularTotal(p), 0),
      ticketMedio,
      conversao,
      pedidoMaisAntigo: parados[0] || aguardando[0] || null,
      pedidosPrioritarios: pedidosOrdenadosPorPrioridade.slice(0, 5),
      pedidosParadosAtrasados: parados.slice(0, 5),
    };
  }, [pedidos]);

  const resumoEstoque = useMemo(() => {
    let totalProdutos = produtos.length;
    let ativos = 0;
    let estoqueFisico = 0;
    let estoqueDisponivel = 0;
    let estoqueReservado = 0;
    let valorVenda = 0;
    let valorCusto = 0;
    let valorDisponivelCusto = 0;
    let semEstoque = 0;
    let baixoEstoque = 0;

    const produtosCriticos = produtos
      .filter((p) => p.ativo !== false)
      .map((p) => {
        const estoque = Number(p.estoque) || 0;
        const reservado = Number(p.reservado) || 0;
        const disponivel = Math.max(0, estoque - reservado);
        return { ...p, disponivel };
      })
      .filter((p) => p.disponivel <= 2)
      .sort((a, b) => a.disponivel - b.disponivel)
      .slice(0, 5);

    for (const p of produtos) {
      if (p.ativo !== false) ativos++;

      const estoque = Number(p.estoque) || 0;
      const reservado = Number(p.reservado) || 0;
      const disponivel = Math.max(0, estoque - reservado);
      const compra = Number(p.precoCompra) || 0;
      const venda = Number(p.precoVenda) || 0;

      estoqueFisico += estoque;
      estoqueReservado += reservado;
      estoqueDisponivel += disponivel;
      valorVenda += venda * estoque;
      valorCusto += compra * estoque;
      valorDisponivelCusto += compra * disponivel;

      if (disponivel <= 0) semEstoque++;
      if (disponivel > 0 && disponivel <= 2) baixoEstoque++;
    }

    const margem = Math.max(0, valorVenda - valorCusto);
    const markupPercentual = valorCusto > 0 ? (margem / valorCusto) * 100 : 0;
    const margemVendaPercentual =
      valorVenda > 0 ? (margem / valorVenda) * 100 : 0;
    const margemPercentual = markupPercentual;
    const saudeEstoque =
      totalProdutos > 0
        ? ((totalProdutos - semEstoque) / totalProdutos) * 100
        : 0;

    return {
      totalProdutos,
      ativos,
      estoqueFisico,
      estoqueDisponivel,
      estoqueReservado,
      valorVenda,
      valorCusto,
      valorDisponivelCusto,
      margem,
      markupPercentual,
      margemVendaPercentual,
      margemPercentual,
      semEstoque,
      baixoEstoque,
      produtosCriticos,
      saudeEstoque,
    };
  }, [produtos]);

  const dadosAnalytics = useMemo(() => {
    const financeiro = analytics?.financeiro;
    const pedidosData = analytics?.pedidos;
    const estoque = analytics?.estoque;
    const estoqueCritico =
      Number(estoque?.semEstoque ?? resumoEstoque.semEstoque) +
      Number(estoque?.baixoEstoque ?? resumoEstoque.baixoEstoque);

    return {
      carregando: loadingAnalytics && !analytics,
      faturamentoMes: Number(
        financeiro?.faturamentoMes ?? resumo.faturamentoMes,
      ),
      faturamentoTotal: Number(
        financeiro?.faturamentoTotal ?? resumo.faturamento,
      ),
      potencialPendente: Number(
        pedidosData?.potencialPendente ?? resumo.potencialPendente,
      ),
      ticketMedio: Number(financeiro?.ticketMedio ?? resumo.ticketMedio),
      conversao: Number(pedidosData?.conversao ?? resumo.conversao),
      custoEstoque: Number(estoque?.valorCusto ?? resumoEstoque.valorCusto),
      valorVendaEstoque: Number(
        estoque?.valorVenda ?? resumoEstoque.valorVenda,
      ),
      margemEstoque: Number(estoque?.lucroEstoque ?? resumoEstoque.margem),
      markupEstoque: Number(
        estoque?.markupEstoque ?? resumoEstoque.markupPercentual,
      ),
      margemVendaEstoque: Number(
        estoque?.margemVendaEstoque ?? resumoEstoque.margemVendaPercentual,
      ),
      estoqueDisponivel: Number(
        estoque?.estoqueDisponivel ?? resumoEstoque.estoqueDisponivel,
      ),
      estoqueReservado: Number(
        estoque?.estoqueReservado ?? resumoEstoque.estoqueReservado,
      ),
      semEstoque: Number(estoque?.semEstoque ?? resumoEstoque.semEstoque),
      baixoEstoque: Number(estoque?.baixoEstoque ?? resumoEstoque.baixoEstoque),
      estoqueCritico,
      produtosCriticos: analytics?.estoque?.produtosCriticos?.length
        ? analytics.estoque.produtosCriticos.slice(0, 5)
        : resumoEstoque.produtosCriticos,
      saudeEstoque:
        Number(estoque?.totalProdutos || 0) > 0
          ? ((Number(estoque?.totalProdutos || 0) -
              Number(estoque?.semEstoque || 0)) /
              Number(estoque?.totalProdutos || 1)) *
            100
          : resumoEstoque.saudeEstoque,
    };
  }, [analytics, loadingAnalytics, resumo, resumoEstoque]);

  const insights = useMemo<Insight[]>(() => {
    const lista: Insight[] = [];

    if (resumo.parados > 0) {
      lista.push({
        tipo: "critico",
        titulo: `${resumo.parados} pedido(s) precisam de atenção`,
        descricao:
          "Existem pedidos parados. Priorize follow-up, envio ou atualização de status.",
        acao: "Ver pedidos",
        href: "/crm/pedidos",
      });
    }

    if (resumo.aguardando > 0) {
      lista.push({
        tipo: "alerta",
        titulo: `${resumo.aguardando} pedido(s) aguardando pagamento`,
        descricao:
          "Clientes com Pix pendente podem receber lembrete pelo WhatsApp.",
        acao: "Abrir pedidos",
        href: "/crm/pedidos",
      });
    }

    if (resumo.aPrazoVencidos > 0) {
      lista.push({
        tipo: "critico",
        titulo: `${resumo.aPrazoVencidos} venda(s) a prazo vencida(s)`,
        descricao: `${formatBRL(resumo.totalAPrazoVencido)} em cobrança atrasada. Priorize contato com esses clientes hoje.`,
        acao: "Ver pedidos",
        href: "/crm/pedidos",
      });
    } else if (resumo.aPrazoHoje > 0) {
      lista.push({
        tipo: "alerta",
        titulo: `${resumo.aPrazoHoje} venda(s) a prazo vencem hoje`,
        descricao:
          "Acompanhe os clientes com vencimento hoje para evitar atraso no caixa.",
        acao: "Ver pedidos",
        href: "/crm/pedidos",
      });
    }

    if (resumo.previsaoMes > 0) {
      lista.push({
        tipo: "info",
        titulo: `Previsão do mês: ${formatBRL(resumo.previsaoMes)}`,
        descricao:
          "Estimativa calculada automaticamente com base no ritmo atual de faturamento.",
      });
    }

    if (dadosAnalytics.conversao >= 50) {
      lista.push({
        tipo: "sucesso",
        titulo: `Conversão forte: ${resumo.conversao.toFixed(1)}%`,
        descricao:
          "A taxa de pedidos faturados está saudável. Vale reforçar os produtos campeões.",
      });
    }

    if (resumoEstoque.semEstoque > 0 || resumoEstoque.baixoEstoque > 0) {
      lista.push({
        tipo: "alerta",
        titulo: `${resumoEstoque.semEstoque} sem estoque • ${resumoEstoque.baixoEstoque} baixo estoque`,
        descricao:
          "Confira os produtos críticos para não perder vendas no site e nos eventos.",
        acao: "Ver produtos",
        href: "/crm/produtos",
      });
    }

    if (resumoEstoque.valorCusto > 0) {
      lista.push({
        tipo: "info",
        titulo: `Capital em estoque: ${formatBRL(resumoEstoque.valorCusto)}`,
        descricao: `Markup de ${resumoEstoque.markupPercentual.toFixed(0)}% sobre custo e margem venda de ${resumoEstoque.margemVendaPercentual.toFixed(0)}%.`,
        acao: "Ver produtos",
        href: "/crm/produtos",
      });
    }

    if (lista.length === 0) {
      lista.push({
        tipo: "sucesso",
        titulo: "CRM sem alertas críticos",
        descricao:
          "Pedidos, follow-ups e faturamento estão sob controle neste momento.",
      });
    }

    return lista;
  }, [resumo, resumoEstoque, dadosAnalytics]);

  const analiseIA = useMemo(() => {
    const recomendacoes: Insight[] = [];
    const scorePedidos =
      resumo.parados > 0 ? 18 : resumo.aguardando > 0 ? 28 : 35;
    const scoreEstoque =
      resumoEstoque.semEstoque > 0
        ? 18
        : resumoEstoque.baixoEstoque > 0
          ? 25
          : 35;
    const scoreFinanceiro = dadosAnalytics.faturamentoMes > 0 ? 30 : 18;
    const score = Math.min(
      100,
      Math.max(0, scorePedidos + scoreEstoque + scoreFinanceiro),
    );

    if (resumo.parados > 0) {
      recomendacoes.push({
        tipo: "critico",
        titulo: "Priorizar pedidos parados agora",
        descricao: `${resumo.parados} pedido(s) estão exigindo ação. Faça follow-up antes de focar em novas campanhas.`,
        acao: "Abrir pedidos",
        href: "/crm/pedidos",
      });
    }

    if (resumo.potencialPendente > 0) {
      recomendacoes.push({
        tipo: "alerta",
        titulo: "Recuperar vendas pendentes",
        descricao: `${formatBRL(resumo.potencialPendente)} em pedidos aguardando pagamento. Um lembrete no WhatsApp pode converter parte desse valor.`,
        acao: "Enviar follow-up",
        href: "/crm/pedidos",
      });
    }

    if (resumo.aPrazoVencidos > 0) {
      recomendacoes.push({
        tipo: "critico",
        titulo: "Cobrar vendas a prazo vencidas",
        descricao: `${formatBRL(resumo.totalAPrazoVencido)} já passou do vencimento. Essa é a ação com maior impacto no caixa agora.`,
        acao: "Abrir cobranças",
        href: "/crm/pedidos",
      });
    } else if (resumo.aPrazoHoje > 0 || resumo.aPrazoBreve > 0) {
      recomendacoes.push({
        tipo: "alerta",
        titulo: "Acompanhar vencimentos a prazo",
        descricao: `${resumo.aPrazoHoje} vencem hoje e ${resumo.aPrazoBreve} vencem em até 2 dias.`,
        acao: "Ver a receber",
        href: "/crm/pedidos",
      });
    }

    if (resumoEstoque.semEstoque > 0 || resumoEstoque.baixoEstoque > 0) {
      recomendacoes.push({
        tipo: "alerta",
        titulo: "Reposição inteligente de estoque",
        descricao: `${resumoEstoque.semEstoque} produto(s) sem estoque e ${resumoEstoque.baixoEstoque} com estoque baixo. Priorize os itens de maior margem.`,
        acao: "Ver produtos",
        href: "/crm/produtos",
      });
    }

    if (resumoEstoque.markupPercentual >= 100) {
      recomendacoes.push({
        tipo: "sucesso",
        titulo: "Margem saudável para campanhas",
        descricao: `Markup estimado de ${resumoEstoque.markupPercentual.toFixed(0)}% e margem venda de ${resumoEstoque.margemVendaPercentual.toFixed(0)}%. Há espaço para promoções controladas sem comprometer lucro.`,
        acao: "Ver financeiro",
        href: "/crm/financeiro",
      });
    }

    if (resumo.conversao < 35 && pedidos.length >= 3) {
      recomendacoes.push({
        tipo: "info",
        titulo: "Conversão pode melhorar",
        descricao: `Conversão atual de ${resumo.conversao.toFixed(1)}%. Revise checkout, prazo de resposta e abordagem de follow-up.`,
        acao: "Ver pedidos",
        href: "/crm/pedidos",
      });
    }

    if (recomendacoes.length === 0) {
      recomendacoes.push({
        tipo: "sucesso",
        titulo: "Operação saudável no momento",
        descricao:
          "Sem gargalos críticos. Bom momento para reforçar divulgação dos produtos com maior margem.",
        acao: "Ver produtos",
        href: "/crm/produtos",
      });
    }

    const focoDoDia =
      resumo.aPrazoVencidos > 0
        ? "Cobrar vendas a prazo vencidas"
        : resumo.parados > 0
          ? "Resolver pedidos parados"
          : resumo.aPrazoHoje > 0
            ? "Acompanhar vencimentos de hoje"
            : resumo.aguardando > 0
              ? "Converter pagamentos pendentes"
              : resumoEstoque.semEstoque > 0 || resumoEstoque.baixoEstoque > 0
                ? "Repor estoque crítico"
                : "Aumentar divulgação dos campeões";

    const resumoTexto =
      score >= 80
        ? "Operação forte. O CRM está saudável e pronto para escalar vendas."
        : score >= 60
          ? "Operação boa, mas com pontos de atenção em pedidos, estoque ou conversão."
          : "Operação exige atenção. Resolva os alertas antes de acelerar campanhas.";

    return {
      score,
      focoDoDia,
      resumoTexto,
      recomendacoes: recomendacoes.slice(0, 4),
    };
  }, [resumo, resumoEstoque, pedidos.length, dadosAnalytics]);

  const graficoProfissional = useMemo(() => {
    const fimBase = periodoSelecionado.end;
    const diffDias = Math.max(
      0,
      Math.round(
        (inicioDoDia(periodoSelecionado.end).getTime() -
          inicioDoDia(periodoSelecionado.start).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    const quantidadeDias = Math.min(31, diffDias + 1);
    const diasBase = Array.from({ length: quantidadeDias }, (_, index) => {
      const data = new Date(fimBase);
      data.setDate(fimBase.getDate() - (quantidadeDias - 1 - index));
      data.setHours(0, 0, 0, 0);
      const key = chaveDataLocal(data);

      return {
        key,
        label: labelDataCurta(data),
        receita: 0,
        lucro: 0,
        pedidos: 0,
        faturados: 0,
        origem: "fallback" as "history" | "dashboard" | "fallback",
      };
    });

    const montarDiasLocais = () => {
      const copia = diasBase.map((dia) => ({ ...dia, origem: "fallback" as const }));
      const mapLocal = new Map(copia.map((dia) => [dia.key, dia]));

      for (const pedido of pedidos) {
        const data = normalizarData(pedido.createdAt);
        if (!data) continue;

        const key = chaveDataLocal(data);
        const dia = mapLocal.get(key);
        if (!dia) continue;

        const financeiroPedido = calcularPedidoFinanceiroReal(pedido, produtos);
        dia.pedidos += 1;

        if (isFaturado(pedido)) {
          dia.faturados += 1;
          dia.receita += financeiroPedido.totalVenda;
          dia.lucro += financeiroPedido.lucro;
        }
      }

      return copia;
    };

    const diasLocais = montarDiasLocais();
    const totalLocal = diasLocais.reduce((acc, dia) => acc + dia.receita + dia.pedidos, 0);

    const historicoFonte = analyticsHistory.length
      ? analyticsHistory
      : Array.isArray(analytics?.historico7Dias)
        ? analytics.historico7Dias
        : [];

    const diasHistorico = diasBase.map((dia) => ({
      ...dia,
      origem: analyticsHistory.length ? ("history" as const) : ("dashboard" as const),
    }));
    const mapHistorico = new Map(diasHistorico.map((dia) => [dia.key, dia]));

    for (const item of historicoFonte) {
      const key = String(item.data || item.id || "").slice(0, 10);
      const dia = mapHistorico.get(key);
      if (!dia) continue;

      dia.receita = Number(item.faturamento ?? item.receita ?? item.faturamentoTotal ?? 0);
      dia.lucro = Number(item.lucro ?? item.lucroTotal ?? 0);
      dia.pedidos = Number(item.pedidos ?? item.totalPedidos ?? 0);
      dia.faturados = Number(item.faturados ?? item.pedidosFaturados ?? 0);
    }

    const totalHistorico = diasHistorico.reduce((acc, dia) => acc + dia.receita + dia.pedidos, 0);

    // Fallback definitivo: se analytics_history existir, mas estiver zerado,
    // usa os pedidos reais carregados no dashboard para não mostrar gráfico vazio.
    const dias = totalHistorico > 0 || totalLocal === 0 ? diasHistorico : diasLocais;
    const maxReceita = Math.max(1, ...dias.map((dia) => dia.receita));
    const maxPedidos = Math.max(1, ...dias.map((dia) => dia.pedidos));
    const totalReceita7d = dias.reduce((acc, dia) => acc + dia.receita, 0);
    const totalLucro7d = dias.reduce((acc, dia) => acc + dia.lucro, 0);
    const totalPedidos7d = dias.reduce((acc, dia) => acc + dia.pedidos, 0);
    const totalFaturados7d = dias.reduce((acc, dia) => acc + dia.faturados, 0);
    const melhorDia = [...dias].sort((a, b) => b.receita - a.receita)[0];
    const origemDados = dias.some((dia) => dia.origem === "history")
      ? "analytics_history"
      : dias.some((dia) => dia.origem === "dashboard")
        ? "analytics/dashboard"
        : "fallback local";

    const statusDistribuicao = [
      { label: "Aguardando", valor: resumo.aguardando, classe: "warn" },
      { label: "Pagos", valor: resumo.pagos, classe: "success" },
      { label: "Enviados", valor: resumo.enviados, classe: "info" },
      { label: "Entregues", valor: resumo.entregues, classe: "gold" },
      { label: "Parados", valor: resumo.parados, classe: "danger" },
    ];

    const maxStatus = Math.max(
      1,
      ...statusDistribuicao.map((item) => item.valor),
    );

    return {
      dias,
      maxReceita,
      maxPedidos,
      totalReceita7d,
      totalLucro7d,
      totalPedidos7d,
      totalFaturados7d,
      melhorDia,
      origemDados,
      carregando:
        loadingHistory &&
        !analyticsHistory.length &&
        !analytics?.historico7Dias?.length,
      statusDistribuicao,
      maxStatus,
    };
  }, [analytics, analyticsHistory, loadingHistory, pedidos, produtos, resumo, periodoSelecionado]);

  const dashboardPremium = useMemo(() => {
    if (analytics) {
      const normalizarRanking = (lista?: AnalyticsProdutoRanking[]) =>
        (lista || []).map((item) => {
          const receita = Number(item.receita || 0);
          const custo = Number(item.custo || 0);
          const lucro = Number(item.lucro || receita - custo);

          return {
            nome: item.nome || "Produto sem nome",
            quantidade: Number(item.quantidade || 0),
            receita,
            custo,
            lucro,
            markupPercentual:
              typeof item.markupPercentual === "number"
                ? item.markupPercentual
                : custo > 0
                  ? (lucro / custo) * 100
                  : 0,
            margemVendaPercentual:
              typeof item.margemVendaPercentual === "number"
                ? item.margemVendaPercentual
                : receita > 0
                  ? (lucro / receita) * 100
                  : 0,
          };
        });

      const topLucro = normalizarRanking(
        analytics.rankings?.topProdutosLucro,
      ).slice(0, 5);
      const topVenda = normalizarRanking(
        analytics.rankings?.topProdutosVenda,
      ).slice(0, 5);
      const baixoLucro = [...topVenda, ...topLucro]
        .filter(
          (item, index, arr) =>
            arr.findIndex((x) => normTexto(x.nome) === normTexto(item.nome)) ===
            index,
        )
        .filter((item) => item.receita > 0 && item.margemVendaPercentual < 35)
        .sort((a, b) => a.margemVendaPercentual - b.margemVendaPercentual)
        .slice(0, 4);

      return {
        receita: Number(analytics.financeiro?.faturamentoTotal || 0),
        custo: Number(analytics.financeiro?.custoTotal || 0),
        lucro: Number(analytics.financeiro?.lucroTotal || 0),
        markupPercentual: Number(analytics.financeiro?.markup || 0),
        margemVendaPercentual: Number(analytics.financeiro?.margemVenda || 0),
        topLucro,
        topVenda,
        baixoLucro,
      };
    }

    const faturados = pedidos.filter(isFaturado);
    const receita = faturados.reduce(
      (acc, pedido) => acc + calcularTotal(pedido),
      0,
    );
    const custo = faturados.reduce(
      (acc, pedido) =>
        acc + calcularPedidoFinanceiroReal(pedido, produtos).custoProdutos,
      0,
    );
    const lucro = receita - custo;
    const markupPercentual = custo > 0 ? (lucro / custo) * 100 : 0;
    const margemVendaPercentual = receita > 0 ? (lucro / receita) * 100 : 0;

    const mapaProdutos = new Map<
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

    for (const pedido of faturados) {
      for (const item of getItens(pedido)) {
        const nome =
          String(item.nome || "Produto sem nome").trim() || "Produto sem nome";
        const key = normTexto(nome);
        const produto = encontrarProdutoPorItem(item, produtos);
        const qtd = Math.max(0, Number(item.qtd || item.quantidade || 0));
        const vendaUnit = Number(
          item.preco || item.precoUnitario || precoVendaProduto(produto) || 0,
        );
        const custoUnit = precoCompraProduto(produto);
        const receitaItem = vendaUnit * qtd;
        const custoItem = custoUnit * qtd;

        const atual = mapaProdutos.get(key) || {
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
        atual.lucro += receitaItem - custoItem;
        atual.markupPercentual =
          atual.custo > 0 ? (atual.lucro / atual.custo) * 100 : 0;
        atual.margemVendaPercentual =
          atual.receita > 0 ? (atual.lucro / atual.receita) * 100 : 0;
        mapaProdutos.set(key, atual);
      }
    }

    const ranking = Array.from(mapaProdutos.values());
    const topLucro = [...ranking].sort((a, b) => b.lucro - a.lucro).slice(0, 5);
    const topVenda = [...ranking]
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
    const baixoLucro = [...ranking]
      .filter((item) => item.receita > 0 && item.margemVendaPercentual < 35)
      .sort((a, b) => a.margemVendaPercentual - b.margemVendaPercentual)
      .slice(0, 4);

    return {
      receita,
      custo,
      lucro,
      markupPercentual,
      margemVendaPercentual,
      topLucro,
      topVenda,
      baixoLucro,
    };
  }, [pedidos, produtos, analytics]);

  const dashboardInteligenteHoje = useMemo(() => {
    const agora = periodoSelecionado.end;
    const pedidosHoje = pedidosPeriodo;

    const faturadosHoje = pedidosHoje.filter(isFaturado);
    const faturamentoHoje = faturadosHoje.reduce(
      (acc, pedido) => acc + calcularTotal(pedido),
      0,
    );
    const lucroHoje = faturadosHoje.reduce(
      (acc, pedido) => acc + calcularPedidoFinanceiroReal(pedido, produtos).lucro,
      0,
    );
    const ticketMedioHoje =
      faturadosHoje.length > 0 ? faturamentoHoje / faturadosHoje.length : 0;

    const produtosHoje = new Map<
      string,
      { nome: string; quantidade: number; receita: number; lucro: number }
    >();

    for (const pedido of faturadosHoje) {
      for (const item of getItens(pedido)) {
        const nome =
          String(item.nome || "Produto sem nome").trim() || "Produto sem nome";
        const key = normTexto(nome);
        const produto = encontrarProdutoPorItem(item, produtos);
        const qtd = Math.max(0, Number(item.qtd || item.quantidade || 0));
        const vendaUnit = Number(
          item.preco || item.precoUnitario || precoVendaProduto(produto) || 0,
        );
        const custoUnit = precoCompraProduto(produto);
        const receita = vendaUnit * qtd;
        const lucro = receita - custoUnit * qtd;
        const atual = produtosHoje.get(key) || {
          nome,
          quantidade: 0,
          receita: 0,
          lucro: 0,
        };

        atual.quantidade += qtd;
        atual.receita += receita;
        atual.lucro += lucro;
        produtosHoje.set(key, atual);
      }
    }

    const produtoMaisVendido = Array.from(produtosHoje.values()).sort(
      (a, b) => b.quantidade - a.quantidade || b.receita - a.receita,
    )[0];

    const pedidosPendentesHoje = pedidosHoje.filter(
      (pedido) => pedido.status === "aguardando_pagamento",
    );
    const valorPendenteHoje = pedidosPendentesHoje.reduce(
      (acc, pedido) => acc + calcularTotal(pedido),
      0,
    );

    const margemHoje =
      faturamentoHoje > 0 ? (lucroHoje / faturamentoHoje) * 100 : 0;
    const melhorDiaHistorico = graficoProfissional.melhorDia;
    const metaVisual = Math.max(faturamentoHoje, resumo.faturamentoMes / Math.max(1, agora.getDate()), 1);
    const progressoHoje = Math.min(100, (faturamentoHoje / metaVisual) * 100);

    const foco =
      resumo.aPrazoVencidos > 0
        ? "Cobrar vendas vencidas"
        : resumo.parados > 0
          ? "Resolver pedidos parados"
          : valorPendenteHoje > 0
            ? "Converter pendências de hoje"
            : produtoMaisVendido
              ? `Impulsionar ${produtoMaisVendido.nome}`
              : "Gerar primeiras vendas do dia";

    return {
      periodoLabel: periodoSelecionado.label,
      periodoShortLabel: periodoSelecionado.shortLabel,
      pedidosHoje: pedidosHoje.length,
      faturadosHoje: faturadosHoje.length,
      faturamentoHoje,
      lucroHoje,
      ticketMedioHoje,
      margemHoje,
      produtoMaisVendido,
      pedidosPendentesHoje: pedidosPendentesHoje.length,
      valorPendenteHoje,
      progressoHoje,
      foco,
      melhorDiaHistorico,
    };
  }, [pedidosPeriodo, periodoSelecionado, produtos, resumo, graficoProfissional]);


  const iaAvancadaDashboard = useMemo(() => {
    const alertas: {
      tipo: "critico" | "alerta" | "sucesso" | "info";
      titulo: string;
      descricao: string;
      acao: string;
      href: string;
      impacto: string;
    }[] = [];

    const produtosBaixaMargem = dashboardPremium.baixoLucro.slice(0, 3);
    const produtoMaisLucrativo = dashboardPremium.topLucro[0];
    const produtoMaisVendido = dashboardPremium.topVenda[0];
    const margemVenda = dashboardPremium.margemVendaPercentual;
    const markup = dashboardPremium.markupPercentual;

    if (resumo.parados > 0) {
      alertas.push({
        tipo: "critico",
        titulo: "Resolver pedidos parados antes de vender mais",
        descricao: `${resumo.parados} pedido(s) estão travados. Ação recomendada: follow-up imediato e atualização de status para não contaminar estoque, financeiro e previsão.`,
        acao: "Abrir pedidos",
        href: "/crm/pedidos",
        impacto: "Alto impacto no caixa",
      });
    }

    if (resumo.potencialPendente > 0) {
      alertas.push({
        tipo: "alerta",
        titulo: "Recuperar faturamento pendente",
        descricao: `Existe ${formatBRL(resumo.potencialPendente)} parado em pedidos aguardando pagamento. Priorize WhatsApp com mensagem curta e link de pagamento.`,
        acao: "Enviar follow-up",
        href: "/crm/pedidos",
        impacto: "Venda quase ganha",
      });
    }

    if (produtosBaixaMargem.length > 0) {
      const p = produtosBaixaMargem[0];
      alertas.push({
        tipo: "alerta",
        titulo: "Produto vendendo com margem baixa",
        descricao: `${p.nome} está com margem sobre venda de ${p.margemVendaPercentual.toFixed(0)}%. Reavalie preço, desconto ou custo de compra antes de impulsionar.`,
        acao: "Ver produtos",
        href: "/crm/produtos",
        impacto: "Proteção de lucro",
      });
    }

    if (resumoEstoque.semEstoque > 0 || resumoEstoque.baixoEstoque > 0) {
      alertas.push({
        tipo: "critico",
        titulo: "Reposição com prioridade financeira",
        descricao: `${resumoEstoque.semEstoque} produto(s) sem estoque e ${resumoEstoque.baixoEstoque} com estoque baixo. Reponha primeiro os produtos com maior lucro e maior saída.`,
        acao: "Ver estoque",
        href: "/crm/produtos",
        impacto: "Evita perda de venda",
      });
    }

    if (produtoMaisLucrativo) {
      alertas.push({
        tipo: "sucesso",
        titulo: "Produto campeão de lucro",
        descricao: `${produtoMaisLucrativo.nome} gerou ${formatBRL(produtoMaisLucrativo.lucro)} de lucro estimado. Bom candidato para destaque no Instagram, vitrine e eventos.`,
        acao: "Promover produto",
        href: "/crm/produtos",
        impacto: "Escalar lucro",
      });
    }

    if (
      produtoMaisVendido &&
      produtoMaisLucrativo &&
      produtoMaisVendido.nome !== produtoMaisLucrativo.nome
    ) {
      alertas.push({
        tipo: "info",
        titulo: "Mais vendido não é necessariamente o mais lucrativo",
        descricao: `${produtoMaisVendido.nome} lidera em volume, mas compare com ${produtoMaisLucrativo.nome}, que lidera em lucro. Use isso para decidir campanhas.`,
        acao: "Ver ranking",
        href: "/crm",
        impacto: "Decisão estratégica",
      });
    }

    const precoSugeridoBase = produtosBaixaMargem[0];
    const precoSugerido =
      precoSugeridoBase && precoSugeridoBase.custo > 0
        ? precoSugeridoBase.custo * 2.5
        : 0;

    const diagnostico =
      resumo.parados > 0
        ? "A IA recomenda limpar pedidos parados antes de acelerar campanhas."
        : produtosBaixaMargem.length > 0
          ? "A IA encontrou oportunidade de proteger margem antes de vender mais."
          : produtoMaisLucrativo
            ? "A IA recomenda reforçar os produtos campeões de lucro."
            : "A operação está estável. Continue alimentando pedidos e produtos para análises mais fortes.";

    const prioridade =
      resumo.parados > 0
        ? "Follow-up de pedidos"
        : resumoEstoque.semEstoque > 0 || resumoEstoque.baixoEstoque > 0
          ? "Reposição de estoque"
          : produtosBaixaMargem.length > 0
            ? "Ajuste de preço/margem"
            : "Campanha dos campeões";

    return {
      diagnostico,
      prioridade,
      margemVenda,
      markup,
      alertas: alertas.slice(0, 6),
      produtosBaixaMargem,
      produtoMaisLucrativo,
      produtoMaisVendido,
      precoSugeridoBase,
      precoSugerido,
    };
  }, [dashboardPremium, resumo, resumoEstoque]);

  const pedidosTabela = resumo.pedidosParadosAtrasados.length
    ? resumo.pedidosParadosAtrasados
    : resumo.pedidosPrioritarios;

  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <main className="crmDashPage">
      <div className="crmDashShell">
        <section className="crmTopBar">
          <div className="crmTopBrand">
            <div className="crmDashKicker">Maison Noor</div>
            <h1>CRM • Dashboard</h1>
            <p>
              Visão inteligente dos pedidos, alertas, faturamento e automações
              do CRM em tempo real.
            </p>
          </div>

          <div className="crmTopActions">
            <span className="crmDashRealtime">● Tempo real ativo</span>
            <div className="crmPeriodFilter" aria-label="Filtro de período do dashboard">
              {([
                ["hoje", "Hoje"],
                ["ontem", "Ontem"],
                ["7d", "7 dias"],
                ["30d", "30 dias"],
                ["mes", "Mês"],
              ] as Array<[PeriodoDashboard, string]>).map(([valor, label]) => (
                <button
                  key={valor}
                  type="button"
                  className={periodoDashboard === valor ? "active" : ""}
                  onClick={() => setPeriodoDashboard(valor)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="crmDateBadge">📅 {periodoSelecionado.shortLabel}</span>
            <span className="crmUserBadge">
              <b>A</b>
              <span>
                Admin
                <small>Administrador</small>
              </span>
            </span>
          </div>
        </section>

        <div className="crmHeroButtons">
          <Link href="/crm/pedidos" className="crmDashLinkPrimary">
            Ver pedidos
          </Link>
          <Link href="/crm/financeiro" className="crmDashLinkSoft">
            Financeiro
          </Link>
        </div>

        {erro ? <div className="crmDashAlert crmDashError">{erro}</div> : null}



        <section className="crmSmartTodayPanel">
          <div className="crmSmartTodayHero">
            <div>
              <div className="crmDashPanelKicker">Dashboard inteligente • {dashboardInteligenteHoje.periodoLabel}</div>
              <h2>Resumo operacional do período</h2>
              <p>
                Leitura rápida do que aconteceu no período selecionado e do que merece ação imediata.
              </p>
            </div>
            <div className="crmSmartTodayFocus">
              <span>Foco recomendado</span>
              <strong>{dashboardInteligenteHoje.foco}</strong>
              <small>
                Baseado em pedidos, pendências, faturamento e estoque em tempo real.
              </small>
            </div>
          </div>

          <div className="crmSmartTodayGrid">
            <div className="crmSmartTodayCard highlight">
              <span>Faturamento do período</span>
              <strong>
                {loading ? "..." : formatBRL(dashboardInteligenteHoje.faturamentoHoje)}
              </strong>
              <small>
                {dashboardInteligenteHoje.faturadosHoje} pedido(s) faturado(s)
              </small>
              <i>
                <b style={{ width: `${dashboardInteligenteHoje.progressoHoje}%` }} />
              </i>
            </div>

            <div className="crmSmartTodayCard">
              <span>Pedidos do período</span>
              <strong>{loading ? "..." : dashboardInteligenteHoje.pedidosHoje}</strong>
              <small>
                {dashboardInteligenteHoje.pedidosPendentesHoje} aguardando pagamento
              </small>
            </div>

            <div className="crmSmartTodayCard success">
              <span>Lucro estimado no período</span>
              <strong>
                {loading || loadingProdutos
                  ? "..."
                  : formatBRL(dashboardInteligenteHoje.lucroHoje)}
              </strong>
              <small>
                Margem venda {dashboardInteligenteHoje.margemHoje.toFixed(0)}%
              </small>
            </div>

            <div className="crmSmartTodayCard">
              <span>Ticket médio do período</span>
              <strong>
                {loading ? "..." : formatBRL(dashboardInteligenteHoje.ticketMedioHoje)}
              </strong>
              <small>Média dos pedidos faturados no dia</small>
            </div>

            <div className="crmSmartTodayCard product">
              <span>Produto mais vendido</span>
              <strong>
                {dashboardInteligenteHoje.produtoMaisVendido?.nome || "Aguardando venda"}
              </strong>
              <small>
                {dashboardInteligenteHoje.produtoMaisVendido
                  ? `${dashboardInteligenteHoje.produtoMaisVendido.quantidade} unidade(s) • ${formatBRL(
                      dashboardInteligenteHoje.produtoMaisVendido.receita,
                    )}`
                  : "Assim que houver venda no período, aparece aqui"}
              </small>
            </div>

            <div className="crmSmartTodayCard warn">
              <span>Pendente no período</span>
              <strong>{formatBRL(dashboardInteligenteHoje.valorPendenteHoje)}</strong>
              <small>Valor aguardando confirmação no período</small>
            </div>
          </div>
        </section>

        <section className="crmDashMetricsOneRow">
          <MetricCard
            icon="🔔"
            label="Novos pedidos"
            value={loading ? "..." : resumo.novos}
            hint="Ainda não visualizados"
            href="/crm/pedidos"
            active={resumo.novos > 0}
          />
          <MetricCard
            icon="⏳"
            label="Aguardando"
            value={loading ? "..." : resumo.aguardando}
            hint="Pix ou atendimento pendente"
            href="/crm/pedidos"
            active={resumo.aguardando > 0}
          />
          <MetricCard
            icon="🔴"
            label="A prazo vencido"
            value={loading ? "..." : resumo.aPrazoVencidos}
            hint={formatBRL(resumo.totalAPrazoVencido)}
            href="/crm/pedidos"
            danger={resumo.aPrazoVencidos > 0}
          />
          <MetricCard
            icon="📅"
            label="Vence hoje"
            value={loading ? "..." : resumo.aPrazoHoje}
            hint="Contas a receber"
            href="/crm/pedidos"
            active={resumo.aPrazoHoje > 0}
          />
          <MetricCard
            icon="⚠️"
            label="Parados"
            value={loading ? "..." : resumo.parados}
            hint="Follow-up prioritário"
            href="/crm/pedidos"
            danger={resumo.parados > 0}
          />
          <MetricCard
            icon="✅"
            label="Pagos"
            value={loading ? "..." : resumo.pagos}
            hint="Pedidos confirmados"
            href="/crm/pedidos"
            success={resumo.pagos > 0}
          />
          <MetricCard
            icon="💰"
            label="Faturamento (mês)"
            value={
              loading && dadosAnalytics.carregando
                ? "..."
                : formatBRL(dadosAnalytics.faturamentoMes)
            }
            hint="Pago, enviado ou entregue"
            active={dadosAnalytics.faturamentoMes > 0}
          />
          <MetricCard
            icon="📈"
            label="Previsão (mês)"
            value={loading ? "..." : formatBRL(resumo.previsaoMes)}
            hint="Estimativa automática"
            active={resumo.previsaoMes > 0}
          />
          <MetricCard
            icon="🧾"
            label="Ticket médio"
            value={
              loading && dadosAnalytics.carregando
                ? "..."
                : formatBRL(dadosAnalytics.ticketMedio)
            }
            hint="Média dos pedidos faturados"
          />
          <MetricCard
            icon="🔥"
            label="Conversão"
            value={
              loading && dadosAnalytics.carregando
                ? "..."
                : `${dadosAnalytics.conversao.toFixed(1)}%`
            }
            hint="Pedidos faturados no CRM"
            success={dadosAnalytics.conversao >= 50}
          />
        </section>

        {resumo.aPrazoPendentes > 0 ? (
          <section className="crmDashPanel crmReceivablePanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">
                  A receber • Vendas a prazo
                </div>
                <h2>Alertas de vencimento</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">
                Ver pedidos
              </Link>
            </div>

            <div className="crmReceivableSummary">
              <span>
                <b>{resumo.aPrazoPendentes}</b> pendente(s)
              </span>
              <span>
                <b>{resumo.aPrazoVencidos}</b> vencido(s)
              </span>
              <span>
                <b>{resumo.aPrazoHoje}</b> vencem hoje
              </span>
              <span>
                <b>{formatBRL(resumo.totalAPrazoPendente)}</b> a receber
              </span>
            </div>

            <div className="crmReceivableList">
              {resumo.pedidosAPrazoCriticos.length ? (
                resumo.pedidosAPrazoCriticos.map((p) => (
                  <Link
                    key={p.id}
                    href="/crm/pedidos"
                    className={`crmReceivableItem ${statusVencimentoPedido(p)}`}
                  >
                    <strong>
                      #{pedidoCodigo(p)} •{" "}
                      {p.clienteNome || p.nome || "Cliente"}
                    </strong>
                    <span>{vencimentoTextoPedido(p)}</span>
                    <b>{formatBRL(calcularTotal(p))}</b>
                  </Link>
                ))
              ) : (
                <span className="crmReceivableEmpty">
                  Nenhum vencimento crítico agora.
                </span>
              )}
            </div>
          </section>
        ) : null}

        <section className="crmBusinessGrid">
          <div className="crmDashPanel crmExecutivePanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Painel executivo</div>
                <h2>Saúde comercial da Maison Noor</h2>
              </div>
              <Link href="/crm/financeiro" className="crmDashSmallLink">
                Financeiro
              </Link>
            </div>

            <div className="crmExecutiveGrid">
              <ExecutiveCard
                label="Faturado no mês"
                value={
                  loading && dadosAnalytics.carregando
                    ? "..."
                    : formatBRL(dadosAnalytics.faturamentoMes)
                }
                hint="Receita confirmada"
                tone="gold"
              />
              <ExecutiveCard
                label="Potencial pendente"
                value={
                  loading && dadosAnalytics.carregando
                    ? "..."
                    : formatBRL(dadosAnalytics.potencialPendente)
                }
                hint="Pedidos aguardando pagamento"
                tone={dadosAnalytics.potencialPendente > 0 ? "warn" : "soft"}
              />
              <ExecutiveCard
                label="Capital em estoque"
                value={
                  loadingProdutos && dadosAnalytics.carregando
                    ? "..."
                    : formatBRL(dadosAnalytics.custoEstoque)
                }
                hint="Custo do estoque físico"
                tone="gold"
              />
              <ExecutiveCard
                label="Margem do estoque"
                value={
                  loadingProdutos && dadosAnalytics.carregando ? (
                    "..."
                  ) : (
                    <>
                      <span className="crmExecutiveMoney">
                        {formatBRL(dadosAnalytics.margemEstoque)}
                      </span>
                      <em className="crmExecutivePercent">
                        Markup {dadosAnalytics.markupEstoque.toFixed(0)}%
                      </em>
                      <em className="crmExecutivePercent subtle">
                        Venda {dadosAnalytics.margemVendaEstoque.toFixed(0)}%
                      </em>
                    </>
                  )
                }
                hint="Lucro, markup e margem sobre venda"
                tone="success"
              />
            </div>
          </div>

          <div className="crmDashPanel crmStockPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Estoque inteligente</div>
                <h2>Risco e oportunidade</h2>
              </div>
              <Link href="/crm/produtos" className="crmDashSmallLink">
                Produtos
              </Link>
            </div>

            <div className="crmStockHealth">
              <div className="crmStockCircle">
                <strong>
                  {loadingProdutos && dadosAnalytics.carregando
                    ? "..."
                    : `${dadosAnalytics.saudeEstoque.toFixed(0)}%`}
                </strong>
                <span>Saúde do estoque</span>
              </div>

              <div className="crmStockFacts">
                <span>
                  <b>{dadosAnalytics.estoqueDisponivel}</b> unidades disponíveis
                </span>
                <span>
                  <b>{dadosAnalytics.estoqueReservado}</b> unidades reservadas
                </span>
                <span>
                  <b>{dadosAnalytics.semEstoque}</b> produtos sem estoque
                </span>
                <span>
                  <b>{formatBRL(dadosAnalytics.custoEstoque)}</b> custo em
                  estoque
                </span>
              </div>
            </div>

            <div className="crmCriticalProducts">
              {loadingProdutos ? (
                <span>Carregando produtos críticos...</span>
              ) : dadosAnalytics.produtosCriticos.length === 0 ? (
                <span>Nenhum produto crítico no estoque agora.</span>
              ) : (
                dadosAnalytics.produtosCriticos.map((p) => (
                  <Link
                    key={p.id}
                    href="/crm/produtos"
                    className="crmCriticalProduct"
                  >
                    <strong>{p.nome || "Produto sem nome"}</strong>
                    <small>Disponível: {p.disponivel}</small>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="crmAiPanel">
          <div className="crmAiHeader">
            <div>
              <div className="crmDashPanelKicker">IA no CRM</div>
              <h2>Análise inteligente da operação</h2>
              <p>{analiseIA.resumoTexto}</p>
            </div>

            <div className="crmAiScoreBox">
              <span>Score IA</span>
              <strong>
                {loading || loadingProdutos ? "..." : analiseIA.score}
              </strong>
              <small>{analiseIA.focoDoDia}</small>
            </div>
          </div>

          <div className="crmAiGrid">
            <div className="crmAiMainCard">
              <span className="crmAiBadge">Recomendação principal</span>
              <h3>{analiseIA.focoDoDia}</h3>
              <p>
                A IA analisou pedidos, pagamentos, estoque, margem e conversão
                para sugerir a ação com maior impacto agora.
              </p>
              <div className="crmAiNumbers">
                <span>
                  <b>{resumo.parados}</b> parados
                </span>
                <span>
                  <b>{formatBRL(dadosAnalytics.potencialPendente)}</b> pendente
                </span>
                <span>
                  <b>{dadosAnalytics.estoqueCritico}</b> alertas estoque
                </span>
              </div>
            </div>

            <div className="crmAiActions">
              {analiseIA.recomendacoes.map((item, index) => {
                const content = (
                  <>
                    <span className={`crmAiActionIcon ${item.tipo}`}>
                      {item.tipo === "critico"
                        ? "⚠️"
                        : item.tipo === "alerta"
                          ? "🔔"
                          : item.tipo === "sucesso"
                            ? "🚀"
                            : "💡"}
                    </span>
                    <span>
                      <strong>{item.titulo}</strong>
                      <small>{item.descricao}</small>
                    </span>
                    <b>{item.acao || "Abrir"} →</b>
                  </>
                );

                return item.href ? (
                  <Link
                    key={index}
                    href={item.href}
                    className="crmAiActionItem"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={index} className="crmAiActionItem">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="crmChartsGrid">
          <div className="crmDashPanel crmChartPanel crmRevenueChartPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">
                  Gráfico profissional • {graficoProfissional.origemDados}
                </div>
                <h2>Faturamento real • {periodoSelecionado.label}</h2>
              </div>
              <Link href="/crm/financeiro" className="crmDashSmallLink">
                Ver financeiro
              </Link>
            </div>

            <div className="crmChartSummary">
              <span>
                <small>
                  {graficoProfissional.carregando
                    ? "Carregando histórico"
                    : "Receita período"}
                </small>
                <b>
                  {graficoProfissional.carregando
                    ? "..."
                    : formatBRL(graficoProfissional.totalReceita7d)}
                </b>
              </span>
              <span>
                <small>Lucro real</small>
                <b>
                  {graficoProfissional.carregando
                    ? "..."
                    : formatBRL(graficoProfissional.totalLucro7d)}
                </b>
              </span>
              <span>
                <small>Pedidos</small>
                <b>
                  {graficoProfissional.carregando
                    ? "..."
                    : graficoProfissional.totalPedidos7d}
                </b>
              </span>
              <span>
                <small>Melhor dia</small>
                <b>
                  {graficoProfissional.carregando
                    ? "..."
                    : graficoProfissional.melhorDia?.label || "—"}
                </b>
              </span>
            </div>

            <div
              className="crmBarChart"
              style={{
                gridTemplateColumns: `repeat(${graficoProfissional.dias.length}, minmax(0, 1fr))`,
              }}
            >
              {graficoProfissional.dias.map((dia) => {
                const alturaReceita = Math.max(
                  8,
                  (dia.receita / graficoProfissional.maxReceita) * 100,
                );
                const alturaPedidos = Math.max(
                  6,
                  (dia.pedidos / graficoProfissional.maxPedidos) * 78,
                );

                return (
                  <div key={dia.key} className="crmChartDay">
                    <div
                      className="crmChartBars"
                      title={`${dia.label} • ${formatBRL(dia.receita)} • ${dia.pedidos} pedido(s)`}
                    >
                      <span
                        className="crmOrdersBar"
                        style={{ height: `${alturaPedidos}%` }}
                      />
                      <strong style={{ height: `${alturaReceita}%` }} />
                    </div>
                    <small>{dia.label}</small>
                    <b>{formatBRL(dia.receita)}</b>
                  </div>
                );
              })}
            </div>

            <div className="crmChartLegend">
              <span>
                <i className="gold" /> Receita faturada
              </span>
              <span>
                <i className="soft" /> Volume de pedidos
              </span>
            </div>
          </div>

          <div className="crmDashPanel crmChartPanel crmStatusChartPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Funil operacional</div>
                <h2>Status dos pedidos</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">
                Ver pedidos
              </Link>
            </div>

            <div className="crmStatusBars">
              {graficoProfissional.statusDistribuicao.map((item) => (
                <div key={item.label} className="crmStatusBarRow">
                  <div>
                    <span>{item.label}</span>
                    <b>{item.valor}</b>
                  </div>
                  <strong>
                    <i
                      className={item.classe}
                      style={{
                        width: `${Math.max(6, (item.valor / graficoProfissional.maxStatus) * 100)}%`,
                      }}
                    />
                  </strong>
                </div>
              ))}
            </div>

            <div className="crmChartInsightBox">
              <span>Leitura rápida</span>
              <strong>
                {graficoProfissional.totalFaturados7d > 0
                  ? `${graficoProfissional.totalFaturados7d} pedido(s) faturados no período.`
                  : "Ainda sem faturamento confirmado no período selecionado."}
              </strong>
              <small>
                O gráfico lê dados consolidados de analytics_history e mantém
                fallback automático se o histórico ainda estiver vazio.
              </small>
            </div>
          </div>
        </section>

        <section className="crmPremiumGrid">
          <div className="crmDashPanel crmPremiumDrePanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Dashboard premium</div>
                <h2>DRE rápido da operação</h2>
              </div>
              <Link href="/crm/financeiro" className="crmDashSmallLink">
                Ver financeiro
              </Link>
            </div>

            <div className="crmDreGrid">
              <span>
                <small>Receita faturada</small>
                <b>{formatBRL(dashboardPremium.receita)}</b>
              </span>
              <span>
                <small>Custo dos produtos</small>
                <b>{formatBRL(dashboardPremium.custo)}</b>
              </span>
              <span className="success">
                <small>Lucro real estimado</small>
                <b>{formatBRL(dashboardPremium.lucro)}</b>
              </span>
              <span>
                <small>Markup</small>
                <b>{dashboardPremium.markupPercentual.toFixed(0)}%</b>
              </span>
              <span>
                <small>Margem venda</small>
                <b>{dashboardPremium.margemVendaPercentual.toFixed(0)}%</b>
              </span>
            </div>
          </div>

          <div className="crmDashPanel crmRankingPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Ranking automático</div>
                <h2>Top produtos por lucro</h2>
              </div>
              <Link href="/crm/produtos" className="crmDashSmallLink">
                Produtos
              </Link>
            </div>

            <div className="crmRankingList">
              {dashboardPremium.topLucro.length ? (
                dashboardPremium.topLucro.map((item, index) => (
                  <div key={`${item.nome}_${index}`} className="crmRankingItem">
                    <span>{index + 1}</span>
                    <strong>{item.nome}</strong>
                    <small>
                      {formatBRL(item.lucro)} • Markup{" "}
                      {item.markupPercentual.toFixed(0)}%
                    </small>
                  </div>
                ))
              ) : (
                <p className="crmPremiumEmpty">
                  Ainda não há produtos faturados para ranking.
                </p>
              )}
            </div>
          </div>

          <div className="crmDashPanel crmRankingPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Mais vendidos</div>
                <h2>Volume e atenção</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">
                Ver pedidos
              </Link>
            </div>

            <div className="crmRankingList">
              {dashboardPremium.topVenda.length ? (
                dashboardPremium.topVenda.map((item, index) => (
                  <div
                    key={`${item.nome}_venda_${index}`}
                    className="crmRankingItem compact"
                  >
                    <span>{item.quantidade}</span>
                    <strong>{item.nome}</strong>
                    <small>
                      {formatBRL(item.receita)} vendidos • Margem venda{" "}
                      {item.margemVendaPercentual.toFixed(0)}%
                    </small>
                  </div>
                ))
              ) : (
                <p className="crmPremiumEmpty">
                  Ainda não há volume suficiente para análise.
                </p>
              )}
            </div>

            {dashboardPremium.baixoLucro.length ? (
              <div className="crmLowMarginBox">
                <b>⚠️ Atenção em margem</b>
                <small>
                  {dashboardPremium.baixoLucro[0].nome} está com margem venda de{" "}
                  {dashboardPremium.baixoLucro[0].margemVendaPercentual.toFixed(
                    0,
                  )}
                  %.
                </small>
              </div>
            ) : null}
          </div>
        </section>

        <section className="crmTrueAiPanel">
          <div className="crmTrueAiHeader">
            <div>
              <div className="crmDashPanelKicker">IA de verdade</div>
              <h2>Central de decisão automática</h2>
              <p>{iaAvancadaDashboard.diagnostico}</p>
            </div>
            <div className="crmTrueAiPriority">
              <span>Prioridade agora</span>
              <strong>{iaAvancadaDashboard.prioridade}</strong>
              <small>
                Markup {iaAvancadaDashboard.markup.toFixed(0)}% • Margem venda{" "}
                {iaAvancadaDashboard.margemVenda.toFixed(0)}%
              </small>
            </div>
          </div>

          <div className="crmTrueAiGrid">
            <div className="crmTrueAiMain">
              <span className="crmTrueAiBadge">Plano recomendado</span>
              <h3>{iaAvancadaDashboard.prioridade}</h3>
              <p>
                A IA cruzou pedidos, estoque, margem, produtos vendidos e lucro
                estimado para indicar onde agir primeiro.
              </p>

              <div className="crmTrueAiMiniGrid">
                <span>
                  <small>Produto mais lucrativo</small>
                  <b>
                    {iaAvancadaDashboard.produtoMaisLucrativo?.nome ||
                      "Aguardando vendas"}
                  </b>
                </span>
                <span>
                  <small>Produto mais vendido</small>
                  <b>
                    {iaAvancadaDashboard.produtoMaisVendido?.nome ||
                      "Aguardando volume"}
                  </b>
                </span>
                <span>
                  <small>Margem em atenção</small>
                  <b>{iaAvancadaDashboard.produtosBaixaMargem.length}</b>
                </span>
              </div>

              {iaAvancadaDashboard.precoSugeridoBase ? (
                <div className="crmPriceSuggestion">
                  <b>💡 Preço sugerido inteligente</b>
                  <span>
                    Para {iaAvancadaDashboard.precoSugeridoBase.nome}, teste
                    preço próximo de{" "}
                    {formatBRL(iaAvancadaDashboard.precoSugerido)} para buscar
                    markup de 150% sobre custo.
                  </span>
                </div>
              ) : null}
            </div>

            <div className="crmTrueAiActions">
              {iaAvancadaDashboard.alertas.map((alerta, index) => (
                <Link
                  key={`${alerta.titulo}_${index}`}
                  href={alerta.href}
                  className={`crmTrueAiAction ${alerta.tipo}`}
                >
                  <span>
                    {alerta.tipo === "critico"
                      ? "🚨"
                      : alerta.tipo === "alerta"
                        ? "⚠️"
                        : alerta.tipo === "sucesso"
                          ? "🚀"
                          : "💡"}
                  </span>
                  <div>
                    <strong>{alerta.titulo}</strong>
                    <small>{alerta.descricao}</small>
                    <em>{alerta.impacto}</em>
                  </div>
                  <b>{alerta.acao} →</b>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {resumo.parados > 0 ? (
          <Link href="/crm/pedidos" className="crmDashAlert crmDashWarning">
            <strong>
              ⚠️ {resumo.parados} pedido(s) parado(s) ou atrasado(s).
            </strong>
            <span>Clique para agir e priorizar follow-up.</span>
            <b>Ver agora →</b>
          </Link>
        ) : null}

        <section className="crmMainGrid">
          <div className="crmDashPanel crmTablePanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">
                  Pedidos parados / atrasados
                </div>
                <h2>Fila de ação</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">
                Ver todos
              </Link>
            </div>

            <div className="crmTableWrap">
              <table className="crmTable">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Tempo parado</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5}>Carregando pedidos...</td>
                    </tr>
                  ) : pedidosTabela.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Nenhum pedido crítico agora.</td>
                    </tr>
                  ) : (
                    pedidosTabela.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>#{pedidoCodigo(p)}</strong>
                          <small>
                            {normalizarData(p.createdAt)?.toLocaleString(
                              "pt-BR",
                            ) || "—"}
                          </small>
                        </td>
                        <td>{p.clienteNome || p.nome || "Cliente"}</td>
                        <td>
                          <span
                            className={`crmDashStatus ${p.status || "rascunho"}`}
                          >
                            {statusLabel(p.status)}
                          </span>
                          <small>{p.formaPagamento || "Pagamento"}</small>
                        </td>
                        <td>
                          {Math.round(horasDesde(p.updatedAt || p.createdAt))}h
                        </td>
                        <td>
                          <div className="crmTableActions">
                            <a
                              href={whatsappPedido(p)}
                              target="_blank"
                              rel="noreferrer"
                              className="crmIconBtn whatsapp"
                              title="WhatsApp"
                            >
                              ☘
                            </a>
                            <button
                              type="button"
                              className="crmIconBtn"
                              disabled={salvandoId === p.id}
                              onClick={() => marcarFollowUp(p)}
                              title="Follow-up feito"
                            >
                              ☑
                            </button>
                            <button
                              type="button"
                              className="crmIconBtn purple"
                              disabled={salvandoId === p.id}
                              onClick={() => priorizarPedido(p)}
                              title="Priorizar"
                            >
                              ⚑
                            </button>
                            {isPedidoNovo(p) ? (
                              <button
                                type="button"
                                className="crmIconBtn soft"
                                disabled={salvandoId === p.id}
                                onClick={() => marcarVisualizado(p)}
                                title="Visualizado"
                              >
                                👁
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crmDashPanel crmInsightsPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Insights inteligentes</div>
                <h2>O que agir agora</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">
                Ver todos
              </Link>
            </div>

            <div className="crmInsightList">
              {insights.map((item, index) => {
                const content = (
                  <>
                    <span className={`crmInsightIcon ${item.tipo}`}>
                      {item.tipo === "critico"
                        ? "⚠️"
                        : item.tipo === "alerta"
                          ? "🔔"
                          : item.tipo === "sucesso"
                            ? "⭐"
                            : "📈"}
                    </span>
                    <span className="crmInsightText">
                      <strong>{item.titulo}</strong>
                      <small>{item.descricao}</small>
                    </span>
                    <b>→</b>
                  </>
                );

                return item.href ? (
                  <Link key={index} href={item.href} className="crmInsightItem">
                    {content}
                  </Link>
                ) : (
                  <div key={index} className="crmInsightItem">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="crmBottomGrid">
          <div className="crmDashPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Automações ativas</div>
                <h2>Motor do CRM</h2>
              </div>
              <span className="crmAutoTag">Configurar</span>
            </div>

            <div className="crmAutomationGrid">
              <AutomationItem text="Alertas de pedidos parados" />
              <AutomationItem text="Follow-up automático" />
              <AutomationItem text="Priorização inteligente" />
              <AutomationItem text="Status automático" />
            </div>
          </div>

          <div className="crmDashPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Ação rápida</div>
                <h2>Atalhos de produtividade</h2>
              </div>
            </div>

            <div className="crmQuickGrid">
              <Link href="/crm/pedidos" className="crmQuickAction">
                <b>☘</b>
                <span>
                  Enviar follow-up<small>WhatsApp</small>
                </span>
              </Link>
              <Link href="/crm/pedidos" className="crmQuickAction">
                <b>⚑</b>
                <span>
                  Priorizar pedidos<small>Fila inteligente</small>
                </span>
              </Link>
              <Link href="/crm/pedidos" className="crmQuickAction">
                <b>☑</b>
                <span>
                  Marcar como feito<small>Follow-up</small>
                </span>
              </Link>
              <Link href="/crm/pedidos" className="crmQuickAction">
                <b>👁</b>
                <span>
                  Ver todos pedidos<small>Lista completa</small>
                </span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      <style jsx global>
        {`
          .crmDashPage {
            padding: 14px 18px 18px;
            color: #f4f1eb;
          }

          .crmDashShell {
            width: 100%;
            max-width: 1320px;
            margin: 0 auto;
          }

          .crmTopBar,
          .crmDashPanel,
          .crmDashMetric,
          .crmDashAlert {
            border: 1px solid rgba(200, 162, 106, 0.18);
            background: linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.045),
              rgba(255, 255, 255, 0.014)
            );
            box-shadow: 0 16px 44px rgba(0, 0, 0, 0.22);
          }

          .crmTopBar {
            min-height: 74px;
            border-radius: 16px;
            padding: 14px 18px;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 9px;
          }

          .crmTopBrand h1 {
            margin: 4px 0 4px;
            font-size: 24px;
            line-height: 1;
            letter-spacing: -0.03em;
          }

          .crmTopBrand p,
          .crmDashPage p {
            margin: 0;
            color: rgba(244, 241, 235, 0.72);
            line-height: 1.32;
          }

          .crmDashKicker,
          .crmDashPanelKicker {
            color: rgba(200, 162, 106, 0.98);
            font-size: 9px;
            font-weight: 950;
            letter-spacing: 0.18em;
            text-transform: uppercase;
          }

          .crmTopActions,
          .crmHeroButtons {
            display: flex;
            align-items: center;
            gap: 7px;
            flex-wrap: wrap;
          }

          .crmHeroButtons {
            margin: 8px 0 0;
          }

          .crmDashRealtime,
          .crmDateBadge,
          .crmUserBadge,
          .crmDashLinkPrimary,
          .crmDashLinkSoft {
            min-height: 30px;
            border-radius: 10px;
            display: inline-flex;
            align-items: center;
            text-decoration: none;
            font-size: 12px;
            font-weight: 950;
          }

          .crmDashRealtime {
            padding: 0 12px;
            color: #8dffb1;
            border: 1px solid rgba(87, 255, 149, 0.28);
            background: rgba(87, 255, 149, 0.08);
          }

          .crmDateBadge {
            padding: 0 12px;
            color: #f4f1eb;
            border: 1px solid rgba(200, 162, 106, 0.22);
            background: rgba(200, 162, 106, 0.08);
          }

          .crmPeriodFilter {
            min-height: 30px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px;
            border-radius: 12px;
            border: 1px solid rgba(200, 162, 106, 0.2);
            background: rgba(0, 0, 0, 0.18);
          }

          .crmPeriodFilter button {
            height: 24px;
            border: 0;
            border-radius: 9px;
            padding: 0 9px;
            cursor: pointer;
            color: rgba(244, 241, 235, 0.68);
            background: transparent;
            font-size: 11px;
            font-weight: 950;
            transition:
              transform 0.16s ease,
              background 0.16s ease,
              color 0.16s ease;
          }

          .crmPeriodFilter button:hover {
            transform: translateY(-1px);
            color: #f4f1eb;
            background: rgba(255, 255, 255, 0.06);
          }

          .crmPeriodFilter button.active {
            color: #15120d;
            background: linear-gradient(180deg, #f3d194, #c8a26a);
            box-shadow: 0 8px 18px rgba(200, 162, 106, 0.16);
          }

          .crmUserBadge {
            gap: 9px;
            color: #f4f1eb;
          }

          .crmUserBadge > b {
            width: 30px;
            height: 30px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            background: linear-gradient(135deg, #347b70, #2c5b54);
          }

          .crmUserBadge span {
            display: grid;
            gap: 1px;
          }

          .crmUserBadge small {
            color: rgba(244, 241, 235, 0.58);
            font-weight: 700;
          }

          .crmDashLinkPrimary,
          .crmDashLinkSoft {
            padding: 0 13px;
            color: #f4f1eb;
          }

          .crmDashLinkPrimary {
            border: 1px solid rgba(200, 162, 106, 0.45);
            background: rgba(200, 162, 106, 0.14);
          }

          .crmDashLinkSoft {
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
          }

          .crmDashMetricsOneRow {
            margin-top: 10px;
            display: grid;
            grid-template-columns: repeat(8, minmax(0, 1fr));
            gap: 7px;
          }

          .crmDashMetric {
            min-height: 78px;
            border-radius: 12px;
            padding: 10px;
            color: inherit;
            text-decoration: none;
            position: relative;
            overflow: hidden;
            transition:
              transform 0.16s ease,
              border-color 0.16s ease,
              background 0.16s ease;
          }

          .crmDashMetric:hover {
            transform: translateY(-2px);
            border-color: rgba(200, 162, 106, 0.42);
          }

          .crmDashMetric.crmDashMetricActive {
            border-color: rgba(255, 211, 120, 0.42);
            background: linear-gradient(
              180deg,
              rgba(255, 211, 120, 0.11),
              rgba(255, 255, 255, 0.014)
            );
          }

          .crmDashMetric.crmDashMetricDanger {
            border-color: rgba(255, 132, 86, 0.45);
            background: linear-gradient(
              180deg,
              rgba(255, 132, 86, 0.12),
              rgba(255, 255, 255, 0.014)
            );
          }

          .crmDashMetric.crmDashMetricSuccess {
            border-color: rgba(91, 255, 146, 0.24);
          }

          .crmDashMetricIcon {
            width: 27px;
            height: 27px;
            border-radius: 10px;
            display: grid;
            place-items: center;
            border: 1px solid rgba(200, 162, 106, 0.24);
            background: rgba(200, 162, 106, 0.1);
            margin-bottom: 7px;
            font-size: 12px;
          }

          .crmDashMetricLabel {
            display: block;
            color: rgba(244, 241, 235, 0.72);
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.09em;
            font-weight: 950;
            min-height: 16px;
          }

          .crmDashMetricValue {
            display: block;
            margin-top: 3px;
            color: #d8ad68;
            font-size: 16px;
            line-height: 1;
            font-weight: 950;
            letter-spacing: -0.03em;
            white-space: nowrap;
          }

          .crmDashMetricHint {
            display: block;
            margin-top: 5px;
            color: rgba(244, 241, 235, 0.58);
            font-size: 9px;
            line-height: 1.28;
          }

          .crmDashAlert {
            margin-top: 10px;
            padding: 10px 13px;
            border-radius: 12px;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 9px;
            color: #ffe1a5;
          }

          .crmDashAlert b {
            color: #d8ad68;
          }

          .crmDashWarning {
            border-color: rgba(255, 180, 80, 0.35);
            background: linear-gradient(
              180deg,
              rgba(255, 180, 80, 0.13),
              rgba(255, 180, 80, 0.05)
            );
          }

          .crmDashError {
            color: #ffd0d0;
            border-color: rgba(255, 100, 100, 0.32);
            background: rgba(255, 100, 100, 0.08);
          }

          .crmMainGrid,
          .crmBottomGrid {
            display: grid;
            gap: 10px;
            margin-top: 10px;
          }

          .crmPremiumGrid {
            margin-top: 12px;
            display: grid;
            grid-template-columns: 1.08fr 0.96fr 0.96fr;
            gap: 12px;
          }
          .crmPremiumDrePanel,
          .crmRankingPanel {
            min-height: 100%;
          }
          .crmDreGrid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }
          .crmDreGrid span {
            min-width: 0;
            padding: 11px;
            border-radius: 15px;
            border: 1px solid rgba(200, 162, 106, 0.14);
            background: rgba(255, 255, 255, 0.025);
          }
          .crmDreGrid span.success {
            border-color: rgba(80, 220, 140, 0.26);
            background: rgba(80, 220, 140, 0.08);
          }
          .crmDreGrid small,
          .crmRankingItem small,
          .crmPremiumEmpty,
          .crmLowMarginBox small {
            display: block;
            opacity: 0.68;
            font-size: 11px;
            line-height: 1.35;
          }
          .crmDreGrid b {
            display: block;
            margin-top: 6px;
            color: rgba(200, 162, 106, 0.98);
            font-size: 17px;
            font-weight: 950;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .crmDreGrid span.success b {
            color: #93f7b3;
          }
          .crmRankingList {
            display: grid;
            gap: 8px;
          }
          .crmRankingItem {
            display: grid;
            grid-template-columns: 32px minmax(0, 1fr);
            gap: 8px 10px;
            align-items: center;
            padding: 9px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.075);
            background: rgba(0, 0, 0, 0.18);
          }
          .crmRankingItem span {
            width: 32px;
            height: 32px;
            border-radius: 11px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(200, 162, 106, 0.22);
            background: rgba(200, 162, 106, 0.08);
            color: rgba(200, 162, 106, 0.98);
            font-weight: 950;
            grid-row: span 2;
          }
          .crmRankingItem strong {
            min-width: 0;
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 13px;
          }
          .crmRankingItem.compact span {
            color: #9ff0bc;
            border-color: rgba(88, 214, 141, 0.26);
            background: rgba(88, 214, 141, 0.09);
          }
          .crmPremiumEmpty {
            margin: 0;
            padding: 12px;
            border-radius: 14px;
            border: 1px dashed rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.02);
          }
          .crmLowMarginBox {
            margin-top: 10px;
            padding: 10px;
            border-radius: 14px;
            border: 1px solid rgba(255, 180, 90, 0.24);
            background: rgba(255, 180, 90, 0.08);
          }
          .crmLowMarginBox b {
            display: block;
            margin-bottom: 4px;
            color: #ffd38b;
          }

          .crmMainGrid {
            grid-template-columns: minmax(0, 1.28fr) minmax(360px, 0.72fr);
          }

          .crmBottomGrid {
            grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          }

          .crmDashPanel {
            border-radius: 14px;
            padding: 12px;
            overflow: hidden;
          }

          .crmDashPanelHead {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 9px;
            margin-bottom: 9px;
          }

          .crmDashPanelHead.compact h2,
          .crmDashPage h2 {
            margin: 5px 0 0;
            font-size: 16px;
            line-height: 1.1;
            letter-spacing: -0.02em;
          }

          .crmDashSmallLink,
          .crmAutoTag {
            color: #d8ad68;
            text-decoration: none;
            white-space: nowrap;
            border: 1px solid rgba(200, 162, 106, 0.24);
            background: rgba(200, 162, 106, 0.08);
            border-radius: 999px;
            padding: 6px 9px;
            font-size: 12px;
            font-weight: 950;
          }

          .crmTableWrap {
            overflow-x: auto;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
          }

          .crmTable {
            width: 100%;
            border-collapse: collapse;
            min-width: 680px;
          }

          .crmTable th,
          .crmTable td {
            padding: 7px 9px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.065);
            font-size: 12px;
          }

          .crmTable th {
            color: rgba(244, 241, 235, 0.62);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 9px;
            font-weight: 950;
          }

          .crmTable td {
            color: rgba(244, 241, 235, 0.78);
          }

          .crmTable tr:last-child td {
            border-bottom: 0;
          }

          .crmTable td strong {
            display: block;
            color: #d8ad68;
          }

          .crmTable small {
            display: block;
            margin-top: 3px;
            color: rgba(244, 241, 235, 0.58);
          }

          .crmDashStatus,
          .crmPriority {
            display: inline-flex;
            width: fit-content;
            border-radius: 999px;
            padding: 4px 8px;
            font-size: 9px;
            font-weight: 950;
            text-transform: capitalize;
          }

          .crmDashStatus {
            color: #d8ad68;
            border: 1px solid rgba(200, 162, 106, 0.28);
            background: rgba(200, 162, 106, 0.08);
          }

          .crmDashStatus.pago,
          .crmDashStatus.enviado,
          .crmDashStatus.entregue {
            color: #9dffbd;
            border-color: rgba(91, 255, 146, 0.28);
            background: rgba(91, 255, 146, 0.08);
          }

          .crmDashStatus.aguardando_pagamento {
            color: #ffe1a5;
            border-color: rgba(255, 211, 120, 0.28);
            background: rgba(255, 211, 120, 0.08);
          }

          .crmTableActions {
            display: flex;
            gap: 6px;
            align-items: center;
          }

          .crmIconBtn {
            width: 26px;
            height: 26px;
            border-radius: 9px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.055);
            color: #f4f1eb;
            display: inline-grid;
            place-items: center;
            text-decoration: none;
            cursor: pointer;
            font-size: 12px;
          }

          .crmIconBtn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .crmIconBtn.whatsapp {
            color: #9dffbd;
            border-color: rgba(91, 255, 146, 0.24);
            background: rgba(91, 255, 146, 0.08);
          }

          .crmIconBtn.purple {
            color: #d6b7ff;
            border-color: rgba(166, 116, 255, 0.24);
            background: rgba(166, 116, 255, 0.08);
          }

          .crmIconBtn.soft {
            color: #d8ad68;
            border-color: rgba(200, 162, 106, 0.22);
            background: rgba(200, 162, 106, 0.07);
          }

          .crmInsightList {
            display: grid;
            gap: 7px;
          }

          .crmInsightItem {
            min-height: 52px;
            display: grid;
            grid-template-columns: 34px 1fr auto;
            align-items: center;
            gap: 7px;
            color: inherit;
            text-decoration: none;
            border-radius: 10px;
            padding: 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.2);
            transition:
              transform 0.16s ease,
              border-color 0.16s ease;
          }

          .crmInsightItem:hover {
            transform: translateY(-1px);
            border-color: rgba(200, 162, 106, 0.32);
          }

          .crmInsightIcon {
            width: 30px;
            height: 30px;
            border-radius: 10px;
            display: grid;
            place-items: center;
            background: rgba(200, 162, 106, 0.1);
            border: 1px solid rgba(200, 162, 106, 0.2);
          }

          .crmInsightText {
            display: grid;
            gap: 3px;
          }

          .crmInsightText strong {
            font-size: 12px;
          }

          .crmInsightText small {
            color: rgba(244, 241, 235, 0.58);
            line-height: 1.3;
          }

          .crmInsightItem b {
            color: rgba(244, 241, 235, 0.58);
          }

          .crmAutomationGrid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px 12px;
            margin-top: 6px;
          }

          .crmAutomationItem {
            display: flex;
            align-items: flex-start;
            gap: 9px;
            color: rgba(244, 241, 235, 0.76);
            font-size: 12px;
          }

          .crmAutomationItem b {
            width: 16px;
            height: 16px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            color: #9dffbd;
            border: 1px solid rgba(91, 255, 146, 0.25);
            background: rgba(91, 255, 146, 0.08);
            font-size: 9px;
            flex: 0 0 auto;
          }

          .crmAutomationItem small {
            display: block;
            color: #80e6a2;
            margin-top: 2px;
          }

          .crmQuickGrid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 7px;
          }

          .crmQuickAction {
            min-height: 52px;
            color: inherit;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 7px;
            border-radius: 10px;
            padding: 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
          }

          .crmQuickAction b {
            width: 28px;
            height: 28px;
            display: grid;
            place-items: center;
            border-radius: 10px;
            color: #d8ad68;
            border: 1px solid rgba(200, 162, 106, 0.22);
            background: rgba(200, 162, 106, 0.08);
          }

          .crmQuickAction span {
            display: grid;
            font-size: 12px;
            font-weight: 950;
          }

          .crmQuickAction small {
            color: rgba(244, 241, 235, 0.55);
            font-size: 9px;
            font-weight: 700;
            margin-top: 2px;
          }

          .crmBusinessGrid {
            display: grid;
            grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
            gap: 10px;
            margin-top: 10px;
          }

          .crmExecutiveGrid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }

          .crmExecutiveCard {
            min-width: 0;
            border-radius: 12px;
            padding: 11px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
            overflow: hidden;
          }

          .crmExecutiveCard.gold {
            border-color: rgba(200, 162, 106, 0.24);
            background: linear-gradient(
              180deg,
              rgba(200, 162, 106, 0.1),
              rgba(0, 0, 0, 0.16)
            );
          }

          .crmExecutiveCard.warn {
            border-color: rgba(255, 180, 80, 0.3);
            background: linear-gradient(
              180deg,
              rgba(255, 180, 80, 0.1),
              rgba(0, 0, 0, 0.16)
            );
          }

          .crmExecutiveCard.success {
            border-color: rgba(91, 255, 146, 0.2);
            background: linear-gradient(
              180deg,
              rgba(91, 255, 146, 0.08),
              rgba(0, 0, 0, 0.16)
            );
          }

          .crmExecutiveCard span {
            display: block;
            color: rgba(244, 241, 235, 0.62);
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.09em;
            font-weight: 950;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmExecutiveCard strong {
            display: block;
            margin-top: 7px;
            color: #d8ad68;
            font-size: 16px;
            line-height: 1.08;
            font-weight: 950;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmExecutiveCard strong .crmExecutiveMoney {
            display: block;
            color: #d8ad68;
            font-size: 16px;
            line-height: 1.08;
            font-weight: 950;
            letter-spacing: 0;
            text-transform: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmExecutiveCard strong .crmExecutivePercent {
            display: block;
            margin-top: 3px;
            color: #8dffb1;
            font-size: 11px;
            line-height: 1.05;
            font-style: normal;
            font-weight: 950;
            letter-spacing: 0.03em;
          }

          .crmExecutiveCard small {
            display: block;
            margin-top: 7px;
            color: rgba(244, 241, 235, 0.54);
            font-size: 10px;
            line-height: 1.25;
          }

          .crmStockHealth {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 12px;
            align-items: center;
          }

          .crmStockCircle {
            width: 112px;
            height: 112px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            text-align: center;
            padding: 12px;
            border: 1px solid rgba(200, 162, 106, 0.28);
            background:
              radial-gradient(
                circle at top,
                rgba(200, 162, 106, 0.2),
                transparent 62%
              ),
              rgba(0, 0, 0, 0.22);
          }

          .crmStockCircle strong {
            display: block;
            color: #d8ad68;
            font-size: 22px;
            line-height: 1;
            font-weight: 950;
          }

          .crmStockCircle span {
            display: block;
            margin-top: 4px;
            color: rgba(244, 241, 235, 0.62);
            font-size: 10px;
            line-height: 1.2;
            font-weight: 800;
          }

          .crmStockFacts {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .crmStockFacts span {
            min-height: 42px;
            border-radius: 10px;
            padding: 9px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
            color: rgba(244, 241, 235, 0.62);
            font-size: 10px;
            line-height: 1.25;
          }

          .crmStockFacts b {
            display: block;
            color: #d8ad68;
            font-size: 14px;
            line-height: 1.05;
            margin-bottom: 3px;
          }

          .crmCriticalProducts {
            margin-top: 10px;
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 7px;
          }

          .crmCriticalProducts > span,
          .crmCriticalProduct {
            min-height: 40px;
            border-radius: 10px;
            padding: 8px 9px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
            color: inherit;
            text-decoration: none;
            overflow: hidden;
          }

          .crmCriticalProducts > span {
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            color: rgba(244, 241, 235, 0.62);
            font-size: 11px;
          }

          .crmCriticalProduct strong {
            display: block;
            color: #f4f1eb;
            font-size: 10.5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmCriticalProduct small {
            display: block;
            margin-top: 4px;
            color: #d8ad68;
            font-size: 9.5px;
            font-weight: 850;
          }

          .crmChartsGrid {
            margin-top: 10px;
            display: grid;
            grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.65fr);
            gap: 10px;
          }

          .crmChartPanel {
            padding: 12px;
            border-radius: 16px;
            overflow: hidden;
            position: relative;
          }

          .crmRevenueChartPanel::before {
            content: "";
            position: absolute;
            inset: -120px -120px auto auto;
            width: 260px;
            height: 260px;
            border-radius: 999px;
            background: radial-gradient(
              circle,
              rgba(200, 162, 106, 0.16),
              transparent 66%
            );
            pointer-events: none;
          }

          .crmChartSummary {
            margin-top: 10px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            position: relative;
            z-index: 1;
          }

          .crmChartSummary span,
          .crmChartInsightBox {
            min-width: 0;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.075);
            background: rgba(0, 0, 0, 0.2);
            padding: 9px 10px;
          }

          .crmChartSummary small,
          .crmChartInsightBox span,
          .crmChartInsightBox small {
            display: block;
            color: rgba(244, 241, 235, 0.62);
            font-size: 10px;
            line-height: 1.2;
          }

          .crmChartSummary b {
            display: block;
            margin-top: 4px;
            color: #d8ad68;
            font-size: 14px;
            line-height: 1.08;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmBarChart {
            height: 214px;
            margin-top: 14px;
            padding: 14px 8px 6px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.07);
            background:
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.03),
                rgba(255, 255, 255, 0.01)
              ),
              repeating-linear-gradient(
                to top,
                rgba(255, 255, 255, 0.055) 0 1px,
                transparent 1px 44px
              );
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 10px;
            align-items: end;
            position: relative;
            z-index: 1;
          }

          .crmChartDay {
            height: 100%;
            min-width: 0;
            display: grid;
            grid-template-rows: 1fr auto auto;
            gap: 5px;
            text-align: center;
          }

          .crmChartBars {
            height: 150px;
            min-width: 0;
            display: flex;
            align-items: end;
            justify-content: center;
            gap: 4px;
          }

          .crmChartBars strong,
          .crmChartBars span {
            display: block;
            width: 18px;
            min-height: 6px;
            border-radius: 999px 999px 5px 5px;
            transition:
              height 0.22s ease,
              transform 0.16s ease;
          }

          .crmChartBars strong {
            background: linear-gradient(
              180deg,
              rgba(255, 221, 156, 0.96),
              rgba(200, 162, 106, 0.44)
            );
            box-shadow: 0 10px 24px rgba(200, 162, 106, 0.12);
          }

          .crmChartBars .crmOrdersBar {
            width: 8px;
            background: linear-gradient(
              180deg,
              rgba(115, 171, 255, 0.95),
              rgba(115, 171, 255, 0.25)
            );
          }

          .crmChartDay:hover .crmChartBars strong,
          .crmChartDay:hover .crmChartBars span {
            transform: translateY(-2px);
          }

          .crmChartDay small {
            color: rgba(244, 241, 235, 0.58);
            font-size: 10px;
            font-weight: 850;
          }

          .crmChartDay b {
            min-height: 14px;
            color: rgba(244, 241, 235, 0.86);
            font-size: 10px;
            line-height: 1.05;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmChartLegend {
            margin-top: 9px;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            color: rgba(244, 241, 235, 0.62);
            font-size: 11px;
            font-weight: 800;
          }

          .crmChartLegend span {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }

          .crmChartLegend i {
            width: 9px;
            height: 9px;
            border-radius: 999px;
            display: inline-block;
          }

          .crmChartLegend i.gold {
            background: #d8ad68;
          }
          .crmChartLegend i.soft {
            background: #73abff;
          }

          .crmStatusBars {
            margin-top: 12px;
            display: grid;
            gap: 10px;
          }

          .crmStatusBarRow {
            display: grid;
            gap: 6px;
          }

          .crmStatusBarRow > div {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: rgba(244, 241, 235, 0.68);
            font-weight: 900;
          }

          .crmStatusBarRow b {
            color: #f4f1eb;
            font-size: 12px;
          }

          .crmStatusBarRow > strong {
            height: 10px;
            border-radius: 999px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.07);
            background: rgba(255, 255, 255, 0.045);
          }

          .crmStatusBarRow i {
            display: block;
            height: 100%;
            min-width: 6px;
            border-radius: 999px;
          }

          .crmStatusBarRow i.warn {
            background: linear-gradient(
              90deg,
              #d8ad68,
              rgba(216, 173, 104, 0.35)
            );
          }
          .crmStatusBarRow i.success {
            background: linear-gradient(
              90deg,
              #5bff92,
              rgba(91, 255, 146, 0.25)
            );
          }
          .crmStatusBarRow i.info {
            background: linear-gradient(
              90deg,
              #73abff,
              rgba(115, 171, 255, 0.25)
            );
          }
          .crmStatusBarRow i.gold {
            background: linear-gradient(
              90deg,
              #ffdd9c,
              rgba(255, 221, 156, 0.25)
            );
          }
          .crmStatusBarRow i.danger {
            background: linear-gradient(
              90deg,
              #ff8a65,
              rgba(255, 138, 101, 0.22)
            );
          }

          .crmChartInsightBox {
            margin-top: 13px;
          }

          .crmChartInsightBox strong {
            display: block;
            margin-top: 5px;
            color: #f4f1eb;
            font-size: 13px;
            line-height: 1.25;
          }

          .crmChartInsightBox small {
            margin-top: 6px;
            line-height: 1.32;
          }

          .crmAiPanel {
            margin-top: 10px;
            border-radius: 16px;
            padding: 14px;
            border: 1px solid rgba(200, 162, 106, 0.24);
            background:
              radial-gradient(
                circle at top left,
                rgba(200, 162, 106, 0.16),
                transparent 34%
              ),
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.052),
                rgba(255, 255, 255, 0.014)
              );
            box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
            overflow: hidden;
          }

          .crmAiHeader {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
          }

          .crmAiHeader h2 {
            margin: 5px 0 5px;
            font-size: 18px;
            line-height: 1.08;
            letter-spacing: -0.02em;
          }

          .crmAiHeader p {
            max-width: 720px;
            font-size: 12px;
          }

          .crmAiScoreBox {
            min-width: 150px;
            border-radius: 14px;
            padding: 10px 12px;
            text-align: right;
            border: 1px solid rgba(91, 255, 146, 0.22);
            background: rgba(91, 255, 146, 0.075);
          }

          .crmAiScoreBox span,
          .crmAiScoreBox small {
            display: block;
            color: rgba(244, 241, 235, 0.62);
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 950;
          }

          .crmAiScoreBox strong {
            display: block;
            margin: 4px 0;
            color: #9dffbd;
            font-size: 28px;
            line-height: 1;
            font-weight: 1000;
          }

          .crmAiScoreBox small {
            color: rgba(157, 255, 189, 0.84);
            letter-spacing: 0;
            text-transform: none;
          }

          .crmAiGrid {
            display: grid;
            grid-template-columns: minmax(300px, 0.78fr) minmax(0, 1.22fr);
            gap: 10px;
          }

          .crmAiMainCard,
          .crmAiActionItem {
            border-radius: 13px;
            border: 1px solid rgba(255, 255, 255, 0.085);
            background: rgba(0, 0, 0, 0.2);
          }

          .crmAiMainCard {
            padding: 13px;
          }

          .crmAiBadge {
            width: fit-content;
            display: inline-flex;
            align-items: center;
            min-height: 24px;
            padding: 0 9px;
            border-radius: 999px;
            color: #d8ad68;
            border: 1px solid rgba(200, 162, 106, 0.25);
            background: rgba(200, 162, 106, 0.08);
            font-size: 10px;
            font-weight: 950;
          }

          .crmAiMainCard h3 {
            margin: 11px 0 6px;
            color: #f4f1eb;
            font-size: 20px;
            line-height: 1.05;
            letter-spacing: -0.03em;
          }

          .crmAiMainCard p {
            font-size: 12px;
            line-height: 1.36;
          }

          .crmAiNumbers {
            margin-top: 12px;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px;
          }

          .crmAiNumbers span {
            min-height: 42px;
            border-radius: 10px;
            padding: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.035);
            color: rgba(244, 241, 235, 0.62);
            font-size: 10px;
            line-height: 1.2;
            overflow: hidden;
          }

          .crmAiNumbers b {
            display: block;
            color: #d8ad68;
            font-size: 13px;
            line-height: 1.05;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .crmAiActions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .crmAiActionItem {
            min-height: 78px;
            display: grid;
            grid-template-columns: 34px 1fr auto;
            align-items: center;
            gap: 8px;
            padding: 10px;
            color: inherit;
            text-decoration: none;
            transition:
              transform 0.16s ease,
              border-color 0.16s ease,
              background 0.16s ease;
          }

          .crmAiActionItem:hover {
            transform: translateY(-1px);
            border-color: rgba(200, 162, 106, 0.34);
            background: rgba(0, 0, 0, 0.26);
          }

          .crmAiActionIcon {
            width: 31px;
            height: 31px;
            display: grid;
            place-items: center;
            border-radius: 11px;
            border: 1px solid rgba(200, 162, 106, 0.22);
            background: rgba(200, 162, 106, 0.08);
            font-size: 13px;
          }

          .crmAiActionIcon.critico,
          .crmAiActionIcon.alerta {
            border-color: rgba(255, 180, 80, 0.28);
            background: rgba(255, 180, 80, 0.08);
          }

          .crmAiActionIcon.sucesso {
            border-color: rgba(91, 255, 146, 0.24);
            background: rgba(91, 255, 146, 0.08);
          }

          .crmAiActionItem strong {
            display: block;
            color: #f4f1eb;
            font-size: 12px;
            line-height: 1.2;
          }

          .crmAiActionItem small {
            display: block;
            margin-top: 4px;
            color: rgba(244, 241, 235, 0.58);
            font-size: 10px;
            line-height: 1.28;
          }

          .crmAiActionItem > b {
            color: #d8ad68;
            font-size: 10px;
            white-space: nowrap;
          }

          @media (max-width: 1320px) {
            .crmDashMetricsOneRow {
              grid-template-columns: repeat(4, minmax(0, 1fr));
            }

            .crmExecutiveGrid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .crmQuickGrid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 1080px) {
            .crmMainGrid,
            .crmBottomGrid,
            .crmBusinessGrid,
            .crmAiGrid,
            .crmChartsGrid,
            .crmPremiumGrid {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 760px) {
            .crmDashPage {
              padding: 14px;
            }

            .crmTopBar {
              flex-direction: column;
              padding: 14px;
            }

            .crmTopBrand h1 {
              font-size: 23px;
            }

            .crmDashMetricsOneRow,
            .crmAutomationGrid,
            .crmQuickGrid,
            .crmExecutiveGrid,
            .crmStockFacts,
            .crmCriticalProducts,
            .crmAiActions,
            .crmAiNumbers,
            .crmChartSummary {
              grid-template-columns: 1fr;
            }

            .crmBarChart {
              gap: 6px;
              padding-left: 6px;
              padding-right: 6px;
            }

            .crmChartBars strong {
              width: 14px;
            }

            .crmChartDay b {
              display: none;
            }

            .crmAiHeader {
              flex-direction: column;
            }

            .crmAiScoreBox {
              width: 100%;
              text-align: left;
            }

            .crmStockHealth {
              grid-template-columns: 1fr;
            }

            .crmStockCircle {
              width: 100%;
              height: auto;
              min-height: 92px;
              border-radius: 14px;
            }

            .crmDashAlert {
              align-items: flex-start;
              flex-direction: column;
            }
          }

          .crmTrueAiPanel {
            margin-top: 16px;
            padding: 16px;
            border-radius: 24px;
            border: 1px solid rgba(88, 214, 141, 0.24);
            background:
              radial-gradient(
                circle at top left,
                rgba(88, 214, 141, 0.12),
                transparent 30%
              ),
              radial-gradient(
                circle at bottom right,
                rgba(200, 162, 106, 0.11),
                transparent 32%
              ),
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.045),
                rgba(255, 255, 255, 0.014)
              );
            box-shadow: 0 20px 54px rgba(0, 0, 0, 0.22);
          }
          .crmTrueAiHeader {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            align-items: flex-start;
            flex-wrap: wrap;
            margin-bottom: 14px;
          }
          .crmTrueAiHeader h2 {
            margin: 4px 0 0;
            font-size: 22px;
            line-height: 1.1;
          }
          .crmTrueAiHeader p {
            margin: 7px 0 0;
            opacity: 0.75;
            line-height: 1.45;
            max-width: 740px;
          }
          .crmTrueAiPriority {
            min-width: 230px;
            border-radius: 18px;
            border: 1px solid rgba(88, 214, 141, 0.28);
            background: rgba(88, 214, 141, 0.08);
            padding: 12px;
            display: grid;
            gap: 5px;
          }
          .crmTrueAiPriority span,
          .crmTrueAiMiniGrid small {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            opacity: 0.72;
            font-weight: 950;
          }
          .crmTrueAiPriority strong {
            color: #9ff0bc;
            font-size: 18px;
            line-height: 1.1;
          }
          .crmTrueAiPriority small {
            opacity: 0.78;
            font-size: 12px;
            font-weight: 800;
          }
          .crmTrueAiGrid {
            display: grid;
            grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.35fr);
            gap: 14px;
          }
          .crmTrueAiMain,
          .crmTrueAiActions {
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
            padding: 14px;
          }
          .crmTrueAiBadge {
            display: inline-flex;
            width: fit-content;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid rgba(200, 162, 106, 0.28);
            background: rgba(200, 162, 106, 0.09);
            color: #f5d49a;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.09em;
            font-weight: 950;
          }
          .crmTrueAiMain h3 {
            margin: 12px 0 0;
            font-size: 21px;
          }
          .crmTrueAiMain p {
            margin: 8px 0 0;
            opacity: 0.72;
            line-height: 1.5;
          }
          .crmTrueAiMiniGrid {
            margin-top: 14px;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }
          .crmTrueAiMiniGrid span {
            min-width: 0;
            padding: 10px;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.025);
            display: grid;
            gap: 5px;
          }
          .crmTrueAiMiniGrid b {
            color: #fff;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .crmPriceSuggestion {
            margin-top: 12px;
            padding: 12px;
            border-radius: 16px;
            border: 1px solid rgba(200, 162, 106, 0.24);
            background: rgba(200, 162, 106, 0.08);
            display: grid;
            gap: 6px;
          }
          .crmPriceSuggestion b {
            color: #f5d49a;
          }
          .crmPriceSuggestion span {
            opacity: 0.78;
            line-height: 1.45;
          }
          .crmTrueAiActions {
            display: grid;
            gap: 9px;
          }
          .crmTrueAiAction {
            display: grid;
            grid-template-columns: 42px minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            padding: 11px;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.025);
            color: #f2f2f2;
            text-decoration: none;
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              background 0.18s ease;
          }
          .crmTrueAiAction:hover {
            transform: translateY(-2px);
            border-color: rgba(200, 162, 106, 0.32);
            background: rgba(200, 162, 106, 0.055);
          }
          .crmTrueAiAction > span {
            width: 42px;
            height: 42px;
            border-radius: 15px;
            display: grid;
            place-items: center;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
          .crmTrueAiAction.critico > span {
            background: rgba(255, 120, 120, 0.1);
            border-color: rgba(255, 120, 120, 0.24);
          }
          .crmTrueAiAction.alerta > span {
            background: rgba(255, 201, 98, 0.1);
            border-color: rgba(255, 201, 98, 0.24);
          }
          .crmTrueAiAction.sucesso > span {
            background: rgba(88, 214, 141, 0.1);
            border-color: rgba(88, 214, 141, 0.24);
          }
          .crmTrueAiAction strong {
            display: block;
            font-size: 14px;
          }
          .crmTrueAiAction small {
            display: block;
            margin-top: 4px;
            opacity: 0.7;
            line-height: 1.35;
          }
          .crmTrueAiAction em {
            display: inline-flex;
            margin-top: 7px;
            font-style: normal;
            color: #d7b77f;
            font-size: 11px;
            font-weight: 950;
          }
          .crmTrueAiAction > b {
            color: #f5d49a;
            white-space: nowrap;
            font-size: 12px;
          }
          @media (max-width: 980px) {
            .crmTrueAiGrid {
              grid-template-columns: 1fr;
            }
            .crmTrueAiMiniGrid {
              grid-template-columns: 1fr;
            }
            .crmTrueAiAction {
              grid-template-columns: 38px minmax(0, 1fr);
            }
            .crmTrueAiAction > b {
              grid-column: 2;
            }
          }
          .crmReceivablePanel {
            margin-top: 14px;
          }
          .crmReceivableSummary {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-top: 10px;
          }
          .crmReceivableSummary span {
            border-radius: 14px;
            border: 1px solid rgba(200, 162, 106, 0.18);
            background: rgba(200, 162, 106, 0.06);
            padding: 10px 12px;
            font-size: 12px;
            font-weight: 850;
            color: rgba(244, 241, 235, 0.76);
          }
          .crmReceivableSummary b {
            display: block;
            color: #fff;
            font-size: 18px;
            margin-bottom: 3px;
          }
          .crmReceivableList {
            display: grid;
            gap: 8px;
            margin-top: 10px;
          }
          .crmReceivableItem {
            display: grid;
            grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            text-decoration: none;
            color: inherit;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.16);
            padding: 10px 12px;
          }
          .crmReceivableItem.vencido {
            border-color: rgba(255, 90, 90, 0.34);
            background: rgba(255, 90, 90, 0.08);
          }
          .crmReceivableItem.hoje {
            border-color: rgba(255, 214, 102, 0.34);
            background: rgba(255, 214, 102, 0.08);
          }
          .crmReceivableItem.breve {
            border-color: rgba(255, 157, 92, 0.34);
            background: rgba(255, 157, 92, 0.08);
          }
          .crmReceivableItem strong,
          .crmReceivableItem span,
          .crmReceivableItem b {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .crmReceivableItem span {
            font-size: 12px;
            opacity: 0.76;
          }
          .crmReceivableItem b {
            color: rgba(200, 162, 106, 0.98);
          }
          .crmReceivableEmpty {
            opacity: 0.7;
            font-size: 13px;
          }
          @media (max-width: 900px) {
            .crmReceivableSummary {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .crmReceivableItem {
              grid-template-columns: 1fr;
            }
          }



          .crmSmartTodayPanel {
            margin-top: 12px;
            padding: 16px;
            border-radius: 22px;
            border: 1px solid rgba(200, 162, 106, 0.22);
            background:
              radial-gradient(circle at top left, rgba(200, 162, 106, 0.14), transparent 32%),
              radial-gradient(circle at bottom right, rgba(52, 123, 112, 0.12), transparent 34%),
              linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.014));
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
          }

          .crmSmartTodayHero {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 14px;
            flex-wrap: wrap;
            margin-bottom: 12px;
          }

          .crmSmartTodayHero h2 {
            margin: 5px 0 5px;
            font-size: 21px;
            line-height: 1.08;
            letter-spacing: -0.035em;
          }

          .crmSmartTodayHero p {
            max-width: 680px;
            font-size: 13px;
          }

          .crmSmartTodayFocus {
            min-width: 260px;
            max-width: 360px;
            padding: 12px;
            border-radius: 18px;
            border: 1px solid rgba(88, 214, 141, 0.24);
            background: rgba(88, 214, 141, 0.08);
            display: grid;
            gap: 5px;
          }

          .crmSmartTodayFocus span,
          .crmSmartTodayCard span {
            color: rgba(244, 241, 235, 0.62);
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 950;
          }

          .crmSmartTodayFocus strong {
            color: #9ff0bc;
            font-size: 17px;
            line-height: 1.15;
          }

          .crmSmartTodayFocus small,
          .crmSmartTodayCard small {
            color: rgba(244, 241, 235, 0.62);
            font-size: 11px;
            line-height: 1.3;
            font-weight: 750;
          }

          .crmSmartTodayGrid {
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            gap: 10px;
          }

          .crmSmartTodayCard {
            min-height: 112px;
            padding: 13px;
            border-radius: 17px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
            display: grid;
            gap: 7px;
            align-content: start;
            overflow: hidden;
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              background 0.18s ease,
              box-shadow 0.18s ease;
          }

          .crmSmartTodayCard:hover {
            transform: translateY(-2px);
            border-color: rgba(200, 162, 106, 0.34);
            box-shadow: 0 12px 26px rgba(0, 0, 0, 0.18);
          }

          .crmSmartTodayCard strong {
            color: #d8ad68;
            font-size: clamp(17px, 1.25vw, 22px);
            line-height: 1.08;
            font-weight: 1000;
            letter-spacing: -0.035em;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .crmSmartTodayCard.highlight {
            border-color: rgba(200, 162, 106, 0.32);
            background: linear-gradient(180deg, rgba(200, 162, 106, 0.13), rgba(0, 0, 0, 0.16));
          }

          .crmSmartTodayCard.success {
            border-color: rgba(88, 214, 141, 0.24);
            background: linear-gradient(180deg, rgba(88, 214, 141, 0.09), rgba(0, 0, 0, 0.16));
          }

          .crmSmartTodayCard.success strong {
            color: #9ff0bc;
          }

          .crmSmartTodayCard.warn {
            border-color: rgba(255, 180, 80, 0.28);
            background: linear-gradient(180deg, rgba(255, 180, 80, 0.1), rgba(0, 0, 0, 0.16));
          }

          .crmSmartTodayCard.product {
            grid-column: span 1;
          }

          .crmSmartTodayCard i {
            height: 7px;
            overflow: hidden;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.06);
          }

          .crmSmartTodayCard i b {
            display: block;
            height: 100%;
            min-width: 6px;
            border-radius: 999px;
            background: linear-gradient(90deg, #d8ad68, rgba(255, 221, 156, 0.72));
          }

          @media (max-width: 1320px) {
            .crmSmartTodayGrid {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
          }

          @media (max-width: 760px) {
            .crmSmartTodayPanel {
              padding: 14px;
              border-radius: 18px;
            }

            .crmSmartTodayFocus {
              min-width: 0;
              max-width: none;
              width: 100%;
            }

            .crmSmartTodayGrid {
              grid-template-columns: 1fr;
            }
          }

          /* =========================================================
           MAISON NOOR CRM • AJUSTE 10/10 DEFINITIVO
           Mantém a estrutura atual, melhora alinhamento, leitura,
           microinterações e acabamento premium sem quebrar o CRM.
        ========================================================= */

          .crmDashPage {
            padding: 18px 18px 22px !important;
            background:
              radial-gradient(
                circle at 18% 4%,
                rgba(200, 162, 106, 0.1),
                transparent 28%
              ),
              radial-gradient(
                circle at 92% 18%,
                rgba(52, 123, 112, 0.1),
                transparent 30%
              );
          }

          .crmDashShell {
            width: 100% !important;
            max-width: 1600px !important;
            margin: 0 auto !important;
          }

          .crmTopBar,
          .crmDashPanel,
          .crmDashMetric,
          .crmDashAlert,
          .crmAiPanel,
          .crmTrueAiPanel {
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
          }

          .crmTopBar {
            border-radius: 20px !important;
            padding: 18px 20px !important;
            background:
              radial-gradient(
                circle at top right,
                rgba(200, 162, 106, 0.11),
                transparent 42%
              ),
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.055),
                rgba(255, 255, 255, 0.016)
              ) !important;
          }

          .crmTopBrand h1 {
            font-size: clamp(24px, 2vw, 31px) !important;
            letter-spacing: -0.045em !important;
          }

          .crmTopBrand p {
            max-width: 760px;
            font-size: 14px;
          }

          .crmHeroButtons {
            margin: 10px 0 0 !important;
          }

          .crmDashLinkPrimary,
          .crmDashLinkSoft,
          .crmDashSmallLink,
          .crmAutoTag {
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              background 0.18s ease,
              box-shadow 0.18s ease;
          }

          .crmDashLinkPrimary:hover,
          .crmDashLinkSoft:hover,
          .crmDashSmallLink:hover,
          .crmAutoTag:hover {
            transform: translateY(-1px);
            border-color: rgba(216, 173, 104, 0.48);
            box-shadow: 0 10px 22px rgba(200, 162, 106, 0.08);
          }

          .crmDashMetricsOneRow {
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            gap: 10px !important;
            margin-top: 12px !important;
          }

          .crmDashMetric {
            min-height: 106px !important;
            border-radius: 16px !important;
            padding: 14px !important;
            transform: translateZ(0);
            transition:
              transform 0.2s ease,
              border-color 0.2s ease,
              background 0.2s ease,
              box-shadow 0.2s ease !important;
          }

          .crmDashMetric::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(
              135deg,
              rgba(255, 255, 255, 0.08),
              transparent 46%
            );
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
          }

          .crmDashMetric:hover {
            transform: translateY(-3px) scale(1.012) !important;
            border-color: rgba(200, 162, 106, 0.48) !important;
            box-shadow:
              0 18px 38px rgba(0, 0, 0, 0.3),
              0 0 0 1px rgba(200, 162, 106, 0.04) !important;
          }

          .crmDashMetric:hover::after {
            opacity: 1;
          }

          .crmDashMetricIcon {
            width: 34px !important;
            height: 34px !important;
            border-radius: 12px !important;
            margin-bottom: 10px !important;
            font-size: 14px !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
          }

          .crmDashMetricLabel {
            font-size: 10px !important;
            letter-spacing: 0.1em !important;
          }

          .crmDashMetricValue {
            margin-top: 7px !important;
            font-size: clamp(17px, 1.25vw, 21px) !important;
          }

          .crmDashMetricHint {
            margin-top: 7px !important;
            font-size: 10px !important;
          }

          .crmBusinessGrid,
          .crmChartsGrid,
          .crmPremiumGrid,
          .crmMainGrid,
          .crmBottomGrid {
            gap: 14px !important;
            margin-top: 14px !important;
          }

          .crmDashPanel {
            border-radius: 18px !important;
            padding: 16px !important;
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              box-shadow 0.18s ease;
          }

          .crmDashPanel:hover {
            border-color: rgba(200, 162, 106, 0.28);
            box-shadow: 0 18px 44px rgba(0, 0, 0, 0.26);
          }

          .crmDashPanelHead.compact h2,
          .crmDashPage h2 {
            font-size: 18px !important;
            letter-spacing: -0.03em !important;
          }

          .crmExecutiveGrid {
            gap: 10px !important;
          }

          .crmExecutiveCard,
          .crmDreGrid span,
          .crmRankingItem,
          .crmAiMainCard,
          .crmAiActionItem,
          .crmTrueAiMain,
          .crmTrueAiActions,
          .crmTrueAiAction,
          .crmQuickAction,
          .crmInsightItem,
          .crmReceivableItem,
          .crmStockFacts span,
          .crmCriticalProduct,
          .crmChartSummary span,
          .crmChartInsightBox {
            transition:
              transform 0.18s ease,
              border-color 0.18s ease,
              background 0.18s ease,
              box-shadow 0.18s ease;
          }

          .crmExecutiveCard:hover,
          .crmDreGrid span:hover,
          .crmRankingItem:hover,
          .crmAiMainCard:hover,
          .crmAiActionItem:hover,
          .crmTrueAiAction:hover,
          .crmQuickAction:hover,
          .crmInsightItem:hover,
          .crmReceivableItem:hover,
          .crmStockFacts span:hover,
          .crmCriticalProduct:hover,
          .crmChartSummary span:hover,
          .crmChartInsightBox:hover {
            transform: translateY(-2px);
            border-color: rgba(200, 162, 106, 0.34) !important;
            box-shadow: 0 12px 26px rgba(0, 0, 0, 0.18);
          }

          .crmExecutiveCard {
            border-radius: 16px !important;
            padding: 14px !important;
          }

          .crmExecutiveCard strong,
          .crmDreGrid b,
          .crmChartSummary b,
          .crmStockFacts b {
            letter-spacing: -0.02em;
          }

          .crmStockCircle {
            box-shadow:
              inset 0 0 28px rgba(200, 162, 106, 0.08),
              0 16px 34px rgba(0, 0, 0, 0.18);
          }

          .crmCriticalProducts {
            grid-template-columns: repeat(
              auto-fit,
              minmax(112px, 1fr)
            ) !important;
          }

          .crmAiPanel {
            border-radius: 22px !important;
            padding: 18px !important;
          }

          .crmAiGrid {
            gap: 14px !important;
          }

          .crmAiActionItem {
            min-height: 96px !important;
            border-radius: 16px !important;
          }

          .crmBarChart {
            height: 250px !important;
            border-radius: 18px !important;
            padding: 18px 12px 8px !important;
          }

          .crmChartBars {
            height: 176px !important;
          }

          .crmChartBars strong {
            width: 22px !important;
          }

          .crmChartBars .crmOrdersBar {
            width: 9px !important;
          }

          .crmStatusBarRow > strong {
            height: 12px !important;
          }

          .crmPremiumGrid {
            grid-template-columns: minmax(280px, 0.95fr) minmax(
                280px,
                1fr
              ) minmax(280px, 1fr) !important;
          }

          .crmRankingList {
            gap: 10px !important;
          }

          .crmRankingItem {
            border-radius: 17px !important;
            padding: 12px !important;
          }

          .crmTrueAiPanel {
            border-radius: 26px !important;
            padding: 20px !important;
          }

          .crmTrueAiGrid {
            gap: 16px !important;
          }

          .crmTrueAiMain,
          .crmTrueAiActions {
            border-radius: 22px !important;
            padding: 18px !important;
          }

          .crmTrueAiAction {
            border-radius: 20px !important;
            padding: 14px !important;
          }

          .crmDashWarning {
            border-radius: 16px !important;
            padding: 13px 16px !important;
            background:
              linear-gradient(
                90deg,
                rgba(255, 180, 80, 0.14),
                rgba(255, 180, 80, 0.055)
              ),
              rgba(0, 0, 0, 0.12) !important;
          }

          .crmTableWrap {
            overflow-x: hidden !important;
            border-radius: 16px !important;
            background: rgba(0, 0, 0, 0.22) !important;
          }

          .crmTable {
            min-width: 0 !important;
            width: 100% !important;
            table-layout: fixed !important;
          }

          .crmTable th,
          .crmTable td {
            padding: 10px 12px !important;
            vertical-align: middle;
          }

          .crmTable th:nth-child(1),
          .crmTable td:nth-child(1) {
            width: 126px;
          }

          .crmTable th:nth-child(2),
          .crmTable td:nth-child(2) {
            width: 30%;
          }

          .crmTable th:nth-child(3),
          .crmTable td:nth-child(3) {
            width: 140px;
          }

          .crmTable th:nth-child(4),
          .crmTable td:nth-child(4) {
            width: 112px;
          }

          .crmTable th:nth-child(5),
          .crmTable td:nth-child(5) {
            width: 150px;
          }

          .crmTable td,
          .crmTable td strong,
          .crmTable td small {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .crmTableActions {
            justify-content: flex-start;
            flex-wrap: nowrap !important;
            gap: 7px !important;
          }

          .crmIconBtn {
            flex: 0 0 auto;
            width: 30px !important;
            height: 30px !important;
            border-radius: 10px !important;
            transition:
              transform 0.16s ease,
              border-color 0.16s ease,
              background 0.16s ease;
          }

          .crmIconBtn:hover {
            transform: translateY(-1px) scale(1.04);
          }

          .crmInsightList {
            gap: 10px !important;
          }

          .crmInsightItem {
            border-radius: 16px !important;
            min-height: 70px !important;
          }

          .crmBottomGrid {
            padding-bottom: 18px;
          }

          @media (min-width: 1500px) {
            .crmDashMetricsOneRow {
              grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            }

            .crmDashMetric {
              min-height: 112px !important;
            }
          }

          @media (max-width: 1320px) {
            .crmDashMetricsOneRow {
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            }
          }

          @media (max-width: 1180px) {
            .crmDashMetricsOneRow {
              grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            }

            .crmPremiumGrid,
            .crmBusinessGrid,
            .crmChartsGrid,
            .crmMainGrid,
            .crmBottomGrid,
            .crmAiGrid,
            .crmTrueAiGrid {
              grid-template-columns: 1fr !important;
            }

            .crmTableWrap {
              overflow-x: auto !important;
            }

            .crmTable {
              min-width: 760px !important;
            }
          }

          @media (max-width: 760px) {
            .crmDashPage {
              padding: 12px !important;
            }

            .crmDashMetricsOneRow {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .crmDashMetric {
              min-height: 104px !important;
            }

            .crmTopBar,
            .crmDashPanel,
            .crmAiPanel,
            .crmTrueAiPanel {
              border-radius: 18px !important;
            }

            .crmAiActions,
            .crmAiNumbers,
            .crmExecutiveGrid,
            .crmStockFacts,
            .crmChartSummary,
            .crmTrueAiMiniGrid,
            .crmReceivableSummary {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 520px) {
            .crmDashMetricsOneRow {
              grid-template-columns: 1fr !important;
            }

            .crmTopActions {
              width: 100%;
            }

            .crmPeriodFilter,
            .crmDashRealtime,
            .crmDateBadge,
            .crmUserBadge {
              width: 100%;
              justify-content: center;
            }

            .crmPeriodFilter {
              overflow-x: auto;
              justify-content: flex-start;
            }

            .crmPeriodFilter button {
              flex: 0 0 auto;
            }
          }
        `}
      </style>
    </main>
  );
}

function ExecutiveCard({
  label,
  value,
  hint,
  tone = "soft",
}: {
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "soft" | "gold" | "warn" | "success";
}) {
  const title =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : undefined;

  return (
    <div className={`crmExecutiveCard ${tone}`}>
      <span>{label}</span>
      <strong title={title}>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function AutomationItem({ text }: { text: string }) {
  return (
    <div className="crmAutomationItem">
      <b>✓</b>
      <span>
        {text}
        <small>Ativo</small>
      </span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  href,
  active,
  danger,
  success,
}: {
  icon: string;
  label: string;
  value: string | number;
  hint: string;
  href?: string;
  active?: boolean;
  danger?: boolean;
  success?: boolean;
}) {
  const className = `crmDashMetric ${active ? "crmDashMetricActive" : ""} ${
    danger ? "crmDashMetricDanger" : ""
  } ${success ? "crmDashMetricSuccess" : ""}`;

  const content = (
    <>
      <div className="crmDashMetricIcon">{icon}</div>
      <div>
        <span className="crmDashMetricLabel">{label}</span>
        <strong className="crmDashMetricValue">{value}</strong>
        <span className="crmDashMetricHint">{hint}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
