"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// 🔌 Firebase
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  setDoc,
} from "firebase/firestore";

type Categoria = "masculino" | "feminino" | "unissex";

type Produto = {
  id: string;
  nome: string;
  marca?: string;
  volumeMl?: number;
  categoria?: Categoria;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number; // estoque físico
  reservado?: number; // reservado para pedidos (ainda não faturados)
  ativo?: boolean;
  createdAt: string;
  updatedAt: string;
  observacoes?: string;
};

const STORAGE_KEY = "maison_noor_crm_produtos_v1";

function nowISO(): string {
  return new Date().toISOString();
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStorage(): Produto[] {
  try {
    if (!canUseStorage()) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Produto[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: Produto[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// 🔧 remove qualquer campo undefined antes de enviar pro Firestore
function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

const productsCollection = collection(db, "products");

export default function ProdutosPage() {
  const [items, setItems] = useState<Produto[]>([]);
  const [toast, setToast] = useState("");

  // filtros
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"todas" | Categoria>("todas");
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlySemEstoque, setOnlySemEstoque] = useState(false);
  const [sortBy, setSortBy] = useState<
    "recentes" | "nome" | "estoque" | "preco"
  >("recentes");

  // modal
  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = useMemo(
    () => items.find((p) => p.id === openId) || null,
    [items, openId]
  );

  // form
  const [fNome, setFNome] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fVolume, setFVolume] = useState<string>("100");
  const [fCat, setFCat] = useState<Categoria>("unissex");
  const [fCompra, setFCompra] = useState<string>("0");
  const [fVenda, setFVenda] = useState<string>("0");
  const [fEstoque, setFEstoque] = useState<string>("0");
  const [fAtivo, setFAtivo] = useState<boolean>(true);
  const [fObs, setFObs] = useState("");

  // import/export
  const fileRef = useRef<HTMLInputElement | null>(null);

  function showToast(msg: string, ms = 1600): void {
    setToast(msg);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setToast(""), ms);
    }
  }

  // 🔁 Carrega do Firestore (com fallback pro backup local)
  async function loadFromFirebase(showMsg = false) {
    try {
      const snap = await getDocs(
        query(productsCollection, orderBy("updatedAt", "desc"))
      );
      const arr: Produto[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        arr.push({
          id: d.id,
          nome: data.nome ?? "",
          marca: data.marca,
          volumeMl: data.volumeMl,
          categoria: data.categoria,
          precoCompra: data.precoCompra,
          precoVenda: data.precoVenda,
          estoque: data.estoque,
          reservado: data.reservado ?? 0,
          ativo: data.ativo ?? true,
          createdAt: data.createdAt ?? nowISO(),
          updatedAt: data.updatedAt ?? nowISO(),
          observacoes: data.observacoes,
        });
      });
      setItems(arr);
      writeStorage(arr);
      if (showMsg) showToast("🔄 Atualizado do servidor!");
    } catch (err) {
      console.error("Erro Firestore:", err);
      const backup = readStorage();
      if (backup.length) {
        setItems(backup);
        showToast("⚠️ Erro no servidor. Usando backup local.");
      } else {
        showToast("⚠️ Erro ao carregar produtos.");
      }
    }
  }

  useEffect(() => {
    loadFromFirebase(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh(): void {
    loadFromFirebase(true);
  }

  function openNew(): void {
    setOpenId("NEW");
    setFNome("");
    setFMarca("");
    setFVolume("100");
    setFCat("unissex");
    setFCompra("0");
    setFVenda("0");
    setFEstoque("0");
    setFAtivo(true);
    setFObs("");
  }

  function openEtiqueta(id: string): void {
    if (typeof window === "undefined") return;
    window.open(`/api/etiqueta?id=${encodeURIComponent(id)}`, "_blank");
  }

  function openEdit(id: string): void {
    const p = items.find((x) => x.id === id);
    if (!p) return;
    setOpenId(id);

    setFNome(p.nome || "");
    setFMarca(p.marca || "");
    setFVolume(String(p.volumeMl ?? 100));
    setFCat(p.categoria || "unissex");
    setFCompra(String(p.precoCompra ?? 0));
    setFVenda(String(p.precoVenda ?? 0));
    setFEstoque(String(p.estoque ?? 0));
    setFAtivo(p.ativo !== false);
    setFObs(p.observacoes || "");
  }

  function closeModal(): void {
    setOpenId(null);
  }

  function toNum(v: string): number {
    const n = Number(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function dedupeName(nome: string, exceptId?: string): string {
    const base = nome.trim();
    const baseNorm = norm(base);
    const existing = items
      .filter((p) => (exceptId ? p.id !== exceptId : true))
      .map((p) => norm(p.nome));
    if (!existing.includes(baseNorm)) return base;

    let i = 2;
    while (existing.includes(norm(`${base} (${i})`))) i++;
    return `${base} (${i})`;
  }

  // 💾 SALVAR (CREATE/UPDATE) NO FIRESTORE
  async function save() {
    const nomeRaw = fNome.trim();
    if (!nomeRaw) {
      showToast("⚠️ Informe o nome do produto.");
      return;
    }

    const basePayload = {
      nome: nomeRaw,
      marca: fMarca.trim() || undefined,
      volumeMl: toNum(fVolume) || undefined,
      categoria: fCat as Categoria,
      precoCompra: Math.max(0, toNum(fCompra)),
      precoVenda: Math.max(0, toNum(fVenda)),
      estoque: Math.max(0, Math.floor(toNum(fEstoque))),
      ativo: fAtivo,
      // 🔑 nunca manda undefined
      observacoes: fObs?.trim() ? fObs.trim() : undefined,
      reservado: openId === "NEW" ? 0 : openItem?.reservado ?? 0,
      createdAt: openId === "NEW" ? nowISO() : openItem?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };

    try {
      if (openId === "NEW") {
        const payload = cleanUndefined({
          ...basePayload,
          nome: dedupeName(basePayload.nome),
        });
        await addDoc(productsCollection, payload);
        showToast("✅ Produto criado no Firebase!");
      } else if (openId) {
        const payload = cleanUndefined({
          ...basePayload,
          nome: dedupeName(basePayload.nome, openId),
        });
        await updateDoc(doc(db, "products", openId), payload);
        showToast("✅ Produto atualizado no Firebase!");
      }

      closeModal();
      await loadFromFirebase(false);
    } catch (err) {
      console.error(err);
      showToast("❌ Erro ao salvar no servidor");
    }
  }

  // 🗑️ REMOVER
  async function remove() {
    if (!openItem) return;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(`Excluir "${openItem.nome}"? (não dá para desfazer)`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "products", openItem.id));
      showToast("🗑️ Produto excluído!");
      closeModal();
      await loadFromFirebase(false);
    } catch (err) {
      console.error(err);
      showToast("⚠️ Erro ao excluir");
    }
  }

  // 📌 DUPLICAR
  async function duplicateProduct(id: string): Promise<void> {
    const p = items.find((x) => x.id === id);
    if (!p) return;

    const copyPayload = {
      ...p,
      nome: dedupeName(p.nome),
      reservado: p.reservado ?? 0,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    // não salvar o id dentro do doc
    const { id: _, ...data } = copyPayload;

    try {
      await addDoc(productsCollection, cleanUndefined(data));
      showToast("📌 Produto duplicado!");
      await loadFromFirebase(false);
    } catch (err) {
      console.error(err);
      showToast("⚠️ Erro ao duplicar");
    }
  }

  // 🔻 / 🔺 AJUSTE DE ESTOQUE
  async function adjustEstoque(id: string, delta: number): Promise<void> {
    const p = items.find((x) => x.id === id);
    if (!p) return;
    const atual = Number(p.estoque) || 0;
    const novo = Math.max(0, atual + delta);

    try {
      await updateDoc(doc(db, "products", id), {
        estoque: novo,
        updatedAt: nowISO(),
      });
      await loadFromFirebase(false);
    } catch (err) {
      console.error(err);
      showToast("⚠️ Erro ao ajustar estoque");
    }
  }

  // ON/OFF
  async function toggleActive(id: string): Promise<void> {
    const p = items.find((x) => x.id === id);
    if (!p) return;

    try {
      await updateDoc(doc(db, "products", id), {
        ativo: !(p.ativo ?? true),
        updatedAt: nowISO(),
      });
      await loadFromFirebase(false);
    } catch (err) {
      console.error(err);
      showToast("⚠️ Erro ao alterar status");
    }
  }

  // export json (usa o estado atual)
  function exportJSON(): void {
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `maison_noor_produtos_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast("⬇️ Exportado!");
  }

  // import json -> grava no Firestore
  function importJSON(file: File): void {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = String(reader.result || "");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Arquivo inválido");

        const incoming = (parsed as any[])
          .filter(Boolean)
          .map((x) => ({
            id: String(x.id || uid()),
            nome: String(x.nome || "").trim(),
            marca: x.marca ? String(x.marca) : undefined,
            volumeMl:
              typeof x.volumeMl === "number"
                ? x.volumeMl
                : Number(x.volumeMl) || undefined,
            categoria:
              x.categoria === "masculino" ||
              x.categoria === "feminino" ||
              x.categoria === "unissex" ||
              x.categoria === "kits-presente"
                ? (x.categoria as Categoria)
                : undefined,
            precoCompra: Number(x.precoCompra) || 0,
            precoVenda: Number(x.precoVenda) || 0,
            estoque: Math.max(0, Math.floor(Number(x.estoque) || 0)),
            reservado: Math.max(0, Math.floor(Number(x.reservado) || 0)),
            ativo: x.ativo !== false,
            createdAt: x.createdAt ? String(x.createdAt) : nowISO(),
            updatedAt: x.updatedAt ? String(x.updatedAt) : nowISO(),
            observacoes: x.observacoes ? String(x.observacoes) : undefined,
          }))
          .filter((p) => p.nome);

        // salva/atualiza cada produto no Firestore
        for (const p of incoming) {
          const { id, ...data } = p;
          await setDoc(doc(db, "products", id), cleanUndefined(data), {
            merge: true,
          });
        }

        await loadFromFirebase(false);
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

  // ESC fecha modal | Ctrl+Enter salva
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
      if (openId && (e.ctrlKey || e.metaKey) && e.key === "Enter") save();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    openId,
    fNome,
    fMarca,
    fVolume,
    fCat,
    fCompra,
    fVenda,
    fEstoque,
    fAtivo,
    fObs,
  ]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    const base = items.filter((p) => {
      if (onlyActive && p.ativo === false) return false;
      if (onlySemEstoque) {
        const est = Number(p.estoque) || 0;
        const res = Number(p.reservado) || 0;
        const disp = Math.max(0, est - res);
        if (disp > 0) return false;
      }
      if (cat !== "todas" && p.categoria !== cat) return false;
      if (!qq) return true;
      const hay = `${p.nome} ${p.marca || ""} ${p.volumeMl || ""}`.toLowerCase();
      return hay.includes(qq);
    });

    if (sortBy === "nome") {
      return base.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    }
    if (sortBy === "estoque") {
      return base.sort(
        (a, b) => (Number(b.estoque) || 0) - (Number(a.estoque) || 0)
      );
    }
    if (sortBy === "preco") {
      return base.sort(
        (a, b) => (Number(b.precoVenda) || 0) - (Number(a.precoVenda) || 0)
      );
    }
    return base.sort((a, b) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || "")
    );
  }, [items, q, cat, onlyActive, onlySemEstoque, sortBy]);

  const totals = useMemo(() => {
    const total = filtered.length;
    let ativos = 0;
    let semEstoqueDisp = 0;
    let estoqueFisico = 0;
    let totalReservado = 0;
    let totalDisponivel = 0;
    let valorEstoqueVenda = 0;
    let valorEstoqueCompra = 0;

    for (const p of filtered) {
      if (p.ativo !== false) ativos++;
      const est = Number(p.estoque) || 0;
      const res = Number(p.reservado) || 0;
      const disp = Math.max(0, est - res);
      estoqueFisico += est;
      totalReservado += res;
      totalDisponivel += disp;
      if (disp <= 0) semEstoqueDisp++;
      valorEstoqueVenda += (Number(p.precoVenda) || 0) * est;
      valorEstoqueCompra += (Number(p.precoCompra) || 0) * est;
    }

    const margemEstimada = Math.max(0, valorEstoqueVenda - valorEstoqueCompra);
    const markupPercentual =
      valorEstoqueCompra > 0 ? (margemEstimada / valorEstoqueCompra) * 100 : 0;
    const margemVendaPercentual =
      valorEstoqueVenda > 0 ? (margemEstimada / valorEstoqueVenda) * 100 : 0;

    return {
      total,
      ativos,
      semEstoqueDisp,
      estoqueFisico,
      totalReservado,
      totalDisponivel,
      valorEstoqueVenda,
      valorEstoqueCompra,
      margemEstimada,
      markupPercentual,
      margemVendaPercentual,
    };
  }, [filtered]);

  const margemFormulario = useMemo(() => {
    const custo = Math.max(0, toNum(fCompra));
    const venda = Math.max(0, toNum(fVenda));
    const estoque = Math.max(0, Math.floor(toNum(fEstoque)));
    const lucroUnitario = venda - custo;
    const markupPercentual = custo > 0 ? (lucroUnitario / custo) * 100 : 0;
    const margemVendaPercentual = venda > 0 ? (lucroUnitario / venda) * 100 : 0;
    const lucroTotalEstoque = lucroUnitario * estoque;
    const custoTotalEstoque = custo * estoque;
    const vendaTotalEstoque = venda * estoque;
    const margemNegativa = lucroUnitario < 0;

    return {
      custo,
      venda,
      estoque,
      lucroUnitario,
      markupPercentual,
      margemVendaPercentual,
      lucroTotalEstoque,
      custoTotalEstoque,
      vendaTotalEstoque,
      margemNegativa,
    };
  }, [fCompra, fVenda, fEstoque]);

  return (
    <main className="page">
      <header className="head">
        <div>
          <div className="kicker">Maison Noor</div>
          <h1 className="title">CRM • Produtos</h1>
          <p className="sub">
            Cadastre e controle catálogo + estoque (sincronizado online).
          </p>
        </div>

        <div className="headRight headRightCompact">
          <span className="heroBadge">Catálogo em tempo real</span>
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}

      <section className="smartPanel">
        <div className="smartPanelTop">
          <div className="smartFilters">
            <div className="field smartSearch">
              <label>Busca</label>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar produto, marca ou categoria..."
              />
            </div>

            <div className="field smartSelect">
              <label>Categoria</label>
              <select
                className="input"
                value={cat}
                onChange={(e) => setCat(e.target.value as "todas" | Categoria)}
              >
                <option value="todas">Todas</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="unissex">Unissex</option>
                <option value="kits-presente">Kits Presente</option>
              </select>
            </div>

            <div className="field smartSelect">
              <label>Ordenar</label>
              <select
                className="input"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "recentes" | "nome" | "estoque" | "preco"
                  )
                }
              >
                <option value="recentes">Mais recentes</option>
                <option value="nome">Nome (A→Z)</option>
                <option value="estoque">Estoque (maior)</option>
                <option value="preco">Preço venda (maior)</option>
              </select>
            </div>

            <label className="check smartCheck">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />
              <span>Ativos</span>
            </label>

            <label className="check smartCheck">
              <input
                type="checkbox"
                checked={onlySemEstoque}
                onChange={(e) => setOnlySemEstoque(e.target.checked)}
              />
              <span>Sem estoque</span>
            </label>
          </div>

          <div className="smartActions">
            <button className="btn btnPrimaryMini" onClick={openNew} type="button">
              + Novo
            </button>

            <Link href="/crm/etiquetas" className="btn btnEtiqueta">
              Emitir Etiquetas
            </Link>

            <button className="btn" onClick={refresh} type="button">
              Atualizar
            </button>
            <button className="btn" onClick={exportJSON} type="button">
              Exportar
            </button>
            <button
              className="btn"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              Importar
            </button>
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
        </div>

        <div className="smartKpis">
          <div className="miniKpi">
            <span>Produtos</span>
            <strong>{totals.total}</strong>
          </div>
          <div className="miniKpi">
            <span>Ativos</span>
            <strong>{totals.ativos}</strong>
          </div>
          <div className={totals.semEstoqueDisp > 0 ? "miniKpi miniKpiWarn" : "miniKpi"}>
            <span>Sem estoque</span>
            <strong>{totals.semEstoqueDisp}</strong>
          </div>
          <div className="miniKpi">
            <span>Disponível</span>
            <strong>{totals.totalDisponivel}</strong>
          </div>
          <div className="miniKpi">
            <span>Estoque</span>
            <strong>{totals.estoqueFisico}</strong>
          </div>
          <div className="miniKpi miniKpiGold">
            <span>Valor venda</span>
            <strong>{formatBRL(totals.valorEstoqueVenda)}</strong>
          </div>
          <div className="miniKpi miniKpiGold">
            <span>Custo estoque</span>
            <strong>{formatBRL(totals.valorEstoqueCompra)}</strong>
            <small className="kpiSub">Investido em estoque</small>
          </div>
          <div className="miniKpi miniKpiGold">
            <span>Lucro estoque</span>
            <strong>{formatBRL(totals.margemEstimada)}</strong>
            <small className="kpiSub">
              Markup {totals.markupPercentual.toFixed(0)}% • Venda {totals.margemVendaPercentual.toFixed(0)}%
            </small>
          </div>
        </div>
      </section>

      {/* GRID DE PRODUTOS - SAAS COMPACTO */}
      <section className="productsShell">
        <div className="productsHead">
          <div>
            <div className="sectionKicker">Produtos cadastrados</div>
            <h2>Catálogo e estoque</h2>
            <p>
              Visual em cards para evitar cortes, melhorar leitura e agilizar ações.
            </p>
          </div>

          <div className="productsHeadBadges">
            <span>{filtered.length} produto(s)</span>
            <span className="gold">{formatBRL(totals.valorEstoqueVenda)}</span>
          </div>
        </div>

        {filtered.length ? (
          <div className="productsGrid">
            {filtered.map((p) => {
              const est = Number(p.estoque) || 0;
              const res = Number(p.reservado) || 0;
              const disp = Math.max(0, est - res);
              const bloqueado = p.ativo === false;
              const lucroUnitario = Number(p.precoVenda || 0) - Number(p.precoCompra || 0);
              const markupUnitario =
                Number(p.precoCompra || 0) > 0
                  ? (lucroUnitario / Number(p.precoCompra || 0)) * 100
                  : 0;
              const margemVendaUnitario =
                Number(p.precoVenda || 0) > 0
                  ? (lucroUnitario / Number(p.precoVenda || 0)) * 100
                  : 0;
              const categoriaLabel = String(p.categoria || "—")
                .replace("kits-presente", "Kits")
                .replace("masculino", "Masc.")
                .replace("feminino", "Fem.")
                .replace("unissex", "Unissex");

              return (
                <article
                  key={p.id}
                  className={bloqueado ? "productCard blocked" : "productCard"}
                  onClick={() => openEdit(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openEdit(p.id);
                  }}
                >
                  <div className="productCardGlow" />

                  <div className="productTop">
                    <div className="productAvatar">
                      {String(p.nome || "P").trim().slice(0, 1).toUpperCase()}
                    </div>

                    <div className="productTitleWrap">
                      <strong className="productName" title={p.nome}>
                        {p.nome || "Produto sem nome"}
                      </strong>
                      <span className="productMeta">
                        {p.marca || "Sem marca"} • {p.volumeMl ? `${p.volumeMl}ml` : "Volume não informado"}
                      </span>
                    </div>

                    <span className={bloqueado ? "productStatus off" : "productStatus on"}>
                      {bloqueado ? "🔴 Bloqueado" : "🟢 Ativo"}
                    </span>
                  </div>

                  <div className="productTags">
                    <span>{categoriaLabel}</span>
                    {disp <= 0 ? <span className="dangerTag">⚠ Sem estoque</span> : null}
                    {disp > 0 && disp <= 2 ? <span className="dangerTag">⚠ Estoque baixo</span> : null}
                    {res > 0 ? <span className="softTag">Reservado: {res}</span> : null}
                  </div>

                  <div className="productCompactInfo">
                    <div className="productStockLine">
                      <span>Estoque: <b>{est}</b></span>
                      <span>Disp.: <b>{disp}</b></span>
                      <span>Res.: <b>{res}</b></span>
                    </div>

                    <div className="productPriceLine">
                      <span>Venda <b>{formatBRL(Number(p.precoVenda || 0))}</b></span>
                      <span>Compra <b>{formatBRL(Number(p.precoCompra || 0))}</b></span>
                      <span>Lucro <b>{formatBRL(lucroUnitario)}</b></span>
                      <span>Markup <b>{markupUnitario.toFixed(0)}%</b></span>
                      <span>Venda <b>{margemVendaUnitario.toFixed(0)}%</b></span>
                    </div>
                  </div>

                  {p.observacoes ? (
                    <div className="productObs" title={p.observacoes}>
                      {p.observacoes}
                    </div>
                  ) : null}

                  <div className="productActions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="miniAction"
                      onClick={() => adjustEstoque(p.id, -1)}
                      type="button"
                      title="Baixar 1 unidade"
                    >
                      −1
                    </button>

                    <button
                      className="miniAction"
                      onClick={() => adjustEstoque(p.id, +1)}
                      type="button"
                      title="Adicionar 1 unidade"
                    >
                      +1
                    </button>

                    <button
                      className="miniAction edit"
                      onClick={() => openEdit(p.id)}
                      type="button"
                    >
                      Editar
                    </button>

                    <button
                      className={bloqueado ? "miniAction unblock" : "miniAction block"}
                      onClick={() => toggleActive(p.id)}
                      type="button"
                      title={bloqueado ? "Ativar produto" : "Bloquear produto"}
                    >
                      {bloqueado ? "Ativar" : "Bloquear"}
                    </button>

                    <button
                      className="miniAction"
                      onClick={() => duplicateProduct(p.id)}
                      type="button"
                    >
                      Duplicar
                    </button>

                    <button
                      className="miniAction label"
                      onClick={() => openEtiqueta(p.id)}
                      type="button"
                      title="Gerar etiqueta de preço em PDF"
                    >
                      Etiqueta
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="emptyPremium">
            <strong>Nenhum produto encontrado.</strong>
            <span>Ajuste os filtros ou clique em “+ Novo”.</span>
          </div>
        )}
      </section>

      {/* MODAL */}
      {openId ? (
        <div
          className="modalOverlay"
          onMouseDown={closeModal}
          role="presentation"
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalKicker">
                  {openId === "NEW" ? "Novo produto" : "Editar produto"}
                </div>
                <div className="modalTitle">
                  {openId === "NEW" ? "Cadastro" : openItem?.nome}
                </div>
                {openId !== "NEW" ? (
                  <div className="modalSub">
                    ID: <span className="mono">{openItem?.id}</span>
                  </div>
                ) : null}
              </div>

              <button
                className="btnX"
                onClick={closeModal}
                type="button"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="modalGrid">
              <div className="field">
                <label>Nome*</label>
                <input
                  className="input"
                  value={fNome}
                  onChange={(e) => setFNome(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Marca</label>
                <input
                  className="input"
                  value={fMarca}
                  onChange={(e) => setFMarca(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Categoria</label>
                <select
                  className="input"
                  value={fCat}
                  onChange={(e) => setFCat(e.target.value as Categoria)}
                >
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                  <option value="unissex">Unissex</option>
                  <option value="kits-presente">Kits Presente</option>
                </select>
              </div>

              <div className="field">
                <label>Volume (ml)</label>
                <input
                  className="input"
                  value={fVolume}
                  onChange={(e) => setFVolume(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Preço compra (R$)</label>
                <input
                  className="input"
                  value={fCompra}
                  onChange={(e) => setFCompra(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Preço venda (R$)</label>
                <input
                  className="input"
                  value={fVenda}
                  onChange={(e) => setFVenda(e.target.value)}
                />
              </div>

              <div className={margemFormulario.margemNegativa ? "autoMarginBox autoMarginDanger" : "autoMarginBox"}>
                <div className="autoMarginTop">
                  <span>Margem automática</span>
                  <strong>{formatBRL(margemFormulario.lucroUnitario)}</strong>
                </div>

                <div className="autoMarginGrid">
                  <div>
                    <small>Markup sobre custo</small>
                    <b>{margemFormulario.markupPercentual.toFixed(0)}%</b>
                  </div>
                  <div>
                    <small>Margem sobre venda</small>
                    <b>{margemFormulario.margemVendaPercentual.toFixed(0)}%</b>
                  </div>
                  <div>
                    <small>Lucro no estoque</small>
                    <b>{formatBRL(margemFormulario.lucroTotalEstoque)}</b>
                  </div>
                </div>

                <p>
                  Custo total: {formatBRL(margemFormulario.custoTotalEstoque)} • Venda total: {formatBRL(margemFormulario.vendaTotalEstoque)}
                </p>
              </div>

              <div className="field">
                <label>Estoque (unid.)</label>
                <input
                  className="input"
                  value={fEstoque}
                  onChange={(e) => setFEstoque(e.target.value)}
                />
              </div>

              <label className="check">
                <input
                  type="checkbox"
                  checked={fAtivo}
                  onChange={(e) => setFAtivo(e.target.checked)}
                />
                <span>Ativo</span>
              </label>

              <div className="field wide">
                <label>Observações</label>
                <textarea
                  className="textarea"
                  value={fObs}
                  onChange={(e) => setFObs(e.target.value)}
                />
              </div>
            </div>

            <div className="modalActions">
              <button
                className="btnSmallPrimary"
                onClick={save}
                type="button"
              >
                Salvar
              </button>

              <div className="spacer" />

              {openId !== "NEW" ? (
                <button className="btnDanger" onClick={remove} type="button">
                  Excluir
                </button>
              ) : null}
            </div>

            {openId !== "NEW" && openItem ? (
              <div className="modalFoot">
                Criado:{" "}
                {new Date(openItem.createdAt).toLocaleString("pt-BR")} •
                Atualizado:{" "}
                {new Date(openItem.updatedAt).toLocaleString("pt-BR")}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .page {
          padding: 24px;
        }

        /* CABEÇALHO NO PADRÃO FINANCEIRO / KANBAN */
        .kicker {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(200, 162, 106, 0.95);
          font-weight: 900;
        }
        .title {
          margin: 4px 0 0;
          font-size: 26px;
          letter-spacing: 0.01em;
          font-weight: 900;
        }
        .sub {
          margin: 4px 0 0;
          opacity: 0.78;
          font-size: 14px;
          line-height: 1.4;
          max-width: 720px;
        }

        .head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          align-items: flex-end;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.03),
            rgba(255, 255, 255, 0.01)
          );
        }
        .headRight {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .btn {
          min-height: 42px;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.25);
          background: rgba(200, 162, 106, 0.08);
          cursor: pointer;
          font-weight: 900;
          color: #f2f2f2;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btnEtiqueta {
          min-height: 42px;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.25);
          background: rgba(200, 162, 106, 0.08);
          cursor: pointer;
          font-weight: 900;
          color: #f2f2f2;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .toast {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.08);
          font-weight: 800;
          max-width: 980px;
        }

        .heroBadge {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(88, 214, 141, 0.3);
          background: rgba(88, 214, 141, 0.08);
          color: #9ff0bc;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .smartPanel {
          margin-top: 12px;
          padding: 12px;
          border-radius: 20px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            radial-gradient(circle at top right, rgba(200, 162, 106, 0.10), transparent 34%),
            rgba(0, 0, 0, 0.14);
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.14);
        }
        .smartPanelTop {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .smartFilters {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
          flex: 1 1 auto;
        }
        .smartActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .smartSearch {
          width: min(320px, 100%);
        }
        .smartSelect {
          width: 190px;
        }
        .field label {
          font-size: 10px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          opacity: 0.72;
          font-weight: 900;
        }
        .input {
          height: 42px;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 15, 22, 0.92);
          color: #f2f2f2;
          outline: none;
          font-size: 13px;
        }

        .check {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(200, 162, 106, 0.06);
          font-weight: 900;
          cursor: pointer;
          user-select: none;
          height: 42px;
          font-size: 12px;
          white-space: nowrap;
        }
        .smartCheck input {
          width: 14px;
          height: 14px;
          accent-color: #c8a26a;
        }
        .btnPrimaryMini {
          border-color: rgba(200, 162, 106, 0.48);
          background: linear-gradient(180deg, rgba(200, 162, 106, 0.18), rgba(200, 162, 106, 0.07));
        }
        .smartKpis {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }
        .miniKpi {
          min-width: 0;
          padding: 9px 10px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.14);
          background: rgba(255, 255, 255, 0.025);
        }
        .miniKpi span {
          display: block;
          font-size: 10px;
          opacity: 0.72;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .miniKpi strong {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 15px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .miniKpiGold strong {
          color: rgba(200, 162, 106, 0.98);
        }
        .miniKpiWarn {
          border-color: rgba(255, 157, 92, 0.28);
          background: rgba(255, 157, 92, 0.07);
        }
        .miniKpi .kpiSub {
          display: block;
          margin-top: 3px;
          font-size: 9px;
          line-height: 1.15;
          color: rgba(255, 255, 255, 0.62);
          white-space: normal;
        }
        .autoMarginBox {
          grid-column: 1 / -1;
          border-radius: 16px;
          border: 1px solid rgba(200, 162, 106, 0.24);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.16), transparent 34%),
            rgba(200, 162, 106, 0.07);
          padding: 12px;
        }
        .autoMarginDanger {
          border-color: rgba(255, 120, 120, 0.38);
          background:
            radial-gradient(circle at top left, rgba(255, 120, 120, 0.16), transparent 34%),
            rgba(255, 120, 120, 0.07);
        }
        .autoMarginTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
        }
        .autoMarginTop span {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.78;
          font-weight: 950;
        }
        .autoMarginTop strong {
          color: rgba(200, 162, 106, 0.98);
          font-size: 20px;
          font-weight: 1000;
        }
        .autoMarginDanger .autoMarginTop strong {
          color: #ffd1d1;
        }
        .autoMarginGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .autoMarginGrid div {
          min-width: 0;
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.16);
          padding: 9px;
        }
        .autoMarginGrid small {
          display: block;
          opacity: 0.62;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .autoMarginGrid b {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 15px;
        }
        .autoMarginBox p {
          margin: 9px 0 0;
          opacity: 0.68;
          font-size: 12px;
          line-height: 1.35;
        }

        @media (max-width: 1280px) {
          .smartKpis {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (max-width: 900px) {
          .smartKpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .smartSelect,
          .smartSearch {
            width: 100%;
          }
        }

        /* ===== TABELA ERP ===== */

        .sectionKicker {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(200, 162, 106, 0.95);
          font-weight: 950;
        }
        .productsShell {
          margin-top: 14px;
          padding: 14px;
          border-radius: 22px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.10), transparent 30%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
          overflow: hidden;
        }
        .productsHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .productsHead h2 {
          margin: 3px 0 0;
          font-size: 22px;
          line-height: 1.08;
          letter-spacing: -0.02em;
        }
        .productsHead p {
          margin: 6px 0 0;
          opacity: 0.68;
          font-size: 13px;
          line-height: 1.45;
        }
        .productsHeadBadges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .productsHeadBadges span {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(0, 0, 0, 0.18);
          font-size: 12px;
          font-weight: 950;
          white-space: nowrap;
        }
        .productsHeadBadges .gold {
          border-color: rgba(200, 162, 106, 0.32);
          background: rgba(200, 162, 106, 0.10);
          color: rgba(200, 162, 106, 0.98);
        }
        .productsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
          gap: 10px;
        }
        .productCard {
          position: relative;
          overflow: hidden;
          min-width: 0;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015)),
            rgba(0, 0, 0, 0.22);
          padding: 11px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
          cursor: pointer;
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
        }
        .productCard:hover {
          transform: translateY(-2px);
          border-color: rgba(200, 162, 106, 0.30);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.018)),
            rgba(0, 0, 0, 0.24);
        }
        .productCard.blocked {
          opacity: 0.72;
          border-color: rgba(255, 120, 120, 0.22);
        }
        .productCardGlow {
          position: absolute;
          inset: -90px auto auto -90px;
          width: 190px;
          height: 190px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(200, 162, 106, 0.16), transparent 66%);
          pointer-events: none;
        }
        .productTop {
          position: relative;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          gap: 9px;
          align-items: center;
        }
        .productAvatar {
          width: 36px;
          height: 36px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(200, 162, 106, 0.28);
          background: linear-gradient(180deg, rgba(200, 162, 106, 0.18), rgba(200, 162, 106, 0.06));
          color: rgba(200, 162, 106, 0.98);
          font-weight: 1000;
          font-size: 15px;
          flex: 0 0 auto;
        }
        .productTitleWrap {
          min-width: 0;
        }
        .productName {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          line-height: 1.2;
        }
        .productMeta {
          display: block;
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          opacity: 0.64;
          font-size: 12px;
          font-weight: 800;
        }
        .productStatus {
          min-height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }
        .productStatus.on {
          border: 1px solid rgba(117, 255, 171, 0.30);
          background: rgba(117, 255, 171, 0.08);
          color: #bfffd5;
        }
        .productStatus.off {
          border: 1px solid rgba(255, 120, 120, 0.32);
          background: rgba(255, 120, 120, 0.09);
          color: #ffd1d1;
        }
        .productTags {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .productTags span {
          min-height: 22px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(200, 162, 106, 0.07);
          padding: 0 9px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(242, 242, 242, 0.82);
        }
        .productTags .dangerTag {
          border-color: rgba(255, 157, 92, 0.34);
          background: rgba(255, 157, 92, 0.12);
          color: #ffd2ad;
        }
        .productTags .softTag {
          border-color: rgba(115, 171, 255, 0.26);
          background: rgba(115, 171, 255, 0.08);
          color: #cfe1ff;
        }
        .productMetrics {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .productMetrics > div,
        .productPrices > div {
          min-width: 0;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.075);
          background: rgba(0, 0, 0, 0.18);
          padding: 9px;
        }
        .productMetrics span,
        .productPrices span {
          display: block;
          font-size: 10.5px;
          opacity: 0.56;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .productMetrics strong,
        .productPrices strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          color: rgba(242, 242, 242, 0.92);
        }
        .productPrices {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .productPrices strong {
          color: rgba(200, 162, 106, 0.98);
          font-size: 13px;
        }
        .productObs {
          margin-top: 8px;
          min-height: 26px;
          max-height: 38px;
          overflow: hidden;
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.025);
          padding: 7px 8px;
          font-size: 11px;
          line-height: 1.35;
          opacity: 0.68;
        }
        .productActions {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .miniAction {
          min-height: 31px;
          min-width: 44px;
          padding: 0 9px;
          border-radius: 11px;
          border: 1px solid rgba(200, 162, 106, 0.23);
          background: rgba(200, 162, 106, 0.08);
          color: #f2f2f2;
          font-weight: 950;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }
        .miniAction:hover {
          transform: translateY(-1px);
          border-color: rgba(200, 162, 106, 0.40);
        }
        .miniAction.edit {
          background: rgba(115, 171, 255, 0.08);
          border-color: rgba(115, 171, 255, 0.24);
        }
        .miniAction.block {
          background: rgba(70, 30, 30, 0.42);
          border-color: rgba(255, 120, 120, 0.22);
          color: #ffd1d1;
        }
        .miniAction.unblock {
          background: rgba(117, 255, 171, 0.08);
          border-color: rgba(117, 255, 171, 0.30);
          color: #bfffd5;
        }
        .miniAction.label {
          background: rgba(200, 162, 106, 0.12);
          border-color: rgba(200, 162, 106, 0.34);
          color: #ffe1ad;
        }

        .productCompactInfo {
          margin-top: 8px;
          display: grid;
          gap: 7px;
        }
        .productStockLine,
        .productPriceLine {
          min-width: 0;
          border-radius: 13px;
          border: 1px solid rgba(255, 255, 255, 0.075);
          background: rgba(0, 0, 0, 0.18);
          padding: 8px 9px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          align-items: center;
        }
        .productStockLine span,
        .productPriceLine span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
          color: rgba(244, 241, 235, 0.62);
          font-weight: 850;
        }
        .productStockLine b {
          color: rgba(244, 241, 235, 0.96);
          font-size: 12px;
        }
        .productPriceLine b {
          display: block;
          margin-top: 2px;
          color: rgba(200, 162, 106, 0.98);
          font-size: 12px;
          line-height: 1.1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .emptyPremium {
          min-height: 180px;
          display: grid;
          place-items: center;
          gap: 6px;
          text-align: center;
          border-radius: 18px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.14);
          opacity: 0.78;
        }
        .emptyPremium strong,
        .emptyPremium span {
          display: block;
        }

        .erpTable {
          margin-top: 16px;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(0, 0, 0, 0.18);
          overflow-x: auto;
        }
        .erpInner {
          min-width: 1200px;
        }

        .erpHeadRow,
        .erpRow {
          display: grid;
          grid-template-columns:
            minmax(180px, 2fr)
            0.9fr
            0.9fr
            1.2fr
            0.8fr
            0.9fr
            0.9fr
            1.1fr
            1.1fr
            0.9fr
            1.8fr;
          align-items: center;
        }

        .erpHeadRow {
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          opacity: 0.8;
        }
        .erpHeadCell {
          padding: 0 4px;
        }
        .erpHeadCell.num {
          text-align: right;
        }
        .erpHeadCell.actions {
          text-align: right;
        }

        .erpRow {
          padding: 8px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          font-size: 13px;
          cursor: pointer;
        }
        .erpRow:last-child {
          border-bottom: none;
        }
        .erpRow:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .erpCell {
          padding: 0 4px;
          text-align: left;
          cursor: pointer;
        }
        .erpCell.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .erpCell.main {
          text-align: left;
        }

        .erpProdName {
          font-weight: 900;
        }

        .meta {
          font-size: 12px;
          opacity: 0.8;
        }
        .chip {
          font-size: 11px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.06);
          white-space: nowrap;
          color: #f2f2f2;
          text-transform: capitalize;
          font-weight: 900;
        }
        .chipGhost {
          font-size: 11px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          white-space: nowrap;
          color: #f2f2f2;
          font-weight: 900;
        }
        .priceERP {
          font-weight: 900;
          color: rgba(200, 162, 106, 0.95);
          white-space: nowrap;
        }
        .priceERP.priceCompra {
          opacity: 0.8;
        }

        .pill {
          font-size: 11px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          font-weight: 900;
        }
        .pill.on {
          border-color: rgba(200, 162, 106, 0.25);
          background: rgba(200, 162, 106, 0.08);
          color: rgba(200, 162, 106, 0.95);
        }
        .pill.off {
          border-color: rgba(255, 90, 90, 0.25);
          background: rgba(255, 90, 90, 0.08);
          color: rgba(255, 170, 170, 0.95);
        }

        .actionsCell {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
          flex-wrap: wrap;
          cursor: default;
        }

        .mini {
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.06);
          cursor: pointer;
          font-weight: 900;
          color: #f2f2f2;
          font-size: 12px;
        }

        .empty {
          padding: 14px 16px;
          border-top: 1px dashed rgba(255, 255, 255, 0.1);
          opacity: 0.7;
          font-size: 12px;
        }

        /* MODAL */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 50;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .modal {
          width: min(980px, 100%);
          max-height: calc(100dvh - 36px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(12, 12, 18, 0.95);
          box-shadow: 0 30px 120px rgba(0, 0, 0, 0.6);
          padding: 14px;
          padding-bottom: calc(14px + env(safe-area-inset-bottom));
        }
        .modalHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          padding: 8px 8px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .modalKicker {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          opacity: 0.75;
        }
        .modalTitle {
          font-size: 18px;
          font-weight: 900;
          margin-top: 6px;
          color: rgba(200, 162, 106, 0.95);
        }
        .modalSub {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.75;
        }
        .btnX {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.06);
          cursor: pointer;
          color: #f2f2f2;
          font-weight: 900;
        }

        .modalGrid {
          padding: 14px 8px 8px;
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(1, minmax(0, 1fr));
        }
        @media (min-width: 900px) {
          .modalGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .wide {
          grid-column: 1 / -1;
        }
        .textarea {
          min-height: 110px;
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 15, 22, 0.9);
          color: #f2f2f2;
          outline: none;
          resize: vertical;
        }

        .modalActions {
          position: sticky;
          bottom: 0;
          z-index: 10;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          padding: 12px 8px calc(12px + env(safe-area-inset-bottom));
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          margin-top: 10px;
          background: rgba(12, 12, 18, 0.98);
          backdrop-filter: blur(10px);
        }
        .spacer {
          flex: 1;
        }
        .btnSmallPrimary {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.4);
          background: linear-gradient(
            180deg,
            rgba(200, 162, 106, 0.18),
            rgba(200, 162, 106, 0.08)
          );
          cursor: pointer;
          font-weight: 900;
          font-size: 12px;
          color: #f2f2f2;
        }
        .btnDanger {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 90, 90, 0.35);
          background: rgba(255, 90, 90, 0.12);
          cursor: pointer;
          font-weight: 900;
          font-size: 12px;
          color: #ffd7d7;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }
        .modalFoot {
          padding: 10px 8px 4px;
          font-size: 12px;
          opacity: 0.7;
        }

        @media (max-width: 640px) {
          .page {
            padding: 14px;
            padding-bottom: calc(90px + env(safe-area-inset-bottom));
          }

          .head {
            padding: 14px;
          }

          .headRight,
          .smartPanel,
          .smartFilters,
          .smartActions {
            width: 100%;
          }

          .smartActions .btn {
            flex: 1 1 calc(50% - 8px);
            min-height: 42px;
          }

          .smartFilters .field,
          .smartFilters .check {
            width: 100%;
            min-width: 0;
          }

          .smartKpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .erpTable {
            margin-left: -4px;
            margin-right: -4px;
          }

          .modalOverlay {
            align-items: flex-end;
            justify-content: center;
            padding: 10px;
            padding-bottom: calc(10px + env(safe-area-inset-bottom));
          }

          .modal {
            width: 100%;
            max-height: 88dvh;
            border-radius: 22px 22px 0 0;
            padding: 12px;
            padding-bottom: 0;
          }

          .modalHead {
            position: sticky;
            top: 0;
            z-index: 9;
            background: rgba(12, 12, 18, 0.98);
            backdrop-filter: blur(10px);
            padding-top: 10px;
          }

          .modalGrid {
            padding: 14px 6px 18px;
          }

          .field {
            min-width: 0;
          }

          .input,
          .textarea {
            font-size: 16px;
          }

          .modalActions {
            padding-left: 6px;
            padding-right: 6px;
          }

          .spacer {
            display: none;
          }

          .btnSmallPrimary,
          .btnDanger {
            flex: 1 1 100%;
            min-height: 48px;
            font-size: 14px;
          }

          .modalFoot {
            padding-bottom: calc(12px + env(safe-area-inset-bottom));
          }
        }



        /* ======================================================
           ✅ PRODUTOS ULTRA COMPACTO 10/10 — SaaS Premium
           ✅ Apenas visual/densidade. Não altera Firebase, estoque, filtros ou ações.
           ✅ Mais produtos visíveis por tela, sem cortes e com botões alinhados.
        ====================================================== */
        .page {
          max-width: 1160px !important;
          padding: 12px 14px 20px !important;
          margin: 0 auto !important;
          overflow-x: hidden !important;
        }

        .head {
          padding: 12px 14px !important;
          border-radius: 18px !important;
          align-items: center !important;
          gap: 12px !important;
        }
        .kicker {
          font-size: 10px !important;
          letter-spacing: 0.16em !important;
        }
        .title {
          font-size: 23px !important;
          line-height: 1.04 !important;
          margin-top: 5px !important;
        }
        .sub {
          font-size: 12.5px !important;
          line-height: 1.28 !important;
          margin-top: 6px !important;
          max-width: 620px !important;
        }
        .heroBadge {
          min-height: 34px !important;
          padding: 0 12px !important;
          border-radius: 999px !important;
          font-size: 11.5px !important;
        }

        .smartPanel {
          margin-top: 12px !important;
          padding: 12px !important;
          border-radius: 18px !important;
        }
        .smartPanelTop {
          gap: 10px !important;
        }
        .smartFilters {
          gap: 8px !important;
          align-items: end !important;
        }
        .field label {
          font-size: 9px !important;
          letter-spacing: 0.11em !important;
        }
        .smartSearch {
          min-width: 270px !important;
        }
        .smartSelect {
          min-width: 170px !important;
        }
        .input {
          height: 36px !important;
          min-height: 36px !important;
          padding: 0 11px !important;
          border-radius: 12px !important;
          font-size: 12px !important;
        }
        .check {
          height: 36px !important;
          min-height: 36px !important;
          padding: 0 11px !important;
          border-radius: 12px !important;
          font-size: 11.5px !important;
        }
        .smartActions {
          gap: 7px !important;
        }
        .btn {
          height: 34px !important;
          min-height: 34px !important;
          padding: 0 11px !important;
          border-radius: 11px !important;
          font-size: 11.5px !important;
        }

        .smartKpis {
          margin-top: 10px !important;
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)) !important;
          gap: 8px !important;
        }
        .miniKpi {
          min-height: 58px !important;
          padding: 9px 10px !important;
          border-radius: 14px !important;
        }
        .miniKpi span {
          font-size: 10px !important;
          line-height: 1.15 !important;
        }
        .miniKpi strong {
          margin-top: 4px !important;
          font-size: 15px !important;
          line-height: 1.08 !important;
          overflow-wrap: anywhere !important;
        }

        .productsShell {
          margin-top: 12px !important;
          padding: 12px !important;
          border-radius: 18px !important;
        }
        .productsHead {
          margin-bottom: 10px !important;
          gap: 10px !important;
          align-items: center !important;
        }
        .sectionKicker {
          font-size: 10px !important;
          letter-spacing: 0.15em !important;
        }
        .productsHead h2 {
          font-size: 21px !important;
          line-height: 1.05 !important;
          margin-top: 4px !important;
        }
        .productsHead p {
          display: none !important;
        }
        .productsHeadBadges {
          gap: 7px !important;
        }
        .productsHeadBadges span {
          min-height: 30px !important;
          padding: 0 10px !important;
          border-radius: 999px !important;
          font-size: 11px !important;
        }

        .productsGrid {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(315px, 1fr)) !important;
          gap: 8px !important;
        }
        .productCard {
          min-width: 0 !important;
          min-height: 0 !important;
          padding: 9px 10px !important;
          border-radius: 16px !important;
          gap: 7px !important;
          overflow: hidden !important;
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease !important;
        }
        .productCard:hover {
          transform: translateY(-2px) !important;
          border-color: rgba(200, 162, 106, 0.42) !important;
        }
        .productCardGlow {
          width: 110px !important;
          height: 110px !important;
          inset: -50px auto auto -50px !important;
          opacity: 0.72 !important;
        }
        .productTop {
          gap: 8px !important;
          align-items: center !important;
        }
        .productAvatar {
          width: 34px !important;
          height: 34px !important;
          border-radius: 12px !important;
          font-size: 14px !important;
        }
        .productTitleWrap {
          min-width: 0 !important;
        }
        .productName {
          font-size: 12.5px !important;
          line-height: 1.12 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          max-width: 100% !important;
        }
        .productMeta {
          margin-top: 2px !important;
          font-size: 10.5px !important;
          line-height: 1.15 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .productStatus {
          min-height: 24px !important;
          height: 24px !important;
          padding: 0 9px !important;
          border-radius: 999px !important;
          font-size: 9.5px !important;
          flex: 0 0 auto !important;
        }

        .productTags {
          gap: 5px !important;
          flex-wrap: nowrap !important;
          overflow: hidden !important;
        }
        .productTags span,
        .dangerTag,
        .softTag {
          min-height: 20px !important;
          height: 20px !important;
          padding: 0 7px !important;
          border-radius: 999px !important;
          font-size: 9.5px !important;
          white-space: nowrap !important;
          flex: 0 0 auto !important;
        }

        .productCompactInfo {
          display: grid !important;
          gap: 6px !important;
          margin-top: 0 !important;
        }
        .productStockLine,
        .productPriceLine {
          min-height: 32px !important;
          padding: 6px 8px !important;
          border-radius: 12px !important;
          gap: 7px !important;
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          align-items: center !important;
        }
        .productStockLine span,
        .productPriceLine span {
          font-size: 9.5px !important;
          line-height: 1.1 !important;
          min-width: 0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        .productStockLine b,
        .productPriceLine b {
          font-size: 10.5px !important;
          line-height: 1.05 !important;
          display: block !important;
          margin-top: 1px !important;
          overflow-wrap: anywhere !important;
        }

        .productObs {
          min-height: 24px !important;
          max-height: 24px !important;
          padding: 5px 8px !important;
          border-radius: 12px !important;
          font-size: 10px !important;
          line-height: 1.15 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .productActions {
          margin-top: 1px !important;
          padding-top: 7px !important;
          gap: 5px !important;
          display: grid !important;
          grid-template-columns: 36px 36px minmax(58px, 0.75fr) minmax(74px, 0.95fr) minmax(70px, 0.95fr) minmax(74px, 0.95fr) !important;
          align-items: center !important;
        }
        .miniAction {
          width: 100% !important;
          min-width: 0 !important;
          height: 28px !important;
          min-height: 28px !important;
          padding: 0 7px !important;
          border-radius: 9px !important;
          font-size: 10px !important;
          line-height: 1 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        .emptyPremium {
          min-height: 150px !important;
          border-radius: 16px !important;
          padding: 18px !important;
        }

        .modal {
          width: min(920px, 96vw) !important;
          padding: 12px !important;
          border-radius: 18px !important;
        }
        .modalHead {
          padding: 8px 8px 10px !important;
        }
        .modalTitle {
          font-size: 17px !important;
        }
        .modalSub {
          font-size: 11.5px !important;
        }
        .modalGrid {
          gap: 10px !important;
          padding: 10px 6px 6px !important;
        }
        .textarea {
          min-height: 82px !important;
          padding: 10px 11px !important;
          border-radius: 12px !important;
          font-size: 12px !important;
        }
        .modalActions {
          padding: 10px 6px calc(10px + env(safe-area-inset-bottom)) !important;
          gap: 8px !important;
        }
        .btnSmallPrimary,
        .btnDanger {
          height: 34px !important;
          min-height: 34px !important;
          padding: 0 11px !important;
          border-radius: 11px !important;
          font-size: 11.5px !important;
        }

        @media (max-width: 1280px) {
          .page { max-width: 1080px !important; }
          .productsGrid { grid-template-columns: repeat(auto-fit, minmax(305px, 1fr)) !important; }
        }
        @media (max-width: 980px) {
          .page { padding: 10px !important; }
          .smartFilters,
          .smartActions,
          .headRightCompact { width: 100% !important; }
          .smartSearch,
          .smartSelect,
          .smartCheck { min-width: 0 !important; flex: 1 1 180px !important; }
          .productsGrid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .title { font-size: 22px !important; }
          .smartKpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .productActions { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .productStockLine,
          .productPriceLine,
          .autoMarginGrid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
