"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/services/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type StatusFornecedor = "ativo" | "inativo";
type TipoFornecedor =
  | "perfumaria"
  | "embalagens"
  | "papelaria"
  | "combustivel"
  | "decoracao"
  | "servicos"
  | "outros";

type Fornecedor = {
  id: string;
  nome: string;
  fantasia?: string;
  cnpj?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  cidade?: string;
  estado?: string;
  tipo: TipoFornecedor;
  status: StatusFornecedor;
  observacoes?: string;
  totalCompras?: number;
  ultimaCompra?: string;
  createdAt?: any;
  updatedAt?: any;
};

const COLLECTION_NAME = "fornecedores";

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

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyNumbers(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function formatCnpj(value?: string): string {
  const v = onlyNumbers(value || "").slice(0, 14);
  if (v.length <= 2) return v;
  if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
  if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
  if (v.length <= 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12, 14)}`;
}

function formatDateBR(value?: string): string {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function tipoLabel(tipo: TipoFornecedor): string {
  const map: Record<TipoFornecedor, string> = {
    perfumaria: "Perfumaria",
    embalagens: "Embalagens",
    papelaria: "Papelaria",
    combustivel: "Combustível",
    decoracao: "Decoração",
    servicos: "Serviços",
    outros: "Outros",
  };

  return map[tipo] || "Outros";
}

function statusLabel(status: StatusFornecedor): string {
  return status === "ativo" ? "Ativo" : "Inativo";
}

function normalizeFornecedor(id: string, raw: any): Fornecedor {
  return {
    id,
    nome: String(raw?.nome || ""),
    fantasia: raw?.fantasia ? String(raw.fantasia) : "",
    cnpj: raw?.cnpj ? String(raw.cnpj) : "",
    telefone: raw?.telefone ? String(raw.telefone) : "",
    whatsapp: raw?.whatsapp ? String(raw.whatsapp) : "",
    email: raw?.email ? String(raw.email) : "",
    cidade: raw?.cidade ? String(raw.cidade) : "",
    estado: raw?.estado ? String(raw.estado) : "",
    tipo: ["perfumaria", "embalagens", "papelaria", "combustivel", "decoracao", "servicos", "outros"].includes(String(raw?.tipo))
      ? raw.tipo
      : "outros",
    status: raw?.status === "inativo" ? "inativo" : "ativo",
    observacoes: raw?.observacoes ? String(raw.observacoes) : "",
    totalCompras: Number(raw?.totalCompras || 0),
    ultimaCompra: raw?.ultimaCompra ? String(raw.ultimaCompra) : "",
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function emptyForm(): Fornecedor {
  return {
    id: "NEW",
    nome: "",
    fantasia: "",
    cnpj: "",
    telefone: "",
    whatsapp: "",
    email: "",
    cidade: "",
    estado: "SP",
    tipo: "perfumaria",
    status: "ativo",
    observacoes: "",
    totalCompras: 0,
    ultimaCompra: "",
  };
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export default function FornecedoresPage() {
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | TipoFornecedor>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | StatusFornecedor>("todos");

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Fornecedor>(emptyForm());

  async function carregarFornecedores(): Promise<void> {
    setLoading(true);

    try {
      const qRef = query(collection(db, COLLECTION_NAME), orderBy("nome", "asc"));
      const snap = await getDocs(qRef);
      const arr = snap.docs.map((d) => normalizeFornecedor(d.id, d.data()));

      setItems(arr);
    } catch (error) {
      console.error("[Fornecedores] Erro ao carregar:", error);
      showToast("❌ Erro ao carregar fornecedores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregarFornecedores();
  }, []);

  function showToast(msg: string, ms = 2400): void {
    setToast(msg);

    if (typeof window !== "undefined") {
      window.setTimeout(() => setToast(""), ms);
    }
  }

  function openNew(): void {
    setOpenId("NEW");
    setForm(emptyForm());
  }

  function openEdit(id: string): void {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    setOpenId(id);
    setForm(item);
  }

  function closeModal(): void {
    setOpenId(null);
    setForm(emptyForm());
  }

  function updateForm<K extends keyof Fornecedor>(key: K, value: Fornecedor[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save(): Promise<void> {
    const nome = form.nome.trim();

    if (!nome) {
      showToast("⚠️ Informe o nome do fornecedor.");
      return;
    }

    const payload = cleanUndefined({
      nome,
      fantasia: form.fantasia?.trim() || "",
      cnpj: formatCnpj(form.cnpj || ""),
      telefone: form.telefone?.trim() || "",
      whatsapp: form.whatsapp?.trim() || "",
      email: form.email?.trim() || "",
      cidade: form.cidade?.trim() || "",
      estado: String(form.estado || "").trim().toUpperCase().slice(0, 2),
      tipo: form.tipo,
      status: form.status,
      observacoes: form.observacoes?.trim() || "",
      totalCompras: Number(form.totalCompras || 0),
      ultimaCompra: form.ultimaCompra || "",
      updatedAt: serverTimestamp(),
    });

    try {
      showToast("⏳ Salvando fornecedor...");

      if (openId && openId !== "NEW") {
        await updateDoc(doc(db, COLLECTION_NAME, openId), payload);
      } else {
        await addDoc(collection(db, COLLECTION_NAME), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await carregarFornecedores();
      showToast("✅ Fornecedor salvo!");
      closeModal();
    } catch (error) {
      console.error("[Fornecedores] Erro ao salvar:", error);
      showToast("❌ Erro ao salvar fornecedor.");
    }
  }

  async function remove(): Promise<void> {
    if (!openId || openId === "NEW") return;

    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(`Excluir o fornecedor "${form.nome}"?`);

    if (!ok) return;

    try {
      await deleteDoc(doc(db, COLLECTION_NAME, openId));
      await carregarFornecedores();
      showToast("🗑️ Fornecedor excluído!");
      closeModal();
    } catch (error) {
      console.error("[Fornecedores] Erro ao excluir:", error);
      showToast("❌ Erro ao excluir fornecedor.");
    }
  }

  const filtered = useMemo(() => {
    const termo = q.trim().toLowerCase();

    return items
      .filter((item) => {
        if (tipoFilter !== "todos" && item.tipo !== tipoFilter) return false;
        if (statusFilter !== "todos" && item.status !== statusFilter) return false;

        if (!termo) return true;

        const hay = `${item.nome} ${item.fantasia || ""} ${item.cnpj || ""} ${item.telefone || ""} ${item.whatsapp || ""} ${item.email || ""} ${item.cidade || ""} ${item.estado || ""} ${tipoLabel(item.tipo)}`.toLowerCase();

        return hay.includes(termo);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [items, q, tipoFilter, statusFilter]);

  const totals = useMemo(() => {
    const ativos = filtered.filter((item) => item.status === "ativo").length;
    const inativos = filtered.filter((item) => item.status === "inativo").length;
    const totalCompras = filtered.reduce((acc, item) => acc + Number(item.totalCompras || 0), 0);
    const perfumaria = filtered.filter((item) => item.tipo === "perfumaria").length;
    const embalagens = filtered.filter((item) => item.tipo === "embalagens").length;
    const gerais = filtered.filter((item) => !["perfumaria", "embalagens"].includes(item.tipo)).length;

    return {
      total: filtered.length,
      ativos,
      inativos,
      totalCompras,
      perfumaria,
      embalagens,
      gerais,
    };
  }, [filtered]);

  const recentes = filtered.slice(0, 5);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <div className="kicker">MAISON NOOR</div>
          <h1>CRM • Fornecedores</h1>
          <p>
            Cadastre fornecedores de perfumes, embalagens, papelaria, serviços e compras gerais.
            Esta base prepara o Fiscal para seleção automática e histórico de compras.
          </p>
        </div>

        <div className="heroActions">
          <span className="syncBadge">● Base de fornecedores</span>
          <button className="btn primary" onClick={openNew} type="button">+ Novo fornecedor</button>
          <button className="btn" onClick={() => void carregarFornecedores()} type="button">Atualizar</button>
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}

      <section className="controlPanel">
        <div className="filtersGrid">
          <div className="field wideField">
            <label>Busca</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, CNPJ, cidade, e-mail, telefone..."
            />
          </div>

          <div className="field">
            <label>Tipo</label>
            <select className="input" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value as "todos" | TipoFornecedor)}>
              <option value="todos">Todos</option>
              <option value="perfumaria">Perfumaria</option>
              <option value="embalagens">Embalagens</option>
              <option value="papelaria">Papelaria</option>
              <option value="combustivel">Combustível</option>
              <option value="decoracao">Decoração</option>
              <option value="servicos">Serviços</option>
              <option value="outros">Outros</option>
            </select>
          </div>

          <div className="field">
            <label>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "todos" | StatusFornecedor)}>
              <option value="todos">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </div>
        </div>
      </section>

      <section className="kpis">
        <Kpi title="Fornecedores" value={String(totals.total)} hint="Total no filtro" />
        <Kpi title="Ativos" value={String(totals.ativos)} hint="Prontos para uso no Fiscal" tone="green" />
        <Kpi title="Inativos" value={String(totals.inativos)} hint="Arquivados" tone="red" />
        <Kpi title="Compras" value={formatBRL(totals.totalCompras)} hint="Histórico manual/preparado" tone="gold" />
        <Kpi title="Perfumaria" value={String(totals.perfumaria)} hint="Mercadoria de revenda" tone="green" />
        <Kpi title="Embalagens" value={String(totals.embalagens)} hint="Materiais operacionais" tone="gold" />
        <Kpi title="Gerais" value={String(totals.gerais)} hint="Serviços, consumo e outros" />
      </section>

      <section className="premiumPanel">
        <div>
          <div className="sectionKicker">Próxima integração</div>
          <h2>Fornecedor conectado ao Fiscal</h2>
          <p>
            Depois desta base, a entrada fiscal poderá buscar fornecedores cadastrados,
            preencher CNPJ/contato automaticamente e registrar histórico de compra por fornecedor.
          </p>
        </div>

        <div className="phaseGrid">
          <div className="phaseCard">
            <strong>Cadastro único</strong>
            <span>Nome, CNPJ, contato, cidade, tipo e observações.</span>
          </div>
          <div className="phaseCard">
            <strong>Histórico fiscal</strong>
            <span>As próximas entradas fiscais poderão alimentar total e última compra.</span>
          </div>
          <div className="phaseCard">
            <strong>Base para XML</strong>
            <span>Quando importar XML, o CNPJ ajudará a localizar o fornecedor automaticamente.</span>
          </div>
        </div>
      </section>

      <section className="listsGrid">
        <div className="miniList">
          <h3>Fornecedores recentes</h3>
          {recentes.length ? (
            recentes.map((item) => (
              <div className="miniItem" key={item.id} onClick={() => openEdit(item.id)} role="button" tabIndex={0}>
                <div>
                  <strong>{item.nome}</strong>
                  <small>{tipoLabel(item.tipo)} • {item.cidade || "Cidade não informada"} {item.estado ? `/${item.estado}` : ""}</small>
                </div>
                <span className={`status ${item.status}`}>{statusLabel(item.status)}</span>
              </div>
            ))
          ) : (
            <div className="empty">Nenhum fornecedor cadastrado.</div>
          )}
        </div>

        <div className="miniList">
          <h3>Como usar no Fiscal</h3>
          <div className="infoBox">
            <strong>Perfumes e revenda</strong>
            <span>Cadastre fornecedores de mercadoria para ajudar no custo médio e histórico.</span>
          </div>
          <div className="infoBox">
            <strong>Compras gerais</strong>
            <span>Também cadastre papelaria, combustível, decoração, embalagens e serviços.</span>
          </div>
        </div>
      </section>

      <section className="tableShell">
        <div className="tableHead">
          <div>
            <div className="sectionKicker">Fornecedores</div>
            <h2>Base cadastrada</h2>
          </div>

          <div className="tableCounters">
            <span>{filtered.length} fornecedor(es)</span>
            <strong>{totals.ativos} ativo(s)</strong>
          </div>
        </div>

        <div className="entries">
          {loading ? <div className="empty">Carregando fornecedores...</div> : null}

          {!loading && filtered.map((item) => (
            <article key={item.id} className="entry" onClick={() => openEdit(item.id)} role="button" tabIndex={0}>
              <div className="entryIcon">🏢</div>

              <div className="entryMain">
                <div className="entryTop">
                  <strong>{item.nome}</strong>
                  <span className="pill">{tipoLabel(item.tipo)}</span>
                  <span className={`status ${item.status}`}>{statusLabel(item.status)}</span>
                </div>

                <div className="entryMeta">
                  {item.fantasia ? `${item.fantasia} • ` : ""}
                  {item.cnpj ? `${item.cnpj} • ` : ""}
                  {item.cidade || "Cidade não informada"} {item.estado ? `/${item.estado}` : ""}
                </div>
              </div>

              <div className="entryValue">
                <strong>{formatBRL(item.totalCompras || 0)}</strong>
                <span>Última compra: {formatDateBR(item.ultimaCompra)}</span>
              </div>

              <div className="entryActions" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => openEdit(item.id)}>Editar</button>
                <a
                  className="actionLink"
                  href={`https://wa.me/55${onlyNumbers(item.whatsapp || item.telefone || "")}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  WhatsApp
                </a>
              </div>
            </article>
          ))}

          {!loading && !filtered.length ? (
            <div className="empty">Nenhum fornecedor encontrado para o filtro atual.</div>
          ) : null}
        </div>
      </section>

      {openId ? (
        <div className="modalOverlay" onMouseDown={closeModal} role="presentation">
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="sectionKicker">{openId === "NEW" ? "Novo fornecedor" : "Editar fornecedor"}</div>
                <h2>{openId === "NEW" ? "Cadastro" : form.nome}</h2>
                {openId !== "NEW" ? <p>ID: {openId}</p> : null}
              </div>

              <button className="btnX" onClick={closeModal} type="button">✕</button>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Dados principais</span></div>

              <div className="modalGrid">
                <div className="field wide">
                  <label>Nome / Razão social</label>
                  <input className="input" value={form.nome} onChange={(e) => updateForm("nome", e.target.value)} placeholder="Ex: Distribuidora X" />
                </div>

                <div className="field">
                  <label>Nome fantasia</label>
                  <input className="input" value={form.fantasia || ""} onChange={(e) => updateForm("fantasia", e.target.value)} placeholder="Opcional" />
                </div>

                <div className="field">
                  <label>CNPJ / CPF</label>
                  <input className="input" value={form.cnpj || ""} onChange={(e) => updateForm("cnpj", formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                </div>

                <div className="field">
                  <label>Tipo</label>
                  <select className="input" value={form.tipo} onChange={(e) => updateForm("tipo", e.target.value as TipoFornecedor)}>
                    <option value="perfumaria">Perfumaria</option>
                    <option value="embalagens">Embalagens</option>
                    <option value="papelaria">Papelaria</option>
                    <option value="combustivel">Combustível</option>
                    <option value="decoracao">Decoração</option>
                    <option value="servicos">Serviços</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <div className="field">
                  <label>Status</label>
                  <select className="input" value={form.status} onChange={(e) => updateForm("status", e.target.value as StatusFornecedor)}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Contato e localização</span></div>

              <div className="modalGrid">
                <div className="field">
                  <label>Telefone</label>
                  <input className="input" value={form.telefone || ""} onChange={(e) => updateForm("telefone", e.target.value)} placeholder="(12) 99999-9999" />
                </div>

                <div className="field">
                  <label>WhatsApp</label>
                  <input className="input" value={form.whatsapp || ""} onChange={(e) => updateForm("whatsapp", e.target.value)} placeholder="(12) 99999-9999" />
                </div>

                <div className="field">
                  <label>E-mail</label>
                  <input className="input" value={form.email || ""} onChange={(e) => updateForm("email", e.target.value)} placeholder="financeiro@fornecedor.com" />
                </div>

                <div className="field">
                  <label>Cidade</label>
                  <input className="input" value={form.cidade || ""} onChange={(e) => updateForm("cidade", e.target.value)} placeholder="Cidade" />
                </div>

                <div className="field">
                  <label>UF</label>
                  <input className="input" value={form.estado || ""} onChange={(e) => updateForm("estado", e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" />
                </div>
              </div>
            </div>

            <div className="modalSection">
              <div className="modalSectionHead"><span>Histórico e observações</span></div>

              <div className="modalGrid">
                <div className="field">
                  <label>Total compras</label>
                  <input className="input" value={String(form.totalCompras || 0)} onChange={(e) => updateForm("totalCompras", Number(e.target.value.replace(",", ".")) || 0)} />
                </div>

                <div className="field">
                  <label>Última compra</label>
                  <input className="input" type="date" value={form.ultimaCompra || ""} onChange={(e) => updateForm("ultimaCompra", e.target.value)} />
                </div>

                <div className="field wide">
                  <label>Observações</label>
                  <textarea className="textarea" value={form.observacoes || ""} onChange={(e) => updateForm("observacoes", e.target.value)} placeholder="Condições comerciais, prazos, contatos, observações..." />
                </div>
              </div>
            </div>

            <div className="modalActions">
              <button className="btn primary" onClick={() => void save()} type="button">Salvar</button>
              {openId !== "NEW" ? <button className="btn dangerBtn" onClick={() => void remove()} type="button">Excluir</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .page { max-width: 1220px; margin: 0 auto; padding: 14px 16px 24px; color: #f5f2ec; }
        .hero, .controlPanel, .tableShell, .premiumPanel { border: 1px solid rgba(200,162,106,.18); background: radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.042), rgba(255,255,255,.012)); border-radius: 20px; box-shadow: 0 18px 48px rgba(0,0,0,.18); }
        .hero { padding: 14px 16px; display: flex; justify-content: space-between; gap: 14px; align-items: center; flex-wrap: wrap; }
        .kicker, .sectionKicker { color: rgba(200,162,106,.95); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; font-weight: 950; }
        h1 { margin: 5px 0 0; font-size: 25px; line-height: 1.05; } h2 { margin: 4px 0 0; font-size: 20px; }
        p { margin: 7px 0 0; opacity: .76; line-height: 1.42; font-size: 13px; max-width: 800px; }
        .heroActions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .btn, .entryActions button, .actionLink { min-height: 32px; height: 32px; border-radius: 11px; border: 1px solid rgba(200,162,106,.24); background: rgba(200,162,106,.075); color: #f5f2ec; padding: 0 10px; font-weight: 900; cursor: pointer; font-size: 11.5px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; transition: transform .15s ease, border-color .15s ease; }
        .btn:hover, .entryActions button:hover, .actionLink:hover { transform: translateY(-1px); border-color: rgba(200,162,106,.42); }
        .btn.primary { background: linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.075)); border-color: rgba(200,162,106,.42); }
        .syncBadge { height: 32px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(88,214,141,.38); background: rgba(88,214,141,.1); color: #9ff0bc; font-size: 11.5px; font-weight: 900; }
        .toast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 10px 13px; border-radius: 14px; border: 1px solid rgba(200,162,106,.25); background: rgba(25,20,16,.96); font-weight: 900; box-shadow: 0 16px 40px rgba(0,0,0,.3); }
        .controlPanel, .premiumPanel, .tableShell { margin-top: 12px; padding: 12px; }
        .filtersGrid { display: grid; grid-template-columns: 1.4fr .7fr .7fr; gap: 8px; align-items: end; }
        .field { display: grid; gap: 5px; min-width: 0; } .field label { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; opacity: .75; font-weight: 950; }
        .wide, .wideField { grid-column: 1 / -1; }
        .input, .textarea { width: 100%; min-height: 34px; height: 34px; border-radius: 11px; border: 1px solid rgba(255,255,255,.11); background: rgba(15,15,22,.92); color: #f5f2ec; padding: 0 10px; outline: none; font-size: 12px; box-sizing: border-box; }
        .textarea { height: auto; min-height: 76px; padding: 9px 10px; resize: vertical; }
        .kpis { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 9px; }
        .kpi { min-height: 72px; padding: 10px 11px; border-radius: 15px; border: 1px solid rgba(200,162,106,.17); background: radial-gradient(circle at top left, rgba(200,162,106,.09), transparent 45%), linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)); display: grid; align-content: center; box-shadow: 0 12px 28px rgba(0,0,0,.12); }
        .kpiTitle { font-size: 9px; line-height: 1.15; text-transform: uppercase; letter-spacing: .12em; opacity: .72; font-weight: 950; }
        .kpiValue { margin-top: 5px; font-size: 16px; line-height: 1.08; font-weight: 950; color: rgba(200,162,106,.98); overflow-wrap: anywhere; }
        .kpiHint { margin-top: 3px; font-size: 10px; line-height: 1.15; opacity: .62; }
        .kpi.green .kpiValue, .green { color: #4dff9a !important; } .kpi.red .kpiValue, .red { color: #ff8585 !important; } .kpi.gold .kpiValue { color: #f3c979 !important; }
        .phaseGrid { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
        .phaseCard, .infoBox { padding: 11px; border-radius: 15px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); display: grid; gap: 5px; }
        .phaseCard strong, .infoBox strong { font-size: 13px; color: #f3c979; }
        .phaseCard span, .infoBox span { font-size: 11px; opacity: .7; line-height: 1.35; }
        .listsGrid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 9px; }
        .miniList { padding: 11px; border-radius: 18px; border: 1px solid rgba(200,162,106,.16); background: rgba(0,0,0,.18); }
        .miniList h3 { margin: 0 0 8px; font-size: 15px; }
        .miniItem { display: flex; justify-content: space-between; gap: 10px; padding: 8px 9px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.055); margin-top: 6px; cursor: pointer; }
        .miniItem strong { display: block; font-size: 12px; line-height: 1.2; }
        .miniItem small { display: block; margin-top: 4px; opacity: .65; font-size: 10.5px; }
        .tableHead { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .tableCounters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .tableCounters span, .tableCounters strong { min-height: 28px; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 9px; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.18); font-size: 11px; } .tableCounters strong { color: rgba(200,162,106,.98); border-color: rgba(200,162,106,.32); }
        .entries { display: grid; gap: 7px; }
        .entry { display: grid; grid-template-columns: 36px minmax(0, 1fr) minmax(120px, auto) auto; min-height: 58px; gap: 8px; align-items: center; padding: 8px 9px; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.2); cursor: pointer; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .entry:hover, .kpi:hover, .premiumPanel:hover, .miniList:hover { transform: translateY(-2px); border-color: rgba(200,162,106,.42); box-shadow: 0 16px 38px rgba(0,0,0,.18); }
        .entryIcon { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; font-weight: 950; border: 1px solid rgba(200,162,106,.22); background: rgba(200,162,106,.08); }
        .entryTop { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .entryTop strong { font-size: 12.5px; line-height: 1.18; }
        .entryMeta { margin-top: 3px; font-size: 10.5px; line-height: 1.15; opacity: .66; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pill, .status { min-height: 20px; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 7px; font-size: 9px; font-weight: 950; text-transform: uppercase; border: 1px solid rgba(255,255,255,.12); }
        .pill { color: #ffe4a6; border-color: rgba(255,201,98,.28); background: rgba(255,201,98,.08); }
        .status.ativo { color: #bfffd5; border-color: rgba(117,255,171,.28); background: rgba(117,255,171,.08); }
        .status.inativo { color: #ffd1d1; border-color: rgba(255,120,120,.28); background: rgba(255,120,120,.08); }
        .entryValue { text-align: right; display: grid; gap: 4px; justify-items: end; } .entryValue strong { font-size: 13px; color: rgba(200,162,106,.98); } .entryValue span { font-size: 10px; opacity: .66; }
        .entryActions { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
        .empty { padding: 18px; text-align: center; border-radius: 16px; border: 1px dashed rgba(255,255,255,.14); opacity: .72; }
        .modalOverlay { position: fixed; inset: 0; background: rgba(0,0,0,.58); display: grid; place-items: center; padding: 18px; z-index: 50; }
        .modal { width: min(920px, 96vw); max-height: 92vh; overflow-y: auto; border-radius: 19px; border: 1px solid rgba(200,162,106,.22); background: radial-gradient(circle at top left, rgba(200,162,106,.13), transparent 28%), rgba(10,10,14,.96); padding: 12px; box-shadow: 0 28px 80px rgba(0,0,0,.65); }
        .modalHead { display: flex; justify-content: space-between; gap: 12px; padding: 10px; border-radius: 15px; border: 1px solid rgba(200,162,106,.16); background: rgba(255,255,255,.022); } .modalHead h2 { font-size: 18px; } .modalHead p { font-size: 12px; } .btnX { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #f5f2ec; border-radius: 12px; padding: 8px 10px; cursor: pointer; height: 36px; }
        .modalSection { margin-top: 10px; border-radius: 16px; border: 1px solid rgba(255,255,255,.075); background: rgba(0,0,0,.14); padding: 10px; } .modalSectionHead { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; } .modalSectionHead span { color: rgba(200,162,106,.95); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 950; }
        .modalGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .modalActions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .dangerBtn { border-color: rgba(255,120,120,.3); background: rgba(255,120,120,.08); color: #ffdada; }
        @media (max-width: 1100px) { .filtersGrid, .phaseGrid, .listsGrid, .modalGrid { grid-template-columns: 1fr; } .entry { grid-template-columns: 36px minmax(0,1fr); } .entryValue { grid-column: 2 / -1; text-align: left; justify-items: start; } .entryActions { grid-column: 2 / -1; justify-content: flex-start; } }
        @media (max-width: 760px) { .page { padding: 12px; } .hero { align-items: flex-start; } .kpis { grid-template-columns: 1fr; } .entryMeta { white-space: normal; } }
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
