"use client";

import { useEffect, useMemo, useState } from "react";

// 🔥 Firebase (mesmo padrão do seu projeto)
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where, // ✅ NOVO (para remover financeiro do pedido)
} from "firebase/firestore";

type Origem =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "indicacao"
  | "site"
  | "outros";
type StatusLead =
  | "novo"
  | "chamou_no_whatsapp"
  | "negociacao"
  | "pagou"
  | "enviado"
  | "finalizado"
  | "perdido";

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  origem: Origem;
  valorEstimado: number;
  perfumes: string[];
  status: StatusLead;
  createdAt: string;
  updatedAt: string;
  observacoes?: string;
};

type StatusPedido =
  | "rascunho"
  | "aguardando_pagamento"
  | "pago"
  | "enviado"
  | "entregue"
  | "cancelado";

type PedidoItem = {
  // Integração com Produtos
  produtoId?: string;
  nome: string;
  qtd: number;
  preco: number; // preço unitário
};

/** ✅ OPÇÃO 2: Pagamento dividido */
type PedidoPagamentoForma =
  | "dinheiro"
  | "pix"
  | "credito"
  | "debito"
  | "boleto"
  | "transferencia"
  | "outros";

type PedidoPagamento = {
  forma: PedidoPagamentoForma;
  valor: number;
};

type TipoEntrega =
  | "entrega_maos"
  | "retirada_evento"
  | "correios"
  | "motoboy"
  | "a_combinar";

type Pedido = {
  id: string;
  /** ✅ Número sequencial (0001, 0002, ...) */
  numero?: number;
  leadId?: string;
  clienteNome: string;
  telefone: string;
  origem?: Origem;
  itens: PedidoItem[];
  desconto: number;
  frete: number;
  status: StatusPedido;

  // ✅ Alerta de pedido novo vindo do site/checkout
  statusInterno?: string;
  visualizado?: boolean;
  alertaNovoPedido?: boolean;
  visualizadoEm?: string;
  numeroPedido?: string;
  numeroSite?: string;
  formaPagamento?: string;
  statusPagamento?: string;

  // ✅ Entrega / retirada
  tipoEntrega?: TipoEntrega;
  entregaLabel?: string;
  entregaObservacao?: string;

  // ✅ NOVO: vendedor responsável pela venda
  vendedorId?: string;
  vendedorNome?: string;
  
  createdAt: string;
  updatedAt: string;
  observacoes?: string;

  // ✅ Controle de baixa/devolução de estoque
  estoqueBaixado?: boolean;

  // ✅ OPÇÃO 2: pagamentos (pix + dinheiro etc.)
  pagamentos?: PedidoPagamento[];
};

type ProdutoCategoria = "masculino" | "feminino" | "unissex";

type Produto = {
  id: string;
  nome: string;
  marca?: string;
  volumeMl?: number;
  categoria?: ProdutoCategoria;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number;
  ativo?: boolean;
  createdAt: string;
  updatedAt: string;
  observacoes?: string;
};

const LEADS_KEY = "maison_noor_crm_leads_v1";
const PRODUTOS_KEY = "maison_noor_crm_produtos_v1";

// ✅ Financeiro (receitas vindas de pedidos) — mantém também o localStorage
const FINANCEIRO_KEY = "maison_noor_crm_financeiro_v1";

// 🔁 estrutura alinhada com a tela Financeiro
type FinanceiroEntry = {
  id: string;
  data: string; // data do lançamento
  competencia: string; // AAAA-MM (mês competência)
  tipo: "receita" | "despesa";
  status: "pago" | "pendente" | "cancelado";
  descricao: string;
  categoria?: string;
  forma: string; // ex: Pix, Crédito
  valor: number;
  observacoes?: string;
  origemPedidoId?: string; // aqui vamos usar id único por parcela
  clienteNome?: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_PEDIDO_META: { v: StatusPedido; label: string }[] = [
  { v: "rascunho", label: "Rascunho" },
  { v: "aguardando_pagamento", label: "Aguardando" },
  { v: "pago", label: "Pago" },
  { v: "enviado", label: "Enviado" },
  { v: "entregue", label: "Entregue" },
  { v: "cancelado", label: "Cancelado" },
];

const ORIGEM_LABEL: Record<Origem, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  site: "Site",
  outros: "Outros",
};

const TIPO_ENTREGA_LABEL: Record<TipoEntrega, string> = {
  entrega_maos: "Entregue em mãos",
  retirada_evento: "Retirada no evento",
  correios: "Correios",
  motoboy: "Motoboy",
  a_combinar: "A combinar",
};

function entregaLabel(tipo?: TipoEntrega, fallback?: string): string {
  if (tipo && TIPO_ENTREGA_LABEL[tipo]) return TIPO_ENTREGA_LABEL[tipo];
  return fallback || "A combinar";
}

// type-guard origem
const ORIGENS_VALIDAS = [
  "instagram",
  "facebook",
  "whatsapp",
  "indicacao",
  "site",
  "outros",
] as const;
function isOrigem(v: unknown): v is Origem {
  return ORIGENS_VALIDAS.includes(v as Origem);
}
function origemLabel(v: unknown): string {
  return isOrigem(v) ? ORIGEM_LABEL[v] : ORIGEM_LABEL.outros;
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    if (!canUseStorage()) return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function hojeInputDate(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function inputDateToISO(dateStr: string): string {
  const clean = String(dateStr || "").trim();
  if (!clean) return new Date().toISOString();
  const d = new Date(`${clean}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

type PedidoPeriodoFiltro = "todos" | "hoje" | "semana" | "mes" | "30dias" | "ano" | "periodo";

function addDiasInputDate(dateStr: string, dias: number): string {
  const clean = String(dateStr || hojeInputDate()).trim();
  const d = new Date(`${clean}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function inicioDoMesInputDate(): string {
  const d = new Date();
  const local = new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
  return local.toISOString().slice(0, 10);
}

function inicioDoAnoInputDate(): string {
  const d = new Date();
  const local = new Date(d.getFullYear(), 0, 1, 12, 0, 0);
  return local.toISOString().slice(0, 10);
}

function inicioDaSemanaInputDate(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  return local.toISOString().slice(0, 10);
}

function pedidoDentroPeriodo(p: Pedido, inicio: string, fim: string): boolean {
  const base = p.createdAt || p.updatedAt;
  if (!base) return false;
  const pedidoTime = new Date(base).getTime();
  if (!Number.isFinite(pedidoTime)) return false;

  const ini = new Date(`${inicio || "1900-01-01"}T00:00:00`).getTime();
  const fimInclusivo = new Date(`${fim || "2999-12-31"}T23:59:59`).getTime();

  return pedidoTime >= ini && pedidoTime <= fimInclusivo;
}

/** ✅ Formata número do pedido como 0001, 0002... */
function formatNumeroPedido(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  return n.toString().padStart(4, "0");
}

function pedidoCodigo(p: Pedido): string {
  if (typeof p.numero === "number" && Number.isFinite(p.numero) && p.numero > 0) {
    return formatNumeroPedido(p.numero);
  }
  return String(p.numeroPedido || p.numeroSite || p.id.slice(-6) || "—");
}

function isPedidoNovoAlerta(p: Pedido): boolean {
  const pedidoDoSiteAguardando =
    p.origem === "site" &&
    p.status === "aguardando_pagamento" &&
    p.visualizado !== true;

  return (
    p.alertaNovoPedido === true ||
    p.visualizado === false ||
    p.statusInterno === "novo_pedido" ||
    pedidoDoSiteAguardando
  );
}

function horasDesdePedido(p: Pedido): number {
  const base = p.updatedAt || p.createdAt;
  if (!base) return 0;
  const time = new Date(base).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, (Date.now() - time) / (1000 * 60 * 60));
}

function isPedidoParado(p: Pedido): boolean {
  return p.status === "aguardando_pagamento" && horasDesdePedido(p) >= 24;
}

function tocarAlertaPedidoNovo(): void {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(1175, audioCtx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.32);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.34);
  } catch (_) {}
}


function calcularTotalPedido(p: Pedido): number {
  const totalDireto = Number((p as any).total || (p as any).valorTotal || (p as any).valor || 0);
  if (totalDireto > 0) return totalDireto;

  const subtotal = (p.itens || []).reduce(
    (acc, it) => acc + (Number(it.preco) || 0) * (Number(it.qtd) || 0),
    0
  );

  return Math.max(0, subtotal - (Number(p.desconto) || 0) + (Number(p.frete) || 0));
}

function statusPedidoLabel(status?: StatusPedido): string {
  return STATUS_PEDIDO_META.find((item) => item.v === status)?.label || status || "—";
}

function getTimelineSteps(status?: StatusPedido) {
  const ordem: StatusPedido[] = ["aguardando_pagamento", "pago", "enviado", "entregue"];
  const idx = status ? ordem.indexOf(status) : -1;

  if (status === "cancelado") {
    return [
      { label: "Pedido criado", done: true, current: false },
      { label: "Pagamento pendente", done: false, current: false },
      { label: "Cancelado", done: true, current: true },
    ];
  }

  return [
    { label: "Pedido criado", done: true, current: false },
    { label: "Aguardando pagamento", done: idx >= 0, current: status === "aguardando_pagamento" },
    { label: "Pagamento confirmado", done: idx >= 1, current: status === "pago" },
    { label: "Pedido enviado", done: idx >= 2, current: status === "enviado" },
    { label: "Entregue", done: idx >= 3, current: status === "entregue" },
  ];
}

/* ======================================================
   ✅ FIRESTORE (Pedidos)
   - pedidos/default/lista/{pedidoId}
   - pedidos/default/counters/pedidos_seq  (sequência)
====================================================== */

const PEDIDOS_DOC = doc(db, "pedidos", "default");
const PEDIDOS_LISTA_COL = collection(PEDIDOS_DOC, "lista");
const PEDIDOS_COUNTER_REF = doc(PEDIDOS_DOC, "counters", "pedidos_seq");

/* ======================================================
   ✅ FIRESTORE (Financeiro)
   - financeiro/default/lancamentos/{id}  ✅ atual
   - financeiro/default/lista/{id}        ✅ compat antigo
====================================================== */
const FIN_ROOT = "financeiro";
const FIN_DOC = "default";
const FIN_SUB_ATUAL = "lancamentos";
const FIN_SUB_COMPAT = "lista"; // ✅ compat antigo

const FIN_COL_ATUAL = collection(db, FIN_ROOT, FIN_DOC, FIN_SUB_ATUAL);
const FIN_COL_COMPAT = collection(db, FIN_ROOT, FIN_DOC, FIN_SUB_COMPAT);

function finDocRefAtual(id: string) {
  return doc(db, FIN_ROOT, FIN_DOC, FIN_SUB_ATUAL, id);
}
function finDocRefCompat(id: string) {
  return doc(db, FIN_ROOT, FIN_DOC, FIN_SUB_COMPAT, id);
}

/* ======================================================
   ✅ FIX: Firestore NÃO aceita undefined
====================================================== */
function cleanUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => cleanUndefinedDeep(v))
      .filter((v) => v !== undefined) as unknown as T;
  }

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      const vv = cleanUndefinedDeep(v);
      if (vv === undefined) continue;
      out[k] = vv;
    }
    return out;
  }

  return value;
}

/** ✅ Gera o próximo número sequencial do pedido (Firestore transaction) */
async function nextPedidoNumeroFS(): Promise<number> {
  const prox = await runTransaction(db, async (tx) => {
    const snap = await tx.get(PEDIDOS_COUNTER_REF);
    const atual = snap.exists() ? Number((snap.data() as any)?.value || 0) : 0;
    const next = atual + 1;
    tx.set(PEDIDOS_COUNTER_REF, { value: next }, { merge: true });
    return next;
  });
  return prox;
}

/** ✅ Busca pedidos do Firestore (ordenado por createdAt ISO) */
async function fetchPedidosFromFirestore(): Promise<Pedido[]> {
  const q = query(PEDIDOS_LISTA_COL, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as Pedido), id: d.id }));
}

/** ✅ Salva pedido no Firestore */
async function savePedidoToFirestore(p: Pedido): Promise<void> {
  const ref = doc(PEDIDOS_LISTA_COL, p.id);
  const safe = cleanUndefinedDeep(p);
  await setDoc(ref, safe as any, { merge: true });
}

/** ✅ Atualiza pedido no Firestore */
async function updatePedidoInFirestore(
  id: string,
  patch: Partial<Pedido>
): Promise<void> {
  const ref = doc(PEDIDOS_LISTA_COL, id);
  const safe = cleanUndefinedDeep(patch);
  await updateDoc(ref, safe as any);
}

/** ✅ Remove pedido no Firestore */
async function deletePedidoFromFirestore(id: string): Promise<void> {
  const ref = doc(PEDIDOS_LISTA_COL, id);
  await deleteDoc(ref);
}

