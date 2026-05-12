"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type TipoLanc = "receita" | "despesa";
type StatusLanc = "pago" | "pendente";
type Prioridade = "critico" | "alto" | "medio" | "baixo" | "positivo";
type AreaIA = "financeiro" | "estoque" | "produto" | "fiscal" | "comercial" | "operacional";

type Produto = {
  id: string;
  nome: string;
  marca?: string;
  categoria?: string;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  updatedAt?: string;
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

function diasDesde(iso?: string): number {
  if (!iso) return 999;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function margemProduto(p: Produto) {
  const compra = toNumber(p.precoCompra);
  const venda = toNumber(p.precoVenda);
  const lucro = venda - compra;
  const margemVenda = venda > 0 ? (lucro / venda) * 100 : 0;
  const markup = compra > 0 ? (lucro / compra) * 100 : 0;
  return { compra, venda, lucro, margemVenda, markup };
}

function areaLabel(area: AreaIA): string {
  const map: Record<AreaIA, string> = {
    financeiro: "Financeiro",
    estoque: "Estoque",
    produto: "Produto",
    fiscal: "Fiscal",
    comercial: "Comercial",
    operacional: "Operacional",
  };
  return map[area];
}

function prioridadeLabel(p: Prioridade): string {
  const map: Record<Prioridade, string> = {
    critico: "Crítico",
    alto: "Alto",
    medio: "Médio",
    baixo: "Baixo",
    positivo: "Positivo",
  };
  return map[p];
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
        categoria: data.categoria ? String(data.categoria) : undefined,
        precoCompra: toNumber(data.precoCompra),
        precoVenda: toNumber(data.precoVenda),
        estoque: toNumber(data.estoque),
        reservado: toNumber(data.reservado),
        ativo: data.ativo !== false,
        updatedAt: tsToISO(data.updatedAt),
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
  const mesAtual = currentMonth();

  let receita = 0;
  let despesas = 0;
  let impostos = 0;
  let cmv = 0;
  let marketing = 0;
  let pendenteReceber = 0;
  let pendentePagar = 0;

  for (const l of lancamentos) {
    if ((l.competencia || l.data.slice(0, 7)) !== mesAtual) continue;
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
    .map((p) => ({ produto: p, ...margemProduto(p) }))
    .filter((x) => x.venda > 0 && x.margemVenda > 0 && x.margemVenda < 25)
    .sort((a, b) => a.margemVenda - b.margemVenda)
    .slice(0, 5);

  const margemNegativa = ativos
    .map((p) => ({ produto: p, ...margemProduto(p) }))
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

  if (margem < 20 && receita > 0) {
    recs.push({
      id: "margem-baixa",
      area: "financeiro",
      prioridade: "critico",
      titulo: "Margem operacional abaixo do ideal",
      descricao: `A margem do mês está em ${formatPercent(margem)}. Custos, descontos ou despesas estão pressionando o resultado.`,
      acao: "Revisar despesas, CMV, preço de venda e promoções antes de aumentar o volume.",
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
      impacto: "Reduz risco de aperto financeiro.",
      valor: pendentePagar - pendenteReceber,
    });
  }

  if (semEstoque.length > 0) {
    recs.push({
      id: "sem-estoque",
      area: "estoque",
      prioridade: "alto",
      titulo: `${semEstoque.length} produto(s) sem estoque disponível`,
      descricao: "Produtos ativos aparecem sem disponibilidade para venda.",
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
      acao: `Avaliar recompra dos itens estratégicos: ${estoqueBaixo.slice(0, 3).map((p) => p.nome).join(", ")}.`,
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
      descricao: "Alguns produtos têm margem sobre venda abaixo de 25%.",
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
      acao: "Criar campanha, combo, destaque no Instagram ou ação de giro.",
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
      descricao: `Marketing representa ${formatPercent(pesoMarketing)} da receita do mês.`,
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
      acao: "Revisar preço de venda, custo médio, descontos e compras.",
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
      acao: "Conferir classificação fiscal e validar se há imposto duplicado ou mal categorizado.",
      impacto: "Evita leitura distorcida do DRE.",
      valor: impostos,
    });
  }

  if (!recs.length) {
    recs.push({
      id: "sem-alertas",
      area: "operacional",
      prioridade: "positivo",
      titulo: "Operação sem alertas críticos",
      descricao: "Não encontrei riscos relevantes nos dados atuais.",
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
    window.setTimeout(() => setToast(""), ms);
  }

  async function carregar(showMsg = false) {
    try {
      setLoading(true);
      const [p, f] = await Promise.all([fetchProdutos(), fetchFinanceiro()]);
      setProdutos(p);
      setLancamentos(f);
      if (showMsg) showToast("🧠 IA atualizada!");
    } catch (err) {
      console.error(err);
      showToast("⚠️ Erro ao carregar dados da IA.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar(false);
  }, []);

  const contexto = useMemo(() => {
    const mesAtual = currentMonth();
    const lancMes = lancamentos.filter((l) => (l.competencia || l.data.slice(0, 7)) === mesAtual);
    const ativos = produtos.filter((p) => p.ativo !== false);

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

    const lucroMes = receitaMes - despesaMes;
    const margemMes = receitaMes > 0 ? (lucroMes / receitaMes) * 100 : 0;
    const cargaTributaria = receitaMes > 0 ? (impostoMes / receitaMes) * 100 : 0;
    const cmvPercent = receitaMes > 0 ? (cmvMes / receitaMes) * 100 : 0;

    const valorCustoEstoque = ativos.reduce((acc, p) => acc + toNumber(p.precoCompra) * toNumber(p.estoque), 0);
    const valorVendaEstoque = ativos.reduce((acc, p) => acc + toNumber(p.precoVenda) * toNumber(p.estoque), 0);
    const lucroPotencial = valorVendaEstoque - valorCustoEstoque;
    const semEstoque = ativos.filter((p) => Math.max(0, toNumber(p.estoque) - toNumber(p.reservado)) <= 0).length;

    const margemProdutoMedia = valorVendaEstoque > 0 ? (lucroPotencial / valorVendaEstoque) * 100 : 0;

    let score = 100;
    if (margemMes < 20 && receitaMes > 0) score -= 18;
    if (pendentePagar > pendenteReceber) score -= 14;
    if (semEstoque > 0) score -= Math.min(18, semEstoque * 2);
    if (cargaTributaria > 12) score -= 8;
    if (cmvPercent > 55) score -= 10;
    if (margemProdutoMedia < 25 && valorVendaEstoque > 0) score -= 12;

    return {
      receitaMes,
      despesaMes,
      lucroMes,
      margemMes,
      impostoMes,
      cargaTributaria,
      cmvMes,
      cmvPercent,
      pendenteReceber,
      pendentePagar,
      valorCustoEstoque,
      valorVendaEstoque,
      lucroPotencial,
      ativos: ativos.length,
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

  const kpis = useMemo(() => [
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
    <main className="iaPage">
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
          <button className="btn primary" onClick={() => void carregar(true)} type="button">
            Atualizar IA
          </button>
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}

      <section className="scorePanel">
        <div className="scoreText">
          <div className="sectionKicker">Diagnóstico geral</div>
          <h2>{contexto.score >= 80 ? "Operação saudável" : contexto.score >= 60 ? "Operação com pontos de atenção" : "Operação exige ação rápida"}</h2>
          <p>
            A IA avaliou margem, caixa pendente, estoque, CMV, impostos e produtos cadastrados.
            Use as recomendações abaixo como plano de ação do dia.
          </p>
        </div>

        <div className={contexto.score >= 80 ? "scoreCircle greenScore" : contexto.score >= 60 ? "scoreCircle goldScore" : "scoreCircle redScore"}>
          <strong>{contexto.score}</strong>
          <span>/100</span>
        </div>
      </section>

      <section className="kpiGrid">
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
          <h2>Capital e produtos</h2>
          <div className="miniRows">
            <MiniRow label="Valor em custo" value={formatBRL(contexto.valorCustoEstoque)} tone="gold" />
            <MiniRow label="Valor em venda" value={formatBRL(contexto.valorVendaEstoque)} tone="green" />
            <MiniRow label="Lucro potencial" value={formatBRL(contexto.lucroPotencial)} tone={contexto.lucroPotencial >= 0 ? "green" : "red"} />
            <MiniRow label="Margem potencial" value={formatPercent(contexto.margemProdutoMedia)} tone={contexto.margemProdutoMedia >= 30 ? "green" : "gold"} />
            <MiniRow label="Produtos ativos" value={String(contexto.ativos)} />
            <MiniRow label="Sem estoque" value={String(contexto.semEstoque)} tone={contexto.semEstoque > 0 ? "red" : "green"} />
          </div>
        </div>
      </section>

      <style jsx global>{`
        .iaPage { max-width:1240px; margin:0 auto; padding:14px 16px 28px; color:#f5f2ec; }
        .hero, .scorePanel, .controlPanel, .recommendations, .deepPanel {
          border:1px solid rgba(200,162,106,.18);
          background:radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012));
          border-radius:20px;
          box-shadow:0 16px 42px rgba(0,0,0,.16);
        }
        .hero { padding:16px; display:flex; justify-content:space-between; align-items:flex-end; gap:14px; flex-wrap:wrap; }
        .kicker, .sectionKicker { color:rgba(200,162,106,.95); font-size:10px; letter-spacing:.16em; text-transform:uppercase; font-weight:950; }
        h1 { margin:5px 0 0; font-size:28px; line-height:1.05; letter-spacing:-.03em; }
        h2 { margin:4px 0 0; font-size:21px; line-height:1.12; letter-spacing:-.02em; }
        p { margin:7px 0 0; opacity:.72; line-height:1.38; font-size:13px; }
        .heroActions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
        .btn { min-height:34px; display:inline-flex; align-items:center; justify-content:center; border-radius:12px; border:1px solid rgba(200,162,106,.25); background:rgba(200,162,106,.08); color:#f5f2ec; padding:0 12px; font-weight:900; cursor:pointer; }
        .btn.primary { background:linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.07)); border-color:rgba(200,162,106,.42); }
        .syncBadge { min-height:34px; display:inline-flex; align-items:center; padding:0 12px; border-radius:999px; border:1px solid rgba(88,214,141,.35); background:rgba(88,214,141,.09); color:#9ff0bc; font-size:12px; font-weight:900; }
        .syncBadge.loading { border-color:rgba(255,201,98,.35); background:rgba(255,201,98,.09); color:#f3c979; }
        .toast { position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:99; padding:10px 13px; border-radius:14px; border:1px solid rgba(200,162,106,.25); background:rgba(25,20,16,.96); font-weight:900; }
        .scorePanel { margin-top:12px; padding:15px; display:grid; grid-template-columns:minmax(0,1fr) 128px; gap:14px; align-items:center; }
        .scoreCircle { width:116px; height:116px; border-radius:999px; display:grid; place-items:center; align-content:center; border:1px solid rgba(200,162,106,.22); background:rgba(0,0,0,.22); justify-self:end; }
        .scoreCircle strong { font-size:34px; line-height:1; }
        .scoreCircle span { font-size:12px; opacity:.62; font-weight:900; }
        .greenScore strong { color:#4dff9a; } .goldScore strong { color:#f3c979; } .redScore strong { color:#ff8585; }
        .kpiGrid { margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:9px; }
        .kpiCard { min-height:78px; padding:10px; border-radius:15px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.18); display:grid; align-content:center; }
        .kpiCard span { font-size:9px; opacity:.72; text-transform:uppercase; letter-spacing:.1em; font-weight:950; }
        .kpiCard strong { margin-top:5px; font-size:17px; color:rgba(200,162,106,.98); overflow-wrap:anywhere; }
        .kpiCard small { margin-top:4px; opacity:.62; font-size:10px; }
        .kpiCard.green strong, .green { color:#4dff9a !important; } .kpiCard.red strong, .red { color:#ff8585 !important; } .kpiCard.gold strong, .gold { color:#f3c979 !important; } .kpiCard.blue strong { color:#8cc8ff !important; }
        .controlPanel { margin-top:12px; padding:13px; display:grid; grid-template-columns:180px 180px minmax(0,1fr); gap:10px; align-items:end; }
        .field { display:grid; gap:5px; min-width:0; }
        .field label { font-size:9px; letter-spacing:.13em; text-transform:uppercase; opacity:.72; font-weight:950; }
        .input { height:38px; border-radius:12px; border:1px solid rgba(255,255,255,.1); background:rgba(15,15,22,.92); color:#f5f2ec; padding:0 11px; outline:none; }
        .areaPills { display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
        .areaPill { min-height:32px; border-radius:999px; border:1px solid rgba(200,162,106,.18); background:rgba(200,162,106,.06); color:#f5f2ec; padding:0 10px; font-weight:900; cursor:pointer; }
        .areaPill.active { border-color:rgba(200,162,106,.45); background:rgba(200,162,106,.16); }
        .areaPill b { color:#f3c979; }
        .recommendations { margin-top:12px; padding:14px; }
        .sectionHead { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px; }
        .recGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:10px; }
        .recCard { position:relative; min-height:250px; border-radius:18px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.18); padding:12px; display:grid; gap:10px; align-content:start; overflow:hidden; }
        .recCard::before { content:""; position:absolute; inset:0 auto auto 0; width:4px; height:100%; background:rgba(200,162,106,.5); }
        .recCard.critico::before { background:#ff8585; } .recCard.alto::before { background:#ffb36b; } .recCard.medio::before { background:#f3c979; } .recCard.positivo::before { background:#4dff9a; }
        .recTop { display:flex; gap:6px; flex-wrap:wrap; }
        .priority, .area { min-height:22px; display:inline-flex; align-items:center; padding:0 8px; border-radius:999px; font-size:9px; font-weight:950; text-transform:uppercase; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); }
        .priority.critico { color:#ffd1d1; border-color:rgba(255,120,120,.3); background:rgba(255,120,120,.08); }
        .priority.alto, .priority.medio { color:#ffe2a8; border-color:rgba(255,201,98,.3); background:rgba(255,201,98,.08); }
        .priority.positivo { color:#bfffd5; border-color:rgba(117,255,171,.3); background:rgba(117,255,171,.08); }
        .recCard h3 { margin:0; font-size:16px; line-height:1.18; }
        .recCard p { margin:0; font-size:12px; opacity:.72; }
        .actionBox, .impact { border-radius:14px; border:1px solid rgba(200,162,106,.14); background:rgba(200,162,106,.055); padding:9px; display:grid; gap:4px; }
        .actionBox span, .impact span { font-size:9px; opacity:.65; text-transform:uppercase; letter-spacing:.1em; font-weight:950; }
        .actionBox strong, .impact b { font-size:12px; line-height:1.3; }
        .recValue { position:absolute; right:12px; bottom:12px; color:#f3c979; font-weight:950; font-size:13px; }
        .empty { min-height:120px; display:grid; place-items:center; border-radius:14px; border:1px dashed rgba(255,255,255,.14); opacity:.7; text-align:center; }
        .deepGrid { margin-top:12px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .deepPanel { padding:13px; }
        .miniRows { margin-top:10px; display:grid; gap:8px; }
        .miniRow { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:9px; border-radius:13px; border:1px solid rgba(255,255,255,.075); background:rgba(255,255,255,.025); }
        .miniRow span { font-size:12px; opacity:.72; font-weight:850; }
        .miniRow b { font-size:13px; white-space:nowrap; color:rgba(200,162,106,.98); }
        .miniRow.green b { color:#4dff9a; } .miniRow.red b { color:#ff8585; } .miniRow.gold b { color:#f3c979; }
        @media (max-width:1100px) {
          .controlPanel, .deepGrid { grid-template-columns:1fr; }
          .scorePanel { grid-template-columns:1fr; }
          .scoreCircle { justify-self:start; }
        }
        @media (max-width:680px) {
          .iaPage { padding:10px; }
          h1 { font-size:24px; }
          .hero { align-items:flex-start; }
          .heroActions { width:100%; justify-content:flex-start; }
          .btn, .syncBadge { flex:1 1 auto; }
          .kpiGrid { grid-template-columns:1fr; }
          .recGrid { grid-template-columns:1fr; }
        }
      `}</style>
    </main>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "red" | "gold" | "blue";
}) {
  return (
    <div className={`kpiCard ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
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
      <b>{value}</b>
    </div>
  );
}
