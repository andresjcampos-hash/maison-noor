"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/services/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

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

type FiltroPeriodo = "mes" | "periodo" | "todos";

type Lancamento = {
  id: string;
  data: string;
  competencia: string;
  tipo: TipoLanc;
  descricao: string;
  categoria?: string;
  forma: FormaPag;
  valor: number;
  status: StatusLanc;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
  origemPedidoId?: string;
  clienteNome?: string;
};

const STORAGE_KEY = "maison_noor_crm_financeiro_v1";

const FIRESTORE_ROOT = "financeiro";
const FIRESTORE_DOC = "default";
const SUB_LISTA = "lista";
const SUB_LANCAMENTOS = "lancamentos";
const FIRESTORE_COLLECTION_PATH = `${FIRESTORE_ROOT}/${FIRESTORE_DOC}/${SUB_LISTA}`;

function nowISO(): string {
  return new Date().toISOString();
}

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

function formatDateBR(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function toCompetencia(iso: string): string {
  if (!iso) return currentMonth();
  return iso.slice(0, 7);
}

function isoFromDateInput(dateStr: string): string {
  return `${dateStr}T12:00:00.000Z`;
}

function dateInputFromISO(iso: string): string {
  if (!iso) return todayInput();
  return String(iso).slice(0, 10);
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

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStorage(): Lancamento[] {
  try {
    if (!canUseStorage()) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Lancamento[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: Lancamento[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function colRef(subcol: string) {
  return collection(db, FIRESTORE_ROOT, FIRESTORE_DOC, subcol);
}

function docRef(subcol: string, id: string) {
  return doc(db, FIRESTORE_ROOT, FIRESTORE_DOC, subcol, id);
}

function docIdForLanc(l: Partial<Lancamento>): string {
  const op = String(l.origemPedidoId || "").trim();
  if (op) return `pedido_${op}`;
  return l.id || uid();
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

function normalizeLancamento(docId: string, raw: any): Lancamento | null {
  const dataIso = tsToISO(raw?.data);
  const descricao = String(raw?.descricao || "").trim();
  if (!descricao) return null;

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
    data: dataIso,
    competencia: raw?.competencia || toCompetencia(dataIso),
    tipo: raw?.tipo === "despesa" ? "despesa" : "receita",
    descricao,
    categoria: raw?.categoria ? String(raw.categoria) : undefined,
    forma,
    valor: Number(raw?.valor) || 0,
    status: raw?.status === "pendente" ? "pendente" : "pago",
    observacoes: raw?.observacoes ? String(raw.observacoes) : undefined,
    origemPedidoId: raw?.origemPedidoId ? String(raw.origemPedidoId) : undefined,
    clienteNome: raw?.clienteNome ? String(raw.clienteNome) : undefined,
    createdAt: tsToISO(raw?.createdAt),
    updatedAt: tsToISO(raw?.updatedAt),
  };
}

async function fetchCollection(subcol: string): Promise<Lancamento[]> {
  try {
    const q = query(colRef(subcol), orderBy("data", "desc"));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => normalizeLancamento(d.id, d.data() as any))
      .filter(Boolean) as Lancamento[];
  } catch (e) {
    console.error(`[Financeiro] Erro ao carregar ${subcol}`, e);
    return [];
  }
}

async function fetchFromFirestore(): Promise<Lancamento[]> {
  const [lista, lancamentos] = await Promise.all([
    fetchCollection(SUB_LISTA),
    fetchCollection(SUB_LANCAMENTOS),
  ]);

  const map = new Map<string, Lancamento>();

  for (const l of [...lista, ...lancamentos]) {
    const key = l.origemPedidoId ? `pedido_${l.origemPedidoId}` : l.id;
    const previous = map.get(key);
    if (!previous || (l.updatedAt || "") > (previous.updatedAt || "")) {
      map.set(key, l);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    (b.data || "").localeCompare(a.data || "")
  );
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

async function upsertInFirestore(l: Lancamento): Promise<boolean> {
  try {
    const id = docIdForLanc(l);
    const normalizedData = l.data || nowISO();
    const payload = cleanUndefined({
      ...l,
      id,
      valor: Number(l.valor || 0),
      data: normalizedData,
      competencia: l.competencia || toCompetencia(normalizedData),
      createdAt: l.createdAt || nowISO(),
      updatedAt: nowISO(),
    });

    await Promise.all([
      setDoc(docRef(SUB_LISTA, id), payload, { merge: true }),
      setDoc(docRef(SUB_LANCAMENTOS, id), payload, { merge: true }),
    ]);

    return true;
  } catch (e) {
    console.error("🚨 [Financeiro] ERRO setDoc", e);
    return false;
  }
}

async function deleteFromFirestore(id: string): Promise<boolean> {
  try {
    await Promise.allSettled([
      deleteDoc(docRef(SUB_LISTA, id)),
      deleteDoc(docRef(SUB_LANCAMENTOS, id)),
    ]);
    return true;
  } catch (e) {
    console.error("🚨 [Financeiro] Erro ao excluir", e);
    return false;
  }
}

async function syncListToFirestore(list: Lancamento[]): Promise<void> {
  await Promise.all(list.map((l) => upsertInFirestore(l)));
}

function formaLabel(forma: FormaPag): string {
  const map: Record<FormaPag, string> = {
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

function getDateOnlyTime(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function diasEntre(inicio: string, fim: string): number {
  const a = getDateOnlyTime(isoFromDateInput(inicio));
  const b = getDateOnlyTime(isoFromDateInput(fim));
  if (!a || !b || b < a) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export default function FinanceiroPage() {
  const [items, setItems] = useState<Lancamento[]>([]);
  const [toast, setToast] = useState("");

  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | TipoLanc>("todos");
  const [statusFilter, setStatusFilter] =
    useState<"todos" | StatusLanc>("todos");

  const [periodoTipo, setPeriodoTipo] = useState<FiltroPeriodo>("mes");
  const [competenciaFilter, setCompetenciaFilter] = useState<string>(currentMonth());
  const [dataInicio, setDataInicio] = useState<string>(startOfCurrentMonthInput());
  const [dataFim, setDataFim] = useState<string>(todayInput());

  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = useMemo(
    () => items.find((l) => l.id === openId) || null,
    [items, openId]
  );

  const [fData, setFData] = useState<string>("");
  const [fTipo, setFTipo] = useState<TipoLanc>("receita");
  const [fDescricao, setFDescricao] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [fForma, setFForma] = useState<FormaPag>("pix");
  const [fValor, setFValor] = useState<string>("0");
  const [fStatus, setFStatus] = useState<StatusLanc>("pago");
  const [fObs, setFObs] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function init() {
      const fromFs = await fetchFromFirestore();
      if (fromFs.length) {
        writeStorage(fromFs);
        setItems(fromFs);
      } else {
        const local = readStorage();
        setItems(local);
        if (local.length) void syncListToFirestore(local);
      }
    }
    void init();
  }, []);

  function showToast(msg: string, ms = 2000): void {
    setToast(msg);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setToast(""), ms);
    }
  }

  async function refresh(): Promise<void> {
    showToast("⏳ Atualizando...");
    const fromFs = await fetchFromFirestore();
    if (fromFs.length) {
      writeStorage(fromFs);
      setItems(fromFs);
    } else {
      setItems(readStorage());
    }
    showToast("🔄 Atualizado!");
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

  function openNew(): void {
    setOpenId("NEW");
    setFData(todayInput());
    setFTipo("receita");
    setFDescricao("");
    setFCategoria("");
    setFForma("pix");
    setFValor("0");
    setFStatus("pago");
    setFObs("");
  }

  function openEdit(id: string): void {
    const l = items.find((x) => x.id === id);
    if (!l) return;
    setOpenId(id);
    setFData(dateInputFromISO(l.data));
    setFTipo(l.tipo);
    setFDescricao(l.descricao);
    setFCategoria(l.categoria || "");
    setFForma(l.forma);
    setFValor(String(l.valor ?? 0));
    setFStatus(l.status);
    setFObs(l.observacoes || "");
  }

  function closeModal(): void {
    setOpenId(null);
  }

  async function save(): Promise<void> {
    const desc = fDescricao.trim();
    if (!desc) return showToast("⚠️ Informe a descrição.");
    if (!fData) return showToast("⚠️ Informe a data.");

    const isoData = isoFromDateInput(fData);
    const payloadBase: Partial<Lancamento> = {
      data: isoData,
      competencia: toCompetencia(isoData),
      tipo: fTipo,
      descricao: desc,
      forma: fForma,
      valor: Math.max(0, toNum(fValor)),
      status: fStatus,
      ...(fCategoria.trim() && { categoria: fCategoria.trim() }),
      ...(fObs.trim() && { observacoes: fObs.trim() }),
    };

    let lancParaSync: Lancamento | null = null;

    if (openId === "NEW") {
      lancParaSync = {
        id: uid(),
        createdAt: nowISO(),
        updatedAt: nowISO(),
        ...payloadBase,
      } as Lancamento;
    } else if (openId) {
      const current = items.find((x) => x.id === openId);
      if (!current) return showToast("⚠️ Não achei o lançamento para editar.");
      lancParaSync = {
        ...current,
        ...payloadBase,
        updatedAt: nowISO(),
      } as Lancamento;
    }

    if (!lancParaSync) return;

    const finalId = docIdForLanc(lancParaSync);
    const finalLanc = { ...lancParaSync, id: finalId };

    setItems((prev) => {
      const semAtual = prev.filter((l) => l.id !== openId && l.id !== finalId);
      const next = [finalLanc, ...semAtual].sort((a, b) =>
        (b.data || "").localeCompare(a.data || "")
      );
      writeStorage(next);
      return next;
    });

    showToast("⏳ Salvando no Firestore...");
    const ok = await upsertInFirestore(finalLanc);
    if (!ok) return showToast("❌ Firestore bloqueou o salvamento. Veja o console.", 3500);

    showToast("✅ Salvo!");
    closeModal();
  }

  async function remove(): Promise<void> {
    if (!openItem) return;
    const okConfirm =
      typeof window === "undefined"
        ? true
        : window.confirm(`Excluir o lançamento "${openItem.descricao}"?`);
    if (!okConfirm) return;

    setItems((prev) => {
      const next = prev.filter((l) => l.id !== openItem.id);
      writeStorage(next);
      return next;
    });

    await deleteFromFirestore(openItem.id);
    showToast("🗑️ Lançamento excluído!");
    closeModal();
  }

  function toggleStatus(id: string): void {
    const current = items.find((x) => x.id === id);
    if (!current) return;

    const updated: Lancamento = {
      ...current,
      status: current.status === "pago" ? "pendente" : "pago",
      updatedAt: nowISO(),
    };

    setItems((prev) => {
      const next = prev.map((l) => (l.id === id ? updated : l));
      writeStorage(next);
      return next;
    });

    void upsertInFirestore(updated);
  }

  function duplicateLanc(id: string): void {
    const l = items.find((x) => x.id === id);
    if (!l) return;
    const copy: Lancamento = {
      ...l,
      id: uid(),
      origemPedidoId: undefined,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    const next = [copy, ...items];
    setItems(next);
    writeStorage(next);
    void upsertInFirestore(copy);
    showToast("📌 Lançamento duplicado!");
  }

  function exportJSON(): void {
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maison_noor_financeiro_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("⬇️ Exportado!");
  }

  function importJSON(file: File): void {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = String(reader.result || "");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Arquivo inválido");

        const incoming = (parsed as any[])
          .filter(Boolean)
          .map((x) => {
            const dataIso = x.data ? String(x.data) : nowISO();
            const forma: FormaPag =
              x.forma === "dinheiro" ||
              x.forma === "pix" ||
              x.forma === "credito" ||
              x.forma === "debito" ||
              x.forma === "boleto" ||
              x.forma === "transferencia"
                ? x.forma
                : "outros";

            return {
              id: String(x.id || uid()),
              data: dataIso,
              competencia: x.competencia ? String(x.competencia) : toCompetencia(dataIso),
              tipo: x.tipo === "despesa" ? "despesa" : "receita",
              descricao: String(x.descricao || "").trim(),
              categoria: x.categoria ? String(x.categoria) : undefined,
              forma,
              valor: Number(x.valor) || 0,
              status: x.status === "pendente" ? "pendente" : "pago",
              observacoes: x.observacoes ? String(x.observacoes) : undefined,
              origemPedidoId: x.origemPedidoId ? String(x.origemPedidoId) : undefined,
              clienteNome: x.clienteNome ? String(x.clienteNome) : undefined,
              createdAt: x.createdAt ? String(x.createdAt) : nowISO(),
              updatedAt: x.updatedAt ? String(x.updatedAt) : nowISO(),
            } as Lancamento;
          })
          .filter((l) => l.descricao);

        const map = new Map<string, Lancamento>();
        for (const l of items) map.set(l.id, l);
        for (const l of incoming) map.set(docIdForLanc(l), { ...l, id: docIdForLanc(l) });

        const next = Array.from(map.values()).sort((a, b) =>
          (b.data || "").localeCompare(a.data || "")
        );
        setItems(next);
        writeStorage(next);
        await syncListToFirestore(next);
        showToast("✅ Importado com sucesso!");
      } catch (err) {
        console.error(err);
        showToast("⚠️ Não consegui importar. Verifique o arquivo JSON.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
      if (openId && (e.ctrlKey || e.metaKey) && e.key === "Enter") void save();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, fData, fDescricao, fValor, fCategoria, fForma, fStatus, fTipo, fObs]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const startMs = periodoTipo === "periodo" ? getDateOnlyTime(isoFromDateInput(dataInicio)) : 0;
    const endMs = periodoTipo === "periodo" ? getDateOnlyTime(isoFromDateInput(dataFim)) : 0;

    return items
      .filter((l) => {
        if (tipoFilter !== "todos" && l.tipo !== tipoFilter) return false;
        if (statusFilter !== "todos" && l.status !== statusFilter) return false;

        if (periodoTipo === "mes" && competenciaFilter && l.competencia !== competenciaFilter) {
          return false;
        }

        if (periodoTipo === "periodo") {
          const lMs = getDateOnlyTime(l.data);
          if (startMs && lMs < startMs) return false;
          if (endMs && lMs > endMs) return false;
        }

        if (!qq) return true;
        const hay = `${l.descricao} ${l.categoria || ""} ${l.forma} ${l.clienteNome || ""}`.toLowerCase();
        return hay.includes(qq);
      })
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [items, q, tipoFilter, statusFilter, periodoTipo, competenciaFilter, dataInicio, dataFim]);

  const totals = useMemo(() => {
    let totalReceitas = 0;
    let totalDespesas = 0;
    let receitasPendentes = 0;
    let despesasPendentes = 0;
    let receitasPagas = 0;
    let despesasPagas = 0;

    for (const l of filtered) {
      const valor = Number(l.valor) || 0;
      if (l.tipo === "receita") {
        totalReceitas += valor;
        if (l.status === "pendente") receitasPendentes += valor;
        if (l.status === "pago") receitasPagas += valor;
      } else {
        totalDespesas += valor;
        if (l.status === "pendente") despesasPendentes += valor;
        if (l.status === "pago") despesasPagas += valor;
      }
    }

    const saldo = totalReceitas - totalDespesas;
    const ticketMedio = filtered.length ? totalReceitas / Math.max(1, filtered.filter((l) => l.tipo === "receita").length) : 0;
    const dias = periodoTipo === "periodo" ? diasEntre(dataInicio, dataFim) : new Date().getDate();
    const mediaDia = totalReceitas / Math.max(1, dias);

    return {
      lancamentos: filtered.length,
      totalReceitas,
      totalDespesas,
      saldo,
      receitasPendentes,
      despesasPendentes,
      receitasPagas,
      despesasPagas,
      ticketMedio,
      mediaDia,
    };
  }, [filtered, periodoTipo, dataInicio, dataFim]);

  const financeiroPremium = useMemo(() => {
    const hojeKey = todayInput();

    const receitas = filtered.filter((l) => l.tipo === "receita");
    const despesas = filtered.filter((l) => l.tipo === "despesa");

    const receitaRecebida = receitas
      .filter((l) => l.status === "pago")
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const receitaAReceber = receitas
      .filter((l) => l.status === "pendente")
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const despesaPaga = despesas
      .filter((l) => l.status === "pago")
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const despesaAPagar = despesas
      .filter((l) => l.status === "pendente")
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const entradasHoje = filtered
      .filter((l) => l.tipo === "receita" && l.status === "pago" && String(l.data || "").slice(0, 10) === hojeKey)
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const saidasHoje = filtered
      .filter((l) => l.tipo === "despesa" && l.status === "pago" && String(l.data || "").slice(0, 10) === hojeKey)
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const saldoHoje = entradasHoje - saidasHoje;
    const lucroReal = receitaRecebida - despesaPaga;
    const saldoProjetado = (receitaRecebida + receitaAReceber) - (despesaPaga + despesaAPagar);
    const margemReal = receitaRecebida > 0 ? (lucroReal / receitaRecebida) * 100 : 0;
    const percentualRecebido = (receitaRecebida + receitaAReceber) > 0
      ? (receitaRecebida / (receitaRecebida + receitaAReceber)) * 100
      : 0;

    const porForma = new Map<FormaPag, number>();
    for (const l of receitas.filter((item) => item.status === "pago")) {
      porForma.set(l.forma, (porForma.get(l.forma) || 0) + (Number(l.valor) || 0));
    }

    const formasPagamento = Array.from(porForma.entries())
      .map(([forma, valor]) => ({
        forma,
        label: formaLabel(forma),
        valor,
        percentual: receitaRecebida > 0 ? (valor / receitaRecebida) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor);

    const porCategoria = new Map<string, number>();
    for (const l of despesas) {
      const categoria = String(l.categoria || "Sem categoria");
      porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + (Number(l.valor) || 0));
    }

    const maioresDespesas = Array.from(porCategoria.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    const alertas: Array<{ titulo: string; descricao: string; tipo: "critico" | "alerta" | "sucesso" | "info" }> = [];

    if (receitaAReceber > 0) {
      alertas.push({
        tipo: "alerta",
        titulo: "Receita pendente para cobrar",
        descricao: `${formatBRL(receitaAReceber)} ainda está a receber no filtro atual. Priorize cobrança e follow-up.`,
      });
    }

    if (despesaAPagar > receitaAReceber && despesaAPagar > 0) {
      alertas.push({
        tipo: "critico",
        titulo: "A pagar maior que a receber",
        descricao: `${formatBRL(despesaAPagar)} a pagar contra ${formatBRL(receitaAReceber)} a receber. Atenção ao caixa.`,
      });
    }

    if (margemReal > 0 && margemReal < 35) {
      alertas.push({
        tipo: "alerta",
        titulo: "Margem real em atenção",
        descricao: `A margem do período está em ${margemReal.toFixed(1)}%. Revise custos, descontos e despesas.`,
      });
    }

    if (lucroReal > 0 && receitaAReceber === 0) {
      alertas.push({
        tipo: "sucesso",
        titulo: "Caixa saudável no período",
        descricao: `Lucro real de ${formatBRL(lucroReal)} com tudo recebido no filtro atual.`,
      });
    }

    if (!alertas.length) {
      alertas.push({
        tipo: "info",
        titulo: "Financeiro sob controle",
        descricao: "Nenhum alerta crítico encontrado no filtro atual.",
      });
    }

    return {
      receitaRecebida,
      receitaAReceber,
      despesaPaga,
      despesaAPagar,
      entradasHoje,
      saidasHoje,
      saldoHoje,
      lucroReal,
      saldoProjetado,
      margemReal,
      percentualRecebido,
      formasPagamento,
      maioresDespesas,
      alertas: alertas.slice(0, 4),
    };
  }, [filtered]);

  const receitasRecentes = filtered.filter((l) => l.tipo === "receita").slice(0, 4);
  const despesasRecentes = filtered.filter((l) => l.tipo === "despesa").slice(0, 4);
  const origemPedidoCount = filtered.filter((l) => l.origemPedidoId).length;
  const chartData = useMemo(() => {
    const grouped = new Map<string, { label: string; entradas: number; saidas: number }>();

    for (const l of filtered) {
      const key = String(l.data || "").slice(0, 10);
      if (!key) continue;

      const date = new Date(key + "T12:00:00.000Z");
      const label = Number.isNaN(date.getTime())
        ? key.slice(5)
        : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

      const current = grouped.get(key) || { label, entradas: 0, saidas: 0 };
      if (l.tipo === "receita") current.entradas += Number(l.valor) || 0;
      if (l.tipo === "despesa") current.saidas += Number(l.valor) || 0;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, value]) => ({
        ...value,
        saldo: value.entradas - value.saidas,
      }));
  }, [filtered]);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <div className="kicker">MAISON NOOR</div>
          <h1>CRM • Financeiro</h1>
          <p>
            Controle entradas, despesas, saldo e performance por mês ou período personalizado.
          </p>
        </div>

        <div className="heroActions">
          <span className="syncBadge">● Financeiro em tempo real</span>
          <button className="btn primary" onClick={openNew} type="button">+ Novo lançamento</button>
          <button className="btn" onClick={() => void refresh()} type="button">Atualizar</button>
          <button className="btn" onClick={exportJSON} type="button">Exportar</button>
          <button className="btn" onClick={() => fileRef.current?.click()} type="button">Importar</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJSON(f);
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
              placeholder="Venda, cliente, embalagem, pedido..."
            />
          </div>

          <div className="field">
            <label>Tipo</label>
            <select className="input" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value as "todos" | TipoLanc)}>
              <option value="todos">Todos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
          </div>

          <div className="field">
            <label>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "todos" | StatusLanc)}>
              <option value="todos">Todos</option>
              <option value="pago">Pagos</option>
              <option value="pendente">Pendentes</option>
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

      <section className="premiumDre">
        <div className="dreHead">
          <div>
            <div className="sectionKicker">Financeiro Premium</div>
            <h2>DRE rápido da operação</h2>
            <p>Separação clara entre recebido, a receber, pago, a pagar e lucro real do filtro atual.</p>
          </div>
          <div className={financeiroPremium.lucroReal >= 0 ? "dreResult positive" : "dreResult negative"}>
            <span>Lucro real</span>
            <strong>{formatBRL(financeiroPremium.lucroReal)}</strong>
            <small>Margem {financeiroPremium.margemReal.toFixed(1)}%</small>
          </div>
        </div>

        <div className="dreGrid">
          <DreCard label="Receita recebida" value={formatBRL(financeiroPremium.receitaRecebida)} hint="Entradas pagas" tone="green" />
          <DreCard label="A receber" value={formatBRL(financeiroPremium.receitaAReceber)} hint={`${financeiroPremium.percentualRecebido.toFixed(0)}% já recebido`} tone="gold" />
          <DreCard label="Despesas pagas" value={formatBRL(financeiroPremium.despesaPaga)} hint="Saídas confirmadas" tone="red" />
          <DreCard label="A pagar" value={formatBRL(financeiroPremium.despesaAPagar)} hint="Despesas pendentes" tone="warn" />
          <DreCard label="Saldo projetado" value={formatBRL(financeiroPremium.saldoProjetado)} hint="Recebido + a receber - despesas" tone={financeiroPremium.saldoProjetado >= 0 ? "green" : "red"} />
        </div>

        <div className="cashToday">
          <div>
            <span>Fluxo de caixa hoje</span>
            <strong>{formatBRL(financeiroPremium.saldoHoje)}</strong>
          </div>
          <div><small>Entradas</small><b className="green">{formatBRL(financeiroPremium.entradasHoje)}</b></div>
          <div><small>Saídas</small><b className="red">{formatBRL(financeiroPremium.saidasHoje)}</b></div>
        </div>
      </section>

      <section className="kpis">
        <Kpi title="Entradas" value={formatBRL(totals.totalReceitas)} hint="Receitas no filtro" tone="green" />
        <Kpi title="Saídas" value={formatBRL(totals.totalDespesas)} hint="Despesas no filtro" tone="red" />
        <Kpi title="Saldo" value={formatBRL(totals.saldo)} hint="Receitas - despesas" tone={totals.saldo >= 0 ? "green" : "red"} />
        <Kpi title="Lançamentos" value={String(totals.lancamentos)} hint="Total filtrado" />
        <Kpi title="Pendentes" value={formatBRL(totals.receitasPendentes + totals.despesasPendentes)} hint="A receber/pagar" tone="gold" />
        <Kpi title="Média/dia" value={formatBRL(totals.mediaDia)} hint="Entrada média" />
        <Kpi title="Ticket médio" value={formatBRL(totals.ticketMedio)} hint="Receitas" />
        <Kpi title="Pedidos" value={String(origemPedidoCount)} hint="Entradas integradas" tone="gold" />
      </section>

      <FinancialChart data={chartData} totalEntradas={totals.totalReceitas} totalSaidas={totals.totalDespesas} />

      <section className="financePremiumGrid">
        <div className="financePremiumPanel">
          <div className="sectionKicker">Formas de pagamento</div>
          <h2>Como o dinheiro está entrando</h2>
          <div className="paymentRanking">
            {financeiroPremium.formasPagamento.length ? financeiroPremium.formasPagamento.map((item) => (
              <div className="paymentRow" key={item.forma}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.percentual.toFixed(1)}% da receita recebida</small>
                </div>
                <span>{formatBRL(item.valor)}</span>
                <i style={{ width: `${Math.max(5, item.percentual)}%` }} />
              </div>
            )) : <div className="emptyMini">Nenhuma receita paga no filtro.</div>}
          </div>
        </div>

        <div className="financePremiumPanel">
          <div className="sectionKicker">Maiores despesas</div>
          <h2>Onde o dinheiro está saindo</h2>
          <div className="expenseRanking">
            {financeiroPremium.maioresDespesas.length ? financeiroPremium.maioresDespesas.map((item) => (
              <div className="expenseRow" key={item.categoria}>
                <strong>{item.categoria}</strong>
                <span>{formatBRL(item.valor)}</span>
              </div>
            )) : <div className="emptyMini">Nenhuma despesa no filtro.</div>}
          </div>
        </div>

        <div className="financePremiumPanel decisionPanel">
          <div className="sectionKicker">Alertas financeiros</div>
          <h2>Decisão rápida</h2>
          <div className="financeAlerts">
            {financeiroPremium.alertas.map((item, index) => (
              <div className={`financeAlert ${item.tipo}`} key={`${item.titulo}_${index}`}>
                <span>{item.tipo === "critico" ? "⚠️" : item.tipo === "alerta" ? "🔔" : item.tipo === "sucesso" ? "✅" : "💡"}</span>
                <div>
                  <strong>{item.titulo}</strong>
                  <small>{item.descricao}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="insightGrid">
        <div className="insightCard">
          <div className="sectionKicker">Resumo inteligente</div>
          <h2>Performance do período</h2>
          <p>
            Você teve <b>{formatBRL(totals.totalReceitas)}</b> de entradas e <b>{formatBRL(totals.totalDespesas)}</b> de saídas.
            O lucro real pago é <b>{formatBRL(financeiroPremium.lucroReal)}</b> e o saldo projetado é <b>{formatBRL(financeiroPremium.saldoProjetado)}</b>.
          </p>
        </div>
        <div className="insightCard compact">
          <span>Receitas recebidas</span><strong className="green">{formatBRL(financeiroPremium.receitaRecebida)}</strong>
          <span>A receber</span><strong>{formatBRL(financeiroPremium.receitaAReceber)}</strong>
        </div>
        <div className="insightCard compact">
          <span>Despesas pagas</span><strong className="red">{formatBRL(financeiroPremium.despesaPaga)}</strong>
          <span>A pagar</span><strong>{formatBRL(financeiroPremium.despesaAPagar)}</strong>
        </div>
      </section>

      <section className="listsGrid">
        <FinanceList title="Últimas entradas" items={receitasRecentes} onOpen={openEdit} />
        <FinanceList title="Últimas saídas" items={despesasRecentes} onOpen={openEdit} />
      </section>

      <section className="tableShell">
        <div className="tableHead">
          <div>
            <div className="sectionKicker">Lançamentos</div>
            <h2>Extrato financeiro</h2>
          </div>
          <div className="tableCounters">
            <span>{filtered.length} lançamento(s)</span>
            <strong>{formatBRL(totals.saldo)}</strong>
          </div>
        </div>

        <div className="entries">
          {filtered.map((l) => (
            <article key={l.id} className="entry" onClick={() => openEdit(l.id)} role="button" tabIndex={0}>
              <div className={`entryIcon ${l.tipo}`}>{l.tipo === "receita" ? "+" : "−"}</div>
              <div className="entryMain">
                <div className="entryTop">
                  <strong>{l.descricao}</strong>
                  <span className={`pill ${l.tipo}`}>{l.tipo === "receita" ? "Receita" : "Despesa"}</span>
                </div>
                <div className="entryMeta">
                  {formatDateBR(l.data)} • {l.categoria || "Sem categoria"} • {formaLabel(l.forma)}
                  {l.clienteNome ? ` • ${l.clienteNome}` : ""}
                </div>
              </div>
              <div className="entryValue">
                <strong className={l.tipo === "receita" ? "green" : "red"}>{formatBRL(l.valor)}</strong>
                <span className={`status ${l.status}`}>{l.status === "pago" ? "Pago" : "Pendente"}</span>
              </div>
              <div className="entryActions" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => toggleStatus(l.id)}>{l.status === "pago" ? "Pendente" : "Pago"}</button>
                <button type="button" onClick={() => duplicateLanc(l.id)}>Duplicar</button>
                <button type="button" className="danger" onClick={() => {
                  const ok = window.confirm("Excluir este lançamento?");
                  if (!ok) return;
                  setItems((prev) => {
                    const next = prev.filter((x) => x.id !== l.id);
                    writeStorage(next);
                    return next;
                  });
                  void deleteFromFirestore(l.id);
                }}>Excluir</button>
              </div>
            </article>
          ))}

          {!filtered.length ? (
            <div className="empty">Nenhum lançamento encontrado para o filtro atual.</div>
          ) : null}
        </div>
      </section>

      {openId ? (
        <div className="modalOverlay" onMouseDown={closeModal} role="presentation">
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="sectionKicker">{openId === "NEW" ? "Novo lançamento" : "Editar lançamento"}</div>
                <h2>{openId === "NEW" ? "Financeiro" : openItem?.descricao}</h2>
                {openId !== "NEW" && openItem ? <p>ID: {openItem.id}</p> : null}
              </div>
              <button className="btnX" onClick={closeModal} type="button">✕</button>
            </div>

            <div className="modalGrid">
              <div className="field"><label>Data</label><input className="input" type="date" value={fData} onChange={(e) => setFData(e.target.value)} /></div>
              <div className="field"><label>Tipo</label><select className="input" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoLanc)}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></div>
              <div className="field wide"><label>Descrição</label><input className="input" value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} /></div>
              <div className="field"><label>Categoria</label><input className="input" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} placeholder="Venda, Estoque, Frete..." /></div>
              <div className="field"><label>Forma</label><select className="input" value={fForma} onChange={(e) => setFForma(e.target.value as FormaPag)}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="credito">Crédito</option><option value="debito">Débito</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="outros">Outros</option></select></div>
              <div className="field"><label>Valor</label><input className="input" value={fValor} onChange={(e) => setFValor(e.target.value)} /></div>
              <div className="field"><label>Status</label><select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value as StatusLanc)}><option value="pago">Pago</option><option value="pendente">Pendente</option></select></div>
              <div className="field wide"><label>Observações</label><textarea className="textarea" value={fObs} onChange={(e) => setFObs(e.target.value)} /></div>
            </div>

            <div className="modalActions">
              <button className="btn primary" onClick={() => void save()} type="button">Salvar</button>
              {openId !== "NEW" ? <button className="btn dangerBtn" onClick={() => void remove()} type="button">Excluir</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .page { max-width: 1240px; margin: 0 auto; padding: 18px; color: #f5f2ec; }
        .hero, .controlPanel, .tableShell, .insightCard { border: 1px solid rgba(200,162,106,.18); background: radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.042), rgba(255,255,255,.012)); border-radius: 22px; box-shadow: 0 18px 48px rgba(0,0,0,.18); }
        .hero { padding: 18px; display: flex; justify-content: space-between; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
        .kicker, .sectionKicker { color: rgba(200,162,106,.95); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; font-weight: 950; }
        h1 { margin: 5px 0 0; font-size: 28px; line-height: 1.05; } h2 { margin: 4px 0 0; font-size: 22px; }
        p { margin: 7px 0 0; opacity: .76; line-height: 1.42; }
        .heroActions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .btn, .quickFilters button, .entryActions button { min-height: 36px; border-radius: 13px; border: 1px solid rgba(200,162,106,.24); background: rgba(200,162,106,.075); color: #f5f2ec; padding: 0 12px; font-weight: 900; cursor: pointer; transition: transform .15s ease, border-color .15s ease; }
        .btn:hover, .quickFilters button:hover, .entryActions button:hover { transform: translateY(-1px); border-color: rgba(200,162,106,.42); }
        .btn.primary { background: linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.075)); border-color: rgba(200,162,106,.42); }
        .syncBadge { height: 36px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(88,214,141,.38); background: rgba(88,214,141,.1); color: #9ff0bc; font-size: 12px; font-weight: 900; }
        .toast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 10px 13px; border-radius: 14px; border: 1px solid rgba(200,162,106,.25); background: rgba(25,20,16,.96); font-weight: 900; box-shadow: 0 16px 40px rgba(0,0,0,.3); }
        .controlPanel { margin-top: 14px; padding: 14px; }
        .quickFilters { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 12px; }
        .quickFilters button { min-height: 32px; font-size: 12px; padding: 0 10px; }
        .filtersGrid { display: grid; grid-template-columns: 1.4fr .8fr .8fr .7fr .8fr .8fr; gap: 10px; align-items: end; }
        .field { display: grid; gap: 5px; min-width: 0; } .field label { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; opacity: .75; font-weight: 950; }
        .input, .textarea { width: 100%; min-height: 40px; border-radius: 14px; border: 1px solid rgba(255,255,255,.11); background: rgba(15,15,22,.92); color: #f5f2ec; padding: 0 12px; outline: none; }
        .textarea { min-height: 88px; padding: 10px 12px; resize: vertical; }
        .kpis { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
        .kpi { min-height: 92px; padding: 12px; border-radius: 18px; border: 1px solid rgba(200,162,106,.16); background: linear-gradient(180deg, rgba(200,162,106,.075), rgba(255,255,255,.014)); display: grid; align-content: center; overflow: hidden; }
        .kpiTitle { font-size: 10px; text-transform: uppercase; letter-spacing: .13em; opacity: .72; font-weight: 950; }
        .kpiValue { margin-top: 5px; font-size: 20px; font-weight: 950; color: rgba(200,162,106,.98); overflow-wrap: anywhere; }
        .kpiHint { margin-top: 4px; font-size: 11px; opacity: .62; } .kpi.green .kpiValue, .green { color: #4dff9a !important; } .kpi.red .kpiValue, .red { color: #ff8585 !important; } .kpi.gold .kpiValue { color: #f3c979 !important; }
        .insightGrid { margin-top: 14px; display: grid; grid-template-columns: 1.3fr .7fr .7fr; gap: 10px; }
        .insightCard { padding: 14px; } .insightCard.compact { display: grid; gap: 5px; align-content: center; } .insightCard.compact span { font-size: 12px; opacity: .7; } .insightCard.compact strong { font-size: 17px; }
        .listsGrid { margin-top: 14px; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
        .miniList { border-radius: 20px; border: 1px solid rgba(200,162,106,.16); background: rgba(0,0,0,.18); padding: 12px; }
        .miniList h3 { margin: 0 0 10px; font-size: 16px; } .miniItem { display: flex; justify-content: space-between; gap: 10px; padding: 9px; border-radius: 13px; background: rgba(255,255,255,.03); margin-top: 7px; cursor: pointer; } .miniItem small { opacity: .65; }
        .tableShell { margin-top: 14px; padding: 14px; } .tableHead { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
        .tableCounters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .tableCounters span, .tableCounters strong { min-height: 32px; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.18); font-size: 12px; } .tableCounters strong { color: rgba(200,162,106,.98); border-color: rgba(200,162,106,.32); }
        .entries { display: grid; gap: 8px; }
        .entry { display: grid; grid-template-columns: 42px minmax(0,1fr) minmax(130px,auto) auto; gap: 10px; align-items: center; padding: 10px; border-radius: 16px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.2); cursor: pointer; }
        .entryIcon { width: 38px; height: 38px; border-radius: 14px; display: grid; place-items: center; font-weight: 950; border: 1px solid rgba(200,162,106,.22); background: rgba(200,162,106,.08); } .entryIcon.receita { color: #4dff9a; } .entryIcon.despesa { color: #ff8585; }
        .entryTop { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .entryMeta { margin-top: 4px; font-size: 12px; opacity: .66; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pill, .status { min-height: 23px; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 8px; font-size: 10px; font-weight: 950; text-transform: uppercase; border: 1px solid rgba(255,255,255,.12); } .pill.receita, .status.pago { color: #bfffd5; border-color: rgba(117,255,171,.28); background: rgba(117,255,171,.08); } .pill.despesa { color: #ffd1d1; border-color: rgba(255,120,120,.28); background: rgba(255,120,120,.08); } .status.pendente { color: #ffe4a6; border-color: rgba(255,201,98,.28); background: rgba(255,201,98,.08); }
        .entryValue { text-align: right; display: grid; gap: 4px; justify-items: end; } .entryValue strong { font-size: 15px; }
        .entryActions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; } .entryActions button { min-height: 30px; font-size: 11px; padding: 0 8px; } .entryActions .danger, .dangerBtn { border-color: rgba(255,120,120,.3); background: rgba(255,120,120,.08); color: #ffdada; }
        .empty { padding: 18px; text-align: center; border-radius: 16px; border: 1px dashed rgba(255,255,255,.14); opacity: .72; }
        .modalOverlay { position: fixed; inset: 0; background: rgba(0,0,0,.58); display: grid; place-items: center; padding: 18px; z-index: 50; } .modal { width: min(860px, 96vw); max-height: 92vh; overflow-y: auto; border-radius: 22px; border: 1px solid rgba(200,162,106,.22); background: radial-gradient(circle at top left, rgba(200,162,106,.13), transparent 28%), rgba(10,10,14,.96); padding: 14px; box-shadow: 0 28px 80px rgba(0,0,0,.65); }
        .modalHead { display: flex; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 16px; border: 1px solid rgba(200,162,106,.16); background: rgba(255,255,255,.022); } .modalHead h2 { font-size: 20px; } .modalHead p { font-size: 12px; } .btnX { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #f5f2ec; border-radius: 12px; padding: 8px 10px; cursor: pointer; }
        .modalGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; padding: 12px 0; } .field.wide { grid-column: 1 / -1; } .modalActions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        @media (max-width: 1100px) { .filtersGrid { grid-template-columns: repeat(3, minmax(0,1fr)); } .insightGrid { grid-template-columns: 1fr; } .entry { grid-template-columns: 42px minmax(0,1fr); } .entryValue { text-align: left; justify-items: start; } .entryActions { grid-column: 1 / -1; justify-content: flex-start; } }
        @media (max-width: 760px) { .page { padding: 12px; } .hero { align-items: flex-start; } .filtersGrid, .listsGrid, .modalGrid { grid-template-columns: 1fr; } .kpis { grid-template-columns: 1fr; } .entryMeta { white-space: normal; } }


        /* ======================================================
           ✅ AJUSTE REAL 10/10 — styled-jsx GLOBAL
           Necessário para aplicar estilo nos componentes Kpi e FinanceList.
           Sem mexer na lógica.
        ====================================================== */
        .page {
          max-width: 1220px !important;
          padding: 14px 16px 24px !important;
        }

        .hero {
          padding: 14px 16px !important;
          border-radius: 20px !important;
          align-items: center !important;
        }

        .hero h1 {
          font-size: 25px !important;
          line-height: 1.05 !important;
        }

        .hero p {
          font-size: 13px !important;
          line-height: 1.35 !important;
          max-width: 720px !important;
        }

        .heroActions {
          gap: 7px !important;
        }

        .syncBadge,
        .btn,
        .quickFilters button,
        .entryActions button {
          min-height: 32px !important;
          height: 32px !important;
          padding: 0 10px !important;
          border-radius: 11px !important;
          font-size: 11.5px !important;
        }

        .controlPanel {
          margin-top: 12px !important;
          padding: 12px !important;
          border-radius: 18px !important;
        }

        .quickFilters {
          margin-bottom: 10px !important;
          gap: 6px !important;
        }

        .filtersGrid {
          gap: 8px !important;
        }

        .field label {
          font-size: 9px !important;
          letter-spacing: 0.12em !important;
        }

        .input,
        .textarea {
          min-height: 34px !important;
          height: 34px !important;
          padding: 0 10px !important;
          border-radius: 11px !important;
          font-size: 12px !important;
        }

        .textarea {
          height: auto !important;
          min-height: 76px !important;
          padding: 9px 10px !important;
        }

        /* KPI agora como card real */
        .kpis {
          margin-top: 12px !important;
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
          gap: 9px !important;
        }

        .kpi {
          min-height: 72px !important;
          padding: 10px 11px !important;
          border-radius: 15px !important;
          border: 1px solid rgba(200, 162, 106, 0.17) !important;
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.09), transparent 45%),
            linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)) !important;
          display: grid !important;
          align-content: center !important;
          box-shadow: 0 12px 28px rgba(0,0,0,.12) !important;
        }

        .kpiTitle {
          font-size: 9px !important;
          line-height: 1.15 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.12em !important;
          opacity: .72 !important;
          font-weight: 950 !important;
        }

        .kpiValue {
          margin-top: 5px !important;
          font-size: 16px !important;
          line-height: 1.08 !important;
          font-weight: 950 !important;
          color: rgba(200,162,106,.98) !important;
          overflow-wrap: anywhere !important;
        }

        .kpiHint {
          margin-top: 3px !important;
          font-size: 10px !important;
          line-height: 1.15 !important;
          opacity: .62 !important;
        }

        .kpi.green .kpiValue,
        .green {
          color: #4dff9a !important;
        }

        .kpi.red .kpiValue,
        .red {
          color: #ff8585 !important;
        }

        .kpi.gold .kpiValue {
          color: #f3c979 !important;
        }

        .insightGrid {
          margin-top: 12px !important;
          grid-template-columns: 1.25fr .7fr .7fr !important;
          gap: 9px !important;
        }

        .insightCard {
          padding: 11px 13px !important;
          border-radius: 18px !important;
        }

        .insightCard h2 {
          font-size: 19px !important;
          line-height: 1.12 !important;
        }

        .insightCard p {
          font-size: 13px !important;
          line-height: 1.38 !important;
        }

        .insightCard.compact {
          gap: 4px !important;
        }

        .insightCard.compact span {
          font-size: 11px !important;
        }

        .insightCard.compact strong {
          font-size: 15px !important;
        }

        /* Últimas entradas/saídas agora compactas e com cards */
        .listsGrid {
          margin-top: 12px !important;
          gap: 9px !important;
        }

        .miniList {
          padding: 11px !important;
          border-radius: 18px !important;
          border: 1px solid rgba(200,162,106,.16) !important;
          background: rgba(0,0,0,.18) !important;
        }

        .miniList h3 {
          font-size: 15px !important;
          margin-bottom: 8px !important;
        }

        .miniItem {
          padding: 8px 9px !important;
          margin-top: 6px !important;
          border-radius: 12px !important;
          background: rgba(255,255,255,.03) !important;
          border: 1px solid rgba(255,255,255,.055) !important;
        }

        .miniItem strong {
          font-size: 12px !important;
          line-height: 1.2 !important;
        }

        .miniItem small {
          font-size: 10.5px !important;
        }

        /* Extrato mais baixo */
        .tableShell {
          margin-top: 12px !important;
          padding: 12px !important;
          border-radius: 19px !important;
        }

        .tableHead {
          margin-bottom: 10px !important;
        }

        .tableHead h2 {
          font-size: 20px !important;
        }

        .tableCounters span,
        .tableCounters strong {
          min-height: 28px !important;
          padding: 0 9px !important;
          font-size: 11px !important;
        }

        .entries {
          gap: 7px !important;
        }

        .entry {
          grid-template-columns: 36px minmax(0, 1fr) minmax(105px, auto) auto !important;
          min-height: 58px !important;
          padding: 8px 9px !important;
          border-radius: 14px !important;
          gap: 8px !important;
        }

        .entryIcon {
          width: 34px !important;
          height: 34px !important;
          border-radius: 12px !important;
          font-size: 15px !important;
        }

        .entryTop strong {
          font-size: 12.5px !important;
          line-height: 1.18 !important;
        }

        .entryMeta {
          margin-top: 3px !important;
          font-size: 10.5px !important;
          line-height: 1.15 !important;
        }

        .pill,
        .status {
          min-height: 20px !important;
          padding: 0 7px !important;
          font-size: 9px !important;
        }

        .entryValue strong {
          font-size: 13px !important;
        }

        .entryActions {
          gap: 5px !important;
        }

        .entryActions button {
          min-height: 28px !important;
          height: 28px !important;
          padding: 0 8px !important;
          font-size: 10px !important;
          border-radius: 9px !important;
        }

        .modal {
          padding: 12px !important;
          border-radius: 19px !important;
        }

        .modalHead {
          padding: 10px !important;
          border-radius: 15px !important;
        }

        .modalHead h2 {
          font-size: 18px !important;
        }

        .modalGrid {
          gap: 8px !important;
        }

        .modalActions {
          margin-top: 8px !important;
        }

        /* ✅ Ajustes finais 10/10 absoluto */
        .kpi, .chartCard, .insightCard, .miniList, .tableShell, .entry { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease !important; }
        .kpi:hover, .chartCard:hover, .insightCard:hover, .miniList:hover, .entry:hover { transform: translateY(-2px) !important; border-color: rgba(200,162,106,.42) !important; box-shadow: 0 16px 38px rgba(0,0,0,.18) !important; }
        .chartCard { margin-top: 12px !important; padding: 13px !important; border-radius: 19px !important; border: 1px solid rgba(200,162,106,.18) !important; background: radial-gradient(circle at top left, rgba(200,162,106,.11), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)) !important; box-shadow: 0 16px 42px rgba(0,0,0,.15) !important; }
        .chartHead { display:flex!important; align-items:flex-start!important; justify-content:space-between!important; gap:12px!important; margin-bottom:10px!important; flex-wrap:wrap!important; }
        .chartHead h2 { margin:3px 0 0!important; font-size:19px!important; line-height:1.1!important; }
        .chartHead p { font-size:12px!important; line-height:1.3!important; }
        .chartLegend { display:flex!important; align-items:center!important; gap:8px!important; flex-wrap:wrap!important; }
        .chartLegend span { min-height:28px!important; padding:0 9px!important; border-radius:999px!important; border:1px solid rgba(255,255,255,.1)!important; background:rgba(0,0,0,.18)!important; font-size:10.5px!important; font-weight:900!important; display:inline-flex!important; align-items:center!important; gap:6px!important; }
        .chartDot { width:8px!important; height:8px!important; border-radius:999px!important; display:inline-block!important; }
        .chartDot.green { background:#4dff9a!important; } .chartDot.red { background:#ff8585!important; } .chartDot.gold { background:#f3c979!important; }
        .chartBars { display:grid!important; grid-template-columns:repeat(12,minmax(34px,1fr))!important; gap:8px!important; align-items:end!important; min-height:165px!important; overflow-x:auto!important; padding-bottom:3px!important; }
        .chartCol { min-width:34px!important; display:grid!important; gap:6px!important; align-items:end!important; }
        .barWrap { height:118px!important; border-radius:14px!important; border:1px solid rgba(255,255,255,.07)!important; background:rgba(0,0,0,.18)!important; display:grid!important; grid-template-columns:1fr 1fr!important; gap:3px!important; align-items:end!important; padding:5px!important; }
        .bar { min-height:3px!important; border-radius:999px 999px 4px 4px!important; box-shadow:0 0 18px rgba(0,0,0,.2)!important; }
        .bar.entrada { background:linear-gradient(180deg,#6dffad,#2edb7d)!important; } .bar.saida { background:linear-gradient(180deg,#ff9a9a,#e85f5f)!important; }
        .chartLabel { text-align:center!important; font-size:10px!important; opacity:.68!important; font-weight:800!important; }
        .chartSaldo { text-align:center!important; font-size:10px!important; font-weight:950!important; color:rgba(200,162,106,.95)!important; white-space:nowrap!important; overflow:hidden!important; text-overflow:ellipsis!important; }
        .chartEmpty { min-height:120px!important; border-radius:16px!important; border:1px dashed rgba(255,255,255,.14)!important; display:grid!important; place-items:center!important; opacity:.72!important; font-weight:800!important; }



        /* ======================================================
           ✅ FINANCEIRO PREMIUM — DRE, caixa, rankings e alertas
        ====================================================== */
        .premiumDre,
        .financePremiumPanel {
          margin-top: 12px;
          padding: 14px;
          border-radius: 20px;
          border: 1px solid rgba(200,162,106,.18);
          background:
            radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012));
          box-shadow: 0 16px 42px rgba(0,0,0,.16);
        }

        .dreHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .dreHead h2,
        .financePremiumPanel h2 {
          margin: 4px 0 0;
          font-size: 20px;
          line-height: 1.12;
        }

        .dreHead p {
          max-width: 760px;
          font-size: 12px;
        }

        .dreResult {
          min-width: 190px;
          padding: 11px 12px;
          border-radius: 16px;
          border: 1px solid rgba(200,162,106,.2);
          background: rgba(0,0,0,.2);
          display: grid;
          gap: 3px;
          text-align: right;
        }

        .dreResult span,
        .dreResult small {
          font-size: 10px;
          opacity: .68;
          text-transform: uppercase;
          letter-spacing: .1em;
          font-weight: 950;
        }

        .dreResult strong {
          font-size: 21px;
          line-height: 1.08;
        }

        .dreResult.positive strong { color: #4dff9a; }
        .dreResult.negative strong { color: #ff8585; }

        .dreGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 9px;
        }

        .dreCard {
          min-height: 82px;
          padding: 11px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.18);
          display: grid;
          align-content: center;
        }

        .dreCard span {
          font-size: 10px;
          opacity: .7;
          text-transform: uppercase;
          letter-spacing: .1em;
          font-weight: 950;
        }

        .dreCard strong {
          margin-top: 5px;
          font-size: 17px;
          color: rgba(200,162,106,.98);
          overflow-wrap: anywhere;
        }

        .dreCard small {
          margin-top: 4px;
          opacity: .62;
          font-size: 10.5px;
        }

        .dreCard.green strong { color: #4dff9a; }
        .dreCard.red strong { color: #ff8585; }
        .dreCard.gold strong,
        .dreCard.warn strong { color: #f3c979; }

        .cashToday {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1.2fr .7fr .7fr;
          gap: 8px;
          padding: 10px;
          border-radius: 16px;
          border: 1px solid rgba(200,162,106,.14);
          background: rgba(200,162,106,.055);
        }

        .cashToday > div {
          display: grid;
          gap: 4px;
        }

        .cashToday span,
        .cashToday small {
          font-size: 10px;
          opacity: .68;
          text-transform: uppercase;
          letter-spacing: .09em;
          font-weight: 950;
        }

        .cashToday strong,
        .cashToday b {
          font-size: 15px;
          overflow-wrap: anywhere;
        }

        .financePremiumGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr 1.15fr;
          gap: 10px;
        }

        .paymentRanking,
        .expenseRanking,
        .financeAlerts {
          margin-top: 10px;
          display: grid;
          gap: 8px;
        }

        .paymentRow {
          position: relative;
          overflow: hidden;
          min-height: 56px;
          padding: 9px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.18);
          display: grid;
          grid-template-columns: minmax(0,1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .paymentRow div,
        .expenseRow {
          min-width: 0;
        }

        .paymentRow strong,
        .expenseRow strong {
          display: block;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .paymentRow small {
          display: block;
          margin-top: 3px;
          opacity: .62;
          font-size: 10.5px;
        }

        .paymentRow span,
        .expenseRow span {
          font-weight: 950;
          color: rgba(200,162,106,.98);
          font-size: 12px;
          white-space: nowrap;
        }

        .paymentRow i {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, #f3c979, rgba(200,162,106,.25));
        }

        .expenseRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 42px;
          padding: 9px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.18);
        }

        .financeAlert {
          display: grid;
          grid-template-columns: 34px minmax(0,1fr);
          gap: 8px;
          padding: 9px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.18);
        }

        .financeAlert > span {
          width: 32px;
          height: 32px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(200,162,106,.18);
          background: rgba(200,162,106,.07);
        }

        .financeAlert strong {
          display: block;
          font-size: 12px;
        }

        .financeAlert small {
          display: block;
          margin-top: 3px;
          opacity: .66;
          font-size: 10.5px;
          line-height: 1.28;
        }

        .financeAlert.critico { border-color: rgba(255,120,120,.28); }
        .financeAlert.alerta { border-color: rgba(255,201,98,.28); }
        .financeAlert.sucesso { border-color: rgba(117,255,171,.24); }

        .emptyMini {
          min-height: 70px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px dashed rgba(255,255,255,.14);
          opacity: .7;
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 1100px) {
          .insightGrid,
          .listsGrid {
            grid-template-columns: 1fr !important;
          }

          .entry {
            grid-template-columns: 36px minmax(0,1fr) !important;
          }

          .entryValue {
            grid-column: 2 / -1 !important;
            text-align: left !important;
            justify-items: start !important;
          }

          .entryActions {
            grid-column: 2 / -1 !important;
            justify-content: flex-start !important;
          }
        }


        @media (max-width: 1100px) {
          .financePremiumGrid { grid-template-columns: 1fr !important; }
          .cashToday { grid-template-columns: 1fr !important; }
          .dreResult { text-align: left !important; }
        }
      `}</style>
    </main>
  );
}


function DreCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "red" | "gold" | "warn";
}) {
  return (
    <div className={`dreCard ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function FinancialChart({
  data,
  totalEntradas,
  totalSaidas,
}: {
  data: Array<{ label: string; entradas: number; saidas: number; saldo: number }>;
  totalEntradas: number;
  totalSaidas: number;
}) {
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.entradas, item.saidas]));

  return (
    <section className="chartCard">
      <div className="chartHead">
        <div>
          <div className="sectionKicker">Gráfico financeiro</div>
          <h2>Entradas x saídas</h2>
          <p>Resumo visual dos últimos movimentos dentro do filtro atual.</p>
        </div>

        <div className="chartLegend">
          <span><i className="chartDot green" /> Entradas {formatBRL(totalEntradas)}</span>
          <span><i className="chartDot red" /> Saídas {formatBRL(totalSaidas)}</span>
          <span><i className="chartDot gold" /> Saldo {formatBRL(totalEntradas - totalSaidas)}</span>
        </div>
      </div>

      {data.length ? (
        <div className="chartBars">
          {data.map((item, index) => {
            const entradaHeight = Math.max(3, Math.round((item.entradas / maxValue) * 100));
            const saidaHeight = Math.max(3, Math.round((item.saidas / maxValue) * 100));

            return (
              <div className="chartCol" key={item.label + "_" + index}>
                <div className="barWrap" title={"Entradas: " + formatBRL(item.entradas) + " | Saídas: " + formatBRL(item.saidas)}>
                  <div className="bar entrada" style={{ height: entradaHeight + "%" }} />
                  <div className="bar saida" style={{ height: saidaHeight + "%" }} />
                </div>
                <div className="chartLabel">{item.label}</div>
                <div className="chartSaldo">{formatBRL(item.saldo)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="chartEmpty">Nenhum dado financeiro para montar o gráfico neste filtro.</div>
      )}
    </section>
  );
}
function Kpi({ title, value, hint, tone }: { title: string; value: string; hint: string; tone?: "green" | "red" | "gold" }) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
      <div className="kpiHint">{hint}</div>
    </div>
  );
}

function FinanceList({ title, items, onOpen }: { title: string; items: Lancamento[]; onOpen: (id: string) => void }) {
  return (
    <section className="miniList">
      <h3>{title}</h3>
      {items.length ? items.map((item) => (
        <div className="miniItem" key={item.id} onClick={() => onOpen(item.id)}>
          <div>
            <strong>{item.descricao}</strong><br />
            <small>{formatDateBR(item.data)} • {formaLabel(item.forma)}</small>
          </div>
          <strong className={item.tipo === "receita" ? "green" : "red"}>{formatBRL(item.valor)}</strong>
        </div>
      )) : <div className="empty">Nenhum lançamento.</div>}
    </section>
  );
}