// 🔗 Pedido -> Lead: sincroniza status do lead quando pedido muda
function syncLeadStatusFromPedido(pedido: Pedido): void {
  if (!pedido.leadId) return;

  const leads = loadJSON<Lead[]>(LEADS_KEY, []);
  const idx = leads.findIndex((l) => l.id === pedido.leadId);
  if (idx === -1) return;

  const statusMap: Partial<Record<StatusPedido, StatusLead>> = {
    pago: "pagou",
    enviado: "enviado",
    entregue: "finalizado",
    cancelado: "perdido",
  };

  const nextStatus = statusMap[pedido.status];
  if (!nextStatus) return;

  leads[idx] = {
    ...leads[idx],
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  saveJSON(LEADS_KEY, leads);
}

/**
 * ✅ Estoque:
 * - baixa quando status vira pago/enviado/entregue (1x)
 * - devolve quando status vira cancelado (se já baixou)
 */
function shouldBaixarEstoque(status: StatusPedido): boolean {
  return status === "pago" || status === "enviado" || status === "entregue";
}
function shouldDevolverEstoque(status: StatusPedido): boolean {
  return status === "cancelado";
}

async function resolverProdutoRefsParaEstoque(item: PedidoItem) {
  const produtoId = String(item.produtoId || "").trim();
  const nome = String(item.nome || "").trim();

  const refs: ReturnType<typeof doc>[] = [];
  const addRef = (ref: ReturnType<typeof doc>) => {
    const path = ref.path;
    if (!refs.some((r) => r.path === path)) refs.push(ref);
  };

  // ✅ Tenta pelo ID nos dois caminhos usados no projeto.
  // Isso resolve quando o pedido salva produtoId de uma coleção,
  // mas a tela Produtos está exibindo estoque da outra coleção.
  if (produtoId) {
    const refProdutos = doc(db, "produtos", "default", "lista", produtoId);
    const snapProdutos = await getDoc(refProdutos);
    if (snapProdutos.exists()) addRef(refProdutos);

    const refProducts = doc(db, "products", produtoId);
    const snapProducts = await getDoc(refProducts);
    if (snapProducts.exists()) addRef(refProducts);
  }

  // ✅ Plano B: tenta pelo nome exato nos dois caminhos.
  // Corrige pedidos antigos que ficaram sem produtoId ou com ID diferente.
  if (nome) {
    const qProdutos = query(
      collection(db, "produtos", "default", "lista"),
      where("nome", "==", nome)
    );
    const snapNomeProdutos = await getDocs(qProdutos);
    snapNomeProdutos.docs.forEach((d) => addRef(d.ref));

    const qProducts = query(collection(db, "products"), where("nome", "==", nome));
    const snapNomeProducts = await getDocs(qProducts);
    snapNomeProducts.docs.forEach((d) => addRef(d.ref));
  }

  if (!refs.length) {
    console.warn("Produto não encontrado para ajustar estoque:", { produtoId, nome });
  }

  return refs;
}

async function ajustarEstoquePorPedido(
  pedido: Pedido,
  modo: "baixar" | "devolver"
): Promise<boolean> {
  const itensValidos = (pedido.itens || []).filter(
    (it) => (it.produtoId || it.nome) && Math.max(0, Number(it.qtd) || 0) > 0
  );

  if (!itensValidos.length) return false;

  const updatedAt = new Date().toISOString();
  let algumProdutoAjustado = false;

  for (const it of itensValidos) {
    const qtd = Math.max(0, Number(it.qtd) || 0);
    if (qtd <= 0) continue;

    const produtoRefs = await resolverProdutoRefsParaEstoque(it);
    if (!produtoRefs.length) continue;

    for (const produtoRef of produtoRefs) {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(produtoRef);
        if (!snap.exists()) return;

        const data = snap.data() as Produto;
        const estoqueAtual = Math.max(0, Number(data.estoque) || 0);
        const novoEstoque =
          modo === "baixar"
            ? Math.max(0, estoqueAtual - qtd)
            : Math.max(0, estoqueAtual + qtd);

        tx.update(produtoRef, {
          estoque: novoEstoque,
          updatedAt,
        });

        algumProdutoAjustado = true;
      });
    }
  }

  // ✅ Mantém o cache local sincronizado para a tela responder rápido no mesmo navegador.
  const produtosLocal = loadJSON<Produto[]>(PRODUTOS_KEY, []);
  if (produtosLocal.length && algumProdutoAjustado) {
    const map = new Map<string, Produto>(produtosLocal.map((produto) => [produto.id, produto]));

    for (const it of itensValidos) {
      const produtoId = String(it.produtoId || "").trim();
      const nomeNormalizado = norm(it.nome || "");
      const produto =
        (produtoId ? map.get(produtoId) : undefined) ||
        Array.from(map.values()).find((p) => norm(p.nome) === nomeNormalizado);

      if (!produto) continue;

      const qtd = Math.max(0, Number(it.qtd) || 0);
      const estoqueAtual = Math.max(0, Number(produto.estoque) || 0);
      const novoEstoque =
        modo === "baixar"
          ? Math.max(0, estoqueAtual - qtd)
          : Math.max(0, estoqueAtual + qtd);

      map.set(produto.id, {
        ...produto,
        estoque: novoEstoque,
        updatedAt,
      });
    }

    saveJSON(PRODUTOS_KEY, Array.from(map.values()));
  }

  return algumProdutoAjustado;
}

// ✅ normaliza texto pra casar nome do Lead com nome do Produto
function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// helper para mês/competência (AAAA-MM)
function toCompetencia(iso: string): string {
  const v = String(iso || "");
  if (v.length >= 7) return v.slice(0, 7);
  const now = new Date().toISOString();
  return now.slice(0, 7);
}

function descricaoPedidoFinanceiro(
  id: string,
  nome?: string,
  numero?: number
): string {
  const codigo =
    typeof numero === "number" && numero > 0
      ? formatNumeroPedido(numero)
      : id.slice(-6);
  const base = `Venda • Pedido #${codigo}`;
  return nome ? `${base} • ${nome}` : base;
}

/** ✅ (opção 2) Descrição por parcela/forma */
function descricaoPedidoFinanceiroParcela(
  pedidoId: string,
  nome: string | undefined,
  numero: number | undefined,
  forma: PedidoPagamentoForma
): string {
  const base = descricaoPedidoFinanceiro(pedidoId, nome, numero);
  const label =
    forma === "pix"
      ? "Pix"
      : forma === "dinheiro"
      ? "Dinheiro"
      : forma === "credito"
      ? "Crédito"
      : forma === "debito"
      ? "Débito"
      : forma === "boleto"
      ? "Boleto"
      : forma === "transferencia"
      ? "Transferência"
      : "Outros";
  return `${base} • ${label}`;
}

/** ✅ Migra descrições antigas (localStorage) */
function migrarDescricoesFinanceiroAntigas(): void {
  const lista = loadJSON<FinanceiroEntry[]>(FINANCEIRO_KEY, []);
  if (!lista.length) return;

  let alterou = false;

  const novaLista = lista.map((l) => {
    if (!l.origemPedidoId) return l;

    const desc = String(l.descricao || "");
    const ehAntigo =
      desc.startsWith("Venda pedido") || desc.startsWith("Venda • Pedido");

    if (!ehAntigo) return l;

    const novaDesc = descricaoPedidoFinanceiro(
      l.origemPedidoId,
      l.clienteNome,
      undefined
    );
    if (novaDesc === l.descricao) return l;

    alterou = true;
    return {
      ...l,
      descricao: novaDesc,
      updatedAt: new Date().toISOString(),
    };
  });

  if (alterou) saveJSON(FINANCEIRO_KEY, novaLista);
}

/**
 * ✅ Upsert no Firestore do Financeiro
 * grava na coleção atual + coleção compat
 */
async function upsertFinanceiroFirestore(entry: FinanceiroEntry): Promise<void> {
  const safe = cleanUndefinedDeep(entry);

  // ✅ Importante: não usar Promise.allSettled aqui.
  // Se o Firestore falhar, precisamos saber no console/toast.
  await Promise.all([
    setDoc(finDocRefAtual(entry.id), safe as any, { merge: true }),
    setDoc(finDocRefCompat(entry.id), safe as any, { merge: true }),
  ]);
}

function formaPagamentoFromString(v?: string): PedidoPagamentoForma {
  const t = String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (t.includes("cred") || t.includes("cartao")) return "credito";
  if (t.includes("deb")) return "debito";
  if (t.includes("dinheiro")) return "dinheiro";
  if (t.includes("boleto")) return "boleto";
  if (t.includes("transf")) return "transferencia";
  if (t.includes("pix")) return "pix";

  return "pix";
}

function normalizarPagamentosParaTotal(
  pagamentos: PedidoPagamento[] | undefined,
  total: number,
  formaFallback: PedidoPagamentoForma = "pix"
): PedidoPagamento[] {
  const totalNum = Math.max(0, Number(total) || 0);
  if (totalNum <= 0) return [];

  const normalizados = (pagamentos || [])
    .map((p) => ({
      forma: p.forma || formaFallback,
      valor: Math.max(0, Number(p.valor) || 0),
    }))
    .filter((p) => p.valor > 0);

  const soma = normalizados.reduce((acc, p) => acc + p.valor, 0);

  // ✅ Caso comum: o usuário escolheu Crédito/Pix, mas deixou valor 0.
  // O sistema assume automaticamente o total do pedido.
  if (!normalizados.length) {
    const primeiraForma = (pagamentos || [])[0]?.forma || formaFallback;
    return [{ forma: primeiraForma, valor: totalNum }];
  }

  // ✅ Se existe apenas uma forma e o valor ficou diferente por centavos/digitação,
  // ajustamos para o total do pedido para não travar a venda.
  if (normalizados.length === 1 && Math.abs(soma - totalNum) > 0.01) {
    return [{ ...normalizados[0], valor: totalNum }];
  }

  return normalizados;
}

function pagamentosDoPedidoParaFinanceiro(pedido: Pedido, total: number): PedidoPagamento[] {
  const formaFallback = formaPagamentoFromString(pedido.formaPagamento);
  return normalizarPagamentosParaTotal(pedido.pagamentos, total, formaFallback);
}

/**
 * ✅ (Opção 2) registra 1..N lançamentos do pedido (localStorage + Firestore)
 * retorna boolean
 */
async function registrarReceitasDoPedidoMulti(
  pedidoId: string,
  clienteNome: string | undefined,
  dataISO: string,
  numero: number | undefined,
  pagamentos: PedidoPagamento[]
): Promise<boolean> {
  try {
    const listaRaw = loadJSON<unknown>(FINANCEIRO_KEY, []);
    const lista: FinanceiroEntry[] = Array.isArray(listaRaw)
      ? (listaRaw as FinanceiroEntry[])
      : [];

    const agora = new Date().toISOString();
    const competencia = toCompetencia(dataISO);

    const pags = (pagamentos || [])
      .map((p) => ({
        forma: p.forma,
        valor: Math.max(0, Number(p.valor) || 0),
      }))
      .filter((p) => p.valor > 0);

    if (!pags.length) return false;

    const novosOuAtualizados: FinanceiroEntry[] = [];

    for (let i = 0; i < pags.length; i++) {
      const origemPedidoId = `${pedidoId}__${i + 1}`;

      const formaLabel =
        pags[i].forma === "pix"
          ? "Pix"
          : pags[i].forma === "dinheiro"
          ? "Dinheiro"
          : pags[i].forma === "credito"
          ? "Crédito"
          : pags[i].forma === "debito"
          ? "Débito"
          : pags[i].forma === "boleto"
          ? "Boleto"
          : pags[i].forma === "transferencia"
          ? "Transferência"
          : "Outros";

      // ✅ ID determinístico: evita duplicar e permite recuperar lançamentos
      // que ficaram no pedido mas não entraram no Financeiro.
      const idDeterministico = `${pedidoId}__fin__${i + 1}`;
      const existenteLocal = lista.find((l) => l.origemPedidoId === origemPedidoId);

      const lanc: FinanceiroEntry = {
        id: existenteLocal?.id || idDeterministico,
        data: dataISO,
        competencia,
        tipo: "receita",
        status: "pago",
        descricao: descricaoPedidoFinanceiroParcela(
          pedidoId,
          clienteNome,
          numero,
          pags[i].forma
        ),
        categoria: "Vendas",
        forma: formaLabel,
        valor: pags[i].valor,
        observacoes: clienteNome ? `Pedido de ${clienteNome}` : undefined,
        origemPedidoId,
        clienteNome,
        createdAt: existenteLocal?.createdAt || agora,
        updatedAt: agora,
      };

      novosOuAtualizados.push(lanc);
    }

    if (!novosOuAtualizados.length) return false;

    // ✅ localStorage: atualiza se já existir, cria se não existir.
    const porOrigem = new Map<string, FinanceiroEntry>();
    for (const item of lista) {
      if (item.origemPedidoId) porOrigem.set(item.origemPedidoId, item);
    }
    for (const item of novosOuAtualizados) {
      if (item.origemPedidoId) porOrigem.set(item.origemPedidoId, item);
    }

    const semOrigem = lista.filter((item) => !item.origemPedidoId);
    const origensNovas = new Set(novosOuAtualizados.map((n) => n.origemPedidoId));
    const outrosComOrigem = Array.from(porOrigem.values()).filter(
      (item) => !origensNovas.has(item.origemPedidoId)
    );

    saveJSON(FINANCEIRO_KEY, [...novosOuAtualizados, ...semOrigem, ...outrosComOrigem]);

    // ✅ Firestore: grava sempre com merge, sem duplicar.
    await Promise.all(novosOuAtualizados.map((n) => upsertFinanceiroFirestore(n)));

    return true;
  } catch (err) {
    console.error("Erro ao registrar receitas do pedido (multi):", err);
    return false;
  }
}

async function reconciliarFinanceiroDosPedidos(pedidosLista: Pedido[]): Promise<void> {
  const elegiveis = pedidosLista.filter(
    (p) => p.status === "pago" || p.status === "enviado" || p.status === "entregue"
  );

  if (!elegiveis.length) return;

  await Promise.allSettled(
    elegiveis.map((p) => {
      const total = calcularTotalPedido(p);
      if (total <= 0) return Promise.resolve(false);

      const pags = pagamentosDoPedidoParaFinanceiro(p, total);
      if (!pags.length) return Promise.resolve(false);

      return registrarReceitasDoPedidoMulti(
        p.id,
        p.clienteNome,
        p.updatedAt || p.createdAt,
        p.numero,
        pags
      );
    })
  );
}

function firebaseCode(err: unknown): string | null {
  try {
    const anyErr = err as any;
    if (anyErr?.code) return String(anyErr.code);

    const msg = String(anyErr?.message || "");
    if (msg.includes("permission-denied")) return "permission-denied";
    if (msg.includes("Missing or insufficient permissions"))
      return "missing-or-insufficient-permissions";

    if (msg.toLowerCase().includes("unsupported field value")) {
      return "unsupported-field-value";
    }

    return null;
  } catch {
    return null;
  }
}

