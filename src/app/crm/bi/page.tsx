"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/services/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type TipoLanc = "receita" | "despesa";
type StatusLanc = "pago" | "pendente";
type FormaPag =
  | "dinheiro"
  | "pix"
  | "credito"
  | "debito"
  | "boleto"
  | "transferencia"
  | "outros";

type Lancamento = {
  id: string;
  data: string;
  competencia: string;
  tipo: TipoLanc;
  descricao: string;
  categoria?: string;
  centroCusto?: string;
  forma?: FormaPag;
  valor: number;
  status: StatusLanc;
  origemPedidoId?: string;
  clienteNome?: string;
  documentoFiscalId?: string;
  origemFiscal?: string;
};

type ProdutoBI = {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  cost: number;
  stock: number;
  sold?: number;
  active?: boolean;
};

type FiltroPeriodo = "mes" | "periodo" | "ano" | "todos";

const FIRESTORE_ROOT = "financeiro";
const FIRESTORE_DOC = "default";
const SUB_LISTA = "lista";
const SUB_LANCAMENTOS = "lancamentos";

const STORAGE_KEY = "maison_noor_crm_bi_v1";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function currentYear() {
  return String(new Date().getFullYear());
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfCurrentMonthInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function formatBRL(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPercent(n: number) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function safeNumber(v: any) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function tsToISO(value: any): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (value && typeof value.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

function toCompetencia(iso: string) {
  if (!iso) return currentMonth();
  return String(iso).slice(0, 7);
}

function isoFromDateInput(dateStr: string) {
  return `${dateStr}T12:00:00.000Z`;
}

function normalizarCentroCusto(value?: string) {
  const v = String(value || "").trim();
  return v || "Sem centro de custo";
}

function formaLabel(forma?: FormaPag) {
  const map: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    credito: "Crédito",
    debito: "Débito",
    boleto: "Boleto",
    transferencia: "Transferência",
    outros: "Outros",
  };
  return map[String(forma || "outros")] || "Outros";
}

function isFiscalLike(l: Lancamento) {
  const centro = normalizarCentroCusto(l.centroCusto).toLowerCase();
  const categoria = String(l.categoria || "").toLowerCase();
  return (
    centro.includes("fiscal") ||
    centro.includes("imposto") ||
    categoria.includes("imposto") ||
    categoria.includes("tribut") ||
    Boolean(l.documentoFiscalId || l.origemFiscal)
  );
}

function isCmvLike(l: Lancamento) {
  const centro = normalizarCentroCusto(l.centroCusto).toLowerCase();
  const categoria = String(l.categoria || "").toLowerCase();
  const desc = String(l.descricao || "").toLowerCase();
  return (
    centro.includes("estoque") ||
    categoria.includes("cmv") ||
    categoria.includes("mercadoria") ||
    categoria.includes("fornecedor") ||
    desc.includes("fornecedor") ||
    desc.includes("compra") ||
    desc.includes("mercadoria")
  );
}

function getDateOnlyTime(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function readCache(): { lancamentos: Lancamento[]; produtos: ProdutoBI[] } {
  try {
    if (typeof window === "undefined") return { lancamentos: [], produtos: [] };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lancamentos: [], produtos: [] };
    const parsed = JSON.parse(raw);
    return {
      lancamentos: Array.isArray(parsed?.lancamentos) ? parsed.lancamentos : [],
      produtos: Array.isArray(parsed?.produtos) ? parsed.produtos : [],
    };
  } catch {
    return { lancamentos: [], produtos: [] };
  }
}

function writeCache(lancamentos: Lancamento[], produtos: ProdutoBI[]) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lancamentos, produtos }));
  } catch {
    // cache opcional
  }
}

function normalizeLancamento(docId: string, raw: any): Lancamento | null {
  const descricao = String(raw?.descricao || raw?.description || "").trim();
  if (!descricao) return null;

  const data = tsToISO(raw?.data || raw?.createdAt);
  const formaRaw = raw?.forma;
  const forma: FormaPag =
    formaRaw === "dinheiro" ||
    formaRaw === "pix" ||
    formaRaw === "credito" ||
    formaRaw === "debito" ||
    formaRaw === "boleto" ||
    formaRaw === "transferencia"
      ? formaRaw
      : "outros";

  return {
    id: docId,
    data,
    competencia: String(raw?.competencia || toCompetencia(data)),
    tipo: raw?.tipo === "despesa" ? "despesa" : "receita",
    descricao,
    categoria: raw?.categoria ? String(raw.categoria) : undefined,
    centroCusto: raw?.centroCusto ? String(raw.centroCusto) : undefined,
    forma,
    valor: safeNumber(raw?.valor || raw?.total || raw?.amount),
    status: raw?.status === "pendente" ? "pendente" : "pago",
    origemPedidoId: raw?.origemPedidoId ? String(raw.origemPedidoId) : undefined,
    clienteNome: raw?.clienteNome ? String(raw.clienteNome) : undefined,
    documentoFiscalId: raw?.documentoFiscalId ? String(raw.documentoFiscalId) : undefined,
    origemFiscal: raw?.origemFiscal ? String(raw.origemFiscal) : undefined,
  };
}

function normalizeProduto(docId: string, raw: any): ProdutoBI {
  const price =
    safeNumber(raw?.price) ||
    safeNumber(raw?.preco) ||
    safeNumber(raw?.valorVenda) ||
    safeNumber(raw?.salePrice);

  const cost =
    safeNumber(raw?.cost) ||
    safeNumber(raw?.custo) ||
    safeNumber(raw?.valorCusto) ||
    safeNumber(raw?.stockCost) ||
    safeNumber(raw?.custoEstoque);

  const stock =
    safeNumber(raw?.stock) ||
    safeNumber(raw?.estoque) ||
    safeNumber(raw?.quantidade) ||
    safeNumber(raw?.quantity);

  return {
    id: docId,
    name: String(raw?.name || raw?.nome || raw?.title || "Produto sem nome"),
    brand: raw?.brand ? String(raw.brand) : raw?.marca ? String(raw.marca) : undefined,
    category: raw?.category ? String(raw.category) : raw?.categoria ? String(raw.categoria) : undefined,
    price,
    cost,
    stock,
    sold: safeNumber(raw?.sold || raw?.vendidos || raw?.salesCount),
    active: raw?.active === false ? false : true,
  };
}

