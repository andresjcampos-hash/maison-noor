"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/services/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

type TipoDocumento = "nfe" | "nfce" | "sat" | "cupom" | "manual";
type StatusDocumento = "rascunho" | "confirmado" | "cancelado";
type FormaPagamento =
  | "dinheiro"
  | "pix"
  | "credito"
  | "debito"
  | "boleto"
  | "transferencia"
  | "outros";

type TipoItemFiscal = "revenda" | "embalagem" | "consumo" | "operacional" | "imobilizado";

type CentroCustoFiscal =
  | "revenda"
  | "embalagens"
  | "marketing"
  | "eventos"
  | "operacional"
  | "papelaria"
  | "combustivel"
  | "decoracao"
  | "servicos"
  | "manutencao"
  | "equipamentos"
  | "outros";

type ItemFiscal = {
  id: string;
  produtoId?: string;
  produto: string;
  tipoItem: TipoItemFiscal;
  quantidade: number;
  custoUnitario: number;
  total: number;
};

type FornecedorFiscal = {
  id: string;
  nome: string;
  fantasia?: string;
  cnpj?: string;
  telefone?: string;
  whatsapp?: string;
  tipo?: string;
  status?: string;
  totalCompras?: number;
};

type EntradaFiscal = {
  id: string;
  tipo: TipoDocumento;
  numeroDocumento: string;
  serie?: string;
  chaveAcesso?: string;
  fornecedorId?: string;
  fornecedor: string;
  cnpj?: string;
  telefone?: string;
  centroCusto: CentroCustoFiscal;
  tipoEntradaGeral: TipoItemFiscal;
  dataEmissao: string;
  dataEntrada: string;
  vencimento: string;
  valorProdutos: number;
  frete: number;
  seguro: number;
  outrasDespesas: number;
  desconto: number;
  icms: number;
  ipi: number;
  pis: number;
  cofins: number;
  valorTotal: number;
  formaPagamento: FormaPagamento;
  pago: boolean;
  status: StatusDocumento;
  observacoes?: string;
  itens: ItemFiscal[];
  createdAt?: any;
  updatedAt?: any;
};

type FiltroPeriodo = "mes" | "periodo" | "todos";