/* ======================================================
   ✅ NOVO: remover lançamentos do Financeiro por pedido
   - remove localStorage (origemPedidoId começa com `${pedidoId}`)
   - remove Firestore nas duas coleções (lancamentos e lista)
====================================================== */
async function removerFinanceiroDoPedido(pedidoId: string): Promise<void> {
  // 1) localStorage
  const lista = loadJSON<FinanceiroEntry[]>(FINANCEIRO_KEY, []);
  if (Array.isArray(lista) && lista.length) {
    const filtrada = lista.filter(
      (l) => !String(l.origemPedidoId || "").startsWith(pedidoId)
    );
    if (filtrada.length !== lista.length) saveJSON(FINANCEIRO_KEY, filtrada);
  }

  // 2) firestore atual
  try {
    const q1 = query(
      FIN_COL_ATUAL,
      where("origemPedidoId", ">=", pedidoId),
      where("origemPedidoId", "<=", pedidoId + "\uf8ff")
    );
    const snap1 = await getDocs(q1);
    await Promise.all(snap1.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    // não quebra o fluxo
    console.warn("Falha ao remover financeiro (lancamentos):", e);
  }

  // 3) firestore compat
  try {
    const q2 = query(
      FIN_COL_COMPAT,
      where("origemPedidoId", ">=", pedidoId),
      where("origemPedidoId", "<=", pedidoId + "\uf8ff")
    );
    const snap2 = await getDocs(q2);
    await Promise.all(snap2.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn("Falha ao remover financeiro (lista):", e);
  }
}

export default function PedidosPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [msg, setMsg] = useState("");

  const [open, setOpen] = useState(false);
  const [leadPick, setLeadPick] = useState<string>("");
  const [clienteNome, setClienteNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [origem, setOrigem] = useState<Origem>("outros");

  const [produtoPick, setProdutoPick] = useState<string>("");
  const [itemNome, setItemNome] = useState("");
  const [itemQtd, setItemQtd] = useState(1);
  const [itemPreco, setItemPreco] = useState(0);

  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [frete, setFrete] = useState(0);
  const [status, setStatus] = useState<StatusPedido>("rascunho");
  const [observacoes, setObservacoes] = useState("");
  const [dataPedido, setDataPedido] = useState(hojeInputDate());
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("entrega_maos");
  const [entregaObservacao, setEntregaObservacao] = useState("");

  // ✅ OPÇÃO 2: pagamentos no modal (dividido)
  const [pagamentos, setPagamentos] = useState<PedidoPagamento[]>([
    { forma: "pix", valor: 0 },
  ]);

  const [statusFiltro, setStatusFiltro] = useState<StatusPedido | "todos">(
    "todos"
  );
  const [q, setQ] = useState("");

  const [periodoFiltro, setPeriodoFiltro] = useState<PedidoPeriodoFiltro>("todos");
  const [dataInicioFiltro, setDataInicioFiltro] = useState(inicioDoMesInputDate());
  const [dataFimFiltro, setDataFimFiltro] = useState(hojeInputDate());

  // ✅ NOVO: edição de pedido
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string>("");
  const [editClienteNome, setEditClienteNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editOrigem, setEditOrigem] = useState<Origem>("outros");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editTipoEntrega, setEditTipoEntrega] = useState<TipoEntrega>("a_combinar");
  const [editEntregaObservacao, setEditEntregaObservacao] = useState("");
  const [pedidoDetalhe, setPedidoDetalhe] = useState<Pedido | null>(null);
  const [realtimeOn, setRealtimeOn] = useState(false);

  function toast(t: string, ms = 1600): void {
    setMsg(t);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setMsg(""), ms);
    }
  }

  function aplicarPeriodoFiltro(tipo: PedidoPeriodoFiltro): void {
    const hoje = hojeInputDate();
    setPeriodoFiltro(tipo);

    if (tipo === "todos") {
      setDataInicioFiltro("");
      setDataFimFiltro("");
      return;
    }

    if (tipo === "hoje") {
      setDataInicioFiltro(hoje);
      setDataFimFiltro(hoje);
      return;
    }

    if (tipo === "semana") {
      setDataInicioFiltro(inicioDaSemanaInputDate());
      setDataFimFiltro(hoje);
      return;
    }

    if (tipo === "mes") {
      setDataInicioFiltro(inicioDoMesInputDate());
      setDataFimFiltro(hoje);
      return;
    }

    if (tipo === "30dias") {
      setDataInicioFiltro(addDiasInputDate(hoje, -30));
      setDataFimFiltro(hoje);
      return;
    }

    if (tipo === "ano") {
      setDataInicioFiltro(inicioDoAnoInputDate());
      setDataFimFiltro(hoje);
    }
  }

  useEffect(() => {
    setLeads(loadJSON<Lead[]>(LEADS_KEY, []));
    setProdutos(loadJSON<Produto[]>(PRODUTOS_KEY, []));

    migrarDescricoesFinanceiroAntigas();

    const qPedidos = query(PEDIDOS_LISTA_COL, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      qPedidos,
      (snap) => {
        const lista = snap.docs.map((d) => ({ ...(d.data() as Pedido), id: d.id }));

        setPedidos((prev) => {
          const totalAnterior = prev.length;

          if (totalAnterior > 0 && lista.length > totalAnterior) {
            toast("🔔 Novo pedido recebido no CRM!", 3200);
            tocarAlertaPedidoNovo();
          }

          return lista;
        });

        setRealtimeOn(true);

        // ✅ Reconciliação automática: se um pedido pago existir, mas o Financeiro
        // não recebeu o lançamento, recria sem duplicar.
        void reconciliarFinanceiroDosPedidos(lista);
      },
      (err) => {
        console.error("Erro no tempo real de pedidos:", err);
        const code = firebaseCode(err);
        toast(
          code
            ? `⚠️ Firebase: ${code} (tempo real)`
            : "⚠️ Não consegui manter pedidos em tempo real. Veja o console (F12).",
          3400
        );
        setRealtimeOn(false);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ======================================================
     ✅ FIX CRÍTICO: REMOVIDO o useEffect que varria pedidos pagos
     e re-registrava financeiro toda vez que "pedidos" mudava.
     Isso era a causa mais comum de duplicação.
  ====================================================== */
  // ❌ removido

  async function refresh(): Promise<void> {
    setLeads(loadJSON<Lead[]>(LEADS_KEY, []));
    setProdutos(loadJSON<Produto[]>(PRODUTOS_KEY, []));

    try {
      const lista = await fetchPedidosFromFirestore();
      setPedidos(lista);
      toast(realtimeOn ? "🔄 Sincronizado em tempo real!" : "🔄 Atualizado!");
    } catch (err) {
      console.error("Erro ao atualizar pedidos:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (atualizar)`
          : "⚠️ Erro ao atualizar pedidos do Firebase (F12).",
        2600
      );
    }
  }

  function openWhatsApp(tel: string, nome?: string): void {
    const digits = onlyDigits(tel);
    const number =
      digits.length >= 12 && digits.startsWith("55")
        ? digits
        : digits.length >= 10
        ? `55${digits}`
        : digits;

    const text = nome ? `Olá ${nome}! Tudo bem?` : "Olá! Tudo bem?";
    const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    if (typeof window !== "undefined") {
      window.open(url, "_blank");
    }
  }

  function goLead(id: string): void {
    if (typeof window === "undefined") return;
    window.location.href = `/crm/leads?focus=${encodeURIComponent(id)}`;
  }

  function goProdutos(): void {
    if (typeof window === "undefined") return;
    window.location.href = `/crm/produtos`;
  }

  // ✅ abre o PDF do pedido (rota /api/pedidos/pdf)
  function openPedidoPDF(p: Pedido): void {
    if (typeof window === "undefined") return;
    const url = `/api/pedidos/pdf?id=${encodeURIComponent(p.id)}`;
    window.open(url, "_blank");
  }

  function startNewPedido(): void {
    setLeadPick("");
    setClienteNome("");
    setTelefone("");
    setOrigem("outros");

    setProdutoPick("");
    setItens([]);
    setItemNome("");
    setItemQtd(1);
    setItemPreco(0);

    setDesconto(0);
    setFrete(0);
    setStatus("rascunho");
    setObservacoes("");
    setDataPedido(hojeInputDate());
    setTipoEntrega("entrega_maos");
    setEntregaObservacao("");

    // ✅ pagamento default
    setPagamentos([{ forma: "pix", valor: 0 }]);

    setOpen(true);
  }

  function mapLeadPerfumesToItens(leadPerfumes: string[]): PedidoItem[] {
    const prodsAtivos = (produtos || []).filter((p) => p.ativo !== false);
    const byName = new Map<string, Produto>();
    for (const p of prodsAtivos) byName.set(norm(p.nome), p);

    return (leadPerfumes || [])
      .map((p) => String(p).trim())
      .filter(Boolean)
      .map((nomePerfume) => {
        const exact = byName.get(norm(nomePerfume));
        if (exact) {
          return {
            produtoId: exact.id,
            nome: exact.nome,
            qtd: 1,
            preco: Number(exact.precoVenda || 0),
          };
        }
        return { nome: nomePerfume, qtd: 1, preco: 0 };
      });
  }

  function onPickLead(leadId: string): void {
    setLeadPick(leadId);
    const l = leads.find((x) => x.id === leadId);
    if (!l) return;

    setClienteNome(l.nome || "");
    setTelefone(l.telefone || "");
    setOrigem(l.origem || "outros");

    const mapped = mapLeadPerfumesToItens(l.perfumes || []);
    setItens(mapped);

    setProdutoPick("");
    setItemNome("");
    setItemQtd(1);
    setItemPreco(0);
  }

  function onPickProduto(produtoId: string): void {
    setProdutoPick(produtoId);
    const p = produtos.find((x) => x.id === produtoId);
    if (!p) return;

    if (typeof p.estoque === "number" && p.estoque <= 0) {
      toast("⚠️ Esse produto está com estoque 0.", 1800);
    }

    setItemNome(p.nome || "");
    setItemPreco(Number(p.precoVenda || 0));
    setItemQtd(1);
  }

  function addItem(): void {
    const nome = String(itemNome).trim();
    if (!nome) {
      toast("⚠️ Informe o nome do item/perfume.", 1600);
      return;
    }
    const qtd = Math.max(1, Number(itemQtd) || 1);
    const preco = Math.max(0, Number(itemPreco) || 0);

    const produtoId = produtoPick || undefined;
    setItens((prev) => [...prev, { produtoId, nome, qtd, preco }]);

    setProdutoPick("");
    setItemNome("");
    setItemQtd(1);
    setItemPreco(0);
  }

  function removeItem(idx: number): void {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<PedidoItem>): void {
    setItens((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  }

  const totals = useMemo(() => {
    const subtotal = itens.reduce(
      (acc, it) => acc + (Number(it.preco) || 0) * (Number(it.qtd) || 0),
      0
    );
    const desc = Math.max(0, Number(desconto) || 0);
    const fr = Math.max(0, Number(frete) || 0);
    const total = Math.max(0, subtotal - desc + fr);
    return { subtotal, total };
  }, [itens, desconto, frete]);

  // ✅ soma pagamentos
  const totalPagamentos = useMemo(() => {
    return (pagamentos || []).reduce(
      (acc, p) => acc + (Number(p.valor) || 0),
      0
    );
  }, [pagamentos]);

  function validatePedido(): string {
    if (!clienteNome.trim()) return "Informe o nome do cliente.";
    if (onlyDigits(telefone).length < 10)
      return "Informe um telefone válido (com DDD).";
    if (!itens.length) return "Adicione pelo menos 1 item.";

    // ✅ se status for pago, o sistema normaliza o pagamento automaticamente.
    // Ex.: forma escolhida "Crédito" com valor 0 vira Crédito no valor total do pedido.
    if (status === "pago") {
      const pags = normalizarPagamentosParaTotal(
        pagamentos,
        totals.total,
        pagamentos?.[0]?.forma || "pix"
      );

      const soma = pags.reduce((acc, p) => acc + p.valor, 0);
      const diff = Math.abs((totals.total || 0) - soma);

      if (totals.total > 0 && diff > 0.01) {
        return `Pagamentos não batem com o total. Total: ${formatBRL(
          totals.total
        )} | Pagamentos: ${formatBRL(soma)}`;
      }
    }

    return "";
  }

  // ✅ pagamentos UI helpers
  function addPagamento(): void {
    setPagamentos((prev) => [
      ...(prev || []),
      { forma: "dinheiro", valor: 0 },
    ]);
  }
  function removePagamento(idx: number): void {
    setPagamentos((prev) => (prev || []).filter((_, i) => i !== idx));
  }
  function updatePagamento(idx: number, patch: Partial<PedidoPagamento>): void {
    setPagamentos((prev) =>
      (prev || []).map((p, i) => (i === idx ? { ...p, ...patch } : p))
    );
  }

  async function savePedido(): Promise<void> {
    try {
      const err = validatePedido();
      if (err) {
        toast(`⚠️ ${err}`, 2600);
        return;
      }

      const now = inputDateToISO(dataPedido);
      const updatedNow = new Date().toISOString();
      const itensNormalizados = itens.map((x) => ({
        produtoId: x.produtoId,
        nome: String(x.nome).trim(),
        qtd: Math.max(1, Number(x.qtd) || 1),
        preco: Math.max(0, Number(x.preco) || 0),
      }));

      const descontoNum = Math.max(0, Number(desconto) || 0);
      const freteNum = Math.max(0, Number(frete) || 0);

      const subtotal = itensNormalizados.reduce(
        (acc, it) => acc + (Number(it.preco) || 0) * (Number(it.qtd) || 0),
        0
      );
      const total = Math.max(0, subtotal - descontoNum + freteNum);

      const pedidoId = uid();
      const numeroPedido = await nextPedidoNumeroFS();

      const pags: PedidoPagamento[] =
        status === "pago"
          ? normalizarPagamentosParaTotal(
              pagamentos,
              total,
              pagamentos?.[0]?.forma || "pix"
            )
          : [];

      const p: Pedido = {
        id: pedidoId,
        numero: numeroPedido,
        leadId: leadPick || undefined,
        clienteNome: clienteNome.trim(),
        telefone: telefone.trim(),
        origem,
        itens: itensNormalizados,
        desconto: descontoNum,
        frete: freteNum,
        status,
        statusInterno: "pedido_manual",
        visualizado: true,
        alertaNovoPedido: false,
        createdAt: now,
        updatedAt: updatedNow,
        observacoes: observacoes.trim() || undefined,
        tipoEntrega,
        entregaLabel: entregaLabel(tipoEntrega),
        entregaObservacao: entregaObservacao.trim() || undefined,
        estoqueBaixado: false,
        pagamentos: pags.length ? pags : undefined,
      };

      if (shouldBaixarEstoque(p.status)) {
        const estoqueOk = await ajustarEstoquePorPedido(p, "baixar");
        p.estoqueBaixado = estoqueOk;

        if (!estoqueOk) {
          toast(
            "⚠️ Pedido pago, mas não encontrei o produto para baixar estoque. Confira o vínculo do item.",
            3400
          );
        }
      }

      // ✅ FINANCEIRO (opção 2)
      if (p.status === "pago" && total > 0) {
        const pagsFinal: PedidoPagamento[] = pagamentosDoPedidoParaFinanceiro(p, total);

        const okFin = await registrarReceitasDoPedidoMulti(
          p.id,
          p.clienteNome,
          p.createdAt,
          p.numero,
          pagsFinal
        );

        if (!okFin) {
          toast(
            "⚠️ Pedido salvo, mas não consegui registrar no Financeiro (ver console F12).",
            3200
          );
        }
      }

      await savePedidoToFirestore(p);

      setPedidos((prev) => [p, ...prev]);

      syncLeadStatusFromPedido(p);
      setLeads(loadJSON<Lead[]>(LEADS_KEY, []));

      setProdutos(loadJSON<Produto[]>(PRODUTOS_KEY, []));

      toast("✅ Pedido salvo!", 1800);
      setOpen(false);
    } catch (err) {
      console.error("Erro ao salvar pedido:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (salvar pedido)`
          : "⚠️ Não consegui salvar o pedido. Veja o console (F12).",
        3400
      );
    }
  }

  async function updatePedidoStatus(id: string, st: StatusPedido): Promise<void> {
    try {
      const pedidoAtual = pedidos.find((p) => p.id === id);
      if (!pedidoAtual) return;

      const updatedAt = new Date().toISOString();
      const prevStatus = pedidoAtual.status;
      let estoqueBaixadoFinal = Boolean(pedidoAtual.estoqueBaixado);

      const updated: Pedido = {
        ...pedidoAtual,
        status: st,
        updatedAt,
        visualizado: true,
        alertaNovoPedido: false,
        statusInterno: st === "pago" ? "pagamento_confirmado" : "status_atualizado",
        visualizadoEm: pedidoAtual.visualizadoEm || updatedAt,
      };

      if (shouldBaixarEstoque(updated.status) && !estoqueBaixadoFinal) {
        const estoqueOk = await ajustarEstoquePorPedido(updated, "baixar");
        estoqueBaixadoFinal = estoqueOk;

        if (!estoqueOk) {
          toast(
            "⚠️ Status atualizado, mas não encontrei o produto para baixar estoque. Confira o vínculo do item.",
            3600
          );
        }
      }

      if (shouldDevolverEstoque(updated.status) && estoqueBaixadoFinal) {
        const estoqueOk = await ajustarEstoquePorPedido(updated, "devolver");
        estoqueBaixadoFinal = estoqueOk ? false : estoqueBaixadoFinal;
      }

      updated.estoqueBaixado = estoqueBaixadoFinal;

      syncLeadStatusFromPedido(updated);

      // ✅ FINANCEIRO: regra clara (sem duplicar)
      // - se virou pago => registra (idempotente no localStorage por origemPedidoId)
      // - se saiu de pago => remove todos lançamentos desse pedido
      if (st === "pago") {
        const subtotal = (updated.itens || []).reduce(
          (a, it) => a + (Number(it.preco) || 0) * (Number(it.qtd) || 0),
          0
        );
        const total = Math.max(
          0,
          subtotal -
            (Number(updated.desconto) || 0) +
            (Number(updated.frete) || 0)
        );

        if (total > 0) {
          const pags: PedidoPagamento[] = pagamentosDoPedidoParaFinanceiro(updated, total);

          updated.pagamentos = pags;

          void registrarReceitasDoPedidoMulti(
            updated.id,
            updated.clienteNome,
            updated.updatedAt,
            updated.numero,
            pags
          );
        }
      } else if (prevStatus === "pago") {
        void removerFinanceiroDoPedido(updated.id);
      }

      setPedidos((prev) => prev.map((p) => (p.id === id ? updated : p)));

      await updatePedidoInFirestore(id, {
        status: st,
        updatedAt,
        estoqueBaixado: updated.estoqueBaixado,
        pagamentos: updated.pagamentos,
        visualizado: true,
        alertaNovoPedido: false,
        statusInterno: st === "pago" ? "pagamento_confirmado" : "status_atualizado",
        visualizadoEm: updated.visualizadoEm || updatedAt,
      });

      setLeads(loadJSON<Lead[]>(LEADS_KEY, []));
      setProdutos(loadJSON<Produto[]>(PRODUTOS_KEY, []));

      toast("✅ Status atualizado!", 1400);
    } catch (err) {
      console.error("Erro ao atualizar status no Firestore:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (atualizar status)`
          : "⚠️ Não consegui atualizar o status (Firebase). Veja o console (F12).",
        3200
      );
    }
  }

  async function reprocessarEstoquePedido(pedidoId: string): Promise<void> {
    try {
      const pedido = pedidos.find((p) => p.id === pedidoId);
      if (!pedido) return;

      if (!shouldBaixarEstoque(pedido.status)) {
        toast("⚠️ Só é possível baixar estoque de pedido pago, enviado ou entregue.", 2600);
        return;
      }

      const okConfirm =
        typeof window === "undefined"
          ? true
          : window.confirm(
              "Reprocessar a baixa de estoque deste pedido? Use isso apenas quando o pedido aparece como baixado, mas o estoque real não caiu."
            );

      if (!okConfirm) return;

      const estoqueOk = await ajustarEstoquePorPedido(pedido, "baixar");
      if (!estoqueOk) {
        toast("⚠️ Não encontrei produto correspondente para baixar estoque.", 3200);
        return;
      }

      const updatedAt = new Date().toISOString();
      const patch: Partial<Pedido> = { estoqueBaixado: true, updatedAt };

      await updatePedidoInFirestore(pedido.id, patch);
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, ...patch } : p)));
      setProdutos(loadJSON<Produto[]>(PRODUTOS_KEY, []));
      toast("✅ Estoque reprocessado com sucesso!", 1800);
    } catch (err) {
      console.error("Erro ao reprocessar estoque:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (reprocessar estoque)`
          : "⚠️ Não consegui reprocessar o estoque. Veja o console (F12).",
        3400
      );
    }
  }

  async function marcarPedidoComoVisualizado(id: string, showToast = true): Promise<void> {
    try {
      const visualizadoEm = new Date().toISOString();
      const patch: Partial<Pedido> = {
        visualizado: true,
        alertaNovoPedido: false,
        statusInterno: "visualizado",
        visualizadoEm,
      };

      await updatePedidoInFirestore(id, patch);

      setPedidos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );

      if (showToast) toast("🔔 Pedido marcado como visto!", 1400);
    } catch (err) {
      console.error("Erro ao marcar pedido como visualizado:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (visualizar pedido)`
          : "⚠️ Não consegui marcar o pedido como visto.",
        2600
      );
    }
  }

  async function marcarTodosPedidosComoVisualizados(): Promise<void> {
    const novos = pedidos.filter(isPedidoNovoAlerta);
    if (!novos.length) return;

    const visualizadoEm = new Date().toISOString();
    const patch: Partial<Pedido> = {
      visualizado: true,
      alertaNovoPedido: false,
      statusInterno: "visualizado",
      visualizadoEm,
    };

    try {
      await Promise.all(novos.map((p) => updatePedidoInFirestore(p.id, patch)));
      setPedidos((prev) =>
        prev.map((p) => (isPedidoNovoAlerta(p) ? { ...p, ...patch } : p))
      );
      toast("✅ Todos os novos pedidos foram marcados como vistos!", 1800);
    } catch (err) {
      console.error("Erro ao marcar todos como visualizados:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (visualizar todos)`
          : "⚠️ Não consegui marcar todos como vistos.",
        3200
      );
    }
  }

  function canDeletePedido(p: Pedido): boolean {
    return p.status === "rascunho" || p.status === "aguardando_pagamento";
  }

  async function deletePedido(id: string): Promise<void> {
    const p = pedidos.find((x) => x.id === id);
    if (!p) return;

    if (!canDeletePedido(p)) {
      toast("⚠️ Só pode remover pedido em Rascunho ou Aguardando.", 2400);
      return;
    }

    if (typeof window !== "undefined") {
      const ok = window.confirm("Remover este pedido?");
      if (!ok) return;
    }

    if (p.estoqueBaixado) {
      await ajustarEstoquePorPedido(p, "devolver");
    }

    // ✅ opcional: se deletar pedido, também remove financeiro relacionado (se houver)
    // (mesmo estando em rascunho/aguardando, pode ter virado pago e depois voltou)
    void removerFinanceiroDoPedido(p.id);

    try {
      await deletePedidoFromFirestore(id);

      const next = pedidos.filter((x) => x.id !== id);
      setPedidos(next);

      setProdutos(loadJSON<Produto[]>(PRODUTOS_KEY, []));

      toast("🗑️ Pedido removido!", 1400);
    } catch (err) {
      console.error("Erro ao remover pedido do Firestore:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (remover pedido)`
          : "⚠️ Não consegui remover (Firebase). Veja o console (F12).",
        3200
      );
    }
  }

  // ✅ abrir edição do pedido
  function openEditPedido(p: Pedido): void {
    if (isPedidoNovoAlerta(p)) {
      void marcarPedidoComoVisualizado(p.id, false);
    }

    setEditId(p.id);
    setEditClienteNome(p.clienteNome || "");
    setEditTelefone(p.telefone || "");
    setEditOrigem((p.origem || "outros") as Origem);
    setEditObservacoes(p.observacoes || "");
    setEditTipoEntrega((p.tipoEntrega || "a_combinar") as TipoEntrega);
    setEditEntregaObservacao(p.entregaObservacao || "");
    setEditOpen(true);
  }

  function validateEditPedido(): string {
    if (!editClienteNome.trim()) return "Informe o nome do cliente.";
    if (onlyDigits(editTelefone).length < 10)
      return "Informe um telefone válido (com DDD).";
    return "";
  }

  async function saveEditPedido(): Promise<void> {
    try {
      const err = validateEditPedido();
      if (err) {
        toast(`⚠️ ${err}`, 2400);
        return;
      }

      const updatedAt = new Date().toISOString();

      const patch: Partial<Pedido> = {
        clienteNome: editClienteNome.trim(),
        telefone: editTelefone.trim(),
        origem: editOrigem,
        observacoes: editObservacoes.trim() || undefined,
        tipoEntrega: editTipoEntrega,
        entregaLabel: entregaLabel(editTipoEntrega),
        entregaObservacao: editEntregaObservacao.trim() || undefined,
        updatedAt,
      };

      await updatePedidoInFirestore(editId, patch);

      setPedidos((prev) =>
        prev.map((p) => (p.id === editId ? { ...p, ...patch } : p))
      );

      toast("✅ Pedido atualizado!", 1400);
      setEditOpen(false);
    } catch (err) {
      console.error("Erro ao editar pedido:", err);
      const code = firebaseCode(err);
      toast(
        code
          ? `⚠️ Firebase: ${code} (editar pedido)`
          : "⚠️ Não consegui editar o pedido (Firebase). Veja o console (F12).",
        3200
      );
    }
  }

  const pedidosFiltrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (statusFiltro !== "todos" && p.status !== statusFiltro) return false;
      if (periodoFiltro !== "todos" && !pedidoDentroPeriodo(p, dataInicioFiltro, dataFimFiltro)) return false;
      if (!qq) return true;
      const text = `${pedidoCodigo(p)} ${p.numeroPedido || ""} ${p.numeroSite || ""} ${p.clienteNome} ${p.telefone} ${(p.itens || [])
        .map((i) => i.nome)
        .join(" ")} ${p.status}`.toLowerCase();
      return text.includes(qq);
    });
  }, [pedidos, statusFiltro, q, periodoFiltro, dataInicioFiltro, dataFimFiltro]);

  const resumo = useMemo(() => {
    const total = pedidosFiltrados.reduce((acc, p) => {
      const subtotal = (p.itens || []).reduce(
        (a, it) => a + (Number(it.preco) || 0) * (Number(it.qtd) || 0),
        0
      );
      const t = Math.max(
        0,
        subtotal - (Number(p.desconto) || 0) + (Number(p.frete) || 0)
      );
      return acc + t;
    }, 0);

    const faturado = pedidosFiltrados
      .filter((p) => p.status === "pago" || p.status === "enviado" || p.status === "entregue")
      .reduce((acc, p) => {
        const subtotal = (p.itens || []).reduce(
          (a, it) => a + (Number(it.preco) || 0) * (Number(it.qtd) || 0),
          0
        );
        const t = Math.max(
          0,
          subtotal - (Number(p.desconto) || 0) + (Number(p.frete) || 0)
        );
        return acc + t;
      }, 0);

    return {
      total,
      faturado,
      aguardando: pedidosFiltrados.filter((p) => p.status === "aguardando_pagamento").length,
      pagos: pedidosFiltrados.filter((p) => p.status === "pago").length,
      enviados: pedidosFiltrados.filter((p) => p.status === "enviado").length,
      entregues: pedidosFiltrados.filter((p) => p.status === "entregue").length,
      cancelados: pedidosFiltrados.filter((p) => p.status === "cancelado").length,
      parados: pedidosFiltrados.filter(isPedidoParado).length,
    };
  }, [pedidosFiltrados]);

  const novosPedidos = useMemo(() => pedidos.filter(isPedidoNovoAlerta), [pedidos]);
  const pedidosParados = useMemo(() => pedidos.filter(isPedidoParado), [pedidos]);

  const produtosAtivos = useMemo(() => {
    return (produtos || [])
      .filter((p) => p.ativo !== false)
      .slice()
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  }, [produtos]);

  const pedidoDetalheAtual = useMemo(() => {
    if (!pedidoDetalhe) return null;
    return pedidos.find((p) => p.id === pedidoDetalhe.id) || pedidoDetalhe;
  }, [pedidoDetalhe, pedidos]);

  return (
    <main className="page">
      <header className="head">
        <div>
          <div className="kicker">Maison Noor</div>
          <h1 className="title">CRM • Pedidos</h1>
          <p className="sub">
            Acompanhe pedidos do site, pagamentos, alertas, estoque e financeiro em uma visão mais limpa e premium.
          </p>
        </div>

        <div className="headRight">
          <div className="filterBox">
            <label>Status</label>
            <select
              value={statusFiltro}
              onChange={(e) =>
                setStatusFiltro(e.target.value as StatusPedido | "todos")
              }
              className="selectSmall"
            >
              <option value="todos">Todos</option>
              {STATUS_PEDIDO_META.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filterBox">
            <label>Busca</label>
            <input
              className="inputSmall"
              placeholder="Cliente, telefone, perfume..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <span className={realtimeOn ? "realtimeBadge on" : "realtimeBadge"}>
            {realtimeOn ? "● Tempo real ativo" : "● Tempo real off"}
          </span>

          <button className="btn" onClick={() => void refresh()} type="button">
            🔄 Atualizar
          </button>
          <button className="btnPrimary" onClick={startNewPedido} type="button">
            + Criar pedido
          </button>
        </div>
      </header>

      <section className="dateFilterBar" aria-label="Filtro de data dos pedidos">
        <div className="dateQuickActions">
          {[
            { key: "hoje", label: "Hoje" },
            { key: "semana", label: "Semana" },
            { key: "mes", label: "Este mês" },
            { key: "30dias", label: "30 dias" },
            { key: "ano", label: "Ano" },
            { key: "todos", label: "Tudo" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={periodoFiltro === item.key ? "dateChip active" : "dateChip"}
              onClick={() => aplicarPeriodoFiltro(item.key as PedidoPeriodoFiltro)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="dateRangeFields">
          <div className="dateField">
            <label>Início</label>
            <input
              type="date"
              value={dataInicioFiltro}
              onChange={(e) => {
                setPeriodoFiltro("periodo");
                setDataInicioFiltro(e.target.value);
              }}
            />
          </div>

          <div className="dateField">
            <label>Fim</label>
            <input
              type="date"
              value={dataFimFiltro}
              onChange={(e) => {
                setPeriodoFiltro("periodo");
                setDataFimFiltro(e.target.value);
              }}
            />
          </div>
        </div>
      </section>

      {msg ? <div className="toast">{msg}</div> : null}

      {!produtosAtivos.length ? (
        <div className="warn">
          ⚠️ Você ainda não tem produtos cadastrados. Cadastre em{" "}
          <strong>Produtos</strong> para puxar preço e baixar estoque.
          <button
            className="btnSmall"
            onClick={goProdutos}
            type="button"
            style={{ marginLeft: 10 }}
          >
            Ir para Produtos
          </button>
        </div>
      ) : null}

      {novosPedidos.length ? (
        <div className="novoPedidoAlert">
          <div>
            <strong>🔔 {novosPedidos.length} novo(s) pedido(s) no CRM</strong>
            <span>Pedido vindo do checkout/site aguardando visualização.</span>
          </div>
          <button
            className="btnSmall"
            type="button"
            onClick={() => void marcarTodosPedidosComoVisualizados()}
          >
            Marcar todos como vistos
          </button>
        </div>
      ) : null}

      {pedidosParados.length ? (
        <div className="slaAlert">
          <div>
            <strong>⏱️ {pedidosParados.length} pedido(s) aguardando há mais de 24h</strong>
            <span>Priorize contato, confirmação de pagamento ou cancelamento para manter o CRM limpo.</span>
          </div>
          <button
            className="btnSmall"
            type="button"
            onClick={() => setStatusFiltro("aguardando_pagamento")}
          >
            Ver pendentes
          </button>
        </div>
      ) : null}

      <section className="stats">
        <button
          type="button"
          className={novosPedidos.length ? "stat statAlert statButton" : "stat statButton"}
          onClick={() => setStatusFiltro("aguardando_pagamento")}
          title="Filtrar pedidos aguardando pagamento"
        >
          <div className="statIcon">🔔</div>
          <div>
            <div className="statLabel">Novos pedidos</div>
            <div className="statValue">{novosPedidos.length}</div>
            <div className="statHint">Aguardando visualização</div>
          </div>
        </button>

        <button
          type="button"
          className={statusFiltro === "aguardando_pagamento" ? "stat statButton statActive" : "stat statButton"}
          onClick={() => setStatusFiltro("aguardando_pagamento")}
        >
          <div className="statIcon">⏳</div>
          <div>
            <div className="statLabel">Aguardando</div>
            <div className="statValue">{resumo.aguardando}</div>
            <div className="statHint">Pix/atendimento pendente</div>
          </div>
        </button>

        <button
          type="button"
          className={pedidosParados.length ? "stat statButton statSla" : "stat statButton"}
          onClick={() => setStatusFiltro("aguardando_pagamento")}
          title="Pedidos aguardando há mais de 24 horas"
        >
          <div className="statIcon">⏱️</div>
          <div>
            <div className="statLabel">Parados 24h+</div>
            <div className="statValue">{pedidosParados.length}</div>
            <div className="statHint">Prioridade de follow-up</div>
          </div>
        </button>

        <button
          type="button"
          className={statusFiltro === "pago" ? "stat statButton statActive" : "stat statButton"}
          onClick={() => setStatusFiltro("pago")}
        >
          <div className="statIcon">✅</div>
          <div>
            <div className="statLabel">Pagos</div>
            <div className="statValue">{resumo.pagos}</div>
            <div className="statHint">Confirmados no filtro</div>
          </div>
        </button>

        <button
          type="button"
          className="stat statButton"
          onClick={() => setStatusFiltro("todos")}
          title="Ver todos os pedidos"
        >
          <div className="statIcon">💰</div>
          <div>
            <div className="statLabel">Faturado</div>
            <div className="statValue">{formatBRL(resumo.faturado)}</div>
            <div className="statHint">Pago, enviado ou entregue</div>
          </div>
        </button>

        <button
          type="button"
          className={statusFiltro === "todos" ? "stat statButton statActive" : "stat statButton"}
          onClick={() => setStatusFiltro("todos")}
        >
          <div className="statIcon">🧾</div>
          <div>
            <div className="statLabel">Total no filtro</div>
            <div className="statValue">{formatBRL(resumo.total)}</div>
            <div className="statHint">Todos os status filtrados</div>
          </div>
        </button>
      </section>

      <section className="ordersShell">
        <div className="ordersPanelHead">
          <div>
            <div className="cardTitle">Pedidos salvos</div>
            <h2 className="ordersTitle">Central de pedidos</h2>
            <p className="ordersSub">
              Visual ultra moderna para acompanhar status, pagamento, cliente, itens e ações rápidas.
            </p>
          </div>
          <div className="ordersPanelActions">
            <span className="miniMetric">{pedidosFiltrados.length} pedido(s)</span>
            <span className="miniMetric gold">{formatBRL(resumo.total)}</span>
          </div>
        </div>

        {pedidosFiltrados.length ? (
          <div className="ordersGrid">
            {pedidosFiltrados.map((p) => {
              const total = calcularTotalPedido(p);
              const podeExcluir = canDeletePedido(p);
              const novo = isPedidoNovoAlerta(p);
              const statusLabel = statusPedidoLabel(p.status);
              const primeiraLetra =
                String(p.clienteNome || "C").trim().slice(0, 1).toUpperCase() || "C";

              return (
                <article
                  key={p.id}
                  className={novo ? "orderCard orderCardNew" : "orderCard"}
                  onClick={() => setPedidoDetalhe(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setPedidoDetalhe(p);
                  }}
                >
                  <div className="orderCardGlow" />

                  <div className="orderCardTop">
                    <div className="orderIdentity">
                      <div className="avatar">{primeiraLetra}</div>
                      <div>
                        <div className="orderCode">#{pedidoCodigo(p)}</div>
                        <div className="orderClient">{p.clienteNome || "Cliente"}</div>
                      </div>
                    </div>

                    <div className="orderBadges">
                      {novo ? <span className="newBadge">🔔 Novo</span> : null}
                      {isPedidoParado(p) ? <span className="slaBadge">⏱️ 24h+</span> : null}
                      <span className={`statusPill status-${p.status}`}>{statusLabel}</span>
                    </div>
                  </div>

                  <div className="orderMoneyRow">
                    <div>
                      <span className="mutedLabel">Total do pedido</span>
                      <strong>{formatBRL(total)}</strong>
                    </div>
                    <div className="orderOrigin">
                      <span>{p.origem ? origemLabel(p.origem) : "Origem não informada"}</span>
                      <small>{p.formaPagamento || p.statusPagamento || "pagamento"}</small>
                    </div>
                  </div>

                  <div className="orderDetailsGrid">
                    <div className="detailBox">
                      <span>Contato</span>
                      <strong>{p.telefone || "—"}</strong>
                    </div>
                    <div className="detailBox">
                      <span>Atualizado</span>
                      <strong>
                        {new Date(p.updatedAt || p.createdAt).toLocaleDateString("pt-BR")}
                      </strong>
                    </div>
                    <div className="detailBox">
                      <span>Estoque</span>
                      <strong>{p.estoqueBaixado ? "Baixado" : "Pendente"}</strong>
                    </div>
                    <div className="detailBox">
                      <span>Entrega</span>
                      <strong>{entregaLabel(p.tipoEntrega, p.entregaLabel)}</strong>
                    </div>
                  </div>

                  <div className="orderItemsBlock">
                    <span className="mutedLabel">Itens</span>
                    <div className="items itemsModern">
                      {(p.itens || []).slice(0, 4).map((it, idx) => (
                        <span className="chip" key={`${p.id}_${idx}`}>
                          {it.nome} ×{it.qtd}
                        </span>
                      ))}
                      {(p.itens || []).length > 4 ? (
                        <span className="more">+{(p.itens || []).length - 4}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="statusControl">
                    <label>Status do pedido</label>
                    <select
                      className="selectInline full"
                      value={p.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        void updatePedidoStatus(p.id, e.target.value as StatusPedido)
                      }
                    >
                      {STATUS_PEDIDO_META.map((s) => (
                        <option key={s.v} value={s.v}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="quickActions">
                    {p.status === "aguardando_pagamento" ? (
                      <button
                        className="quickPaid"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updatePedidoStatus(p.id, "pago");
                        }}
                      >
                        ✅ Marcar pago
                      </button>
                    ) : null}
                    {p.status === "pago" ? (
                      <button
                        className="quickShip"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updatePedidoStatus(p.id, "enviado");
                        }}
                      >
                        🚚 Enviado
                      </button>
                    ) : null}
                    {p.status === "enviado" ? (
                      <button
                        className="quickDone"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updatePedidoStatus(p.id, "entregue");
                        }}
                      >
                        ✨ Entregue
                      </button>
                    ) : null}
                  </div>

                  <div className="cardActions">
                    {novo ? (
                      <button
                        className="btnAlert"
                        onClick={(e) => {
                          e.stopPropagation();
                          void marcarPedidoComoVisualizado(p.id);
                        }}
                        type="button"
                      >
                        Marcar visto
                      </button>
                    ) : null}

                    {shouldBaixarEstoque(p.status) ? (
                      <button
                        className="btnSmall"
                        onClick={(e) => {
                          e.stopPropagation();
                          void reprocessarEstoquePedido(p.id);
                        }}
                        type="button"
                        title="Use quando o pedido aparece como baixado, mas o estoque real não caiu"
                      >
                        Reprocessar estoque
                      </button>
                    ) : null}

                    <button
                      className="btnSmall"
                      onClick={(e) => {
                        e.stopPropagation();
                        openWhatsApp(p.telefone, p.clienteNome);
                      }}
                      type="button"
                    >
                      WhatsApp
                    </button>

                    <button
                      className="btnSmall"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditPedido(p);
                      }}
                      type="button"
                    >
                      Editar
                    </button>

                    <button className="btnSmall" onClick={(e) => {
                      e.stopPropagation();
                      openPedidoPDF(p);
                    }} type="button">
                      PDF
                    </button>

                    {p.leadId ? (
                      <button className="btnSmall" onClick={(e) => {
                        e.stopPropagation();
                        goLead(p.leadId!);
                      }} type="button">
                        Ver Lead
                      </button>
                    ) : null}

                    <button
                      className="btnDanger"
                      onClick={(e) => {
                      e.stopPropagation();
                      void deletePedido(p.id);
                    }}
                      type="button"
                      disabled={!podeExcluir}
                      title={podeExcluir ? "Remover pedido" : "Só pode remover em Rascunho ou Aguardando"}
                      style={!podeExcluir ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    >
                      Remover
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="emptyStatePremium">
            <strong>Nenhum pedido encontrado.</strong>
            <span>Ajuste os filtros ou clique em “+ Criar pedido”.</span>
          </div>
        )}
      </section>


      {/* ✅ MODAL DETALHES DO PEDIDO */}
      {pedidoDetalheAtual ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" onClick={() => setPedidoDetalhe(null)}>
          <div className="detailModal" onClick={(e) => e.stopPropagation()}>
            <div className="detailHero">
              <div>
                <div className="kicker">Maison Noor</div>
                <h2 className="detailTitle">Pedido #{pedidoCodigo(pedidoDetalheAtual)}</h2>
                <p className="detailSub">
                  Visão completa do pedido, status, itens, estoque, pagamento e ações rápidas.
                </p>
              </div>
              <button className="x" onClick={() => setPedidoDetalhe(null)} type="button" aria-label="Fechar">
                ✕
              </button>
            </div>

            <div className="detailGrid">
              <section className="detailMainCard">
                <div className="detailClientRow">
                  <div className="avatar avatarLarge">
                    {String(pedidoDetalheAtual.clienteNome || "C").trim().slice(0, 1).toUpperCase() || "C"}
                  </div>
                  <div>
                    <div className="detailClientName">{pedidoDetalheAtual.clienteNome || "Cliente"}</div>
                    <div className="detailClientMeta">
                      {pedidoDetalheAtual.telefone || "Telefone não informado"} • {pedidoDetalheAtual.origem ? origemLabel(pedidoDetalheAtual.origem) : "Origem não informada"}
                    </div>
                  </div>
                  <span className={`statusPill status-${pedidoDetalheAtual.status}`}>
                    {statusPedidoLabel(pedidoDetalheAtual.status)}
                  </span>
                </div>

                <div className="detailMoneyGrid">
                  <div>
                    <span>Total</span>
                    <strong>{formatBRL(calcularTotalPedido(pedidoDetalheAtual))}</strong>
                  </div>
                  <div>
                    <span>Frete</span>
                    <strong>{formatBRL(Number(pedidoDetalheAtual.frete) || 0)}</strong>
                  </div>
                  <div>
                    <span>Desconto</span>
                    <strong>{formatBRL(Number(pedidoDetalheAtual.desconto) || 0)}</strong>
                  </div>
                  <div>
                    <span>Estoque</span>
                    <strong>{pedidoDetalheAtual.estoqueBaixado ? "Baixado" : "Pendente"}</strong>
                  </div>
                  <div>
                    <span>Entrega</span>
                    <strong>{entregaLabel(pedidoDetalheAtual.tipoEntrega, pedidoDetalheAtual.entregaLabel)}</strong>
                  </div>
                </div>

                <div className="detailSectionTitle">Itens do pedido</div>
                <div className="detailItemsList">
                  {(pedidoDetalheAtual.itens || []).map((it, idx) => (
                    <div className="detailItem" key={`${pedidoDetalheAtual.id}_detail_${idx}`}>
                      <div>
                        <strong>{it.nome}</strong>
                        <span>Quantidade: {it.qtd}</span>
                      </div>
                      <strong>{formatBRL((Number(it.preco) || 0) * (Number(it.qtd) || 0))}</strong>
                    </div>
                  ))}
                  {!pedidoDetalheAtual.itens?.length ? (
                    <div className="emptyBox">Nenhum item encontrado nesse pedido.</div>
                  ) : null}
                </div>
              </section>

              <aside className="detailSideCard">
                <div className="detailSectionTitle">Timeline</div>
                <div className="timeline">
                  {getTimelineSteps(pedidoDetalheAtual.status).map((step, idx) => (
                    <div
                      key={`${step.label}_${idx}`}
                      className={step.current ? "timelineStep current" : step.done ? "timelineStep done" : "timelineStep"}
                    >
                      <span className="timelineDot" />
                      <div>
                        <strong>{step.label}</strong>
                        <small>{step.current ? "Status atual" : step.done ? "Concluído" : "Pendente"}</small>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="detailSectionTitle">Alterar status</div>
                <select
                  className="selectInline full"
                  value={pedidoDetalheAtual.status}
                  onChange={(e) => void updatePedidoStatus(pedidoDetalheAtual.id, e.target.value as StatusPedido)}
                >
                  {STATUS_PEDIDO_META.map((s) => (
                    <option key={s.v} value={s.v}>{s.label}</option>
                  ))}
                </select>

                <div className="detailActionsGrid">
                  {isPedidoNovoAlerta(pedidoDetalheAtual) ? (
                    <button className="btnAlert" type="button" onClick={() => void marcarPedidoComoVisualizado(pedidoDetalheAtual.id)}>
                      Marcar visto
                    </button>
                  ) : null}
                  {shouldBaixarEstoque(pedidoDetalheAtual.status) ? (
                    <button className="btnSmall" type="button" onClick={() => void reprocessarEstoquePedido(pedidoDetalheAtual.id)}>
                      Reprocessar estoque
                    </button>
                  ) : null}
                  <button className="btnSmall" type="button" onClick={() => openWhatsApp(pedidoDetalheAtual.telefone, pedidoDetalheAtual.clienteNome)}>
                    WhatsApp
                  </button>
                  <button className="btnSmall" type="button" onClick={() => openEditPedido(pedidoDetalheAtual)}>
                    Editar
                  </button>
                  <button className="btnSmall" type="button" onClick={() => openPedidoPDF(pedidoDetalheAtual)}>
                    PDF
                  </button>
                </div>

                <div className="detailMetaBox">
                  <span>Criado em</span>
                  <strong>{new Date(pedidoDetalheAtual.createdAt).toLocaleString("pt-BR")}</strong>
                  <span>Atualizado em</span>
                  <strong>{new Date(pedidoDetalheAtual.updatedAt || pedidoDetalheAtual.createdAt).toLocaleString("pt-BR")}</strong>
                  {pedidoDetalheAtual.entregaObservacao ? (
                    <>
                      <span>Obs. entrega</span>
                      <strong>{pedidoDetalheAtual.entregaObservacao}</strong>
                    </>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ MODAL EDITAR PEDIDO */}
      {editOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modalHead">
              <div>
                <div className="kicker">Maison Noor</div>
                <div className="modalTitle">Editar pedido</div>
                <div className="modalSub">
                  Altere o tipo de contato (origem), nome/telefone e observações.
                </div>
              </div>

              <button
                className="x"
                onClick={() => setEditOpen(false)}
                type="button"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="modalGrid">
              <div className="box">
                <div className="boxTitle">Dados do cliente</div>

                <div className="row2">
                  <div>
                    <label className="lab">Nome</label>
                    <input
                      className="input"
                      value={editClienteNome}
                      onChange={(e) => setEditClienteNome(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="lab">Telefone</label>
                    <input
                      className="input"
                      value={editTelefone}
                      onChange={(e) => setEditTelefone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row2">
                  <div>
                    <label className="lab">Origem (tipo de contato)</label>
                    <select
                      className="select"
                      value={editOrigem}
                      onChange={(e) => setEditOrigem(e.target.value as Origem)}
                    >
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="indicacao">Indicação</option>
                      <option value="site">Site</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="lab">Entrega</label>
                    <select
                      className="select"
                      value={editTipoEntrega}
                      onChange={(e) => setEditTipoEntrega(e.target.value as TipoEntrega)}
                    >
                      <option value="entrega_maos">Entregue em mãos</option>
                      <option value="retirada_evento">Retirada no evento</option>
                      <option value="correios">Correios</option>
                      <option value="motoboy">Motoboy</option>
                      <option value="a_combinar">A combinar</option>
                    </select>
                  </div>
                </div>

                <label className="lab">Observação da entrega</label>
                <input
                  className="input"
                  value={editEntregaObservacao}
                  onChange={(e) => setEditEntregaObservacao(e.target.value)}
                  placeholder="Ex: entregue no evento, retirada na bancada, código de rastreio..."
                />

                <label className="lab">Observações</label>
                <textarea
                  className="textarea"
                  value={editObservacoes}
                  onChange={(e) => setEditObservacoes(e.target.value)}
                />

                <div className="modalActions">
                  <button
                    className="btn"
                    onClick={() => setEditOpen(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="btnPrimary"
                    onClick={() => void saveEditPedido()}
                    type="button"
                  >
                    Salvar alterações
                  </button>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">Dica rápida</div>
                <div className="meta">
                  • Esse editar foi feito pra resolver seu caso:{" "}
                  <strong>mudar o tipo de contato</strong> sem precisar apagar o
                  pedido.
                  <br />
                  • Itens/status continuam do jeito que você já usa (status tem
                  o select na tabela).
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL (criar pedido) */}
      {open ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modalHead">
              <div>
                <div className="kicker">Maison Noor</div>
                <div className="modalTitle">Novo pedido</div>
                <div className="modalSub">
                  Você pode puxar dados de um Lead ou preencher manualmente.
                </div>
              </div>

              <button
                className="x"
                onClick={() => setOpen(false)}
                type="button"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="modalGrid">
              <div className="box">
                <div className="boxTitle">Cliente</div>

                <label className="lab">Criar a partir de Lead</label>
                <select
                  className="select"
                  value={leadPick}
                  onChange={(e) => onPickLead(e.target.value)}
                >
                  <option value="">— Selecionar lead —</option>
                  {leads
                    .slice()
                    .sort((a, b) =>
                      (b.updatedAt || "").localeCompare(a.updatedAt || "")
                    )
                    .slice(0, 80)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} • {l.telefone} • {origemLabel(l.origem)}
                      </option>
                    ))}
                </select>

                <div className="row2">
                  <div>
                    <label className="lab">Data do pedido</label>
                    <input
                      className="input"
                      type="date"
                      value={dataPedido}
                      onChange={(e) => setDataPedido(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="lab">Registro</label>
                    <input
                      className="input"
                      value="A data escolhida alimenta pedidos, financeiro e dashboard"
                      readOnly
                    />
                  </div>
                </div>

                <div className="row2">
                  <div>
                    <label className="lab">Nome</label>
                    <input
                      className="input"
                      value={clienteNome}
                      onChange={(e) => setClienteNome(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="lab">Telefone</label>
                    <input
                      className="input"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row2">
                  <div>
                    <label className="lab">Origem</label>
                    <select
                      className="select"
                      value={origem}
                      onChange={(e) => setOrigem(e.target.value as Origem)}
                    >
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="indicacao">Indicação</option>
                      <option value="site">Site</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="lab">Status</label>
                    <select
                      className="select"
                      value={status}
                      onChange={(e) => {
                        const novoStatus = e.target.value as StatusPedido;
                        setStatus(novoStatus);

                        if (novoStatus === "pago" && totals.total > 0) {
                          setPagamentos((prev) =>
                            normalizarPagamentosParaTotal(
                              prev,
                              totals.total,
                              prev?.[0]?.forma || "pix"
                            )
                          );
                        }
                      }}
                    >
                      {STATUS_PEDIDO_META.map((s) => (
                        <option key={s.v} value={s.v}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="row2">
                  <div>
                    <label className="lab">Entrega</label>
                    <select
                      className="select"
                      value={tipoEntrega}
                      onChange={(e) => {
                        const next = e.target.value as TipoEntrega;
                        setTipoEntrega(next);
                        if (next === "entrega_maos" || next === "retirada_evento") setFrete(0);
                      }}
                    >
                      <option value="entrega_maos">Entregue em mãos</option>
                      <option value="retirada_evento">Retirada no evento</option>
                      <option value="correios">Correios</option>
                      <option value="motoboy">Motoboy</option>
                      <option value="a_combinar">A combinar</option>
                    </select>
                  </div>
                  <div>
                    <label className="lab">Observação da entrega</label>
                    <input
                      className="input"
                      value={entregaObservacao}
                      onChange={(e) => setEntregaObservacao(e.target.value)}
                      placeholder="Ex: entregue no evento, retirada na bancada..."
                    />
                  </div>
                </div>

                <label className="lab">Observações</label>
                <textarea
                  className="textarea"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />

                {/* ✅ OPÇÃO 2: Pagamentos (aparece quando status = pago) */}
                {status === "pago" ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="boxTitle" style={{ marginBottom: 8 }}>
                      Pagamentos (dividido)
                    </div>

                    {(pagamentos || []).map((pg, idx) => (
                      <div className="row3" key={`pg_${idx}`}>
                        <select
                          className="select"
                          value={pg.forma}
                          onChange={(e) =>
                            updatePagamento(idx, {
                              forma: e.target.value as PedidoPagamentoForma,
                            })
                          }
                        >
                          <option value="pix">Pix</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="credito">Crédito</option>
                          <option value="debito">Débito</option>
                          <option value="boleto">Boleto</option>
                          <option value="transferencia">Transferência</option>
                          <option value="outros">Outros</option>
                        </select>

                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={pg.valor}
                          onChange={(e) =>
                            updatePagamento(idx, {
                              valor: Number(String(e.target.value).replace(",", ".")),
                            })
                          }
                        />

                        <button
                          className="btnDanger"
                          type="button"
                          onClick={() => removePagamento(idx)}
                          disabled={(pagamentos || []).length <= 1}
                          style={
                            (pagamentos || []).length <= 1
                              ? { opacity: 0.5, cursor: "not-allowed" }
                              : undefined
                          }
                        >
                          Remover
                        </button>
                      </div>
                    ))}

                    <div
                      className="modalActions"
                      style={{ justifyContent: "space-between" }}
                    >
                      <button
                        className="btnSmall"
                        type="button"
                        onClick={addPagamento}
                      >
                        + Adicionar forma
                      </button>
                      <div className="meta" style={{ textAlign: "right" }}>
                        Pagamentos: <b>{formatBRL(totalPagamentos)}</b> • Total:{" "}
                        <b>{formatBRL(totals.total)}</b>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="box">
                <div className="boxTitle">Itens do pedido</div>

                <label className="lab">Adicionar a partir de Produtos</label>
                <select
                  className="select"
                  value={produtoPick}
                  onChange={(e) => onPickProduto(e.target.value)}
                >
                  <option value="">— Selecionar produto —</option>
                  {produtosAtivos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {typeof p.estoque === "number"
                        ? ` • estoque ${p.estoque}`
                        : ""}
                      {p.precoVenda ? ` • ${formatBRL(p.precoVenda)}` : ""}
                    </option>
                  ))}
                </select>

                <div className="row3">
                  <input
                    className="input"
                    placeholder="Nome do perfume / item"
                    value={itemNome}
                    onChange={(e) => setItemNome(e.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={itemQtd}
                    onChange={(e) => setItemQtd(Number(e.target.value))}
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemPreco}
                    onChange={(e) => setItemPreco(Number(e.target.value))}
                  />
                  <button className="btnSmall" onClick={addItem} type="button">
                    Adicionar
                  </button>
                </div>

                <div className="itemsList">
                  {itens.length ? (
                    itens.map((it, idx) => (
                      <div className="itemRow" key={`${it.nome}_${idx}`}>
                        <input
                          className="input"
                          value={it.nome}
                          onChange={(e) =>
                            updateItem(idx, { nome: e.target.value })
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          min={1}
                          value={it.qtd}
                          onChange={(e) =>
                            updateItem(idx, { qtd: Number(e.target.value) })
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.preco}
                          onChange={(e) =>
                            updateItem(idx, { preco: Number(e.target.value) })
                          }
                        />
                        <button
                          className="btnDanger"
                          onClick={() => removeItem(idx)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="emptyBox">
                      Sem itens ainda. Se escolher um Lead, os perfumes entram
                      aqui.
                    </div>
                  )}
                </div>

                <div className="row2">
                  <div>
                    <label className="lab">Desconto (R$)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={desconto}
                      onChange={(e) => setDesconto(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="lab">Frete (R$)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={frete}
                      onChange={(e) => setFrete(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="totals">
                  <div className="totLine">
                    <span>Subtotal</span>
                    <strong>{formatBRL(totals.subtotal)}</strong>
                  </div>
                  <div className="totLine">
                    <span>Total</span>
                    <strong className="tot">{formatBRL(totals.total)}</strong>
                  </div>
                </div>

                <div className="modalActions">
                  <button
                    className="btn"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="btnPrimary"
                    onClick={() => void savePedido()}
                    type="button"
                  >
                    Salvar pedido
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .page {
          padding: 24px;
          max-width: 1440px;
          margin: 0 auto;
        }
        .kicker {
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(200, 162, 106, 0.95);
          font-weight: 800;
        }
        .title {
          margin: 6px 0 0;
          font-size: 30px;
          line-height: 1.05;
          font-weight: 950;
        }
        .sub {
          margin: 8px 0 0;
          opacity: 0.75;
          max-width: 720px;
          line-height: 1.55;
        }

        .head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          align-items: flex-end;
          padding: 20px;
          border-radius: 22px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.14), transparent 32%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.014));
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.16);
        }
        .headRight {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .filterBox {
          display: grid;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 16px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(0, 0, 0, 0.14);
        }
        .filterBox label {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.75;
          font-weight: 900;
        }
        .selectSmall,
        .inputSmall {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 15, 22, 0.9);
          color: #f2f2f2;
          outline: none;
          min-width: 180px;
        }
        .inputSmall {
          min-width: 240px;
        }

        .btn {
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.25);
          background: rgba(200, 162, 106, 0.08);
          cursor: pointer;
          font-weight: 900;
          color: #f2f2f2;
        }
        .btnPrimary {
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.45);
          background: linear-gradient(
            180deg,
            rgba(200, 162, 106, 0.18),
            rgba(200, 162, 106, 0.08)
          );
          cursor: pointer;
          font-weight: 900;
          color: #f2f2f2;
        }

        .btnSmall {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(200, 162, 106, 0.25);
          background: rgba(200, 162, 106, 0.08);
          cursor: pointer;
          font-weight: 900;
          color: #f2f2f2;
          white-space: nowrap;

          min-width: 108px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }
        .btnDanger {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 120, 120, 0.3);
          background: rgba(255, 120, 120, 0.08);
          cursor: pointer;
          font-weight: 900;
          color: #ffdada;
          white-space: nowrap;

          min-width: 108px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }

        .toast {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;

          margin-top: 0;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.1);
          font-weight: 800;
          max-width: min(980px, 92vw);
        }

        .warn {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 220, 160, 0.25);
          background: rgba(255, 220, 160, 0.08);
          font-weight: 800;
          max-width: 980px;
        }

        .stats {
          margin-top: 16px;
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        }
        .stat {
          padding: 16px;
          border-radius: 20px;
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: linear-gradient(180deg, rgba(200, 162, 106, 0.08), rgba(255, 255, 255, 0.018));
          display: flex;
          gap: 12px;
          align-items: flex-start;
          min-height: 118px;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.12);
        }
        .statIcon {
          width: 42px;
          height: 42px;
          border-radius: 16px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.08);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }
        .statLabel {
          font-size: 11px;
          opacity: 0.78;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 900;
        }
        .statValue {
          margin-top: 8px;
          font-size: 22px;
          font-weight: 950;
          color: rgba(200, 162, 106, 0.98);
        }
        .statHint {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.62;
          line-height: 1.35;
        }

        .card {
          margin-top: 16px;
          border-radius: 22px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.014));
          padding: 16px;
          overflow: visible;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.14);
        }
        .cardHeaderPremium {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .cardTitle {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.85;
          font-weight: 900;
        }
        .cardSub {
          margin: 7px 0 0;
          opacity: 0.65;
          font-size: 13px;
          line-height: 1.45;
        }
        .cardMiniKpis {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .cardMiniKpis span {
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(200, 162, 106, 0.07);
          font-size: 12px;
          font-weight: 800;
          color: rgba(242, 242, 242, 0.82);
        }

        .tableWrap {
          width: 100%;
          overflow-x: auto;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.18);
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1400px;
        }

        th,
        td {
          padding: 14px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          vertical-align: top;
        }
        th {
          font-size: 11px;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          opacity: 0.66;
          text-align: left;
          white-space: nowrap;
          background: rgba(255, 255, 255, 0.025);
        }
        tbody tr {
          transition: background 0.18s ease, transform 0.18s ease;
        }
        tbody tr:hover {
          background: rgba(200, 162, 106, 0.055);
        }

        .thActions,
        .tdActions {
          min-width: 520px;
          width: 520px;
          text-align: left;
        }

        .name {
          font-weight: 900;
        }
        .meta {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.7;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }
        .items {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        .chip {
          font-size: 11px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.06);
          white-space: nowrap;
        }
        .more {
          font-size: 12px;
          opacity: 0.75;
        }
        .selectInline {
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.2);
          background: rgba(15, 15, 22, 0.92);
          color: #f2f2f2;
          outline: none;
          font-weight: 800;
        }

        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: nowrap;
          justify-content: flex-start;
          align-items: center;
        }

        .empty {
          padding: 16px;
          opacity: 0.7;
          text-align: center;
        }

        .pillOk {
          display: inline-block;
          margin-left: 8px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.08);
          color: rgba(200, 162, 106, 0.95);
          font-weight: 900;
          font-size: 11px;
        }


        .statButton {
          text-align: left;
          color: #f2f2f2;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .statButton:hover,
        .statActive {
          transform: translateY(-2px);
          border-color: rgba(200, 162, 106, 0.42);
          background: rgba(200, 162, 106, 0.1);
        }
        .orderCard {
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .orderCard:hover {
          transform: translateY(-3px);
          border-color: rgba(200, 162, 106, 0.36);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.018));
        }
        .detailModal {
          width: min(1180px, 96vw);
          max-height: 92vh;
          overflow-y: auto;
          border-radius: 24px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: radial-gradient(circle at top left, rgba(200, 162, 106, 0.13), transparent 28%), rgba(10, 10, 14, 0.96);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.65);
          padding: 16px;
        }
        .detailHero {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(255, 255, 255, 0.025);
        }
        .detailTitle {
          margin: 6px 0 0;
          font-size: 28px;
        }
        .detailSub {
          margin: 8px 0 0;
          opacity: 0.74;
          line-height: 1.5;
        }
        .detailGrid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
          gap: 14px;
        }
        .detailMainCard,
        .detailSideCard {
          border-radius: 22px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(0, 0, 0, 0.18);
          padding: 16px;
        }
        .detailClientRow {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .avatarLarge {
          width: 54px;
          height: 54px;
          font-size: 22px;
        }
        .detailClientName {
          font-size: 20px;
          font-weight: 950;
        }
        .detailClientMeta {
          margin-top: 4px;
          opacity: 0.68;
          font-size: 13px;
        }
        .detailMoneyGrid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }
        .detailMoneyGrid > div {
          border-radius: 16px;
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: rgba(200, 162, 106, 0.055);
          padding: 12px;
          display: grid;
          gap: 7px;
        }
        .detailMoneyGrid span,
        .detailMetaBox span {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          opacity: 0.7;
          font-weight: 900;
        }
        .detailMoneyGrid strong {
          color: rgba(200, 162, 106, 0.98);
          font-size: 17px;
        }
        .detailSectionTitle {
          margin-top: 18px;
          margin-bottom: 10px;
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(200, 162, 106, 0.95);
          font-weight: 950;
        }
        .detailItemsList {
          display: grid;
          gap: 10px;
        }
        .detailItem {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
        }
        .detailItem div {
          display: grid;
          gap: 5px;
        }
        .detailItem span {
          opacity: 0.68;
          font-size: 12px;
        }
        .timeline {
          display: grid;
          gap: 12px;
          margin-bottom: 18px;
        }
        .timelineStep {
          display: grid;
          grid-template-columns: 18px 1fr;
          gap: 10px;
          align-items: start;
          opacity: 0.56;
        }
        .timelineStep.done,
        .timelineStep.current {
          opacity: 1;
        }
        .timelineDot {
          width: 13px;
          height: 13px;
          margin-top: 3px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.05);
        }
        .timelineStep.done .timelineDot {
          border-color: rgba(200, 162, 106, 0.7);
          background: rgba(200, 162, 106, 0.34);
        }
        .timelineStep.current .timelineDot {
          border-color: #ffd98a;
          background: #d2a65f;
          box-shadow: 0 0 20px rgba(255, 217, 138, 0.25);
        }
        .timelineStep strong {
          display: block;
          font-size: 13px;
        }
        .timelineStep small {
          display: block;
          margin-top: 3px;
          opacity: 0.64;
        }
        .detailActionsGrid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .detailActionsGrid button {
          width: 100%;
          min-width: 0;
        }
        .detailMetaBox {
          margin-top: 16px;
          border-radius: 16px;
          border: 1px solid rgba(200, 162, 106, 0.14);
          background: rgba(255, 255, 255, 0.022);
          padding: 12px;
          display: grid;
          gap: 6px;
        }
        .detailMetaBox strong {
          font-size: 12px;
          opacity: 0.82;
          margin-bottom: 6px;
        }
        @media (max-width: 980px) {
          .detailGrid,
          .detailMoneyGrid {
            grid-template-columns: 1fr;
          }
        }

        /* Modal */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: grid;
          place-items: center;
          padding: 20px;
          z-index: 50;
        }
        .modal {
          width: min(1100px, 98vw);
          max-height: 90vh;
          overflow-y: auto;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(10, 10, 14, 0.92);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
          padding: 14px;
          display: flex;
          flex-direction: column;
        }
        .modalHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          padding: 10px;
        }
        .modalTitle {
          font-size: 18px;
          font-weight: 900;
          margin-top: 4px;
        }
        .modalSub {
          margin-top: 6px;
          opacity: 0.75;
        }
        .x {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #f2f2f2;
          border-radius: 12px;
          padding: 10px 12px;
          cursor: pointer;
          font-weight: 900;
        }
        .modalGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          padding: 10px;
        }
        @media (min-width: 980px) {
          .modalGrid {
            grid-template-columns: 1fr 1.2fr;
          }
        }
        .box {
          border-radius: 16px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(0, 0, 0, 0.18);
          padding: 12px;
        }
        .boxTitle {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.85;
          margin-bottom: 12px;
          font-weight: 900;
        }
        .lab {
          display: block;
          margin-top: 10px;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.8;
          font-weight: 900;
        }
        .input,
        .select,
        .textarea {
          width: 100%;
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 15, 22, 0.9);
          color: #f2f2f2;
          outline: none;
          margin-top: 6px;
        }
        .textarea {
          min-height: 96px;
          resize: vertical;
        }
        .row2 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        @media (min-width: 720px) {
          .row2 {
            grid-template-columns: 1fr 1fr;
          }
        }
        .row3 {
          display: grid;
          grid-template-columns: 1fr 140px 140px;
          gap: 8px;
          align-items: end;
          margin-top: 8px;
        }
        @media (max-width: 900px) {
          .row3 {
            grid-template-columns: 1fr;
          }
        }
        .itemsList {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }
        .itemRow {
          display: grid;
          grid-template-columns: 1fr 90px 140px 120px;
          gap: 8px;
          align-items: center;
        }
        @media (max-width: 900px) {
          .itemRow {
            grid-template-columns: 1fr 90px 140px;
          }
          .itemRow button {
            grid-column: 1 / -1;
          }
        }
        .emptyBox {
          padding: 12px;
          border-radius: 14px;
          border: 1px dashed rgba(255, 255, 255, 0.18);
          opacity: 0.75;
        }
        .totals {
          margin-top: 12px;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(200, 162, 106, 0.06);
        }
        .totLine {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          font-weight: 800;
        }
        .tot {
          color: rgba(200, 162, 106, 0.95);
        }
        .modalActions {
          margin-top: 12px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .novoPedidoAlert {
          margin-top: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 201, 98, 0.36);
          background: linear-gradient(180deg, rgba(255, 201, 98, 0.16), rgba(200, 162, 106, 0.08));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          max-width: 980px;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18);
        }
        .novoPedidoAlert strong {
          display: block;
          font-size: 15px;
        }
        .novoPedidoAlert span {
          display: block;
          margin-top: 4px;
          opacity: 0.78;
          font-size: 12px;
          font-weight: 700;
        }
        .statAlert {
          border-color: rgba(255, 201, 98, 0.38);
          background: rgba(255, 201, 98, 0.11);
        }
        .btnAlert {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 201, 98, 0.42);
          background: rgba(255, 201, 98, 0.14);
          cursor: pointer;
          font-weight: 900;
          color: #ffe7ad;
          white-space: nowrap;
          min-width: 108px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }
        .newRow {
          background: linear-gradient(90deg, rgba(255, 201, 98, 0.13), rgba(255, 201, 98, 0.03));
        }
        .pedidoCell {
          display: grid;
          gap: 6px;
          align-items: start;
        }
        .newBadge {
          display: inline-flex;
          width: fit-content;
          padding: 5px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 201, 98, 0.42);
          background: rgba(255, 201, 98, 0.15);
          color: #ffe7ad;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }


        .ordersShell {
          margin-top: 16px;
          padding: 16px;
          border-radius: 22px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.10), transparent 28%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
        }
        .ordersPanelHead {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .ordersTitle {
          margin: 2px 0 0;
          font-size: 22px;
          line-height: 1.1;
        }
        .ordersSub {
          margin: 7px 0 0;
          opacity: 0.7;
          font-size: 13px;
          line-height: 1.5;
        }
        .ordersPanelActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .miniMetric {
          display: inline-flex;
          min-height: 36px;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(0, 0, 0, 0.18);
          font-size: 12px;
          font-weight: 900;
        }
        .miniMetric.gold {
          border-color: rgba(200, 162, 106, 0.32);
          background: rgba(200, 162, 106, 0.10);
          color: rgba(200, 162, 106, 0.98);
        }
        .ordersGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .orderCard {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015)),
            rgba(0, 0, 0, 0.22);
          padding: 15px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }
        .orderCard:hover {
          transform: translateY(-2px);
          border-color: rgba(200, 162, 106, 0.28);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.018)),
            rgba(0, 0, 0, 0.24);
        }
        .orderCardNew {
          border-color: rgba(255, 201, 98, 0.35);
        }
        .orderCardGlow {
          position: absolute;
          inset: -80px auto auto -80px;
          width: 190px;
          height: 190px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(200, 162, 106, 0.16), transparent 64%);
          pointer-events: none;
        }
        .orderCardTop {
          position: relative;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .orderIdentity {
          display: flex;
          gap: 11px;
          align-items: center;
          min-width: 0;
        }
        .avatar {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(200, 162, 106, 0.28);
          background: linear-gradient(180deg, rgba(200, 162, 106, 0.18), rgba(200, 162, 106, 0.06));
          color: rgba(200, 162, 106, 0.98);
          font-weight: 1000;
          font-size: 18px;
          flex: 0 0 auto;
        }
        .orderCode {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-weight: 1000;
          color: #fff;
        }
        .orderClient {
          margin-top: 4px;
          font-weight: 900;
          opacity: 0.9;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .orderBadges {
          display: flex;
          gap: 6px;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .statusPill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 27px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.045);
          font-size: 11px;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .status-pago,
        .status-entregue {
          border-color: rgba(117, 255, 171, 0.28);
          background: rgba(117, 255, 171, 0.08);
          color: #bfffd5;
        }
        .status-aguardando_pagamento,
        .status-rascunho {
          border-color: rgba(255, 201, 98, 0.28);
          background: rgba(255, 201, 98, 0.08);
          color: #ffe4a6;
        }
        .status-enviado {
          border-color: rgba(120, 180, 255, 0.28);
          background: rgba(120, 180, 255, 0.08);
          color: #c7ddff;
        }
        .status-cancelado {
          border-color: rgba(255, 120, 120, 0.28);
          background: rgba(255, 120, 120, 0.08);
          color: #ffd1d1;
        }
        .orderMoneyRow {
          position: relative;
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-end;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.14);
          background: rgba(200, 162, 106, 0.055);
        }
        .orderMoneyRow strong {
          display: block;
          margin-top: 4px;
          color: rgba(200, 162, 106, 0.98);
          font-size: 19px;
        }
        .mutedLabel {
          display: block;
          font-size: 11px;
          opacity: 0.62;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .orderOrigin {
          display: grid;
          gap: 4px;
          text-align: right;
          font-weight: 900;
        }
        .orderOrigin small {
          opacity: 0.55;
          font-weight: 800;
        }
        .orderDetailsGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .detailBox {
          min-width: 0;
          border-radius: 15px;
          border: 1px solid rgba(255, 255, 255, 0.075);
          background: rgba(0, 0, 0, 0.18);
          padding: 10px;
        }
        .detailBox span {
          display: block;
          opacity: 0.55;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .detailBox strong {
          display: block;
          margin-top: 5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }
        .orderItemsBlock {
          margin-top: 12px;
        }
        .itemsModern {
          margin-top: 7px;
        }
        .statusControl {
          margin-top: 12px;
          display: grid;
          gap: 7px;
        }
        .statusControl label {
          opacity: 0.62;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .selectInline.full {
          width: 100%;
        }
        .cardActions {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .emptyStatePremium {
          min-height: 220px;
          display: grid;
          place-items: center;
          gap: 8px;
          text-align: center;
          border-radius: 20px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.14);
          opacity: 0.78;
        }
        .emptyStatePremium strong,
        .emptyStatePremium span {
          display: block;
        }

        @media (max-width: 760px) {
          .stats {
            grid-template-columns: 1fr;
            max-width: 100%;
          }
          .ordersGrid {
            grid-template-columns: 1fr;
          }
          .orderMoneyRow,
          .orderCardTop {
            align-items: flex-start;
            flex-direction: column;
          }
          .orderOrigin {
            text-align: left;
          }
          .orderDetailsGrid {
            grid-template-columns: 1fr;
          }
        }

        .realtimeBadge {
          min-height: 40px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.66);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }
        .realtimeBadge.on {
          border-color: rgba(88, 214, 141, 0.38);
          background: rgba(88, 214, 141, 0.10);
          color: #9ff0bc;
          box-shadow: 0 0 24px rgba(88, 214, 141, 0.08);
        }
        .slaAlert {
          margin-top: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 157, 92, 0.36);
          background: linear-gradient(180deg, rgba(255, 157, 92, 0.16), rgba(200, 162, 106, 0.06));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          max-width: 980px;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18);
        }
        .slaAlert strong {
          display: block;
          font-size: 15px;
        }
        .slaAlert span {
          display: block;
          margin-top: 4px;
          opacity: 0.78;
          font-size: 12px;
          font-weight: 700;
        }
        .statSla {
          border-color: rgba(255, 157, 92, 0.34);
          background: linear-gradient(180deg, rgba(255, 157, 92, 0.12), rgba(255, 255, 255, 0.018));
        }
        .slaBadge {
          display: inline-flex;
          width: fit-content;
          padding: 5px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 157, 92, 0.42);
          background: rgba(255, 157, 92, 0.15);
          color: #ffd2ad;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }
        .quickActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .quickPaid,
        .quickShip,
        .quickDone {
          height: 38px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid rgba(88, 214, 141, 0.34);
          background: rgba(88, 214, 141, 0.10);
          color: #b9ffd0;
          font-weight: 900;
          cursor: pointer;
        }
        .quickShip {
          border-color: rgba(115, 171, 255, 0.34);
          background: rgba(115, 171, 255, 0.10);
          color: #cfe1ff;
        }
        .quickDone {
          border-color: rgba(200, 162, 106, 0.38);
          background: rgba(200, 162, 106, 0.12);
          color: #ffe1ad;
        }


        /* ======================================================
           ✅ PEDIDOS SaaS Premium compacto — alinhado ao Financeiro
           ✅ Apenas densidade/layout visual + campo data no modal
        ====================================================== */
        .page {
          max-width: 1240px !important;
          padding: 14px 16px 22px !important;
          margin: 0 auto !important;
          overflow-x: hidden !important;
        }

        .head {
          padding: 14px 16px !important;
          border-radius: 20px !important;
          gap: 12px !important;
          align-items: center !important;
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.11), transparent 30%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.012)) !important;
        }
        .title { font-size: 25px !important; line-height: 1.04 !important; }
        .sub { font-size: 13px !important; line-height: 1.36 !important; max-width: 680px !important; }
        .kicker { font-size: 10px !important; letter-spacing: 0.16em !important; }

        .headRight {
          flex: 1 1 500px !important;
          display: flex !important;
          gap: 8px !important;
          align-items: flex-end !important;
          justify-content: flex-end !important;
        }
        .filterBox {
          padding: 7px 9px !important;
          border-radius: 14px !important;
          gap: 4px !important;
        }
        .filterBox label { font-size: 9.5px !important; }
        .selectSmall,
        .inputSmall {
          height: 36px !important;
          min-width: 0 !important;
          padding: 0 11px !important;
          border-radius: 12px !important;
          font-size: 12px !important;
        }
        .selectSmall { width: 170px !important; }
        .inputSmall { width: 230px !important; }
        .realtimeBadge,
        .btn,
        .btnPrimary {
          height: 36px !important;
          min-height: 36px !important;
          padding: 0 12px !important;
          border-radius: 12px !important;
          font-size: 12px !important;
        }

        .stats {
          margin-top: 12px !important;
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)) !important;
          gap: 9px !important;
        }
        .stat {
          min-height: 92px !important;
          padding: 11px !important;
          border-radius: 16px !important;
          display: grid !important;
          grid-template-columns: 36px minmax(0, 1fr) !important;
          gap: 10px !important;
          align-items: center !important;
          overflow: hidden !important;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease !important;
        }
        .stat:hover {
          transform: translateY(-2px) !important;
          border-color: rgba(200, 162, 106, 0.42) !important;
        }
        .statIcon { width: 36px !important; height: 36px !important; border-radius: 13px !important; }
        .statLabel { font-size: 10px !important; line-height: 1.15 !important; }
        .statValue {
          margin-top: 4px !important;
          font-size: 17px !important;
          line-height: 1.1 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }
        .statHint { margin-top: 3px !important; font-size: 10.5px !important; line-height: 1.18 !important; }

        .ordersShell {
          margin-top: 12px !important;
          padding: 12px !important;
          border-radius: 20px !important;
          overflow: hidden !important;
        }
        .ordersPanelHead { margin-bottom: 10px !important; gap: 10px !important; align-items: center !important; }
        .ordersTitle { font-size: 21px !important; line-height: 1.05 !important; }
        .ordersSub { font-size: 12px !important; margin-top: 4px !important; line-height: 1.3 !important; }
        .miniMetric { min-height: 32px !important; padding: 0 10px !important; font-size: 11px !important; }

        .ordersGrid {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(470px, 1fr)) !important;
          gap: 10px !important;
        }
        .orderCard {
          min-width: 0 !important;
          padding: 11px !important;
          border-radius: 18px !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        .orderCard:hover { transform: translateY(-2px) !important; }
        .avatar { width: 36px !important; height: 36px !important; border-radius: 12px !important; }
        .orderClient { font-size: 13px !important; max-width: 250px !important; }
        .orderCode { font-size: 12px !important; }
        .statusPill,
        .newBadge,
        .slaBadge { min-height: 22px !important; padding: 0 8px !important; font-size: 9.5px !important; }

        .orderMoneyRow {
          margin-top: 9px !important;
          padding: 9px 10px !important;
          border-radius: 14px !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) minmax(110px, auto) !important;
        }
        .orderMoneyRow strong { font-size: 16px !important; overflow-wrap: anywhere !important; }
        .orderDetailsGrid { margin-top: 8px !important; gap: 6px !important; }
        .detailBox { padding: 7px !important; border-radius: 12px !important; }
        .detailBox span { font-size: 8.5px !important; }
        .detailBox strong { font-size: 10.5px !important; margin-top: 3px !important; }
        .chip { font-size: 10px !important; padding: 3px 7px !important; max-width: 100% !important; overflow: hidden !important; text-overflow: ellipsis !important; }
        .selectInline,
        .selectInline.full { height: 32px !important; min-height: 32px !important; border-radius: 11px !important; font-size: 11.5px !important; }
        .btnSmall,
        .btnDanger,
        .btnAlert,
        .quickPaid,
        .quickShip,
        .quickDone { min-width: 78px !important; height: 32px !important; min-height: 32px !important; padding: 0 8px !important; border-radius: 10px !important; font-size: 10.5px !important; }

        .modal { width: min(1080px, 96vw) !important; padding: 12px !important; border-radius: 20px !important; }
        .modalHead { padding: 12px !important; border-radius: 16px !important; }
        .modalTitle { font-size: 18px !important; }
        .modalSub { font-size: 12.5px !important; }
        .modalGrid { gap: 10px !important; padding: 10px !important; }
        .box { padding: 11px !important; border-radius: 16px !important; }
        .boxTitle { font-size: 10px !important; margin-bottom: 9px !important; }
        .lab { font-size: 9.5px !important; margin-top: 8px !important; }
        .input,
        .select,
        .textarea { min-height: 36px !important; padding: 0 11px !important; border-radius: 12px !important; font-size: 12px !important; }
        .textarea { min-height: 78px !important; padding-top: 10px !important; }
        .row2 { gap: 8px !important; margin-top: 8px !important; }
        .row3 { gap: 7px !important; margin-top: 7px !important; grid-template-columns: minmax(0, 1fr) 120px 115px !important; }
        .itemsList { gap: 8px !important; margin-top: 9px !important; }
        .itemRow { gap: 7px !important; grid-template-columns: minmax(0, 1fr) 80px 120px 105px !important; }
        .totals { margin-top: 9px !important; padding: 10px !important; border-radius: 14px !important; }
        .modalActions { margin-top: 10px !important; gap: 8px !important; }

        @media (max-width: 1280px) {
          .page { max-width: 1160px !important; }
          .stats { grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)) !important; }
          .ordersGrid { grid-template-columns: repeat(auto-fit, minmax(430px, 1fr)) !important; }
        }
        @media (max-width: 980px) {
          .page { padding: 12px !important; }
          .headRight { width: 100% !important; justify-content: flex-start !important; }
          .filterBox { flex: 1 1 190px !important; }
          .selectSmall,
          .inputSmall { width: 100% !important; }
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .ordersGrid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 700px) {
          .row3,
          .itemRow { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .title { font-size: 22px !important; }
          .stats { grid-template-columns: 1fr !important; }
          .orderMoneyRow { grid-template-columns: 1fr !important; }
          .orderDetailsGrid { grid-template-columns: 1fr !important; }
        }


        .dateFilterBar {
          margin-top: 10px;
          padding: 10px;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.10), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .dateQuickActions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          align-items: center;
        }
        .dateChip {
          height: 32px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.07);
          color: #f2f2f2;
          font-size: 11px;
          font-weight: 950;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .dateChip:hover,
        .dateChip.active {
          transform: translateY(-1px);
          border-color: rgba(200, 162, 106, 0.48);
          background: rgba(200, 162, 106, 0.15);
          color: #ffe2aa;
        }
        .dateRangeFields {
          display: flex;
          gap: 8px;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .dateField {
          display: grid;
          gap: 4px;
        }
        .dateField label {
          font-size: 9px;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          opacity: 0.72;
          font-weight: 950;
        }
        .dateField input {
          height: 32px;
          width: 132px;
          padding: 0 9px;
          border-radius: 11px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 15, 22, 0.92);
          color: #f2f2f2;
          outline: none;
          font-size: 11px;
          font-weight: 800;
        }

        /* ======================================================
           ✅ PEDIDOS ULTRA COMPACTO 10/10 — versão final premium
           ✅ Não altera lógica, Firestore, financeiro, estoque ou ações
           ✅ Reduz tamanho da página e deixa os cards no padrão do Financeiro
        ====================================================== */
        .page { max-width: 1120px !important; padding: 10px 14px 18px !important; }
        .head { padding: 12px 14px !important; border-radius: 18px !important; align-items: center !important; }
        .title { font-size: 23px !important; }
        .sub { font-size: 12.5px !important; line-height: 1.28 !important; max-width: 620px !important; }
        .headRight { gap: 7px !important; }
        .filterBox { padding: 6px 8px !important; }
        .selectSmall { width: 145px !important; }
        .inputSmall { width: 205px !important; }
        .realtimeBadge, .btn, .btnPrimary { height: 34px !important; min-height: 34px !important; padding: 0 11px !important; font-size: 11.5px !important; }
        .stats { margin-top: 10px !important; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important; gap: 8px !important; }
        .stat { min-height: 68px !important; padding: 9px !important; border-radius: 14px !important; grid-template-columns: 30px minmax(0, 1fr) !important; gap: 8px !important; }
        .statIcon { width: 30px !important; height: 30px !important; border-radius: 10px !important; font-size: 13px !important; }
        .statLabel { font-size: 8.8px !important; letter-spacing: 0.08em !important; }
        .statValue { font-size: 15.5px !important; margin-top: 2px !important; }
        .statHint { font-size: 9.5px !important; margin-top: 2px !important; line-height: 1.12 !important; }
        .ordersShell { margin-top: 10px !important; padding: 10px !important; border-radius: 18px !important; }
        .ordersPanelHead { margin-bottom: 8px !important; }
        .ordersTitle { font-size: 19px !important; }
        .ordersSub { display: none !important; }
        .miniMetric { min-height: 28px !important; height: 28px !important; padding: 0 9px !important; font-size: 10.5px !important; }
        .ordersGrid { grid-template-columns: 1fr !important; gap: 8px !important; }
        .orderCard { display: grid !important; grid-template-columns: minmax(220px, 1.15fr) minmax(145px, 0.7fr) minmax(210px, 1fr) !important; gap: 8px 10px !important; align-items: center !important; min-height: 0 !important; padding: 9px 10px !important; border-radius: 16px !important; }
        .orderCardGlow { width: 120px !important; height: 120px !important; inset: -55px auto auto -55px !important; opacity: 0.75 !important; }
        .orderCardTop { grid-column: 1 / 2 !important; align-items: center !important; gap: 8px !important; }
        .orderIdentity { gap: 8px !important; }
        .avatar { width: 32px !important; height: 32px !important; border-radius: 11px !important; font-size: 14px !important; }
        .orderCode { font-size: 11px !important; line-height: 1.05 !important; }
        .orderClient { margin-top: 2px !important; font-size: 12.5px !important; max-width: 260px !important; line-height: 1.15 !important; }
        .orderBadges { gap: 4px !important; }
        .statusPill, .newBadge, .slaBadge { min-height: 20px !important; height: 20px !important; padding: 0 7px !important; font-size: 8.8px !important; }
        .orderMoneyRow { grid-column: 2 / 3 !important; margin-top: 0 !important; padding: 8px !important; border-radius: 12px !important; display: grid !important; grid-template-columns: 1fr !important; gap: 2px !important; align-self: stretch !important; }
        .mutedLabel { font-size: 8.5px !important; letter-spacing: 0.07em !important; }
        .orderMoneyRow strong { margin-top: 1px !important; font-size: 14px !important; line-height: 1.1 !important; }
        .orderOrigin { text-align: left !important; gap: 1px !important; font-size: 10.5px !important; opacity: 0.92 !important; }
        .orderOrigin small { font-size: 9.5px !important; }
        .orderDetailsGrid { grid-column: 3 / 4 !important; margin-top: 0 !important; gap: 5px !important; align-self: stretch !important; }
        .detailBox { padding: 6px 7px !important; border-radius: 11px !important; }
        .detailBox span { font-size: 7.8px !important; }
        .detailBox strong { font-size: 10px !important; margin-top: 2px !important; }
        .orderItemsBlock { grid-column: 1 / 3 !important; margin-top: 0 !important; min-width: 0 !important; }
        .orderItemsBlock > .mutedLabel { display: none !important; }
        .itemsModern { margin-top: 0 !important; gap: 4px !important; flex-wrap: nowrap !important; overflow: hidden !important; }
        .chip { font-size: 9.3px !important; padding: 2px 6px !important; max-width: 260px !important; display: inline-block !important; }
        .more { font-size: 10px !important; flex-shrink: 0 !important; }
        .statusControl { grid-column: 3 / 4 !important; margin-top: 0 !important; gap: 0 !important; align-self: center !important; }
        .statusControl label { display: none !important; }
        .selectInline, .selectInline.full { height: 30px !important; min-height: 30px !important; font-size: 10.8px !important; border-radius: 10px !important; padding: 0 9px !important; }
        .quickActions { grid-column: 1 / 2 !important; margin-top: 0 !important; gap: 5px !important; }
        .cardActions { grid-column: 2 / 4 !important; margin-top: 0 !important; padding-top: 0 !important; border-top: 0 !important; justify-content: flex-end !important; gap: 5px !important; }
        .btnSmall, .btnDanger, .btnAlert, .quickPaid, .quickShip, .quickDone { min-width: auto !important; height: 28px !important; min-height: 28px !important; padding: 0 8px !important; border-radius: 9px !important; font-size: 9.8px !important; }
        .novoPedidoAlert, .slaAlert, .warn { margin-top: 9px !important; padding: 10px 12px !important; border-radius: 14px !important; max-width: 100% !important; }
        .detailModal { width: min(1040px, 95vw) !important; padding: 12px !important; border-radius: 20px !important; }
        .detailHero { padding: 12px !important; border-radius: 16px !important; }
        .detailTitle { font-size: 22px !important; }
        .detailSub { font-size: 12px !important; line-height: 1.3 !important; }
        .detailGrid { gap: 10px !important; }
        .detailMainCard, .detailSideCard { padding: 12px !important; border-radius: 18px !important; }
        @media (max-width: 1280px) { .page { max-width: 1060px !important; } .stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important; } .orderCard { grid-template-columns: minmax(210px, 1.1fr) minmax(135px, 0.68fr) minmax(190px, 1fr) !important; } }
        @media (max-width: 980px) { .orderCard { grid-template-columns: 1fr !important; } .orderCardTop, .orderMoneyRow, .orderDetailsGrid, .orderItemsBlock, .statusControl, .quickActions, .cardActions { grid-column: 1 / -1 !important; } .cardActions { justify-content: flex-start !important; } .itemsModern { flex-wrap: wrap !important; } }
        @media (max-width: 560px) { .page { padding: 10px !important; } .stats { grid-template-columns: 1fr !important; } }

        .dateFilterBar { max-width: 1120px !important; margin: 10px auto 0 !important; padding: 8px 10px !important; border-radius: 16px !important; }
        .dateChip { height: 30px !important; padding: 0 10px !important; font-size: 10.5px !important; }
        .dateField input { height: 30px !important; width: 124px !important; font-size: 10.5px !important; }
        @media (max-width: 760px) { .dateFilterBar { align-items: flex-start !important; } .dateRangeFields { width: 100% !important; } .dateField { flex: 1 1 130px !important; } .dateField input { width: 100% !important; } }

      `}</style>
    </main>
  );
}