async function fetchFinanceiro(): Promise<Lancamento[]> {
  async function fetchSub(subcol: string) {
    try {
      const q = query(collection(db, FIRESTORE_ROOT, FIRESTORE_DOC, subcol), orderBy("data", "desc"));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => normalizeLancamento(d.id, d.data()))
        .filter(Boolean) as Lancamento[];
    } catch (e) {
      console.error(`[BI] Erro ao carregar financeiro/${subcol}`, e);
      return [];
    }
  }

  const [lista, lancamentos] = await Promise.all([fetchSub(SUB_LISTA), fetchSub(SUB_LANCAMENTOS)]);
  const map = new Map<string, Lancamento>();

  for (const l of [...lista, ...lancamentos]) {
    const key = l.origemPedidoId ? `pedido_${l.origemPedidoId}` : l.id;
    if (!map.has(key)) map.set(key, l);
  }

  return Array.from(map.values()).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
}

async function fetchProdutos(): Promise<ProdutoBI[]> {
  try {
    const snap = await getDocs(collection(db, "products"));
    return snap.docs.map((d) => normalizeProduto(d.id, d.data()));
  } catch (e) {
    console.error("[BI] Erro ao carregar produtos", e);
    return [];
  }
}

export default function BiExecutivoPage() {
  const [items, setItems] = useState<Lancamento[]>([]);
  const [produtos, setProdutos] = useState<ProdutoBI[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [periodoTipo, setPeriodoTipo] = useState<FiltroPeriodo>("mes");
  const [competenciaFilter, setCompetenciaFilter] = useState(currentMonth());
  const [anoFilter, setAnoFilter] = useState(currentYear());
  const [dataInicio, setDataInicio] = useState(startOfCurrentMonthInput());
  const [dataFim, setDataFim] = useState(todayInput());

  function showToast(msg: string, ms = 2200) {
    setToast(msg);
    if (typeof window !== "undefined") window.setTimeout(() => setToast(""), ms);
  }

  async function refresh() {
    setLoading(true);
    showToast("⏳ Atualizando BI...");
    const [financeiro, produtosLista] = await Promise.all([fetchFinanceiro(), fetchProdutos()]);
    setItems(financeiro);
    setProdutos(produtosLista);
    writeCache(financeiro, produtosLista);
    setLoading(false);
    showToast("✅ BI atualizado!");
  }

  useEffect(() => {
    const cached = readCache();
    if (cached.lancamentos.length || cached.produtos.length) {
      setItems(cached.lancamentos);
      setProdutos(cached.produtos);
      setLoading(false);
    }

    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setQuickRange(kind: "hoje" | "semana" | "mes" | "30dias" | "ano" | "todos") {
    const hoje = new Date();
    const end = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

    if (kind === "todos") {
      setPeriodoTipo("todos");
      return;
    }

    if (kind === "mes") {
      setPeriodoTipo("mes");
      setCompetenciaFilter(currentMonth());
      return;
    }

    if (kind === "ano") {
      setPeriodoTipo("ano");
      setAnoFilter(currentYear());
      return;
    }

    setPeriodoTipo("periodo");
    let startDate = new Date(hoje);

    if (kind === "hoje") {
      startDate = new Date(hoje);
    } else if (kind === "semana") {
      const day = hoje.getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate.setDate(hoje.getDate() - diff);
    } else if (kind === "30dias") {
      startDate.setDate(hoje.getDate() - 29);
    }

    setDataInicio(`${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`);
    setDataFim(end);
  }

  const filtered = useMemo(() => {
    const startMs = periodoTipo === "periodo" ? getDateOnlyTime(isoFromDateInput(dataInicio)) : 0;
    const endMs = periodoTipo === "periodo" ? getDateOnlyTime(isoFromDateInput(dataFim)) : 0;

    return items.filter((l) => {
      if (periodoTipo === "mes" && l.competencia !== competenciaFilter) return false;
      if (periodoTipo === "ano" && !String(l.competencia || "").startsWith(anoFilter)) return false;

      if (periodoTipo === "periodo") {
        const lMs = getDateOnlyTime(l.data);
        if (startMs && lMs < startMs) return false;
        if (endMs && lMs > endMs) return false;
      }

      return true;
    });
  }, [items, periodoTipo, competenciaFilter, anoFilter, dataInicio, dataFim]);

  const bi = useMemo(() => {
    const receitas = filtered.filter((l) => l.tipo === "receita");
    const despesas = filtered.filter((l) => l.tipo === "despesa");

    const receitaBruta = receitas.reduce((acc, l) => acc + l.valor, 0);
    const receitaRecebida = receitas.filter((l) => l.status === "pago").reduce((acc, l) => acc + l.valor, 0);
    const receitaPendente = receitas.filter((l) => l.status === "pendente").reduce((acc, l) => acc + l.valor, 0);

    const despesasTotais = despesas.reduce((acc, l) => acc + l.valor, 0);
    const despesasPagas = despesas.filter((l) => l.status === "pago").reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = despesas.filter((l) => l.status === "pendente").reduce((acc, l) => acc + l.valor, 0);

    const impostosLancados = despesas.filter(isFiscalLike).reduce((acc, l) => acc + l.valor, 0);
    const impostosConsiderados = impostosLancados > 0 ? impostosLancados : receitaBruta * 0.06;

    const cmv = despesas.filter(isCmvLike).reduce((acc, l) => acc + l.valor, 0);
    const despesasOperacionais = Math.max(0, despesasTotais - impostosLancados - cmv);

    const receitaLiquida = receitaBruta - impostosConsiderados;
    const lucroBruto = receitaLiquida - cmv;
    const lucroLiquido = lucroBruto - despesasOperacionais;

    const margemBruta = receitaBruta > 0 ? (lucroBruto / receitaBruta) * 100 : 0;
    const margemLiquida = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;
    const cargaTributaria = receitaBruta > 0 ? (impostosConsiderados / receitaBruta) * 100 : 0;
    const ticketMedio = receitas.length ? receitaBruta / Math.max(1, receitas.length) : 0;

    const pedidosIntegrados = receitas.filter((l) => l.origemPedidoId).length;

    const porForma = new Map<string, number>();
    for (const l of receitas.filter((x) => x.status === "pago")) {
      const forma = formaLabel(l.forma);
      porForma.set(forma, (porForma.get(forma) || 0) + l.valor);
    }

    const rankingFormas = Array.from(porForma.entries())
      .map(([forma, valor]) => ({
        forma,
        valor,
        percentual: receitaRecebida > 0 ? (valor / receitaRecebida) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const porCentro = new Map<string, { centro: string; receitas: number; despesas: number; saldo: number; qtd: number }>();
    for (const l of filtered) {
      const centro = normalizarCentroCusto(l.centroCusto);
      const row = porCentro.get(centro) || { centro, receitas: 0, despesas: 0, saldo: 0, qtd: 0 };
      if (l.tipo === "receita") row.receitas += l.valor;
      else row.despesas += l.valor;
      row.saldo = row.receitas - row.despesas;
      row.qtd += 1;
      porCentro.set(centro, row);
    }

    const centros = Array.from(porCentro.values()).sort((a, b) => b.despesas - a.despesas);

    const porCategoria = new Map<string, { categoria: string; receitas: number; despesas: number; saldo: number }>();
    for (const l of filtered) {
      const categoria = String(l.categoria || "Sem categoria");
      const row = porCategoria.get(categoria) || { categoria, receitas: 0, despesas: 0, saldo: 0 };
      if (l.tipo === "receita") row.receitas += l.valor;
      else row.despesas += l.valor;
      row.saldo = row.receitas - row.despesas;
      porCategoria.set(categoria, row);
    }

    const categorias = Array.from(porCategoria.values()).sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo)).slice(0, 8);

    const porMes = new Map<string, { competencia: string; receita: number; despesas: number; impostos: number; cmv: number; lucro: number }>();
    for (const l of items) {
      const comp = l.competencia || toCompetencia(l.data);
      const row = porMes.get(comp) || { competencia: comp, receita: 0, despesas: 0, impostos: 0, cmv: 0, lucro: 0 };
      if (l.tipo === "receita") row.receita += l.valor;
      else {
        row.despesas += l.valor;
        if (isFiscalLike(l)) row.impostos += l.valor;
        if (isCmvLike(l)) row.cmv += l.valor;
      }
      row.lucro = row.receita - row.despesas;
      porMes.set(comp, row);
    }

    const evolucaoMensal = Array.from(porMes.values())
      .sort((a, b) => a.competencia.localeCompare(b.competencia))
      .slice(-12);

    const atual = evolucaoMensal[evolucaoMensal.length - 1];
    const anterior = evolucaoMensal[evolucaoMensal.length - 2];
    const crescimentoReceita =
      atual && anterior && anterior.receita > 0 ? ((atual.receita - anterior.receita) / anterior.receita) * 100 : 0;

    const hoje = new Date();
    const limite7 = new Date();
    limite7.setDate(hoje.getDate() + 7);
    const limite30 = new Date();
    limite30.setDate(hoje.getDate() + 30);

    let receber7 = 0;
    let pagar7 = 0;
    let receber30 = 0;
    let pagar30 = 0;
    let vencido = 0;

    for (const l of items.filter((x) => x.status === "pendente")) {
      const d = new Date(l.data);
      if (Number.isNaN(d.getTime())) continue;

      if (d.getTime() < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) {
        vencido += l.valor;
      }

      if (d <= limite7) {
        if (l.tipo === "receita") receber7 += l.valor;
        else pagar7 += l.valor;
      }

      if (d <= limite30) {
        if (l.tipo === "receita") receber30 += l.valor;
        else pagar30 += l.valor;
      }
    }

    const fluxo7 = receber7 - pagar7;
    const fluxo30 = receber30 - pagar30;

    return {
      receitaBruta,
      receitaRecebida,
      receitaPendente,
      despesasTotais,
      despesasPagas,
      despesasPendentes,
      impostosConsiderados,
      impostosLancados,
      cmv,
      despesasOperacionais,
      receitaLiquida,
      lucroBruto,
      lucroLiquido,
      margemBruta,
      margemLiquida,
      cargaTributaria,
      ticketMedio,
      pedidosIntegrados,
      rankingFormas,
      centros,
      categorias,
      evolucaoMensal,
      crescimentoReceita,
      receber7,
      pagar7,
      receber30,
      pagar30,
      fluxo7,
      fluxo30,
      vencido,
      usandoEstimativaImposto: impostosLancados <= 0 && receitaBruta > 0,
    };
  }, [filtered, items]);

  const produtosBI = useMemo(() => {
    const ativos = produtos.filter((p) => p.active !== false);
    const enriquecidos = ativos.map((p) => {
      const sold = safeNumber(p.sold);
      const lucroUnit = p.price - p.cost;
      const margem = p.price > 0 ? (lucroUnit / p.price) * 100 : 0;
      const faturamentoVendido = p.price * sold;
      const lucroVendido = lucroUnit * sold;
      const valorEstoqueVenda = p.price * p.stock;
      const valorEstoqueCusto = p.cost * p.stock;
      return {
        ...p,
        sold,
        lucroUnit,
        margem,
        faturamentoVendido,
        lucroVendido,
        valorEstoqueVenda,
        valorEstoqueCusto,
      };
    });

    const estoqueTotal = enriquecidos.reduce((acc, p) => acc + p.stock, 0);
    const valorEstoqueVenda = enriquecidos.reduce((acc, p) => acc + p.valorEstoqueVenda, 0);
    const valorEstoqueCusto = enriquecidos.reduce((acc, p) => acc + p.valorEstoqueCusto, 0);
    const margemEstoque = valorEstoqueVenda > 0 ? ((valorEstoqueVenda - valorEstoqueCusto) / valorEstoqueVenda) * 100 : 0;

    const faturamentoProdutos = enriquecidos.reduce((acc, p) => acc + p.faturamentoVendido, 0);
    const lucroProdutos = enriquecidos.reduce((acc, p) => acc + p.lucroVendido, 0);
    const margemRealProdutos = faturamentoProdutos > 0 ? (lucroProdutos / faturamentoProdutos) * 100 : 0;

    let acumulado = 0;
    const curvaABC = enriquecidos
      .filter((p) => p.faturamentoVendido > 0 || p.valorEstoqueVenda > 0)
      .sort((a, b) => (b.faturamentoVendido || b.valorEstoqueVenda) - (a.faturamentoVendido || a.valorEstoqueVenda))
      .map((p) => {
        const base = faturamentoProdutos > 0 ? p.faturamentoVendido : p.valorEstoqueVenda;
        const totalBase = faturamentoProdutos > 0 ? faturamentoProdutos : valorEstoqueVenda;
        const percentual = totalBase > 0 ? (base / totalBase) * 100 : 0;
        acumulado += percentual;
        const classe = acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C";
        return { ...p, baseABC: base, percentualABC: percentual, acumuladoABC: acumulado, classeABC: classe };
      })
      .slice(0, 12);

    const rankingMargem = [...enriquecidos]
      .filter((p) => p.price > 0 && p.cost > 0)
      .sort((a, b) => b.lucroUnit - a.lucroUnit)
      .slice(0, 8);

    const maisVendidos = [...enriquecidos]
      .filter((p) => p.sold > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 8);

    const menorMargem = [...enriquecidos]
      .filter((p) => p.price > 0 && p.cost > 0)
      .sort((a, b) => a.margem - b.margem)
      .slice(0, 8);

    const parados = [...enriquecidos]
      .filter((p) => p.stock > 0 && p.sold <= 0)
      .sort((a, b) => b.valorEstoqueCusto - a.valorEstoqueCusto)
      .slice(0, 8);

    const porCategoria = new Map<string, { categoria: string; qtd: number; estoque: number; venda: number; custo: number; margem: number }>();
    for (const p of enriquecidos) {
      const categoria = String(p.category || "Sem categoria");
      const row = porCategoria.get(categoria) || { categoria, qtd: 0, estoque: 0, venda: 0, custo: 0, margem: 0 };
      row.qtd += 1;
      row.estoque += p.stock;
      row.venda += p.valorEstoqueVenda;
      row.custo += p.valorEstoqueCusto;
      row.margem = row.venda > 0 ? ((row.venda - row.custo) / row.venda) * 100 : 0;
      porCategoria.set(categoria, row);
    }

    const categorias = Array.from(porCategoria.values())
      .sort((a, b) => b.venda - a.venda)
      .slice(0, 8);

    return {
      ativos: ativos.length,
      estoqueTotal,
      valorEstoqueVenda,
      valorEstoqueCusto,
      margemEstoque,
      faturamentoProdutos,
      lucroProdutos,
      margemRealProdutos,
      curvaABC,
      rankingMargem,
      maisVendidos,
      menorMargem,
      parados,
      categorias,
    };
  }, [produtos]);

  const alertasExecutivos = useMemo(() => {
    const out: Array<{ tipo: "critico" | "alerta" | "sucesso" | "info"; titulo: string; descricao: string }> = [];

    if (bi.margemLiquida < 20 && bi.receitaBruta > 0) {
      out.push({
        tipo: "critico",
        titulo: "Margem líquida baixa",
        descricao: `A margem líquida está em ${formatPercent(bi.margemLiquida)}. Revise CMV, descontos, taxas e despesas operacionais.`,
      });
    }

    if (bi.cargaTributaria >= 12 && bi.receitaBruta > 0) {
      out.push({
        tipo: "alerta",
        titulo: "Carga tributária elevada",
        descricao: `A carga tributária estimada/lançada está em ${formatPercent(bi.cargaTributaria)} do faturamento.`,
      });
    }

    if (bi.fluxo7 < 0 || bi.fluxo30 < 0) {
      out.push({
        tipo: "critico",
        titulo: "Risco de caixa futuro",
        descricao: `A previsão de 7 dias é ${formatBRL(bi.fluxo7)} e a de 30 dias é ${formatBRL(bi.fluxo30)}.`,
      });
    }

    if (bi.vencido > 0) {
      out.push({
        tipo: "alerta",
        titulo: "Pendências vencidas",
        descricao: `Existem ${formatBRL(bi.vencido)} em lançamentos pendentes vencidos.`,
      });
    }

    if (produtosBI.valorEstoqueCusto > bi.receitaBruta && produtosBI.valorEstoqueCusto > 0) {
      out.push({
        tipo: "info",
        titulo: "Estoque alto em relação ao faturamento",
        descricao: `O custo estimado em estoque é ${formatBRL(produtosBI.valorEstoqueCusto)}, acima da receita do filtro.`,
      });
    }

    const produtoMargemBaixa = produtosBI.menorMargem.find((p) => p.margem < 30);
    if (produtoMargemBaixa) {
      out.push({
        tipo: "alerta",
        titulo: "Produto com margem baixa",
        descricao: `${produtoMargemBaixa.name} está com margem de ${formatPercent(produtoMargemBaixa.margem)}. Revise custo e preço de venda.`,
      });
    }

    if (produtosBI.parados.length >= 5) {
      out.push({
        tipo: "info",
        titulo: "Produtos parados no estoque",
        descricao: `${produtosBI.parados.length} produto(s) aparecem com estoque e sem venda registrada. Considere campanha ou kit promocional.`,
      });
    }

    const centroMaisCaro = bi.centros.find((c) => c.despesas > 0);
    if (centroMaisCaro && bi.receitaBruta > 0 && (centroMaisCaro.despesas / bi.receitaBruta) * 100 > 25) {
      out.push({
        tipo: "alerta",
        titulo: "Centro de custo concentrado",
        descricao: `${centroMaisCaro.centro} está consumindo ${formatPercent((centroMaisCaro.despesas / bi.receitaBruta) * 100)} da receita.`,
      });
    }

    if (!out.length) {
      out.push({
        tipo: "sucesso",
        titulo: "Operação saudável",
        descricao: "Os principais indicadores do filtro estão equilibrados para uma leitura gerencial positiva.",
      });
    }

    return out.slice(0, 6);
  }, [bi, produtosBI]);

  return (
    <main className="biPage">
      <header className="hero">
        <div>
          <div className="kicker">MAISON NOOR ERP</div>
          <h1>BI Executivo</h1>
          <p>
            Painel CEO com faturamento, lucro, margem, impostos, estoque, centro de custo,
            projeção de caixa e inteligência empresarial.
          </p>
        </div>

        <div className="heroActions">
          <span className="syncBadge">{loading ? "● Atualizando BI..." : "● BI em tempo real"}</span>
          <button className="btn primary" type="button" onClick={() => void refresh()}>
            Atualizar BI
          </button>
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}

      <section className="controlPanel">
        <div className="quickFilters">
          <button type="button" onClick={() => setQuickRange("hoje")}>Hoje</button>
          <button type="button" onClick={() => setQuickRange("semana")}>Semana</button>
          <button type="button" onClick={() => setQuickRange("mes")}>Este mês</button>
          <button type="button" onClick={() => setQuickRange("30dias")}>30 dias</button>
          <button type="button" onClick={() => setQuickRange("ano")}>Ano</button>
          <button type="button" onClick={() => setQuickRange("todos")}>Tudo</button>
        </div>

        <div className="filtersGrid">
          <div className="field">
            <label>Filtro</label>
            <select className="input" value={periodoTipo} onChange={(e) => setPeriodoTipo(e.target.value as FiltroPeriodo)}>
              <option value="mes">Mês</option>
              <option value="periodo">Período</option>
              <option value="ano">Ano</option>
              <option value="todos">Todos</option>
            </select>
          </div>

          {periodoTipo === "mes" ? (
            <div className="field">
              <label>Mês</label>
              <input className="input" type="month" value={competenciaFilter} onChange={(e) => setCompetenciaFilter(e.target.value)} />
            </div>
          ) : null}

          {periodoTipo === "ano" ? (
            <div className="field">
              <label>Ano</label>
              <input className="input" value={anoFilter} onChange={(e) => setAnoFilter(e.target.value)} placeholder="2026" />
            </div>
          ) : null}

          {periodoTipo === "periodo" ? (
            <>
              <div className="field">
                <label>Início</label>
                <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="field">
                <label>Fim</label>
                <input className="input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </>
          ) : null}

          <div className="filterInfo">
            <strong>{filtered.length}</strong>
            <span>lançamentos analisados</span>
          </div>
        </div>
      </section>

      <section className="ceoPanel">
        <div className="ceoHead">
          <div>
            <div className="sectionKicker">Dashboard CEO</div>
            <h2>Resultado executivo do período</h2>
            <p>
              Leitura consolidada de faturamento, margem, carga tributária, estoque e fluxo projetado.
            </p>
          </div>
          <div className={bi.lucroLiquido >= 0 ? "ceoResult positive" : "ceoResult negative"}>
            <span>Lucro líquido gerencial</span>
            <strong>{formatBRL(bi.lucroLiquido)}</strong>
            <small>Margem {formatPercent(bi.margemLiquida)}</small>
          </div>
        </div>

        <div className="kpis">
          <Kpi title="Faturamento" value={formatBRL(bi.receitaBruta)} hint="Receita bruta do filtro" tone="green" />
          <Kpi title="Receita líquida" value={formatBRL(bi.receitaLiquida)} hint="Após impostos" tone="green" />
          <Kpi title="Lucro bruto" value={formatBRL(bi.lucroBruto)} hint={`Margem ${formatPercent(bi.margemBruta)}`} tone={bi.lucroBruto >= 0 ? "green" : "red"} />
          <Kpi title="Lucro líquido" value={formatBRL(bi.lucroLiquido)} hint={`Margem ${formatPercent(bi.margemLiquida)}`} tone={bi.lucroLiquido >= 0 ? "green" : "red"} />
          <Kpi title="CMV" value={formatBRL(bi.cmv)} hint="Custo de mercadorias" tone="red" />
          <Kpi title="Impostos" value={formatBRL(bi.impostosConsiderados)} hint={bi.usandoEstimativaImposto ? "Estimativa 6%" : "Lançado"} tone="gold" />
          <Kpi title="Carga tributária" value={formatPercent(bi.cargaTributaria)} hint="Impostos / faturamento" tone="gold" />
          <Kpi title="Crescimento" value={formatPercent(bi.crescimentoReceita)} hint="Mês atual x anterior" tone={bi.crescimentoReceita >= 0 ? "green" : "red"} />
          <Kpi title="Ticket médio" value={formatBRL(bi.ticketMedio)} hint="Média por receita" />
          <Kpi title="Fluxo 7 dias" value={formatBRL(bi.fluxo7)} hint="Receber - pagar" tone={bi.fluxo7 >= 0 ? "green" : "red"} />
          <Kpi title="Fluxo 30 dias" value={formatBRL(bi.fluxo30)} hint="Receber - pagar" tone={bi.fluxo30 >= 0 ? "green" : "red"} />
          <Kpi title="Estoque custo" value={formatBRL(produtosBI.valorEstoqueCusto)} hint={`${produtosBI.estoqueTotal} unidade(s)`} tone="gold" />
        </div>
      </section>

      <section className="biGrid">
        <div className="panel wide">
          <div className="sectionKicker">Evolução executiva</div>
          <h2>Receita x despesas x lucro</h2>
          <ExecutiveChart data={bi.evolucaoMensal} />
        </div>

        <div className="panel">
          <div className="sectionKicker">Alertas IA</div>
          <h2>Inteligência empresarial</h2>
          <div className="alerts">
            {alertasExecutivos.map((a, i) => (
              <div className={`alert ${a.tipo}`} key={`${a.titulo}_${i}`}>
                <span>{a.tipo === "critico" ? "⚠️" : a.tipo === "alerta" ? "🔔" : a.tipo === "sucesso" ? "✅" : "💡"}</span>
                <div>
                  <strong>{a.titulo}</strong>
                  <small>{a.descricao}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="biGrid three">
        <div className="panel">
          <div className="sectionKicker">Centro de custo</div>
          <h2>Maiores despesas</h2>
          <RankingRows
            empty="Nenhuma despesa por centro."
            rows={bi.centros.filter((c) => c.despesas > 0).slice(0, 7).map((c) => ({
              label: c.centro,
              value: c.despesas,
              sub: `${c.qtd} lançamento(s) • saldo ${formatBRL(c.saldo)}`,
              percent: bi.despesasTotais > 0 ? (c.despesas / bi.despesasTotais) * 100 : 0,
              tone: "red",
            }))}
          />
        </div>

        <div className="panel">
          <div className="sectionKicker">Pagamentos</div>
          <h2>Formas que mais entram</h2>
          <RankingRows
            empty="Nenhuma receita paga."
            rows={bi.rankingFormas.map((f) => ({
              label: f.forma,
              value: f.valor,
              sub: `${formatPercent(f.percentual)} da receita recebida`,
              percent: f.percentual,
              tone: "green",
            }))}
          />
        </div>

        <div className="panel">
          <div className="sectionKicker">Categorias</div>
          <h2>Resultado gerencial</h2>
          <div className="categoryRows">
            {bi.categorias.length ? bi.categorias.map((c) => (
              <div className="categoryRow" key={c.categoria}>
                <div>
                  <strong>{c.categoria}</strong>
                  <small>Receita {formatBRL(c.receitas)} • Despesa {formatBRL(c.despesas)}</small>
                </div>
                <b className={c.saldo >= 0 ? "green" : "red"}>{formatBRL(c.saldo)}</b>
              </div>
            )) : <div className="emptyMini">Nenhuma categoria.</div>}
          </div>
        </div>
      </section>

      <section className="productBi">
        <div className="productHead">
          <div>
            <div className="sectionKicker">Curva ABC / Produtos</div>
            <h2>Estoque, margem e produtos estratégicos</h2>
            <p>
              BI de produtos com Curva ABC, margem, produtos mais vendidos, menor margem, categorias e produtos parados.
              Quanto mais campos de custo, preço, estoque e vendidos estiverem preenchidos, mais precisa fica a análise.
            </p>
          </div>
          <div className="productResult">
            <span>Margem potencial estoque</span>
            <strong>{formatPercent(produtosBI.margemEstoque)}</strong>
            <small>{produtosBI.ativos} produto(s) ativo(s)</small>
          </div>
        </div>

        <div className="productKpis">
          <Kpi title="Estoque venda" value={formatBRL(produtosBI.valorEstoqueVenda)} hint="Valor potencial" tone="green" />
          <Kpi title="Estoque custo" value={formatBRL(produtosBI.valorEstoqueCusto)} hint={`${produtosBI.estoqueTotal} unidade(s)`} tone="gold" />
          <Kpi title="Lucro potencial" value={formatBRL(produtosBI.valorEstoqueVenda - produtosBI.valorEstoqueCusto)} hint="Venda - custo" tone={(produtosBI.valorEstoqueVenda - produtosBI.valorEstoqueCusto) >= 0 ? "green" : "red"} />
          <Kpi title="Faturamento vendido" value={formatBRL(produtosBI.faturamentoProdutos)} hint="Base campo vendidos" tone="green" />
          <Kpi title="Lucro vendido" value={formatBRL(produtosBI.lucroProdutos)} hint={`Margem ${formatPercent(produtosBI.margemRealProdutos)}`} tone={produtosBI.lucroProdutos >= 0 ? "green" : "red"} />
        </div>

        <div className="abcPanel">
          <div className="sectionKicker">Curva ABC</div>
          <h2>Produtos que mais pesam no faturamento/estoque</h2>
          <div className="abcRows">
            {produtosBI.curvaABC.length ? produtosBI.curvaABC.map((p) => (
              <div className={`abcRow classe${p.classeABC}`} key={p.id}>
                <span>{p.classeABC}</span>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.brand || "Sem marca"} • {formatPercent(p.percentualABC)} do total • acumulado {formatPercent(p.acumuladoABC)}</small>
                </div>
                <b>{formatBRL(p.baseABC)}</b>
              </div>
            )) : <div className="emptyMini">Sem dados suficientes para Curva ABC.</div>}
          </div>
        </div>

        <div className="productGrid premium">
          <div className="panel productPanel">
            <div className="sectionKicker">Mais vendidos</div>
            <h2>Ranking por quantidade vendida</h2>
            <div className="productRows">
              {produtosBI.maisVendidos.length ? produtosBI.maisVendidos.map((p) => (
                <div className="productRow" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.brand || "Sem marca"} • lucro vendido {formatBRL(p.lucroVendido)}</small>
                  </div>
                  <b>{p.sold} un.</b>
                </div>
              )) : <div className="emptyMini">Sem campo de vendidos preenchido.</div>}
            </div>
          </div>

          <div className="panel productPanel">
            <div className="sectionKicker">Mais lucrativos</div>
            <h2>Ranking por lucro unitário</h2>
            <div className="productRows">
              {produtosBI.rankingMargem.length ? produtosBI.rankingMargem.map((p) => (
                <div className="productRow" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.brand || "Sem marca"} • margem {formatPercent(p.margem)}</small>
                  </div>
                  <b>{formatBRL(p.lucroUnit)}</b>
                </div>
              )) : <div className="emptyMini">Sem produtos com preço/custo.</div>}
            </div>
          </div>

          <div className="panel productPanel">
            <div className="sectionKicker">Margem baixa</div>
            <h2>Produtos para revisar preço</h2>
            <div className="productRows">
              {produtosBI.menorMargem.length ? produtosBI.menorMargem.map((p) => (
                <div className="productRow" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{formatBRL(p.price)} venda • {formatBRL(p.cost)} custo</small>
                  </div>
                  <b className={p.margem < 30 ? "red" : "gold"}>{formatPercent(p.margem)}</b>
                </div>
              )) : <div className="emptyMini">Sem margem para revisar.</div>}
            </div>
          </div>

          <div className="panel productPanel">
            <div className="sectionKicker">Atenção estoque</div>
            <h2>Produtos parados</h2>
            <div className="productRows">
              {produtosBI.parados.length ? produtosBI.parados.map((p) => (
                <div className="productRow" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.stock} unidade(s) • custo {formatBRL(p.valorEstoqueCusto)}</small>
                  </div>
                  <b>{formatBRL(p.valorEstoqueVenda)}</b>
                </div>
              )) : <div className="emptyMini">Nenhum produto parado detectado.</div>}
            </div>
          </div>
        </div>

        <div className="categoryProductPanel">
          <div>
            <div className="sectionKicker">Categorias de produtos</div>
            <h2>Valor de estoque por categoria</h2>
          </div>
          <div className="categoryRows productCategories">
            {produtosBI.categorias.length ? produtosBI.categorias.map((c) => (
              <div className="categoryRow" key={c.categoria}>
                <div>
                  <strong>{c.categoria}</strong>
                  <small>{c.qtd} produto(s) • {c.estoque} unidade(s) • margem {formatPercent(c.margem)}</small>
                </div>
                <b>{formatBRL(c.venda)}</b>
              </div>
            )) : <div className="emptyMini">Nenhuma categoria de produto encontrada.</div>}
          </div>
        </div>
      </section>

      <section className="projectionPanel">
        <div>
          <div className="sectionKicker">Projeção empresarial</div>
          <h2>Leitura rápida para decisão</h2>
          <p>
            Com base nos lançamentos atuais, o caixa projetado para 30 dias é <b>{formatBRL(bi.fluxo30)}</b>,
            com <b>{formatBRL(bi.receitaPendente)}</b> a receber e <b>{formatBRL(bi.despesasPendentes)}</b> a pagar.
            O estoque em custo está em <b>{formatBRL(produtosBI.valorEstoqueCusto)}</b>.
          </p>
        </div>

        <div className="decisionCards">
          <DecisionCard title="Prioridade 1" text={bi.fluxo30 < 0 ? "Reforçar cobranças e segurar novas despesas." : "Manter giro e acompanhar margem."} />
          <DecisionCard title="Prioridade 2" text={produtosBI.parados.length ? "Criar ação para produtos parados no estoque." : "Manter controle de reposição de estoque."} />
          <DecisionCard title="Prioridade 3" text={bi.margemLiquida < 20 ? "Revisar CMV, taxas e precificação." : "Explorar produtos com melhor margem."} />
        </div>
      </section>

      <style jsx global>{`
        .biPage { max-width: 1240px; margin: 0 auto; padding: 14px 16px 28px; color: #f5f2ec; }
        .hero, .controlPanel, .ceoPanel, .panel, .productBi, .projectionPanel {
          border: 1px solid rgba(200,162,106,.18);
          background: radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012));
          border-radius: 20px;
          box-shadow: 0 16px 42px rgba(0,0,0,.16);
        }
        .hero { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
        .kicker, .sectionKicker { color: rgba(200,162,106,.95); font-size: 10px; letter-spacing: .16em; text-transform: uppercase; font-weight: 950; }
        h1 { margin: 5px 0 0; font-size: 28px; line-height: 1.05; }
        h2 { margin: 4px 0 0; font-size: 20px; line-height: 1.12; }
        p { margin: 7px 0 0; opacity: .75; line-height: 1.4; font-size: 13px; }
        .heroActions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .btn, .quickFilters button {
          min-height: 32px; border-radius: 11px; border: 1px solid rgba(200,162,106,.24);
          background: rgba(200,162,106,.075); color: #f5f2ec; padding: 0 10px; font-weight: 900; cursor: pointer; font-size: 11.5px;
        }
        .btn.primary { background: linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.075)); border-color: rgba(200,162,106,.42); }
        .syncBadge { height: 32px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(88,214,141,.38); background: rgba(88,214,141,.1); color: #9ff0bc; font-size: 11.5px; font-weight: 900; }
        .toast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 10px 13px; border-radius: 14px; border: 1px solid rgba(200,162,106,.25); background: rgba(25,20,16,.96); font-weight: 900; box-shadow: 0 16px 40px rgba(0,0,0,.3); }
        .controlPanel { margin-top: 12px; padding: 12px; }
        .quickFilters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .filtersGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; align-items: end; }
        .field { display: grid; gap: 5px; min-width: 0; }
        .field label { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; opacity: .75; font-weight: 950; }
        .input { width: 100%; min-height: 34px; border-radius: 11px; border: 1px solid rgba(255,255,255,.11); background: rgba(15,15,22,.92); color: #f5f2ec; padding: 0 10px; outline: none; font-size: 12px; }
        .filterInfo { min-height: 34px; display: flex; align-items: center; gap: 8px; border-radius: 11px; border: 1px solid rgba(200,162,106,.18); background: rgba(0,0,0,.18); padding: 0 10px; }
        .filterInfo strong { color: rgba(200,162,106,.98); }
        .filterInfo span { font-size: 11px; opacity: .68; font-weight: 800; }

        .ceoPanel, .productBi, .projectionPanel { margin-top: 12px; padding: 14px; }
        .ceoHead, .productHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
        .ceoResult, .productResult { min-width: 220px; padding: 11px 12px; border-radius: 16px; border: 1px solid rgba(200,162,106,.2); background: rgba(0,0,0,.22); display: grid; gap: 3px; text-align: right; }
        .ceoResult span, .ceoResult small, .productResult span, .productResult small { font-size: 10px; opacity: .68; text-transform: uppercase; letter-spacing: .1em; font-weight: 950; }
        .ceoResult strong, .productResult strong { font-size: 21px; line-height: 1.08; }
        .ceoResult.positive strong { color: #4dff9a; }
        .ceoResult.negative strong { color: #ff8585; }
        .kpis { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 9px; }
        .kpi { min-height: 76px; padding: 10px 11px; border-radius: 15px; border: 1px solid rgba(200,162,106,.17); background: radial-gradient(circle at top left, rgba(200,162,106,.09), transparent 45%), linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)); display: grid; align-content: center; box-shadow: 0 12px 28px rgba(0,0,0,.12); }
        .kpiTitle { font-size: 9px; text-transform: uppercase; letter-spacing: .12em; opacity: .72; font-weight: 950; }
        .kpiValue { margin-top: 5px; font-size: 16px; line-height: 1.08; font-weight: 950; color: rgba(200,162,106,.98); overflow-wrap: anywhere; }
        .kpiHint { margin-top: 3px; font-size: 10px; opacity: .62; }
        .kpi.green .kpiValue, .green { color: #4dff9a !important; }
        .kpi.red .kpiValue, .red { color: #ff8585 !important; }
        .kpi.gold .kpiValue { color: #f3c979 !important; }

        .biGrid { margin-top: 12px; display: grid; grid-template-columns: 1.45fr .9fr; gap: 10px; }
        .biGrid.three { grid-template-columns: repeat(3, minmax(0,1fr)); }
        .panel { padding: 13px; min-width: 0; }
        .panel.wide { min-height: 280px; }
        .execChart { margin-top: 12px; display: grid; grid-template-columns: repeat(12, minmax(42px, 1fr)); gap: 8px; align-items: end; overflow-x: auto; min-height: 210px; padding-bottom: 4px; }
        .execCol { min-width: 42px; display: grid; gap: 6px; align-items: end; text-align: center; }
        .execBars { height: 142px; display: grid; grid-template-columns: repeat(3,1fr); align-items: end; gap: 3px; padding: 5px; border-radius: 13px; border: 1px solid rgba(255,255,255,.07); background: rgba(0,0,0,.2); }
        .execBars i { min-height: 3px; border-radius: 999px 999px 4px 4px; display: block; }
        .execBars .receita { background: linear-gradient(180deg,#6dffad,#2edb7d); }
        .execBars .despesa { background: linear-gradient(180deg,#ff9a9a,#e85f5f); }
        .execBars .lucro { background: linear-gradient(180deg,#f3c979,#b98b38); }
        .execLabel { font-size: 10px; opacity: .68; font-weight: 800; }
        .execValue { font-size: 9.5px; color: rgba(200,162,106,.95); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .alerts, .rankingRows, .categoryRows, .productRows { margin-top: 10px; display: grid; gap: 8px; }
        .alert { display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 8px; padding: 9px; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); }
        .alert > span { width: 32px; height: 32px; border-radius: 12px; display: grid; place-items: center; border: 1px solid rgba(200,162,106,.18); background: rgba(200,162,106,.07); }
        .alert strong { display: block; font-size: 12px; }
        .alert small { display: block; margin-top: 3px; opacity: .66; font-size: 10.5px; line-height: 1.28; }
        .alert.critico { border-color: rgba(255,120,120,.28); }
        .alert.alerta { border-color: rgba(255,201,98,.28); }
        .alert.sucesso { border-color: rgba(117,255,171,.24); }

        .rankRow { position: relative; overflow: hidden; min-height: 54px; padding: 9px; border-radius: 13px; border: 1px solid rgba(255,255,255,.075); background: rgba(255,255,255,.025); display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; }
        .rankRow strong, .categoryRow strong, .productRow strong { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rankRow small, .categoryRow small, .productRow small { display: block; margin-top: 3px; opacity: .62; font-size: 10.5px; }
        .rankRow span, .categoryRow b, .productRow b { font-weight: 950; color: rgba(200,162,106,.98); font-size: 12px; white-space: nowrap; }
        .rankRow i { position: absolute; left: 0; bottom: 0; height: 3px; border-radius: 999px; background: linear-gradient(90deg, #f3c979, rgba(200,162,106,.2)); }

        .categoryRow, .productRow { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; min-height: 48px; padding: 9px; border-radius: 13px; border: 1px solid rgba(255,255,255,.075); background: rgba(255,255,255,.025); }
        .productKpis { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 9px; }
        .abcPanel, .categoryProductPanel { margin-top: 12px; padding: 13px; border-radius: 17px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.16); }
        .abcRows { margin-top: 10px; display: grid; gap: 8px; }
        .abcRow { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; gap: 9px; align-items: center; min-height: 52px; padding: 9px; border-radius: 13px; border: 1px solid rgba(255,255,255,.075); background: rgba(255,255,255,.025); }
        .abcRow > span { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; font-size: 12px; font-weight: 950; border: 1px solid rgba(200,162,106,.22); background: rgba(200,162,106,.09); color: #f3c979; }
        .abcRow.classeA > span { color: #4dff9a; border-color: rgba(77,255,154,.25); background: rgba(77,255,154,.08); }
        .abcRow.classeB > span { color: #f3c979; }
        .abcRow.classeC > span { color: #ff8585; border-color: rgba(255,133,133,.22); background: rgba(255,133,133,.07); }
        .abcRow strong { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .abcRow small { display: block; margin-top: 3px; opacity: .62; font-size: 10.5px; }
        .abcRow b { font-size: 12px; color: rgba(200,162,106,.98); white-space: nowrap; }
        .productGrid { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .productGrid.premium { grid-template-columns: repeat(2, minmax(0,1fr)); }
        .productPanel { background: rgba(0,0,0,.16); }
        .productCategories { margin-top: 10px; }

        .projectionPanel { display: grid; grid-template-columns: 1.1fr .9fr; gap: 12px; align-items: start; }
        .decisionCards { display: grid; gap: 8px; }
        .decisionCard { padding: 10px; border-radius: 14px; border: 1px solid rgba(200,162,106,.16); background: rgba(0,0,0,.18); }
        .decisionCard strong { display: block; font-size: 12px; color: rgba(200,162,106,.98); }
        .decisionCard small { display: block; margin-top: 4px; opacity: .68; font-size: 11px; line-height: 1.32; }
        .emptyMini { min-height: 70px; display: grid; place-items: center; border-radius: 14px; border: 1px dashed rgba(255,255,255,.14); opacity: .7; font-size: 12px; text-align: center; }

        @media (max-width: 1100px) {
          .biGrid, .biGrid.three, .productGrid, .projectionPanel { grid-template-columns: 1fr; }
          .ceoResult, .productResult { text-align: left; }
        }
        @media (max-width: 760px) {
          .biPage { padding: 12px; }
          h1 { font-size: 24px; }
          .execChart { grid-template-columns: repeat(12, minmax(38px, 1fr)); }
        }
      `}</style>
    </main>
  );
}

function Kpi({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  tone?: "green" | "red" | "gold";
}) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
      <div className="kpiHint">{hint}</div>
    </div>
  );
}