const COLLECTION_NAME = "fiscal_entradas";
const FINANCEIRO_ROOT = "financeiro";
const FINANCEIRO_DOC = "default";
const FINANCEIRO_LISTA = "lista";
const FINANCEIRO_LANCAMENTOS = "lancamentos";
const PRODUCTS_COLLECTION = "products";
const ESTOQUE_MOV_COLLECTION = "estoque_movimentacoes";
const FORNECEDORES_COLLECTION = "fornecedores";

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function startOfCurrentMonthInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateBR(date?: string): string {
  if (!date) return "—";
  const normalized = date.includes("T") ? date : `${date}T12:00:00`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function toNum(v: string | number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function getDateOnlyTime(date: string): number {
  if (!date) return 0;
  const d = new Date(date.includes("T") ? date : `${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function tipoLabel(tipo: TipoDocumento): string {
  const map: Record<TipoDocumento, string> = {
    nfe: "NF-e",
    nfce: "NFC-e",
    sat: "SAT CF-e",
    cupom: "Cupom simples",
    manual: "Manual",
  };

  return map[tipo] || "Manual";
}

function isDocumentoAtrasado(item: EntradaFiscal): boolean {
  if (item.pago || item.status === "cancelado") return false;

  const venc = getDateOnlyTime(item.vencimento || item.dataEntrada);
  const hoje = getDateOnlyTime(todayInput());

  return Boolean(venc && hoje && venc < hoje);
}

function diasAtraso(item: EntradaFiscal): number {
  if (!isDocumentoAtrasado(item)) return 0;

  const venc = getDateOnlyTime(item.vencimento || item.dataEntrada);
  const hoje = getDateOnlyTime(todayInput());

  return Math.max(0, Math.floor((hoje - venc) / 86400000));
}

function formaLabel(forma: FormaPagamento): string {
  const map: Record<FormaPagamento, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    credito: "Crédito",
    debito: "Débito",
    boleto: "Boleto",
    transferencia: "Transferência",
    outros: "Outros",
  };
  return map[forma] || "Outros";
}


function isoFromDateInput(dateStr: string): string {
  return `${dateStr}T12:00:00.000Z`;
}

function toCompetencia(dateStr: string): string {
  if (!dateStr) return currentMonth();
  return String(dateStr).slice(0, 7);
}

function financeiroDocId(entradaId: string): string {
  return `fiscal_${entradaId}`;
}

function estoqueMovDocId(entradaId: string, itemIndex: number): string {
  return `fiscal_${entradaId}_${itemIndex}`;
}


function tipoItemLabel(tipo: TipoItemFiscal): string {
  const map: Record<TipoItemFiscal, string> = {
    revenda: "Revenda",
    embalagem: "Embalagem",
    consumo: "Consumo interno",
    operacional: "Despesa operacional",
    imobilizado: "Imobilizado",
  };

  return map[tipo] || "Operacional";
}


function centroCustoLabel(centro: CentroCustoFiscal): string {
  const map: Record<CentroCustoFiscal, string> = {
    revenda: "Revenda / CMV",
    embalagens: "Embalagens",
    marketing: "Marketing",
    eventos: "Eventos",
    operacional: "Operacional",
    papelaria: "Papelaria",
    combustivel: "Combustível",
    decoracao: "Decoração",
    servicos: "Serviços",
    manutencao: "Manutenção",
    equipamentos: "Equipamentos",
    outros: "Outros",
  };

  return map[centro] || "Outros";
}

function categoriaFinanceiraPorCentroCusto(centro: CentroCustoFiscal): string {
  const map: Record<CentroCustoFiscal, string> = {
    revenda: "CMV / Mercadoria para revenda",
    embalagens: "Embalagens",
    marketing: "Marketing",
    eventos: "Eventos",
    operacional: "Operacional",
    papelaria: "Papelaria",
    combustivel: "Combustível",
    decoracao: "Decoração",
    servicos: "Serviços",
    manutencao: "Manutenção",
    equipamentos: "Equipamentos",
    outros: "Compras gerais",
  };

  return map[centro] || "Compras gerais";
}

function centroCustoPadraoPorTipo(tipo: TipoItemFiscal): CentroCustoFiscal {
  if (tipo === "revenda") return "revenda";
  if (tipo === "embalagem") return "embalagens";
  if (tipo === "imobilizado") return "equipamentos";
  if (tipo === "consumo") return "operacional";
  return "operacional";
}

function tipoItemMovimentaEstoque(tipo: TipoItemFiscal): boolean {
  return tipo === "revenda";
}

function categoriaFinanceiraPorItens(itens: ItemFiscal[]): string {
  const tipos = new Set(itens.map((item) => item.tipoItem || "operacional"));

  if (tipos.size === 1) {
    const tipo = Array.from(tipos)[0] as TipoItemFiscal;

    if (tipo === "revenda") return "Entrada fiscal / Mercadoria para revenda";
    if (tipo === "embalagem") return "Entrada fiscal / Embalagens";
    if (tipo === "consumo") return "Entrada fiscal / Consumo interno";
    if (tipo === "imobilizado") return "Entrada fiscal / Imobilizado";
    return "Entrada fiscal / Despesa operacional";
  }

  return "Entrada fiscal / Compras gerais";
}

function statusLabel(status: StatusDocumento): string {
  const map: Record<StatusDocumento, string> = {
    rascunho: "Rascunho",
    confirmado: "Confirmado",
    cancelado: "Cancelado",
  };
  return map[status] || "Rascunho";
}

function normalizeEntrada(id: string, raw: any): EntradaFiscal {
  const itensRaw = Array.isArray(raw?.itens) ? raw.itens : [];

  const itens = itensRaw.map((item: any) => {
    const quantidade = Number(item?.quantidade) || 0;
    const custoUnitario = Number(item?.custoUnitario) || 0;

    return {
      id: String(item?.id || uid()),
      produtoId: item?.produtoId ? String(item.produtoId) : undefined,
      produto: String(item?.produto || ""),
      tipoItem: (["revenda", "embalagem", "consumo", "operacional", "imobilizado"].includes(String(item?.tipoItem || "")) ? String(item.tipoItem) : "revenda") as TipoItemFiscal,
      quantidade,
      custoUnitario,
      total: Number(item?.total) || quantidade * custoUnitario,
    } as ItemFiscal;
  });

  return {
    id,
    tipo: ["nfe", "nfce", "sat", "cupom", "manual"].includes(raw?.tipo) ? raw.tipo : "manual",
    numeroDocumento: String(raw?.numeroDocumento || ""),
    serie: raw?.serie ? String(raw.serie) : "",
    chaveAcesso: raw?.chaveAcesso ? String(raw.chaveAcesso) : "",
    fornecedorId: raw?.fornecedorId ? String(raw.fornecedorId) : "",
    fornecedor: String(raw?.fornecedor || ""),
    cnpj: raw?.cnpj ? String(raw.cnpj) : "",
    telefone: raw?.telefone ? String(raw.telefone) : "",
    centroCusto: (["revenda", "embalagens", "marketing", "eventos", "operacional", "papelaria", "combustivel", "decoracao", "servicos", "manutencao", "equipamentos", "outros"].includes(String(raw?.centroCusto || "")) ? String(raw.centroCusto) : "operacional") as CentroCustoFiscal,
    tipoEntradaGeral: (["revenda", "embalagem", "consumo", "operacional", "imobilizado"].includes(String(raw?.tipoEntradaGeral || "")) ? String(raw.tipoEntradaGeral) : "revenda") as TipoItemFiscal,
    dataEmissao: String(raw?.dataEmissao || todayInput()).slice(0, 10),
    dataEntrada: String(raw?.dataEntrada || todayInput()).slice(0, 10),
    valorProdutos: Number(raw?.valorProdutos) || 0,
    frete: Number(raw?.frete) || 0,
    seguro: Number(raw?.seguro) || 0,
    outrasDespesas: Number(raw?.outrasDespesas) || Number(raw?.outrosCustos) || 0,
    desconto: Number(raw?.desconto) || 0,
    icms: Number(raw?.icms) || 0,
    ipi: Number(raw?.ipi) || 0,
    pis: Number(raw?.pis) || 0,
    cofins: Number(raw?.cofins) || 0,
    valorTotal: Number(raw?.valorTotal) || 0,
    formaPagamento: ["dinheiro", "pix", "credito", "debito", "boleto", "transferencia", "outros"].includes(raw?.formaPagamento)
      ? raw.formaPagamento
      : "pix",
    pago: Boolean(raw?.pago),
    vencimento: raw?.vencimento ? String(raw.vencimento).slice(0, 10) : "",
    status: ["rascunho", "confirmado", "cancelado"].includes(raw?.status) ? raw.status : "rascunho",
    observacoes: raw?.observacoes ? String(raw.observacoes) : "",
    itens,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function emptyItem(tipoItem: TipoItemFiscal = "revenda"): ItemFiscal {
  return {
    id: uid(),
    produto: "",
    tipoItem,
    quantidade: 1,
    custoUnitario: 0,
    total: 0,
  };
}

function createEmptyForm(): EntradaFiscal {
  return {
    id: "NEW",
    tipo: "sat",
    numeroDocumento: "",
    serie: "",
    chaveAcesso: "",
    fornecedorId: "",
    fornecedor: "",
    cnpj: "",
    telefone: "",
    centroCusto: "revenda",
    tipoEntradaGeral: "revenda",
    dataEmissao: todayInput(),
    dataEntrada: todayInput(),
    valorProdutos: 0,
    frete: 0,
    seguro: 0,
    outrasDespesas: 0,
    desconto: 0,
    icms: 0,
    ipi: 0,
    pis: 0,
    cofins: 0,
    valorTotal: 0,
    formaPagamento: "pix",
    pago: true,
    vencimento: "",
    status: "rascunho",
    observacoes: "",
    itens: [emptyItem()],
  };
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}


async function syncFinanceiroEntradaFiscal(
  entradaId: string,
  entrada: EntradaFiscal,
  itensValidos: ItemFiscal[]
): Promise<void> {
  const lancId = financeiroDocId(entradaId);

  if (entrada.status !== "confirmado") {
    await Promise.allSettled([
      deleteDoc(doc(db, FINANCEIRO_ROOT, FINANCEIRO_DOC, FINANCEIRO_LISTA, lancId)),
      deleteDoc(doc(db, FINANCEIRO_ROOT, FINANCEIRO_DOC, FINANCEIRO_LANCAMENTOS, lancId)),
    ]);
    return;
  }

  const descricao = `Entrada fiscal ${tipoLabel(entrada.tipo)} ${entrada.numeroDocumento} - ${entrada.fornecedor}`;
  const dataIso = isoFromDateInput(entrada.dataEntrada);

  const payload = cleanUndefined({
    id: lancId,
    data: dataIso,
    competencia: toCompetencia(entrada.dataEntrada),
    tipo: "despesa",
    descricao,
    categoria: categoriaFinanceiraPorCentroCusto(entrada.centroCusto || "outros"),
    centroCusto: entrada.centroCusto || "outros",
    centroCustoLabel: centroCustoLabel(entrada.centroCusto || "outros"),
    categoriaFiscalItens: categoriaFinanceiraPorItens(itensValidos),
    forma: entrada.formaPagamento,
    valor: Number(entrada.valorTotal || 0),
    status: entrada.pago ? "pago" : "pendente",
    vencimento: entrada.vencimento || entrada.dataEntrada,
    dataVencimento: entrada.vencimento || entrada.dataEntrada,
    observacoes:
      entrada.observacoes ||
      `Gerado automaticamente pelo módulo Fiscal. Documento: ${tipoLabel(entrada.tipo)} ${entrada.numeroDocumento}. Itens: ${itensValidos.length}.`,
    origemFiscalId: entradaId,
    numeroDocumentoFiscal: entrada.numeroDocumento,
    fornecedorNome: entrada.fornecedor,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await Promise.all([
    setDoc(doc(db, FINANCEIRO_ROOT, FINANCEIRO_DOC, FINANCEIRO_LISTA, lancId), payload, { merge: true }),
    setDoc(doc(db, FINANCEIRO_ROOT, FINANCEIRO_DOC, FINANCEIRO_LANCAMENTOS, lancId), payload, { merge: true }),
  ]);
}


async function syncEstoqueEntradaFiscal(
  entradaId: string,
  entrada: EntradaFiscal,
  itensValidos: ItemFiscal[]
): Promise<void> {
  if (entrada.status !== "confirmado") {
    await Promise.allSettled(
      itensValidos.map((_, index) =>
        deleteDoc(doc(db, ESTOQUE_MOV_COLLECTION, estoqueMovDocId(entradaId, index)))
      )
    );
    return;
  }

  for (let index = 0; index < itensValidos.length; index += 1) {
    const item = itensValidos[index];
    if (!tipoItemMovimentaEstoque(item.tipoItem || "operacional")) continue;

    const produtoId = String(item.produtoId || "").trim();
    const quantidadeEntrada = Math.max(0, Number(item.quantidade || 0));
    const custoUnitarioEntrada = Math.max(0, Number(item.custoUnitario || 0));
    const totalItem = Math.max(0, Number(item.total || quantidadeEntrada * custoUnitarioEntrada));

    if (!produtoId || quantidadeEntrada <= 0) continue;

    const productRef = doc(db, PRODUCTS_COLLECTION, produtoId);
    const productSnap = await getDoc(productRef);

    const produtoAtual = productSnap.exists() ? (productSnap.data() as any) : {};
    const estoqueAtual = Number(produtoAtual?.estoque || 0);
    const custoAtual = Number(produtoAtual?.precoCompra || produtoAtual?.custo || 0);

    const novoEstoque = estoqueAtual + quantidadeEntrada;
    const custoMedio =
      novoEstoque > 0
        ? ((estoqueAtual * custoAtual) + (quantidadeEntrada * custoUnitarioEntrada)) / novoEstoque
        : custoUnitarioEntrada;

    await updateDoc(productRef, cleanUndefined({
      estoque: novoEstoque,
      precoCompra: Number(custoMedio.toFixed(2)),
      custo: Number(custoMedio.toFixed(2)),
      ultimoCustoCompra: custoUnitarioEntrada,
      ultimaEntradaFiscalId: entradaId,
      ultimaEntradaFiscalData: entrada.dataEntrada,
      updatedAt: serverTimestamp(),
    }));

    await setDoc(
      doc(db, ESTOQUE_MOV_COLLECTION, estoqueMovDocId(entradaId, index)),
      cleanUndefined({
        id: estoqueMovDocId(entradaId, index),
        tipo: "entrada",
        origem: "fiscal",
        origemFiscalId: entradaId,
        produtoId,
        produtoNome: item.produto,
        quantidade: quantidadeEntrada,
        custoUnitario: custoUnitarioEntrada,
        total: totalItem,
        estoqueAnterior: estoqueAtual,
        estoqueNovo: novoEstoque,
        custoMedioAnterior: custoAtual,
        custoMedioNovo: Number(custoMedio.toFixed(2)),
        fornecedor: entrada.fornecedor,
        numeroDocumento: entrada.numeroDocumento,
        data: isoFromDateInput(entrada.dataEntrada),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  }
}


async function syncFornecedorHistorico(
  entrada: EntradaFiscal,
  valorTotal: number
): Promise<void> {
  if (!entrada.fornecedorId || entrada.status !== "confirmado") return;

  const ref = doc(db, FORNECEDORES_COLLECTION, entrada.fornecedorId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const atual = snap.data() as any;
  const totalAtual = Number(atual?.totalCompras || 0);

  await updateDoc(ref, cleanUndefined({
    totalCompras: totalAtual + Number(valorTotal || 0),
    ultimaCompra: entrada.dataEntrada,
    ultimoDocumentoFiscalId: entrada.id,
    ultimoDocumentoFiscalNumero: entrada.numeroDocumento,
    updatedAt: serverTimestamp(),
  }));
}


function textContentByTag(root: Document | Element, tag: string): string {
  const direct = root.getElementsByTagName(tag)?.[0]?.textContent;
  return String(direct || "").trim();
}

function allByTag(root: Document | Element, tag: string): Element[] {
  return Array.from(root.getElementsByTagName(tag));
}

function chaveAcessoFromXml(xml: Document): string {
  const infNFe = xml.getElementsByTagName("infNFe")?.[0];
  const id = infNFe?.getAttribute("Id") || "";
  return id.replace(/^NFe/i, "").trim();
}

function dateFromXml(value: string): string {
  if (!value) return todayInput();
  return String(value).slice(0, 10);
}

function tipoDocumentoFromXml(xml: Document): TipoDocumento {
  const mod = textContentByTag(xml, "mod");

  if (mod === "55") return "nfe";
  if (mod === "65") return "nfce";
  if (mod === "59") return "sat";

  const cfe = xml.getElementsByTagName("CFe")?.[0] || xml.getElementsByTagName("infCFe")?.[0];
  if (cfe) return "sat";

  return "manual";
}

function getFornecedorFromXml(xml: Document) {
  const emit = xml.getElementsByTagName("emit")?.[0] || xml.getElementsByTagName("Emit")?.[0];

  return {
    nome: textContentByTag(emit || xml, "xNome") || textContentByTag(emit || xml, "xFant"),
    cnpj: textContentByTag(emit || xml, "CNPJ") || textContentByTag(emit || xml, "CPF"),
    telefone: textContentByTag(emit || xml, "fone"),
  };
}

function getTotaisFromXml(xml: Document) {
  const icmsTot = xml.getElementsByTagName("ICMSTot")?.[0];
  const totalCFe = xml.getElementsByTagName("total")?.[0];

  const valorProdutos =
    toNum(textContentByTag(icmsTot || xml, "vProd")) ||
    toNum(textContentByTag(totalCFe || xml, "vCFe")) ||
    0;

  const frete = toNum(textContentByTag(icmsTot || xml, "vFrete"));
  const seguro = toNum(textContentByTag(icmsTot || xml, "vSeg"));
  const outrasDespesas = toNum(textContentByTag(icmsTot || xml, "vOutro"));
  const desconto = toNum(textContentByTag(icmsTot || xml, "vDesc"));
  const icms = toNum(textContentByTag(icmsTot || xml, "vICMS"));
  const ipi = toNum(textContentByTag(icmsTot || xml, "vIPI"));
  const pis = toNum(textContentByTag(icmsTot || xml, "vPIS"));
  const cofins = toNum(textContentByTag(icmsTot || xml, "vCOFINS"));

  const valorTotal =
    toNum(textContentByTag(icmsTot || xml, "vNF")) ||
    toNum(textContentByTag(totalCFe || xml, "vCFe")) ||
    Math.max(0, valorProdutos + frete - desconto);

  return {
    valorProdutos,
    frete,
    seguro,
    outrasDespesas,
    desconto,
    icms,
    ipi,
    pis,
    cofins,
    valorTotal,
  };
}

function getItensFromXml(xml: Document): ItemFiscal[] {
  const dets = allByTag(xml, "det");

  const itens = dets.map((det) => {
    const prod = det.getElementsByTagName("prod")?.[0] || det;

    const nome = textContentByTag(prod, "xProd") || textContentByTag(prod, "xItem") || "Item XML";
    const quantidade = toNum(textContentByTag(prod, "qCom") || textContentByTag(prod, "qTrib") || "1") || 1;
    const custoUnitario = toNum(textContentByTag(prod, "vUnCom") || textContentByTag(prod, "vUnTrib"));
    const total = toNum(textContentByTag(prod, "vProd")) || quantidade * custoUnitario;

    return {
      id: uid(),
      produto: nome,
      tipoItem: "revenda" as TipoItemFiscal,
      quantidade,
      custoUnitario: custoUnitario || (quantidade > 0 ? total / quantidade : total),
      total,
    };
  });

  return itens.length ? itens : [emptyItem("revenda")];
}

function parseFiscalXml(xmlText: string): EntradaFiscal {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");

  const parserError = xml.getElementsByTagName("parsererror")?.[0];
  if (parserError) {
    throw new Error("XML inválido ou não reconhecido.");
  }

  const ide = xml.getElementsByTagName("ide")?.[0] || xml.getElementsByTagName("Ide")?.[0];
  const fornecedor = getFornecedorFromXml(xml);
  const totais = getTotaisFromXml(xml);
  const itens = getItensFromXml(xml);

  const numeroDocumento =
    textContentByTag(ide || xml, "nNF") ||
    textContentByTag(xml, "nCFe") ||
    textContentByTag(xml, "cNF") ||
    "";

  const serie = textContentByTag(ide || xml, "serie") || textContentByTag(xml, "nserieSAT") || "";
  const dataEmissao =
    dateFromXml(textContentByTag(ide || xml, "dhEmi") || textContentByTag(ide || xml, "dEmi"));

  return recalcularEntradaFiscal({
    ...createEmptyForm(),
    tipo: tipoDocumentoFromXml(xml),
    numeroDocumento,
    serie,
    chaveAcesso: chaveAcessoFromXml(xml),
    fornecedor: fornecedor.nome || "",
    cnpj: fornecedor.cnpj || "",
    telefone: fornecedor.telefone || "",
    centroCusto: "revenda",
    dataEmissao,
    dataEntrada: todayInput(),
    vencimento: todayInput(),
    tipoEntradaGeral: "revenda",
    valorProdutos: totais.valorProdutos,
    frete: totais.frete,
    seguro: totais.seguro,
    outrasDespesas: totais.outrasDespesas,
    desconto: totais.desconto,
    icms: totais.icms,
    ipi: totais.ipi,
    pis: totais.pis,
    cofins: totais.cofins,
    valorTotal: totais.valorTotal,
    itens,
    observacoes: "Importado via XML.",
  });
}

function recalcularEntradaFiscal(next: EntradaFiscal): EntradaFiscal {
  const itens = next.itens.map((item) => {
    const quantidade = Number(item.quantidade) || 0;
    const custoUnitario = Number(item.custoUnitario) || 0;

    return {
      ...item,
      quantidade,
      custoUnitario,
      total: Number(item.total || quantidade * custoUnitario) || 0,
    };
  });

  const valorProdutos = itens.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
  const frete = Number(next.frete) || 0;
  const seguro = Number(next.seguro) || 0;
  const outrasDespesas = Number(next.outrasDespesas) || 0;
  const desconto = Number(next.desconto) || 0;
  const icms = Number(next.icms) || 0;
  const ipi = Number(next.ipi) || 0;
  const pis = Number(next.pis) || 0;
  const cofins = Number(next.cofins) || 0;
  const valorTotal = Math.max(0, valorProdutos + frete + seguro + outrasDespesas + ipi - desconto);

  return {
    ...next,
    itens,
    valorProdutos,
    frete,
    seguro,
    outrasDespesas,
    desconto,
    icms,
    ipi,
    pis,
    cofins,
    valorTotal,
  };
}

export default function FiscalPage() {
  const [items, setItems] = useState<EntradaFiscal[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | TipoDocumento>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | StatusDocumento>("todos");
  const [periodoTipo, setPeriodoTipo] = useState<FiltroPeriodo>("mes");
  const [competenciaFilter, setCompetenciaFilter] = useState(currentMonth());
  const [dataInicio, setDataInicio] = useState(startOfCurrentMonthInput());
  const [dataFim, setDataFim] = useState(todayInput());

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntradaFiscal>(() => createEmptyForm());
  const xmlInputRef = useRef<HTMLInputElement | null>(null);

  function showToast(msg: string, ms = 2200) {
    setToast(msg);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setToast(""), ms);
    }
  }

  async function carregarEntradas() {
    setLoading(true);
    try {
      const qRef = query(collection(db, COLLECTION_NAME), orderBy("dataEntrada", "desc"));
      const snap = await getDocs(qRef);
      const list = snap.docs.map((d) => normalizeEntrada(d.id, d.data()));
      setItems(list);
    } catch (error) {
      console.error("[Fiscal] Erro ao carregar entradas fiscais:", error);
      showToast("❌ Erro ao carregar documentos fiscais.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarFornecedores() {
    try {
      const qRef = query(collection(db, FORNECEDORES_COLLECTION), orderBy("nome", "asc"));
      const snap = await getDocs(qRef);

      const list = snap.docs
        .map((d) => {
          const data = d.data() as any;

          return {
            id: d.id,
            nome: String(data?.nome || ""),
            fantasia: data?.fantasia ? String(data.fantasia) : "",
            cnpj: data?.cnpj ? String(data.cnpj) : "",
            telefone: data?.telefone ? String(data.telefone) : "",
            whatsapp: data?.whatsapp ? String(data.whatsapp) : "",
            tipo: data?.tipo ? String(data.tipo) : "",
            status: data?.status ? String(data.status) : "ativo",
            totalCompras: Number(data?.totalCompras || 0),
          } as FornecedorFiscal;
        })
        .filter((item) => item.nome && item.status !== "inativo");

      setFornecedores(list);
    } catch (error) {
      console.error("[Fiscal] Erro ao carregar fornecedores:", error);
    }
  }

  useEffect(() => {
    void carregarEntradas();
    void carregarFornecedores();
  }, []);

  function recalcularTotais(next: EntradaFiscal): EntradaFiscal {
    const itens = next.itens.map((item) => {
      const quantidade = Number(item.quantidade) || 0;
      const custoUnitario = Number(item.custoUnitario) || 0;
      return {
        ...item,
        quantidade,
        custoUnitario,
        total: quantidade * custoUnitario,
      };
    });

    const valorProdutos = itens.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
    const frete = Number(next.frete) || 0;
    const seguro = Number(next.seguro) || 0;
    const outrasDespesas = Number(next.outrasDespesas) || 0;
    const desconto = Number(next.desconto) || 0;
    const icms = Number(next.icms) || 0;
    const ipi = Number(next.ipi) || 0;
    const pis = Number(next.pis) || 0;
    const cofins = Number(next.cofins) || 0;
    const valorTotal = Math.max(0, valorProdutos + frete + seguro + outrasDespesas + ipi - desconto);

    return {
      ...next,
      itens,
      valorProdutos,
      frete,
      seguro,
      outrasDespesas,
      desconto,
      icms,
      ipi,
      pis,
      cofins,
      valorTotal,
    };
  }

  function setFormField<K extends keyof EntradaFiscal>(key: K, value: EntradaFiscal[K]) {
    setForm((prev) => recalcularTotais({ ...prev, [key]: value }));
  }

  function selecionarFornecedor(fornecedorId: string) {
    const fornecedor = fornecedores.find((item) => item.id === fornecedorId);

    if (!fornecedor) {
      setFormField("fornecedorId", "");
      return;
    }

    setForm((prev) =>
      recalcularTotais({
        ...prev,
        fornecedorId: fornecedor.id,
        fornecedor: fornecedor.nome,
        cnpj: fornecedor.cnpj || prev.cnpj || "",
        telefone: fornecedor.whatsapp || fornecedor.telefone || prev.telefone || "",
      })
    );
  }

  function importarXml(file: File): void {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const xmlText = String(reader.result || "");
        const parsed = parseFiscalXml(xmlText);

        setEditingId(null);
        setForm(parsed);
        setOpen(true);
        showToast("✅ XML importado. Confira os dados antes de confirmar.");
      } catch (error) {
        console.error("[Fiscal] Erro ao importar XML:", error);
        showToast("❌ Não consegui ler o XML. Verifique se é NF-e, NFC-e ou SAT válido.", 4200);
      } finally {
        if (xmlInputRef.current) xmlInputRef.current.value = "";
      }
    };

    reader.readAsText(file, "utf-8");
  }

  function updateItem(itemId: string, patch: Partial<ItemFiscal>) {
    setForm((prev) =>
      recalcularTotais({
        ...prev,
        itens: prev.itens.map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...patch,
              }
            : item
        ),
      })
    );
  }

  function addItem() {
    setForm((prev) => recalcularTotais({ ...prev, itens: [...prev.itens, emptyItem(prev.tipoEntradaGeral || "revenda")] }));
  }

  function removeItem(itemId: string) {
    setForm((prev) => {
      const nextItens = prev.itens.filter((item) => item.id !== itemId);
      return recalcularTotais({ ...prev, itens: nextItens.length ? nextItens : [emptyItem()] });
    });
  }

  function openNew() {
    setEditingId(null);
    setForm(createEmptyForm());
    setOpen(true);
  }

  function openEdit(item: EntradaFiscal) {
    setEditingId(item.id);
    setForm(recalcularTotais({ ...item, itens: item.itens.length ? item.itens : [emptyItem()] }));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
  }

  async function save(statusForcado?: StatusDocumento) {
    const normalized = recalcularTotais({
      ...form,
      status: statusForcado || form.status,
    });

    if (!normalized.fornecedor.trim()) {
      showToast("⚠️ Informe o fornecedor.");
      return;
    }

    if (!normalized.numeroDocumento.trim()) {
      showToast("⚠️ Informe o número do documento.");
      return;
    }

    const itensValidos = normalized.itens.filter(
      (item) => item.produto.trim() && Number(item.quantidade) > 0 && Number(item.custoUnitario) >= 0
    );

    if (!itensValidos.length) {
      showToast("⚠️ Adicione pelo menos um item válido.");
      return;
    }

    const payload = cleanUndefined({
      tipo: normalized.tipo,
      numeroDocumento: normalized.numeroDocumento.trim(),
      serie: normalized.serie?.trim() || "",
      chaveAcesso: normalized.chaveAcesso?.trim() || "",
      fornecedor: normalized.fornecedor.trim(),
      cnpj: normalized.cnpj?.trim() || "",
      telefone: normalized.telefone?.trim() || "",
      centroCusto: normalized.centroCusto || "outros",
      dataEmissao: normalized.dataEmissao,
      dataEntrada: normalized.dataEntrada,
      valorProdutos: normalized.valorProdutos,
      frete: normalized.frete,
      seguro: normalized.seguro,
      outrasDespesas: normalized.outrasDespesas,
      desconto: normalized.desconto,
      icms: normalized.icms,
      ipi: normalized.ipi,
      pis: normalized.pis,
      cofins: normalized.cofins,
      valorTotal: normalized.valorTotal,
      formaPagamento: normalized.formaPagamento,
      pago: normalized.pago,
      vencimento: normalized.vencimento || "",
      status: normalized.status,
      observacoes: normalized.observacoes?.trim() || "",
      itens: itensValidos.map((item) => ({
        id: item.id,
        produtoId: item.produtoId || "",
        produto: item.produto.trim(),
        quantidade: Number(item.quantidade) || 0,
        custoUnitario: Number(item.custoUnitario) || 0,
        total: Number(item.total) || 0,
      })),
      updatedAt: serverTimestamp(),
    });

    try {
      showToast("⏳ Salvando entrada fiscal...");

      let entradaId = editingId || "";

      if (editingId) {
        const ref = doc(db, COLLECTION_NAME, editingId);
        await updateDoc(ref, payload);
      } else {
        const created = await addDoc(collection(db, COLLECTION_NAME), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        entradaId = created.id;
      }

      const entradaNormalizada = {
        ...normalized,
        itens: itensValidos,
      };

      await syncFinanceiroEntradaFiscal(
        entradaId,
        entradaNormalizada,
        itensValidos
      );

      await syncEstoqueEntradaFiscal(
        entradaId,
        entradaNormalizada,
        itensValidos
      );

      await syncFornecedorHistorico(
        {
          ...entradaNormalizada,
          id: entradaId,
        },
        Number(entradaNormalizada.valorTotal || 0)
      );

      await carregarEntradas();
      await carregarFornecedores();

      if (normalized.status === "confirmado") {
        showToast("✅ Entrada fiscal confirmada, estoque atualizado e financeiro lançado!");
      } else {
        showToast("✅ Entrada fiscal salva como rascunho. Financeiro não lançado.");
      }

      closeModal();
    } catch (error) {
      console.error("[Fiscal] Erro ao salvar entrada fiscal:", error);
      showToast("❌ Erro ao salvar/integrar no Firestore.");
    }
  }

  async function excluir(item: EntradaFiscal) {
    const ok = typeof window === "undefined" ? true : window.confirm(`Excluir o documento ${item.numeroDocumento}?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, COLLECTION_NAME, item.id));
      setItems((prev) => prev.filter((entrada) => entrada.id !== item.id));
      showToast("🗑️ Documento fiscal excluído.");
      closeModal();
    } catch (error) {
      console.error("[Fiscal] Erro ao excluir:", error);
      showToast("❌ Erro ao excluir documento.");
    }
  }

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
    } else if (kind === "ano") {
      startDate = new Date(hoje.getFullYear(), 0, 1);
    }

    setDataInicio(`${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`);
    setDataFim(end);
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const startMs = periodoTipo === "periodo" ? getDateOnlyTime(dataInicio) : 0;
    const endMs = periodoTipo === "periodo" ? getDateOnlyTime(dataFim) : 0;

    return items
      .filter((item) => {
        if (tipoFilter !== "todos" && item.tipo !== tipoFilter) return false;
        if (statusFilter !== "todos" && item.status !== statusFilter) return false;

        if (periodoTipo === "mes" && competenciaFilter) {
          if (!String(item.dataEntrada || "").startsWith(competenciaFilter)) return false;
        }

        if (periodoTipo === "periodo") {
          const itemMs = getDateOnlyTime(item.dataEntrada);
          if (startMs && itemMs < startMs) return false;
          if (endMs && itemMs > endMs) return false;
        }

        if (!qq) return true;

        const hay = `${item.numeroDocumento} ${item.serie || ""} ${item.chaveAcesso || ""} ${item.fornecedor} ${item.cnpj || ""} ${item.observacoes || ""} ${item.itens.map((i) => i.produto).join(" ")}`.toLowerCase();
        return hay.includes(qq);
      })
      .sort((a, b) => String(b.dataEntrada || "").localeCompare(String(a.dataEntrada || "")));
  }, [items, q, tipoFilter, statusFilter, periodoTipo, competenciaFilter, dataInicio, dataFim]);

  const totals = useMemo(() => {
    const totalGeral = filtered.reduce((acc, item) => acc + (Number(item.valorTotal) || 0), 0);
    const totalProdutos = filtered.reduce((acc, item) => acc + (Number(item.valorProdutos) || 0), 0);
    const totalFrete = filtered.reduce((acc, item) => acc + (Number(item.frete) || 0), 0);
    const totalSeguro = filtered.reduce((acc, item) => acc + (Number(item.seguro) || 0), 0);
    const totalOutrasDespesas = filtered.reduce((acc, item) => acc + (Number(item.outrasDespesas) || 0), 0);
    const totalDesconto = filtered.reduce((acc, item) => acc + (Number(item.desconto) || 0), 0);
    const totalIcms = filtered.reduce((acc, item) => acc + (Number(item.icms) || 0), 0);
    const totalIpi = filtered.reduce((acc, item) => acc + (Number(item.ipi) || 0), 0);
    const totalPis = filtered.reduce((acc, item) => acc + (Number(item.pis) || 0), 0);
    const totalCofins = filtered.reduce((acc, item) => acc + (Number(item.cofins) || 0), 0);
    const totalImpostos = totalIcms + totalIpi + totalPis + totalCofins;
    const confirmados = filtered.filter((item) => item.status === "confirmado").length;
    const rascunhos = filtered.filter((item) => item.status === "rascunho").length;
    const totalItens = filtered.reduce((acc, item) => acc + item.itens.reduce((sum, i) => sum + (Number(i.quantidade) || 0), 0), 0);
    const fornecedores = new Set(filtered.map((item) => item.fornecedor.trim()).filter(Boolean)).size;
    const itensRevenda = filtered.reduce((acc, item) => acc + item.itens.filter((i) => (i.tipoItem || "revenda") === "revenda").length, 0);
    const itensGerais = filtered.reduce((acc, item) => acc + item.itens.filter((i) => (i.tipoItem || "revenda") !== "revenda").length, 0);

    return {
      totalGeral,
      totalProdutos,
      totalFrete,
      totalSeguro,
      totalOutrasDespesas,
      totalDesconto,
      totalIcms,
      totalIpi,
      totalPis,
      totalCofins,
      totalImpostos,
      confirmados,
      rascunhos,
      totalItens,
      fornecedores,
      itensRevenda,
      itensGerais,
    };
  }, [filtered]);

  const recente = filtered.slice(0, 5);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <div className="kicker">MAISON NOOR</div>
          <h1>CRM • Documentos Fiscais</h1>
          <p>
            Registre entradas fiscais, SAT, NF-e, NFC-e, cupom ou compra manual para organizar compras, fornecedores, histórico de compras e custo real.
          </p>
        </div>

        <div className="heroActions">
          <span className="syncBadge">● Fiscal em tempo real</span>

          <button className="btn primary" type="button" onClick={openNew}>
            + Nova entrada
          </button>

          <button
            className="btn"
            type="button"
            onClick={() => xmlInputRef.current?.click()}
          >
            Importar XML
          </button>

          <button className="btn" type="button" onClick={() => void carregarEntradas()}>
            Atualizar
          </button>

          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];

              if (file) {
                importarXml(file);
              }
            }}
          />
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
          <div className="field wideField">
            <label>Busca</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Fornecedor, documento, CNPJ, chave, produto..."
            />
          </div>

          <div className="field">
            <label>Tipo</label>
            <select className="input" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value as "todos" | TipoDocumento)}>
              <option value="todos">Todos</option>
              <option value="nfe">NF-e</option>
              <option value="nfce">NFC-e</option>
              <option value="sat">SAT CF-e</option>
              <option value="cupom">Cupom simples</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          <div className="field">
            <label>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "todos" | StatusDocumento)}>
              <option value="todos">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="confirmado">Confirmado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div className="field">
            <label>Filtro</label>
            <select className="input" value={periodoTipo} onChange={(e) => setPeriodoTipo(e.target.value as FiltroPeriodo)}>
              <option value="mes">Mês</option>
              <option value="periodo">Período</option>
              <option value="todos">Todos</option>
            </select>
          </div>

          {periodoTipo === "mes" ? (
            <div className="field">
              <label>Mês</label>
              <input className="input" type="month" value={competenciaFilter} onChange={(e) => setCompetenciaFilter(e.target.value)} />
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
        </div>
      </section>

      <section className="kpis">
        <Kpi title="Valor total" value={formatBRL(totals.totalGeral)} hint="Entradas no filtro" tone="gold" />
        <Kpi title="Produtos" value={formatBRL(totals.totalProdutos)} hint="Total dos itens" />
        <Kpi title="Frete" value={formatBRL(totals.totalFrete)} hint="Custos de entrega" />
        <Kpi title="Descontos" value={formatBRL(totals.totalDesconto)} hint="Reduções registradas" />
        <Kpi title="Impostos" value={formatBRL(totals.totalImpostos)} hint="ICMS, IPI, PIS e COFINS" tone="gold" />
        <Kpi title="Confirmados" value={String(totals.confirmados)} hint="Prontos para integrar" tone="green" />
        <Kpi title="Rascunhos" value={String(totals.rascunhos)} hint="Pendentes de conferência" tone="gold" />
        <Kpi title="Itens" value={String(totals.totalItens)} hint="Quantidade comprada" />
        <Kpi title="Fornecedores" value={String(totals.fornecedores)} hint="No filtro atual" />
        <Kpi title="Centro de custo" value="Ativo" hint="Classificação financeira automática" tone="green" />
      </section>

      <section className="premiumPanel fiscalOverview">
        <div className="fiscalOverviewText">
          <div className="sectionKicker">Módulo Fiscal</div>
          <h2>Entrada fiscal inteligente</h2>
          <p>
            Importe XML ou cadastre manualmente. O Fiscal organiza compras, fornecedores,
            financeiro, impostos, centro de custo e estoque em um único fluxo.
          </p>
        </div>

        <div className="phaseGrid fiscalOverviewGrid">
          <div><strong>XML</strong><span>NF-e, NFC-e e SAT</span></div>
          <div><strong>Fiscal</strong><span>Documento e itens</span></div>
          <div><strong>Financeiro</strong><span>Despesa automática</span></div>
          <div><strong>Estoque</strong><span>Revenda e custo</span></div>
        </div>
      </section>

      <section className="listsGrid">
        <section className="miniList">
          <h3>Últimas entradas fiscais</h3>
          {recente.length ? recente.map((item) => (
            <div className="miniItem" key={item.id} onClick={() => openEdit(item)}>
              <div>
                <strong>{item.fornecedor}</strong><br />
                <small>{tipoLabel(item.tipo)} • Nº {item.numeroDocumento} • {formatDateBR(item.dataEntrada)}</small>
              </div>
              <strong>{formatBRL(item.valorTotal)}</strong>
            </div>
          )) : <div className="empty">Nenhum documento fiscal cadastrado.</div>}
        </section>

        <section className="miniList">
          <h3>Resumo fiscal</h3>
          <div className="resumeFiscal">
            <div><span>Total filtrado</span><strong>{formatBRL(totals.totalGeral)}</strong></div>
            <div><span>Documentos</span><strong>{filtered.length}</strong></div>
            <div><span>Itens comprados</span><strong>{totals.totalItens}</strong></div>
            <div><span>Impostos</span><strong>{formatBRL(totals.totalImpostos)}</strong></div>
            <div><span>Fornecedores</span><strong>{totals.fornecedores}</strong></div>
          </div>
        </section>
      </section>

      <section className="tableShell">
        <div className="tableHead">
          <div>
            <div className="sectionKicker">Documentos</div>
            <h2>Entradas fiscais</h2>
          </div>
          <div className="tableCounters">
            <span>{filtered.length} documento(s)</span>
            <strong>{formatBRL(totals.totalGeral)}</strong>
          </div>
        </div>

        <div className="entries">
          {loading ? <div className="empty">Carregando documentos fiscais...</div> : null}

          {!loading && filtered.map((item) => (
            <article key={item.id} className="entry" onClick={() => openEdit(item)} role="button" tabIndex={0}>
              <div className={`entryIcon ${item.status}`}>{tipoLabel(item.tipo).slice(0, 2)}</div>

              <div className="entryMain">
                <div className="entryTop">
                  <strong>{item.fornecedor}</strong>
                  <span className={`pill ${item.status}`}>{statusLabel(item.status)}</span>
                  <span className="pill neutral">{tipoLabel(item.tipo)}</span>
                </div>
                <div className="entryMeta">
                  Nº {item.numeroDocumento || "—"} {item.serie ? `• Série ${item.serie}` : ""} • Entrada {formatDateBR(item.dataEntrada)}
                  {item.cnpj ? ` • ${item.cnpj}` : ""} • {centroCustoLabel(item.centroCusto || "outros")}
                </div>
              </div>

              <div className="entryValue">
                <strong>{formatBRL(item.valorTotal)}</strong>
                <span>{item.itens.length} item(ns)</span>
              </div>

              <div className="entryActions" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => openEdit(item)}>Editar</button>
                <button type="button" className="danger" onClick={() => void excluir(item)}>Excluir</button>
              </div>
            </article>
          ))}

          {!loading && !filtered.length ? (
            <div className="empty">Nenhuma entrada fiscal encontrada para o filtro atual.</div>
          ) : null}
        </div>
      </section>

      {open ? (
        <div className="modalOverlay" onMouseDown={closeModal} role="presentation">
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="sectionKicker">{editingId ? "Editar documento fiscal" : "Nova entrada fiscal"}</div>
                <h2>{editingId ? `${tipoLabel(form.tipo)} • ${form.numeroDocumento || "Documento"}` : "Cadastro fiscal"}</h2>
                <p>Cadastro manual ou importado por XML. Confira fornecedor, itens, tipo de entrada e valores antes de confirmar.</p>
              </div>
              <button className="btnX" onClick={closeModal} type="button">✕</button>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Documento</span></div>
              <div className="modalGrid">
                <div className="field"><label>Tipo</label><select className="input" value={form.tipo} onChange={(e) => setFormField("tipo", e.target.value as TipoDocumento)}><option value="nfe">NF-e</option><option value="nfce">NFC-e</option><option value="sat">SAT CF-e</option><option value="cupom">Cupom simples</option><option value="manual">Manual</option></select></div>
                <div className="field"><label>Nº documento</label><input className="input" value={form.numeroDocumento} onChange={(e) => setFormField("numeroDocumento", e.target.value)} /></div>
                <div className="field"><label>Série</label><input className="input" value={form.serie || ""} onChange={(e) => setFormField("serie", e.target.value)} /></div>
                <div className="field"><label>Status</label><select className="input" value={form.status} onChange={(e) => setFormField("status", e.target.value as StatusDocumento)}><option value="rascunho">Rascunho</option><option value="confirmado">Confirmado</option><option value="cancelado">Cancelado</option></select></div>
                <div className="field wide"><label>Chave de acesso</label><input className="input" value={form.chaveAcesso || ""} onChange={(e) => setFormField("chaveAcesso", e.target.value)} /></div>
                <div className="field"><label>Data emissão</label><input className="input" type="date" value={form.dataEmissao} onChange={(e) => setFormField("dataEmissao", e.target.value)} /></div>
                <div className="field"><label>Data entrada</label><input className="input" type="date" value={form.dataEntrada} onChange={(e) => setFormField("dataEntrada", e.target.value)} /></div>
              </div>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Fornecedor</span></div>
              <div className="modalGrid">
                <div className="field wide">
                  <label>Fornecedor cadastrado</label>
                  <select className="input" value={form.fornecedorId || ""} onChange={(e) => selecionarFornecedor(e.target.value)}>
                    <option value="">Selecionar fornecedor...</option>
                    {fornecedores.map((fornecedor) => (
                      <option key={fornecedor.id} value={fornecedor.id}>
                        {fornecedor.nome}{fornecedor.cnpj ? ` • ${fornecedor.cnpj}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field wide"><label>Fornecedor / loja</label><input className="input" value={form.fornecedor} onChange={(e) => setFormField("fornecedor", e.target.value)} /></div>
                <div className="field"><label>CNPJ / CPF</label><input className="input" value={form.cnpj || ""} onChange={(e) => setFormField("cnpj", e.target.value)} /></div>
                <div className="field"><label>Telefone</label><input className="input" value={form.telefone || ""} onChange={(e) => setFormField("telefone", e.target.value)} /></div>
              </div>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Itens do documento</span><button type="button" className="miniBtn" onClick={addItem}>+ Adicionar item</button></div>
              <div className="itemsBox">
                {form.itens.map((item, index) => (
                  <div className="itemRow" key={item.id}>
                    <div className="itemIndex">{index + 1}</div>
                    <div className="field itemProduct"><label>Produto / descrição fiscal</label><input className="input" value={item.produto} onChange={(e) => updateItem(item.id, { produto: e.target.value })} placeholder="Ex: perfume, sacola, combustível, decoração..." /></div>
                    <div className="field"><label>Tipo</label><select className="input" value={item.tipoItem || "revenda"} onChange={(e) => updateItem(item.id, { tipoItem: e.target.value as TipoItemFiscal })}><option value="revenda">Revenda</option><option value="embalagem">Embalagem</option><option value="consumo">Consumo</option><option value="operacional">Operacional</option><option value="imobilizado">Imobilizado</option></select></div>
                    <div className="field"><label>Qtd</label><input className="input" value={String(item.quantidade)} onChange={(e) => updateItem(item.id, { quantidade: toNum(e.target.value) })} /></div>
                    <div className="field"><label>Custo unit.</label><input className="input" value={String(item.custoUnitario)} onChange={(e) => updateItem(item.id, { custoUnitario: toNum(e.target.value) })} /></div>
                    <div className="field"><label>Total</label><input className="input readonly" value={formatBRL(item.total)} readOnly /></div>
                    <button type="button" className="removeItem" onClick={() => removeItem(item.id)}>×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Financeiro da entrada</span></div>
              <div className="modalGrid">
                <div className="field"><label>Valor produtos</label><input className="input readonly" value={formatBRL(form.valorProdutos)} readOnly /></div>
                <div className="field"><label>Frete</label><input className="input" value={String(form.frete)} onChange={(e) => setFormField("frete", toNum(e.target.value))} /></div>
                <div className="field"><label>Seguro</label><input className="input" value={String(form.seguro)} onChange={(e) => setFormField("seguro", toNum(e.target.value))} /></div>
                <div className="field"><label>Outras despesas</label><input className="input" value={String(form.outrasDespesas)} onChange={(e) => setFormField("outrasDespesas", toNum(e.target.value))} /></div>
                <div className="field"><label>Desconto</label><input className="input" value={String(form.desconto)} onChange={(e) => setFormField("desconto", toNum(e.target.value))} /></div>

                <div className="field"><label>ICMS</label><input className="input" value={String(form.icms)} onChange={(e) => setFormField("icms", toNum(e.target.value))} /></div>
                <div className="field"><label>IPI</label><input className="input" value={String(form.ipi)} onChange={(e) => setFormField("ipi", toNum(e.target.value))} /></div>
                <div className="field"><label>PIS</label><input className="input" value={String(form.pis)} onChange={(e) => setFormField("pis", toNum(e.target.value))} /></div>
                <div className="field"><label>COFINS</label><input className="input" value={String(form.cofins)} onChange={(e) => setFormField("cofins", toNum(e.target.value))} /></div>

                <div className="field"><label>Total impostos</label><input className="input readonly" value={formatBRL((Number(form.icms) || 0) + (Number(form.ipi) || 0) + (Number(form.pis) || 0) + (Number(form.cofins) || 0))} readOnly /></div>
                <div className="field"><label>Total</label><input className="input readonly strongInput" value={formatBRL(form.valorTotal)} readOnly /></div>

                <div className="field">
                  <label>Centro de custo</label>
                  <select className="input" value={form.centroCusto || "outros"} onChange={(e) => setFormField("centroCusto", e.target.value as CentroCustoFiscal)}>
                    <option value="revenda">Revenda / CMV</option>
                    <option value="embalagens">Embalagens</option>
                    <option value="marketing">Marketing</option>
                    <option value="eventos">Eventos</option>
                    <option value="operacional">Operacional</option>
                    <option value="papelaria">Papelaria</option>
                    <option value="combustivel">Combustível</option>
                    <option value="decoracao">Decoração</option>
                    <option value="servicos">Serviços</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="equipamentos">Equipamentos</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <div className="field"><label>Forma pagamento</label><select className="input" value={form.formaPagamento} onChange={(e) => setFormField("formaPagamento", e.target.value as FormaPagamento)}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="credito">Crédito</option><option value="debito">Débito</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="outros">Outros</option></select></div>
                <div className="field"><label>Pagamento</label><select className="input" value={form.pago ? "sim" : "nao"} onChange={(e) => setFormField("pago", e.target.value === "sim")}><option value="sim">Pago</option><option value="nao">Pendente</option></select></div>
                <div className="field"><label>Vencimento</label><input className="input" type="date" value={form.vencimento || ""} onChange={(e) => setFormField("vencimento", e.target.value)} /></div>
                <div className="field wide"><label>Observações</label><textarea className="textarea" value={form.observacoes || ""} onChange={(e) => setFormField("observacoes", e.target.value)} /></div>
              </div>
            </div>

            <div className="modalActions">
              <button className="btn" type="button" onClick={() => void save("rascunho")}>Salvar rascunho</button>
              <button className="btn primary" type="button" onClick={() => void save("confirmado")}>Confirmar entrada</button>
              {editingId ? <button className="btn dangerBtn" type="button" onClick={() => void excluir(form)}>Excluir</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .page { max-width: 1240px; margin: 0 auto; padding: 14px 16px 24px; color: #f5f2ec; }
        .hero, .controlPanel, .tableShell, .premiumPanel, .miniList { border: 1px solid rgba(200,162,106,.18); background: radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.042), rgba(255,255,255,.012)); border-radius: 20px; box-shadow: 0 18px 48px rgba(0,0,0,.18); }
        .hero { padding: 14px 16px; display: flex; justify-content: space-between; gap: 14px; align-items: center; flex-wrap: wrap; }
        .kicker, .sectionKicker { color: rgba(200,162,106,.95); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; font-weight: 950; }
        h1 { margin: 5px 0 0; font-size: 25px; line-height: 1.05; } h2 { margin: 4px 0 0; font-size: 20px; } h3 { margin: 0 0 10px; font-size: 15px; }
        p { margin: 7px 0 0; opacity: .76; line-height: 1.42; font-size: 13px; }
        .heroActions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .btn, .quickFilters button, .entryActions button, .miniBtn { min-height: 32px; border-radius: 11px; border: 1px solid rgba(200,162,106,.24); background: rgba(200,162,106,.075); color: #f5f2ec; padding: 0 10px; font-weight: 900; font-size: 11.5px; cursor: pointer; transition: transform .15s ease, border-color .15s ease; }
        .btn:hover, .quickFilters button:hover, .entryActions button:hover, .miniBtn:hover { transform: translateY(-1px); border-color: rgba(200,162,106,.42); }
        .btn.primary { background: linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.075)); border-color: rgba(200,162,106,.42); }
        .dangerBtn, .entryActions .danger { border-color: rgba(255,120,120,.3); background: rgba(255,120,120,.08); color: #ffdada; }
        .syncBadge { height: 32px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(88,214,141,.38); background: rgba(88,214,141,.1); color: #9ff0bc; font-size: 11.5px; font-weight: 900; }
        .toast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 10px 13px; border-radius: 14px; border: 1px solid rgba(200,162,106,.25); background: rgba(25,20,16,.96); font-weight: 900; box-shadow: 0 16px 40px rgba(0,0,0,.3); }
        .controlPanel { margin-top: 12px; padding: 12px; }
        .quickFilters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .filtersGrid { display: grid; grid-template-columns: 1.4fr .8fr .8fr .7fr .8fr .8fr; gap: 8px; align-items: end; }
        .field { display: grid; gap: 5px; min-width: 0; } .field label { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; opacity: .75; font-weight: 950; }
        .field.wide, .wide { grid-column: 1 / -1; }
        .input, .textarea { width: 100%; min-height: 34px; border-radius: 11px; border: 1px solid rgba(255,255,255,.11); background: rgba(15,15,22,.92); color: #f5f2ec; padding: 0 10px; outline: none; font-size: 12px; }
        .textarea { min-height: 76px; padding: 9px 10px; resize: vertical; } .readonly { opacity: .88; background: rgba(0,0,0,.24); } .strongInput { color: #f3c979; font-weight: 950; }
        .kpis { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 9px; }
        .kpi { min-height: 72px; padding: 10px 11px; border-radius: 15px; border: 1px solid rgba(200,162,106,.17); background: radial-gradient(circle at top left, rgba(200,162,106,.09), transparent 45%), linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)); display: grid; align-content: center; box-shadow: 0 12px 28px rgba(0,0,0,.12); }
        .kpiTitle { font-size: 9px; line-height: 1.15; text-transform: uppercase; letter-spacing: .12em; opacity: .72; font-weight: 950; }
        .kpiValue { margin-top: 5px; font-size: 16px; line-height: 1.08; font-weight: 950; color: rgba(200,162,106,.98); overflow-wrap: anywhere; }
        .kpiHint { margin-top: 3px; font-size: 10px; line-height: 1.15; opacity: .62; } .kpi.green .kpiValue, .green { color: #4dff9a !important; } .kpi.gold .kpiValue { color: #f3c979 !important; }
        .premiumPanel { margin-top: 12px; padding: 14px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 14px; align-items: center; }
        .phaseGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .phaseGrid div { border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); padding: 10px; display: grid; gap: 5px; }
        .phaseGrid strong { color: #f3c979; font-size: 18px; } .phaseGrid span { font-size: 11px; opacity: .72; font-weight: 800; }
        .listsGrid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .miniList { padding: 11px; border-radius: 18px; }
        .miniItem { display: flex; justify-content: space-between; gap: 10px; padding: 8px 9px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.055); margin-top: 6px; cursor: pointer; }
        .miniItem strong { font-size: 12px; line-height: 1.2; } .miniItem small { font-size: 10.5px; opacity: .65; }
        .resumeFiscal { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .resumeFiscal div { min-height: 58px; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); padding: 9px; display: grid; align-content: center; gap: 4px; }
        .resumeFiscal span { font-size: 10px; opacity: .66; text-transform: uppercase; letter-spacing: .1em; font-weight: 950; } .resumeFiscal strong { font-size: 15px; color: rgba(200,162,106,.98); }
        .tableShell { margin-top: 12px; padding: 12px; border-radius: 19px; } .tableHead { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .tableCounters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .tableCounters span, .tableCounters strong { min-height: 28px; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 9px; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.18); font-size: 11px; } .tableCounters strong { color: rgba(200,162,106,.98); border-color: rgba(200,162,106,.32); }
        .entries { display: grid; gap: 7px; }
        .entry { display: grid; grid-template-columns: 42px minmax(0, 1fr) minmax(120px, auto) auto; gap: 8px; align-items: center; min-height: 58px; padding: 8px 9px; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.2); cursor: pointer; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .entry:hover { transform: translateY(-2px); border-color: rgba(200,162,106,.42); box-shadow: 0 16px 38px rgba(0,0,0,.18); }
        .entryIcon { width: 38px; height: 38px; border-radius: 14px; display: grid; place-items: center; font-weight: 950; border: 1px solid rgba(200,162,106,.22); background: rgba(200,162,106,.08); color: #f3c979; font-size: 11px; text-transform: uppercase; } .entryIcon.confirmado { color: #4dff9a; } .entryIcon.cancelado { color: #ff8585; }
        .entryTop { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .entryTop strong { font-size: 12.5px; line-height: 1.18; }
        .entryMeta { margin-top: 3px; font-size: 10.5px; line-height: 1.15; opacity: .66; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pill { min-height: 20px; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 7px; font-size: 9px; font-weight: 950; text-transform: uppercase; border: 1px solid rgba(255,255,255,.12); }
        .pill.confirmado { color: #bfffd5; border-color: rgba(117,255,171,.28); background: rgba(117,255,171,.08); } .pill.rascunho { color: #ffe4a6; border-color: rgba(255,201,98,.28); background: rgba(255,201,98,.08); } .pill.cancelado { color: #ffd1d1; border-color: rgba(255,120,120,.28); background: rgba(255,120,120,.08); } .pill.neutral { color: #f5f2ec; background: rgba(255,255,255,.045); }
        .entryValue { text-align: right; display: grid; gap: 4px; justify-items: end; } .entryValue strong { font-size: 13px; color: rgba(200,162,106,.98); } .entryValue span { font-size: 10px; opacity: .66; }
        .entryActions { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; } .entryActions button { min-height: 28px; height: 28px; padding: 0 8px; font-size: 10px; border-radius: 9px; }
        .empty { padding: 18px; text-align: center; border-radius: 16px; border: 1px dashed rgba(255,255,255,.14); opacity: .72; }
        .modalOverlay { position: fixed; inset: 0; background: rgba(0,0,0,.58); display: grid; place-items: center; padding: 18px; z-index: 50; } .modal { width: min(980px, 96vw); max-height: 92vh; overflow-y: auto; border-radius: 19px; border: 1px solid rgba(200,162,106,.22); background: radial-gradient(circle at top left, rgba(200,162,106,.13), transparent 28%), rgba(10,10,14,.96); padding: 12px; box-shadow: 0 28px 80px rgba(0,0,0,.65); }
        .modalHead { display: flex; justify-content: space-between; gap: 12px; padding: 10px; border-radius: 15px; border: 1px solid rgba(200,162,106,.16); background: rgba(255,255,255,.022); } .modalHead h2 { font-size: 18px; } .modalHead p { font-size: 12px; } .btnX { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #f5f2ec; border-radius: 12px; padding: 8px 10px; cursor: pointer; height: 36px; }
        .modalSection { margin-top: 10px; border-radius: 16px; border: 1px solid rgba(255,255,255,.075); background: rgba(0,0,0,.14); padding: 10px; } .modalSectionHead { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; } .modalSectionHead span { color: rgba(200,162,106,.95); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 950; }
        .helperText { margin: -4px 0 10px; font-size: 11px; opacity: .68; line-height: 1.35; }
        .modalGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .itemsBox { display: grid; gap: 8px; } .itemRow { display: grid; grid-template-columns: 34px minmax(180px, 1fr) 145px 80px 110px 120px 34px; gap: 8px; align-items: end; padding: 8px; border-radius: 14px; border: 1px solid rgba(255,255,255,.075); background: rgba(255,255,255,.025); }
        .itemIndex { height: 34px; border-radius: 12px; display: grid; place-items: center; font-weight: 950; color: #f3c979; background: rgba(200,162,106,.08); border: 1px solid rgba(200,162,106,.16); }
        .removeItem { width: 34px; height: 34px; border-radius: 12px; border: 1px solid rgba(255,120,120,.28); background: rgba(255,120,120,.08); color: #ffdada; font-size: 18px; font-weight: 950; cursor: pointer; }
        .modalActions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .phaseGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
        .phaseGrid div { border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); padding: 10px 12px; display: grid; gap: 3px; }
        .phaseGrid strong { color: #f3c979; font-size: 15px; line-height: 1.05; }
        .phaseGrid span { opacity: .7; font-size: 10.5px; line-height: 1.2; }

        .fiscalOverview {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(380px, .95fr);
          gap: 14px;
          align-items: center;
          padding: 12px 14px !important;
        }

        .fiscalOverviewText h2 {
          font-size: 20px !important;
          margin-top: 4px !important;
        }

        .fiscalOverviewText p {
          max-width: 620px !important;
          font-size: 12.5px !important;
          line-height: 1.35 !important;
          margin-top: 6px !important;
        }

        .fiscalOverviewGrid {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }

        .fiscalOverviewGrid div {
          min-height: 64px;
          align-content: center;
        }
        @media (max-width: 1100px) { .filtersGrid, .premiumPanel, .listsGrid, .modalGrid { grid-template-columns: 1fr; } .fiscalOverview { grid-template-columns: 1fr !important; } .fiscalOverviewGrid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } .entry { grid-template-columns: 42px minmax(0, 1fr); } .entryValue { grid-column: 2 / -1; text-align: left; justify-items: start; } .entryActions { grid-column: 2 / -1; justify-content: flex-start; } .itemRow { grid-template-columns: 34px minmax(0, 1fr); } .itemProduct, .itemRow .field, .removeItem { grid-column: 1 / -1; } .itemIndex { grid-column: 1; } }
        @media (max-width: 760px) { .page { padding: 12px; } .hero { align-items: flex-start; } .kpis { grid-template-columns: 1fr; } .phaseGrid, .resumeFiscal { grid-template-columns: 1fr; } .entryMeta { white-space: normal; } }
        .status.atrasado { color: #ffd1d1; border-color: rgba(255,120,120,.42); background: rgba(255,80,80,.12); }
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
  tone?: "green" | "gold";
}) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
      <div className="kpiHint">{hint}</div>
    </div>
  );
}
