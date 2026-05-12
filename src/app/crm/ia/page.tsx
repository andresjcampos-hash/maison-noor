"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

type TipoLanc = "receita" | "despesa";
type StatusLanc = "pago" | "pendente";
type Prioridade = "critico" | "alto" | "medio" | "baixo" | "positivo";
type AreaIA = "financeiro" | "estoque" | "produto" | "fiscal" | "comercial" | "operacional";

type Produto = {
  id: string;
  nome: string;
  marca?: string;
  volumeMl?: number;
  categoria?: string;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  observacoes?: string;
};

type Lancamento = {
  id: string;
  data: string;
  competencia: string;
  tipo: TipoLanc;
  descricao: string;
  categoria?: string;
  centroCusto?: string;
  forma?: string;
  valor: number;
  status: StatusLanc;
  documentoFiscalId?: string;
  origemFiscal?: string;
  origemPedidoId?: string;
  clienteNome?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RecomendacaoIA = {
  id: string;
  area: AreaIA;
  prioridade: Prioridade;
  titulo: string;
  descricao: string;
  acao: string;
  impacto: string;
  valor?: number;
};

type KpiIA = {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "red" | "gold" | "blue";
};

const CENTROS_FISCAIS = ["fiscal", "imposto", "tribut", "icms", "pis", "cofins", "simples", "das"];
const CENTROS_ESTOQUE = ["estoque", "cmv", "mercadoria", "produto", "compra", "fornecedor"];
const CENTROS_MARKETING = ["marketing", "anuncio", "anúncio", "trafego", "tráfego", "ads", "meta", "instagram", "facebook"];

function nowISO(): string {
  return new Date().toISOString();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function startOfCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01T00:00:00.000Z`;
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

function toNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function tsToISO(value: any): string {
  if (!value) return nowISO();
  if (typeof value === "string") return value;
  if (value && typeof value.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return nowISO();
    }
  }
  return nowISO();
}

function normalizarTexto(value?: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function contemAlgum(texto: string, palavras: string[]): boolean {
  const t = normalizarTexto(texto);
  return palavras.some((p) => t.includes(normalizarTexto(p)));
}

function getMargemProduto(p: Produto) {
  const compra = toNumber(p.precoCompra);
  const venda = toNumber(p.precoVenda);
  const lucro = venda - compra;
  const margemVenda = venda > 0 ? (lucro / venda) * 100 : 0;
  const markup = compra > 0 ? (lucro / compra) * 100 : 0;
  return { compra, venda, lucro, margemVenda, markup };
}

function diasDesde(iso?: string): number {
  if (!iso) return 999;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 999;
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / 86400000));
}

async function fetchProdutos(): Promise<Produto[]> {
  try {
    const snap = await getDocs(query(collection(db, "products"), orderBy("updatedAt", "desc")));
    return snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        nome: String(data.nome || ""),
        marca: data.marca ? String(data.marca) : undefined,
        volumeMl: toNumber(data.volumeMl),
        categoria: data.categoria ? String(data.categoria) : undefined,
        precoCompra: toNumber(data.precoCompra),
        precoVenda: toNumber(data.precoVenda),
        estoque: toNumber(data.estoque),
        reservado: toNumber(data.reservado),
        ativo: data.ativo !== false,
        createdAt: tsToISO(data.createdAt),
        updatedAt: tsToISO(data.updatedAt),
        observacoes: data.observacoes ? String(data.observacoes) : undefined,
      };
    });
  } catch (e) {
    console.error("[IA] Erro ao carregar produtos", e);
    return [];
  }
}

function normalizeLancamento(docId: string, raw: any): Lancamento | null {
  const descricao = String(raw?.descricao || "").trim();
  if (!descricao) return null;

  const dataIso = tsToISO(raw?.data);

  return {
    id: docId,
    data: dataIso,
    competencia: raw?.competencia ? String(raw.competencia) : dataIso.slice(0, 7),
    tipo: raw?.tipo === "despesa" ? "despesa" : "receita",
    descricao,
    categoria: raw?.categoria ? String(raw.categoria) : undefined,
    centroCusto: raw?.centroCusto ? String(raw.centroCusto) : undefined,
    forma: raw?.forma ? String(raw.forma) : undefined,
    valor: toNumber(raw?.valor),
    status: raw?.status === "pendente" ? "pendente" : "pago",
    documentoFiscalId: raw?.documentoFiscalId ? String(raw.documentoFiscalId) : undefined,
    origemFiscal: raw?.origemFiscal ? String(raw.origemFiscal) : undefined,
    origemPedidoId: raw?.origemPedidoId ? String(raw.origemPedidoId) : undefined,
    clienteNome: raw?.clienteNome ? String(raw.clienteNome) : undefined,
    createdAt: tsToISO(raw?.createdAt),
    updatedAt: tsToISO(raw?.updatedAt),
  };
}

async function fetchFinanceiro(): Promise<Lancamento[]> {
  const subcols = ["lista", "lancamentos"];
  const map = new Map<string, Lancamento>();

  for (const sub of subcols) {
    try {
      const ref = collection(db, "financeiro", "default", sub);
      const snap = await getDocs(query(ref, orderBy("data", "desc")));
      for (const d of snap.docs) {
        const l = normalizeLancamento(d.id, d.data() as any);
        if (!l) continue;
        const key = l.origemPedidoId ? `pedido_${l.origemPedidoId}` : l.id;
        const previous = map.get(key);
        if (!previous || (l.updatedAt || "") > (previous.updatedAt || "")) {
          map.set(key, l);
        }
      }
    } catch (e) {
      console.error(`[IA] Erro ao carregar financeiro/${sub}`, e);
    }
  }

  return Array.from(map.values()).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
}

function buildRecomendacoes(produtos: Produto[], lancamentos: Lancamento[]): RecomendacaoIA[] {
  const recs: RecomendacaoIA[] = [];
  const ativos = produtos.filter((p) => p.ativo !== false);

  let receita = 0;
  let despesas = 0;
  let impostos = 0;
  let cmv = 0;
  let marketing = 0;
  let pendenteReceber = 0;
  let pendentePagar = 0;

  for (const l of lancamentos) {
    const valor = toNumber(l.valor);
    const texto = `${l.descricao} ${l.categoria || ""} ${l.centroCusto || ""}`;

    if (l.tipo === "receita") {
      receita += valor;
      if (l.status === "pendente") pendenteReceber += valor;
    } else {
      despesas += valor;
      if (l.status === "pendente") pendentePagar += valor;
      if (contemAlgum(texto, CENTROS_FISCAIS)) impostos += valor;
      if (contemAlgum(texto, CENTROS_ESTOQUE)) cmv += valor;
      if (contemAlgum(texto, CENTROS_MARKETING)) marketing += valor;
    }
  }

  const lucro = receita - despesas;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;
  const cargaTributaria = receita > 0 ? (impostos / receita) * 100 : 0;
  const pesoMarketing = receita > 0 ? (marketing / receita) * 100 : 0;
  const pesoCmv = receita > 0 ? (cmv / receita) * 100 : 0;

  const semEstoque = ativos.filter((p) => Math.max(0, toNumber(p.estoque) - toNumber(p.reservado)) <= 0);
  const estoqueBaixo = ativos.filter((p) => {
    const disp = Math.max(0, toNumber(p.estoque) - toNumber(p.reservado));
    return disp > 0 && disp <= 2;
  });

  const margemBaixa = ativos
    .map((p) => ({ produto: p, ...getMargemProduto(p) }))
    .filter((x) => x.venda > 0 && x.margemVenda > 0 && x.margemVenda < 25)
    .sort((a, b) => a.margemVenda - b.margemVenda)
    .slice(0, 5);

  const margemNegativa = ativos
    .map((p) => ({ produto: p, ...getMargemProduto(p) }))
    .filter((x) => x.venda > 0 && x.lucro < 0)
    .slice(0, 5);

  const produtosParados = ativos
    .filter((p) => toNumber(p.estoque) > 0 && diasDesde(p.updatedAt) >= 45)
    .sort((a, b) => diasDesde(b.updatedAt) - diasDesde(a.updatedAt))
    .slice(0, 5);

  const capitalParado = produtosParados.reduce(
    (acc, p) => acc + toNumber(p.precoCompra) * toNumber(p.estoque),
    0
  );

  const valorEstoqueCompra = ativos.reduce(
    (acc, p) => acc + toNumber(p.precoCompra) * toNumber(p.estoque),
    0
  );

  const valorEstoqueVenda = ativos.reduce(
    (acc, p) => acc + toNumber(p.precoVenda) * toNumber(p.estoque),
    0
  );

  if (margem < 20 && receita > 0) {
    recs.push({
      id: "margem-baixa",
      area: "financeiro",
      prioridade: "critico",
      titulo: "Margem operacional abaixo do ideal",
      descricao: `A margem do período está em ${formatPercent(margem)}. Isso indica que custos, descontos ou despesas estão pressionando o resultado.`,
      acao: "Revisar despesas, CMV, preço de venda e promoções antes de aumentar o volume de vendas.",
      impacto: "Pode recuperar lucro sem depender de vender mais.",
      valor: lucro,
    });
  }

  if (pendentePagar > pendenteReceber && pendentePagar > 0) {
    recs.push({
      id: "caixa-risco",
      area: "financeiro",
      prioridade: "alto",
      titulo: "Risco de caixa por contas a pagar",
      descricao: `Há ${formatBRL(pendentePagar)} a pagar contra ${formatBRL(pendenteReceber)} a receber.`,
      acao: "Priorizar cobranças, renegociar vencimentos e evitar novas compras até equilibrar o caixa.",
      impacto: "Reduz risco de aperto financeiro nos próximos dias.",
      valor: pendentePagar - pendenteReceber,
    });
  }

  if (semEstoque.length > 0) {
    recs.push({
      id: "sem-estoque",
      area: "estoque",
      prioridade: "alto",
      titulo: `${semEstoque.length} produto(s) sem estoque disponível`,
      descricao: `Produtos ativos aparecem sem disponibilidade para venda. Isso pode gerar perda de receita no site e no atendimento.`,
      acao: `Revisar recompra ou desativar temporariamente: ${semEstoque.slice(0, 3).map((p) => p.nome).join(", ")}.`,
      impacto: "Evita venda perdida e melhora a experiência do cliente.",
    });
  }

  if (estoqueBaixo.length > 0) {
    recs.push({
      id: "estoque-baixo",
      area: "estoque",
      prioridade: "medio",
      titulo: `${estoqueBaixo.length} produto(s) perto de acabar`,
      descricao: "Há produtos com 1 ou 2 unidades disponíveis.",
      acao: `Avaliar recompra dos itens mais estratégicos: ${estoqueBaixo.slice(0, 3).map((p) => p.nome).join(", ")}.`,
      impacto: "Ajuda a manter produtos importantes disponíveis.",
    });
  }

  if (margemNegativa.length > 0) {
    recs.push({
      id: "margem-negativa",
      area: "produto",
      prioridade: "critico",
      titulo: "Produto com venda abaixo do custo",
      descricao: `${margemNegativa.length} produto(s) têm lucro unitário negativo.`,
      acao: `Corrigir preço imediatamente: ${margemNegativa.slice(0, 3).map((x) => x.produto.nome).join(", ")}.`,
      impacto: "Evita prejuízo direto a cada venda.",
    });
  }

  if (margemBaixa.length > 0) {
    recs.push({
      id: "margem-produto-baixa",
      area: "produto",
      prioridade: "alto",
      titulo: "Produtos com margem baixa",
      descricao: `Alguns produtos têm margem sobre venda abaixo de 25%.`,
      acao: `Revisar preço ou negociar compra: ${margemBaixa.slice(0, 3).map((x) => `${x.produto.nome} (${formatPercent(x.margemVenda)})`).join(", ")}.`,
      impacto: "Aumenta lucro sem aumentar estoque.",
    });
  }

  if (produtosParados.length > 0) {
    recs.push({
      id: "estoque-parado",
      area: "estoque",
      prioridade: "medio",
      titulo: "Capital parado em estoque",
      descricao: `${produtosParados.length} produto(s) estão há 45+ dias sem atualização. Capital estimado parado: ${formatBRL(capitalParado)}.`,
      acao: "Criar campanha, combo, destaque no Instagram ou ação de giro para esses produtos.",
      impacto: "Transforma estoque parado em caixa.",
      valor: capitalParado,
    });
  }

  if (pesoMarketing > 20) {
    recs.push({
      id: "marketing-alto",
      area: "comercial",
      prioridade: "medio",
      titulo: "Marketing consumindo parte relevante da receita",
      descricao: `Marketing representa ${formatPercent(pesoMarketing)} da receita filtrada.`,
      acao: "Comparar campanhas com vendas geradas e pausar anúncios sem retorno claro.",
      impacto: "Melhora ROI e preserva margem.",
      valor: marketing,
    });
  }

  if (pesoCmv > 55) {
    recs.push({
      id: "cmv-alto",
      area: "operacional",
      prioridade: "alto",
      titulo: "CMV alto em relação à receita",
      descricao: `Custo de mercadorias representa ${formatPercent(pesoCmv)} da receita.`,
      acao: "Revisar preço de venda, custo médio, descontos e compras de fornecedores.",
      impacto: "Protege lucro bruto da operação.",
      valor: cmv,
    });
  }

  if (cargaTributaria > 12) {
    recs.push({
      id: "imposto-alto",
      area: "fiscal",
      prioridade: "medio",
      titulo: "Carga tributária elevada",
      descricao: `Impostos representam ${formatPercent(cargaTributaria)} da receita.`,
      acao: "Conferir classificação fiscal dos lançamentos e validar se há imposto duplicado ou mal categorizado.",
      impacto: "Evita leitura distorcida do DRE.",
      valor: impostos,
    });
  }

  if (valorEstoqueCompra > 0 && valorEstoqueVenda > 0) {
    const lucroPotencial = valorEstoqueVenda - valorEstoqueCompra;
    const margemPotencial = valorEstoqueVenda > 0 ? (lucroPotencial / valorEstoqueVenda) * 100 : 0;

    if (margemPotencial >= 35) {
      recs.push({
        id: "estoque-potencial",
        area: "estoque",
        prioridade: "positivo",
        titulo: "Estoque com bom potencial de lucro",
        descricao: `O estoque atual tem margem potencial estimada de ${formatPercent(margemPotencial)}.`,
        acao: "Priorizar venda dos produtos com maior margem e bom estoque disponível.",
        impacto: "Pode acelerar geração de caixa com boa rentabilidade.",
        valor: lucroPotencial,
      });
    }
  }

  if (!recs.length) {
    recs.push({
      id: "sem-alertas",
      area: "operacional",
      prioridade: "positivo",
      titulo: "Operação sem alertas críticos",
      descricao: "Não encontrei riscos relevantes nos dados atuais de produtos e financeiro.",
      acao: "Manter acompanhamento semanal de margem, estoque e caixa.",
      impacto: "Ajuda a manter previsibilidade da operação.",
    });
  }

  const peso: Record<Prioridade, number> = {
    critico: 5,
    alto: 4,
    medio: 3,
    baixo: 2,
    positivo: 1,
  };

  return recs.sort((a, b) => peso[b.prioridade] - peso[a.prioridade]).slice(0, 12);
}

export default function IAEmpresarialPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [areaFilter, setAreaFilter] = useState<"todas" | AreaIA>("todas");
  const [prioridadeFilter, setPrioridadeFilter] = useState<"todas" | Prioridade>("todas");

  function showToast(msg: string, ms = 1800) {
    setToast(msg);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setToast(""), ms);
    }
  }

  async function carregar() {
    setLoading(true);
    try {
      const [produtosData, financeiroData] = await Promise.all([
        fetchProdutos(),
        fetchFinanceiro(),
      ]);
      setProdutos(produtosData);
      setLancamentos(financeiroData);
      showToast("🧠 IA atualizada!");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contexto = useMemo(() => {
    const mesAtual = currentMonth();
    const inicioMes = new Date(startOfCurrentMonth()).getTime();

    const lancMes = lancamentos.filter((l) => {
      const data = new Date(l.data).getTime();
      return (l.competencia || "").startsWith(mesAtual) || data >= inicioMes;
    });

    let receitaMes = 0;
    let despesaMes = 0;
    let impostoMes = 0;
    let cmvMes = 0;
    let pendenteReceber = 0;
    let pendentePagar = 0;

    for (const l of lancMes) {
      const valor = toNumber(l.valor);
      const texto = `${l.descricao} ${l.categoria || ""} ${l.centroCusto || ""}`;

      if (l.tipo === "receita") {
        receitaMes += valor;
        if (l.status === "pendente") pendenteReceber += valor;
      } else {
        despesaMes += valor;
        if (l.status === "pendente") pendentePagar += valor;
        if (contemAlgum(texto, CENTROS_FISCAIS)) impostoMes += valor;
        if (contemAlgum(texto, CENTROS_ESTOQUE)) cmvMes += valor;
      }
    }

    const ativos = produtos.filter((p) => p.ativo !== false);
    const estoqueTotal = ativos.reduce((acc, p) => acc + toNumber(p.estoque), 0);
    const disponivelTotal = ativos.reduce((acc, p) => acc + Math.max(0, toNumber(p.estoque) - toNumber(p.reservado)), 0);
    const valorCustoEstoque = ativos.reduce((acc, p) => acc + toNumber(p.precoCompra) * toNumber(p.estoque), 0);
    const valorVendaEstoque = ativos.reduce((acc, p) => acc + toNumber(p.precoVenda) * toNumber(p.estoque), 0);
    const lucroPotencial = valorVendaEstoque - valorCustoEstoque;

    const semEstoque = ativos.filter((p) => Math.max(0, toNumber(p.estoque) - toNumber(p.reservado)) <= 0).length;
    const margemProdutoMedia = ativos.length
      ? ativos.reduce((acc, p) => acc + getMargemProduto(p).margemVenda, 0) / ativos.length
      : 0;

    const lucroMes = receitaMes - despesaMes;
    const margemMes = receitaMes > 0 ? (lucroMes / receitaMes) * 100 : 0;
    const cargaTributaria = receitaMes > 0 ? (impostoMes / receitaMes) * 100 : 0;
    const cmvPercentual = receitaMes > 0 ? (cmvMes / receitaMes) * 100 : 0;

    const score =
      100
      - (margemMes < 20 && receitaMes > 0 ? 20 : 0)
      - (pendentePagar > pendenteReceber ? 15 : 0)
      - (semEstoque > 0 ? 10 : 0)
      - (cmvPercentual > 55 ? 15 : 0)
      - (cargaTributaria > 12 ? 10 : 0);

    return {
      mesAtual,
      receitaMes,
      despesaMes,
      lucroMes,
      margemMes,
      impostoMes,
      cargaTributaria,
      cmvMes,
      cmvPercentual,
      pendenteReceber,
      pendentePagar,
      ativos: ativos.length,
      estoqueTotal,
      disponivelTotal,
      valorCustoEstoque,
      valorVendaEstoque,
      lucroPotencial,
      semEstoque,
      margemProdutoMedia,
      score: Math.max(0, Math.min(100, score)),
    };
  }, [produtos, lancamentos]);

  const recomendacoes = useMemo(() => buildRecomendacoes(produtos, lancamentos), [produtos, lancamentos]);

  const recomendacoesFiltradas = useMemo(() => {
    return recomendacoes.filter((r) => {
      if (areaFilter !== "todas" && r.area !== areaFilter) return false;
      if (prioridadeFilter !== "todas" && r.prioridade !== prioridadeFilter) return false;
      return true;
    });
  }, [recomendacoes, areaFilter, prioridadeFilter]);

  const kpis: KpiIA[] = useMemo(() => [
    {
      label: "Score IA",
      value: `${contexto.score}/100`,
      hint: contexto.score >= 80 ? "Operação saudável" : contexto.score >= 60 ? "Atenção moderada" : "Risco elevado",
      tone: contexto.score >= 80 ? "green" : contexto.score >= 60 ? "gold" : "red",
    },
    {
      label: "Lucro do mês",
      value: formatBRL(contexto.lucroMes),
      hint: `Margem ${formatPercent(contexto.margemMes)}`,
      tone: contexto.lucroMes >= 0 ? "green" : "red",
    },
    {
      label: "Caixa pendente",
      value: formatBRL(contexto.pendenteReceber - contexto.pendentePagar),
      hint: "A receber - a pagar",
      tone: contexto.pendenteReceber >= contexto.pendentePagar ? "green" : "red",
    },
    {
      label: "Valor em estoque",
      value: formatBRL(contexto.valorCustoEstoque),
      hint: `Potencial ${formatBRL(contexto.lucroPotencial)}`,
      tone: "gold",
    },
    {
      label: "Produtos ativos",
      value: String(contexto.ativos),
      hint: `${contexto.semEstoque} sem estoque`,
      tone: contexto.semEstoque > 0 ? "gold" : "green",
    },
    {
      label: "Carga tributária",
      value: formatPercent(contexto.cargaTributaria),
      hint: formatBRL(contexto.impostoMes),
      tone: contexto.cargaTributaria > 12 ? "red" : "green",
    },
  ], [contexto]);

  const porArea = useMemo(() => {
    const areas: AreaIA[] = ["financeiro", "estoque", "produto", "fiscal", "comercial", "operacional"];
    return areas.map((area) => ({
      area,
      qtd: recomendacoes.filter((r) => r.area === area).length,
    }));
  }, [recomendacoes]);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <div className="kicker">MAISON NOOR • INTELIGÊNCIA</div>
          <h1>Central de IA Empresarial</h1>
          <p>
            Diagnóstico automático cruzando Financeiro, Fiscal, Estoque e Produtos para sugerir ações práticas de gestão.
          </p>
        </div>

        <div className="heroActions">
          <span className={loading ? "syncBadge loading" : "syncBadge"}>{loading ? "● Analisando dados..." : "● IA em tempo real"}</span>
          <button className="btn primary" onClick={() => void carregar()} type="button">
            Atualizar IA
          </button>
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}

      <section className="scorePanel">
        <div className="scoreLeft">
          <div className="sectionKicker">Diagnóstico geral</div>
          <h2>{contexto.score >= 80 ? "Operação saudável" : contexto.score >= 60 ? "Operação com pontos de atenção" : "Operação exige ação rápida"}</h2>
          <p>
            A IA avaliou margem, caixa pendente, estoque, CMV, impostos e produtos cadastrados.
            Use as recomendações abaixo como plano de ação do dia.
          </p>
        </div>

        <div className="scoreCircle">
          <strong>{contexto.score}</strong>
          <span>/100</span>
        </div>
      </section>

      <section className="kpis">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="controlPanel">
        <div className="field">
          <label>Área</label>
          <select className="input" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as "todas" | AreaIA)}>
            <option value="todas">Todas</option>
            <option value="financeiro">Financeiro</option>
            <option value="estoque">Estoque</option>
            <option value="produto">Produto</option>
            <option value="fiscal">Fiscal</option>
            <option value="comercial">Comercial</option>
            <option value="operacional">Operacional</option>
          </select>
        </div>

        <div className="field">
          <label>Prioridade</label>
          <select className="input" value={prioridadeFilter} onChange={(e) => setPrioridadeFilter(e.target.value as "todas" | Prioridade)}>
            <option value="todas">Todas</option>
            <option value="critico">Crítico</option>
            <option value="alto">Alto</option>
            <option value="medio">Médio</option>
            <option value="baixo">Baixo</option>
            <option value="positivo">Positivo</option>
          </select>
        </div>

        <div className="areaPills">
          {porArea.map((item) => (
            <button
              key={item.area}
              type="button"
              className={areaFilter === item.area ? "areaPill active" : "areaPill"}
              onClick={() => setAreaFilter(areaFilter === item.area ? "todas" : item.area)}
            >
              {areaLabel(item.area)} <b>{item.qtd}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="recommendations">
        <div className="sectionHead">
          <div>
            <div className="sectionKicker">Recomendações IA</div>
            <h2>Plano de ação inteligente</h2>
            <p>{recomendacoesFiltradas.length} recomendação(ões) para o filtro atual.</p>
          </div>
        </div>

        <div className="recGrid">
          {recomendacoesFiltradas.map((rec) => (
            <article className={`recCard ${rec.prioridade}`} key={rec.id}>
              <div className="recTop">
                <span className={`priority ${rec.prioridade}`}>{prioridadeLabel(rec.prioridade)}</span>
                <span className="area">{areaLabel(rec.area)}</span>
              </div>

              <h3>{rec.titulo}</h3>
              <p>{rec.descricao}</p>

              <div className="actionBox">
                <span>Ação recomendada</span>
                <strong>{rec.acao}</strong>
              </div>

              <div className="impact">
                <span>Impacto</span>
                <b>{rec.impacto}</b>
              </div>

              {typeof rec.valor === "number" ? (
                <div className="recValue">{formatBRL(rec.valor)}</div>
              ) : null}
            </article>
          ))}

          {!recomendacoesFiltradas.length ? (
            <div className="empty">Nenhuma recomendação encontrada para o filtro atual.</div>
          ) : null}
        </div>
      </section>

      <section className="deepGrid">
        <div className="deepPanel">
          <div className="sectionKicker">Leitura financeira</div>
          <h2>Resultado e caixa</h2>
          <div className="miniRows">
            <MiniRow label="Receita do mês" value={formatBRL(contexto.receitaMes)} tone="green" />
            <MiniRow label="Despesas do mês" value={formatBRL(contexto.despesaMes)} tone="red" />
            <MiniRow label="Lucro do mês" value={formatBRL(contexto.lucroMes)} tone={contexto.lucroMes >= 0 ? "green" : "red"} />
            <MiniRow label="Margem operacional" value={formatPercent(contexto.margemMes)} tone={contexto.margemMes >= 20 ? "green" : "gold"} />
            <MiniRow label="A receber" value={formatBRL(contexto.pendenteReceber)} tone="green" />
            <MiniRow label="A pagar" value={formatBRL(contexto.pendentePagar)} tone="red" />
          </div>
        </div>

        <div className="deepPanel">
          <div className="sectionKicker">Leitura de estoque</div>
          <h2>Capital e disponibilidade</h2>
          <div className="miniRows">
            <MiniRow label="Estoque físico" value={String(contexto.estoqueTotal)} />
            <MiniRow label="Disponível" value={String(contexto.disponivelTotal)} />
            <MiniRow label="Sem estoque" value={String(contexto.semEstoque)} tone={contexto.semEstoque > 0 ? "gold" : "green"} />
            <MiniRow label="Custo em estoque" value={formatBRL(contexto.valorCustoEstoque)} tone="gold" />
            <MiniRow label="Venda potencial" value={formatBRL(contexto.valorVendaEstoque)} tone="green" />
            <MiniRow label="Lucro potencial" value={formatBRL(contexto.lucroPotencial)} tone={contexto.lucroPotencial >= 0 ? "green" : "red"} />
          </div>
        </div>

        <div className="deepPanel">
          <div className="sectionKicker">Fiscal e operação</div>
          <h2>Impostos e CMV</h2>
          <div className="miniRows">
            <MiniRow label="Impostos do mês" value={formatBRL(contexto.impostoMes)} tone="gold" />
            <MiniRow label="Carga tributária" value={formatPercent(contexto.cargaTributaria)} tone={contexto.cargaTributaria > 12 ? "red" : "green"} />
            <MiniRow label="CMV do mês" value={formatBRL(contexto.cmvMes)} tone="red" />
            <MiniRow label="CMV / Receita" value={formatPercent(contexto.cmvPercentual)} tone={contexto.cmvPercentual > 55 ? "red" : "green"} />
            <MiniRow label="Margem média produto" value={formatPercent(contexto.margemProdutoMedia)} tone={contexto.margemProdutoMedia >= 30 ? "green" : "gold"} />
            <MiniRow label="Lançamentos analisados" value={String(lancamentos.length)} />
          </div>
        </div>
      </section>

      <style jsx>{`
        .page {
          max-width: 1240px;
          margin: 0 auto;
          padding: 18px;
          color: #f5f2ec;
        }

        .hero,
        .scorePanel,
        .controlPanel,
        .recommendations,
        .deepPanel {
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.12), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,.042), rgba(255,255,255,.012));
          border-radius: 22px;
          box-shadow: 0 18px 48px rgba(0,0,0,.18);
        }

        .hero {
          padding: 18px;
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .kicker,
        .sectionKicker {
          color: rgba(200, 162, 106, 0.95);
          font-size: 11px;
          letter-spacing: .18em;
          text-transform: uppercase;
          font-weight: 950;
        }

        h1 {
          margin: 5px 0 0;
          font-size: 30px;
          line-height: 1.05;
        }

        h2 {
          margin: 4px 0 0;
          font-size: 22px;
        }

        p {
          margin: 7px 0 0;
          opacity: .76;
          line-height: 1.42;
        }

        .heroActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
        }

        .btn {
          min-height: 36px;
          border-radius: 13px;
          border: 1px solid rgba(200,162,106,.24);
          background: rgba(200,162,106,.075);
          color: #f5f2ec;
          padding: 0 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .btn.primary {
          background: linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.075));
          border-color: rgba(200,162,106,.42);
        }

        .syncBadge {
          height: 36px;
          display: inline-flex;
          align-items: center;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(88,214,141,.38);
          background: rgba(88,214,141,.1);
          color: #9ff0bc;
          font-size: 12px;
          font-weight: 900;
        }

        .syncBadge.loading {
          border-color: rgba(255, 201, 98, 0.38);
          background: rgba(255, 201, 98, 0.1);
          color: #ffe4a6;
        }

        .toast {
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          padding: 10px 13px;
          border-radius: 14px;
          border: 1px solid rgba(200,162,106,.25);
          background: rgba(25,20,16,.96);
          font-weight: 900;
          box-shadow: 0 16px 40px rgba(0,0,0,.3);
        }

        .scorePanel {
          margin-top: 14px;
          padding: 16px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 150px;
          gap: 16px;
          align-items: center;
        }

        .scoreCircle {
          width: 136px;
          height: 136px;
          border-radius: 999px;
          border: 1px solid rgba(200,162,106,.35);
          background:
            radial-gradient(circle, rgba(200,162,106,.20), rgba(200,162,106,.05) 58%, rgba(0,0,0,.22));
          display: grid;
          place-items: center;
          align-content: center;
          justify-self: end;
          box-shadow: inset 0 0 30px rgba(200,162,106,.08);
        }

        .scoreCircle strong {
          font-size: 40px;
          line-height: 1;
          color: rgba(200,162,106,.98);
        }

        .scoreCircle span {
          margin-top: 3px;
          font-size: 12px;
          opacity: .68;
          font-weight: 950;
        }

        .kpis {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }

        .kpi {
          min-height: 84px;
          padding: 11px;
          border-radius: 18px;
          border: 1px solid rgba(200,162,106,.16);
          background:
            radial-gradient(circle at top left, rgba(200,162,106,.09), transparent 45%),
            linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01));
          display: grid;
          align-content: center;
        }

        .kpi span {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .12em;
          opacity: .72;
          font-weight: 950;
        }

        .kpi strong {
          margin-top: 5px;
          font-size: 18px;
          line-height: 1.08;
          color: rgba(200,162,106,.98);
          overflow-wrap: anywhere;
        }

        .kpi small {
          margin-top: 4px;
          font-size: 10.5px;
          opacity: .62;
        }

        .kpi.green strong,
        .green {
          color: #4dff9a !important;
        }

        .kpi.red strong,
        .red {
          color: #ff8585 !important;
        }

        .kpi.gold strong,
        .gold {
          color: #f3c979 !important;
        }

        .kpi.blue strong {
          color: #8cc8ff !important;
        }

        .controlPanel {
          margin-top: 14px;
          padding: 12px;
          display: grid;
          grid-template-columns: 180px 180px minmax(0, 1fr);
          gap: 10px;
          align-items: end;
        }

        .field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }

        .field label {
          font-size: 10px;
          letter-spacing: .14em;
          text-transform: uppercase;
          opacity: .75;
          font-weight: 950;
        }

        .input {
          width: 100%;
          min-height: 38px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.11);
          background: rgba(15,15,22,.92);
          color: #f5f2ec;
          padding: 0 11px;
          outline: none;
        }

        .areaPills {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .areaPill {
          min-height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(200,162,106,.20);
          background: rgba(200,162,106,.06);
          color: #f5f2ec;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .areaPill.active {
          background: rgba(200,162,106,.16);
          border-color: rgba(200,162,106,.44);
          color: #ffe1ad;
        }

        .areaPill b {
          margin-left: 5px;
          color: rgba(200,162,106,.98);
        }

        .recommendations {
          margin-top: 14px;
          padding: 14px;
        }

        .sectionHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .recGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
          gap: 10px;
        }

        .recCard {
          position: relative;
          overflow: hidden;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.20);
          display: grid;
          gap: 9px;
        }

        .recCard.critico {
          border-color: rgba(255,120,120,.30);
          background:
            radial-gradient(circle at top left, rgba(255,120,120,.10), transparent 35%),
            rgba(0,0,0,.20);
        }

        .recCard.alto {
          border-color: rgba(255,201,98,.28);
        }

        .recCard.positivo {
          border-color: rgba(117,255,171,.24);
        }

        .recTop {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          align-items: center;
        }

        .priority,
        .area {
          min-height: 24px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0 9px;
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .05em;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.04);
        }

        .priority.critico {
          color: #ffd1d1;
          border-color: rgba(255,120,120,.34);
          background: rgba(255,120,120,.10);
        }

        .priority.alto,
        .priority.medio {
          color: #ffe4a6;
          border-color: rgba(255,201,98,.30);
          background: rgba(255,201,98,.08);
        }

        .priority.positivo {
          color: #bfffd5;
          border-color: rgba(117,255,171,.28);
          background: rgba(117,255,171,.08);
        }

        .area {
          color: rgba(200,162,106,.98);
          border-color: rgba(200,162,106,.22);
          background: rgba(200,162,106,.06);
        }

        .recCard h3 {
          margin: 0;
          font-size: 16px;
          line-height: 1.2;
        }

        .recCard p {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.42;
          opacity: .72;
        }

        .actionBox {
          padding: 10px;
          border-radius: 14px;
          border: 1px solid rgba(200,162,106,.14);
          background: rgba(200,162,106,.06);
        }

        .actionBox span,
        .impact span {
          display: block;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: .1em;
          opacity: .62;
          font-weight: 950;
          margin-bottom: 4px;
        }

        .actionBox strong,
        .impact b {
          display: block;
          font-size: 12px;
          line-height: 1.35;
        }

        .impact {
          padding: 9px 10px;
          border-radius: 14px;
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.07);
        }

        .recValue {
          justify-self: start;
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0 10px;
          border: 1px solid rgba(200,162,106,.24);
          background: rgba(200,162,106,.08);
          color: rgba(200,162,106,.98);
          font-weight: 950;
          font-size: 12px;
        }

        .deepGrid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .deepPanel {
          padding: 13px;
        }

        .miniRows {
          margin-top: 10px;
          display: grid;
          gap: 7px;
        }

        .miniRow {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          min-height: 38px;
          padding: 8px 9px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(0,0,0,.18);
        }

        .miniRow span {
          opacity: .68;
          font-size: 12px;
          font-weight: 850;
        }

        .miniRow strong {
          font-size: 12px;
          white-space: nowrap;
        }

        .miniRow.green strong { color: #4dff9a; }
        .miniRow.red strong { color: #ff8585; }
        .miniRow.gold strong { color: #f3c979; }

        .empty {
          grid-column: 1 / -1;
          min-height: 110px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          border: 1px dashed rgba(255,255,255,.14);
          opacity: .7;
        }

        @media (max-width: 1050px) {
          .controlPanel {
            grid-template-columns: 1fr 1fr;
          }

          .areaPills {
            grid-column: 1 / -1;
            justify-content: flex-start;
          }

          .deepGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .page {
            padding: 12px;
          }

          .hero,
          .scorePanel {
            grid-template-columns: 1fr;
          }

          .scoreCircle {
            justify-self: start;
          }

          .controlPanel {
            grid-template-columns: 1fr;
          }

          .recGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function KpiCard({ label, value, hint, tone }: KpiIA) {
  return (
    <article className={`kpi ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function MiniRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "gold";
}) {
  return (
    <div className={`miniRow ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function prioridadeLabel(value: Prioridade): string {
  const map: Record<Prioridade, string> = {
    critico: "Crítico",
    alto: "Alto",
    medio: "Médio",
    baixo: "Baixo",
    positivo: "Positivo",
  };
  return map[value] || value;
}

function areaLabel(value: AreaIA): string {
  const map: Record<AreaIA, string> = {
    financeiro: "Financeiro",
    estoque: "Estoque",
    produto: "Produto",
    fiscal: "Fiscal",
    comercial: "Comercial",
    operacional: "Operacional",
  };
  return map[value] || value;
}