function ExecutiveChart({
  data,
}: {
  data: Array<{ competencia: string; receita: number; despesas: number; impostos: number; cmv: number; lucro: number }>;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.receita, d.despesas, Math.abs(d.lucro)]));

  if (!data.length) {
    return <div className="emptyMini">Sem dados para montar a evolução executiva.</div>;
  }

  return (
    <div className="execChart">
      {data.map((d) => {
        const receitaH = Math.max(3, Math.round((d.receita / max) * 100));
        const despesaH = Math.max(3, Math.round((d.despesas / max) * 100));
        const lucroH = Math.max(3, Math.round((Math.abs(d.lucro) / max) * 100));

        return (
          <div className="execCol" key={d.competencia}>
            <div className="execBars" title={`Receita: ${formatBRL(d.receita)} | Despesas: ${formatBRL(d.despesas)} | Lucro: ${formatBRL(d.lucro)}`}>
              <i className="receita" style={{ height: `${receitaH}%` }} />
              <i className="despesa" style={{ height: `${despesaH}%` }} />
              <i className="lucro" style={{ height: `${lucroH}%` }} />
            </div>
            <div className="execLabel">{d.competencia.slice(5)}/{d.competencia.slice(2, 4)}</div>
            <div className="execValue">{formatBRL(d.lucro)}</div>
          </div>
        );
      })}
    </div>
  );
}

function RankingRows({
  rows,
  empty,
}: {
  empty: string;
  rows: Array<{ label: string; value: number; sub: string; percent: number; tone?: "green" | "red" | "gold" }>;
}) {
  if (!rows.length) return <div className="emptyMini">{empty}</div>;

  return (
    <div className="rankingRows">
      {rows.map((r) => (
        <div className="rankRow" key={r.label}>
          <div>
            <strong>{r.label}</strong>
            <small>{r.sub}</small>
          </div>
          <span className={r.tone === "green" ? "green" : r.tone === "red" ? "red" : ""}>{formatBRL(r.value)}</span>
          <i style={{ width: `${Math.max(5, Math.min(100, r.percent))}%` }} />
        </div>
      ))}
    </div>
  );
}

function DecisionCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="decisionCard">
      <strong>{title}</strong>
      <small>{text}</small>
    </div>
  );
}
