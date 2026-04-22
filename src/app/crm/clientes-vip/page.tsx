
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";

type VipStatus =
  | "novo"
  | "chamou_whatsapp"
  | "em_conversa"
  | "interessado"
  | "comprou"
  | "vip_ativo"
  | "perdido"
  | "converteu";

type VipCliente = {
  id: string;
  nome: string;
  telefone: string;
  instagram?: string;
  cidade?: string;
  observacoes?: string;
  status: VipStatus;
  ticketMedio?: number;
  totalCompras?: number;
  ultimaCompra?: string;
  createdAt: string;
  updatedAt: string;
};

type LeadOrigem = "instagram" | "whatsapp" | "indicacao" | "site" | "outros";
type LeadStatus =
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
  origem: LeadOrigem;
  valorEstimado: number;
  perfumes: string[];
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  observacoes?: string;
  historico?: Array<{
    id: string;
    data: string;
    tipo: "msg" | "ligacao" | "obs" | "pagamento" | "envio";
    texto: string;
  }>;
};

const VIP_STATUS_OPTIONS: { v: VipStatus; label: string }[] = [
  { v: "novo", label: "Novo" },
  { v: "chamou_whatsapp", label: "Chamou WhatsApp" },
  { v: "em_conversa", label: "Em conversa" },
  { v: "interessado", label: "Interessado" },
  { v: "comprou", label: "Comprou" },
  { v: "vip_ativo", label: "VIP ativo" },
  { v: "perdido", label: "Perdido" },
  { v: "converteu", label: "Converteu" },
];

const VIP_COL = collection(db, "clientes_vip");
const LEADS_COL = collection(db, "leads");

function uid(): string {
  // @ts-ignore
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function onlyHandle(v: string): string {
  return (v || "").replace(/\s/g, "").replace(/^@+/, "");
}

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

function normalizeVip(id: string, data: any): VipCliente {
  const statuses = VIP_STATUS_OPTIONS.map((s) => s.v);
  const createdAt =
    typeof data?.createdAt === "string" ? data.createdAt : new Date().toISOString();
  const updatedAt =
    typeof data?.updatedAt === "string"
      ? data.updatedAt
      : createdAt;

  return {
    id,
    nome:
      (typeof data?.nome === "string" && data.nome.trim()) ||
      (typeof data?.name === "string" && data.name.trim()) ||
      "Sem nome",
    telefone: typeof data?.telefone === "string" ? onlyDigits(data.telefone) : "",
    instagram: typeof data?.instagram === "string" ? onlyHandle(data.instagram) : "",
    cidade: typeof data?.cidade === "string" ? data.cidade : "",
    observacoes: typeof data?.observacoes === "string" ? data.observacoes : "",
    status: statuses.includes(data?.status) ? (data.status as VipStatus) : "novo",
    ticketMedio: Number(data?.ticketMedio || 0),
    totalCompras: Number(data?.totalCompras || 0),
    ultimaCompra: typeof data?.ultimaCompra === "string" ? data.ultimaCompra : "",
    createdAt,
    updatedAt,
  };
}

async function fetchVipClientes(): Promise<VipCliente[]> {
  const q = query(VIP_COL, orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeVip(d.id, d.data() || {}));
}

async function fetchLeadIds(): Promise<string[]> {
  const snap = await getDocs(LEADS_COL);
  return snap.docs.map((d) => d.id);
}

async function saveVipCliente(cliente: VipCliente): Promise<void> {
  const ref = doc(VIP_COL, cliente.id);
  const safe = cleanUndefinedDeep({
    ...cliente,
    nome: (cliente.nome || "").trim() || "Sem nome",
    telefone: onlyDigits(cliente.telefone || ""),
    instagram: onlyHandle(cliente.instagram || ""),
    cidade: cliente.cidade || "",
    observacoes: cliente.observacoes || "",
    ticketMedio: Number(cliente.ticketMedio || 0),
    totalCompras: Number(cliente.totalCompras || 0),
    ultimaCompra: cliente.ultimaCompra || "",
  });
  await setDoc(ref, safe as any, { merge: true });
}

async function updateVipCliente(id: string, patch: Partial<VipCliente>): Promise<void> {
  const ref = doc(VIP_COL, id);
  const safe = cleanUndefinedDeep({
    ...patch,
    telefone: patch.telefone !== undefined ? onlyDigits(String(patch.telefone)) : undefined,
    instagram: patch.instagram !== undefined ? onlyHandle(String(patch.instagram)) : undefined,
  });
  await updateDoc(ref, safe as any);
}

async function convertVipToLead(cliente: VipCliente): Promise<void> {
  const now = new Date().toISOString();
  const lead: Lead = {
    id: cliente.id,
    nome: cliente.nome,
    telefone: onlyDigits(cliente.telefone || ""),
    origem: cliente.instagram ? "instagram" : "whatsapp",
    valorEstimado: Number(cliente.ticketMedio || 0) || Number(cliente.totalCompras || 0) || 0,
    perfumes: [],
    status: "negociacao",
    createdAt: cliente.createdAt || now,
    updatedAt: now,
    observacoes: cliente.observacoes || "Convertido automaticamente do módulo Clientes VIP.",
    historico: [
      {
        id: uid(),
        data: now,
        tipo: "obs",
        texto: "Cliente convertido do módulo Clientes VIP para Leads.",
      },
    ],
  };

  await setDoc(doc(LEADS_COL, lead.id), cleanUndefinedDeep(lead) as any, { merge: true });
  await updateVipCliente(cliente.id, { status: "converteu", updatedAt: now });
}

function statusLabel(status: VipStatus): string {
  return VIP_STATUS_OPTIONS.find((s) => s.v === status)?.label || status;
}

function statusClass(status: VipStatus): string {
  switch (status) {
    case "novo":
      return "sNovo";
    case "chamou_whatsapp":
      return "sWhatsapp";
    case "em_conversa":
      return "sConversa";
    case "interessado":
      return "sInteressado";
    case "comprou":
      return "sComprou";
    case "vip_ativo":
      return "sAtivo";
    case "perdido":
      return "sPerdido";
    case "converteu":
      return "sConverteu";
    default:
      return "sNovo";
  }
}

export default function ClientesVipPage() {
  const [lista, setLista] = useState<VipCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [queryText, setQueryText] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<VipStatus | "">("");

  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [cidade, setCidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] = useState<VipStatus>("novo");
  const [ticketMedio, setTicketMedio] = useState("");
  const [totalCompras, setTotalCompras] = useState("");

  function toast(text: string, ms = 2200): void {
    setMsg(text);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setMsg(""), ms);
    }
  }

  async function refresh(silent = false): Promise<void> {
    try {
      setLoading(true);
      const [data, leadIdsData] = await Promise.all([fetchVipClientes(), fetchLeadIds()]);
      setLista(data);
      setLeadIds(leadIdsData);
      if (!silent) toast("🔄 Clientes VIP atualizados!");
    } catch (error) {
      console.error("Erro ao carregar clientes VIP:", error);
      toast("⚠️ Não consegui carregar clientes VIP do Firebase.", 3200);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(true);
  }, []);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return lista.filter((item) => {
      const matchStatus = !statusFiltro || item.status === statusFiltro;
      if (!matchStatus) return false;

      if (!q) return true;
      return [
        item.nome,
        item.telefone,
        item.instagram,
        item.cidade,
        item.observacoes,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [lista, queryText, statusFiltro]);

  const stats = useMemo(() => {
    const total = lista.length;
    const novos = lista.filter((x) => x.status === "novo").length;
    const emConversa = lista.filter((x) => x.status === "em_conversa").length;
    const compraram = lista.filter((x) => x.status === "comprou" || x.status === "vip_ativo").length;
    const leadIdsSet = new Set(leadIds);
    const convertidos = lista.filter((x) => leadIdsSet.has(x.id)).length;
    const conversao = total ? Math.round((convertidos / total) * 100) : 0;
    return { total, novos, emConversa, compraram, convertidos, conversao };
  }, [lista, leadIds]);

  function resetForm(): void {
    setEditingId(null);
    setNome("");
    setTelefone("");
    setInstagram("");
    setCidade("");
    setObservacoes("");
    setStatus("novo");
    setTicketMedio("");
    setTotalCompras("");
  }

  function abrirNovo(): void {
    resetForm();
    setOpenModal(true);
  }

  function abrirEditar(item: VipCliente): void {
    setEditingId(item.id);
    setNome(item.nome || "");
    setTelefone(item.telefone || "");
    setInstagram(item.instagram || "");
    setCidade(item.cidade || "");
    setObservacoes(item.observacoes || "");
    setStatus(item.status || "novo");
    setTicketMedio(item.ticketMedio ? String(item.ticketMedio) : "");
    setTotalCompras(item.totalCompras ? String(item.totalCompras) : "");
    setOpenModal(true);
  }

  function validar(): string | null {
    if ((nome || "").trim().length < 3) return "Nome precisa ter pelo menos 3 letras.";
    if (onlyDigits(telefone).length < 10) return "Telefone precisa ter DDD + número.";
    return null;
  }

  async function salvar(): Promise<void> {
    const erro = validar();
    if (erro) {
      toast(`⚠️ ${erro}`, 2600);
      return;
    }

    const now = new Date().toISOString();

    try {
      if (editingId) {
        await updateVipCliente(editingId, {
          nome: nome.trim(),
          telefone: onlyDigits(telefone),
          instagram: onlyHandle(instagram),
          cidade: cidade.trim(),
          observacoes: observacoes.trim(),
          status,
          ticketMedio: Number(ticketMedio || 0),
          totalCompras: Number(totalCompras || 0),
          updatedAt: now,
        });
        toast("✅ Cliente VIP atualizado!");
      } else {
        const novo: VipCliente = {
          id: uid(),
          nome: nome.trim(),
          telefone: onlyDigits(telefone),
          instagram: onlyHandle(instagram),
          cidade: cidade.trim(),
          observacoes: observacoes.trim(),
          status,
          ticketMedio: Number(ticketMedio || 0),
          totalCompras: Number(totalCompras || 0),
          createdAt: now,
          updatedAt: now,
        };
        await saveVipCliente(novo);
        toast("✅ Cliente VIP cadastrado!");
      }

      setOpenModal(false);
      resetForm();
      await refresh(true);
    } catch (error) {
      console.error("Erro ao salvar cliente VIP:", error);
      toast("⚠️ Não consegui salvar no Firebase.", 3200);
    }
  }

  async function mudarStatus(item: VipCliente, novoStatus: VipStatus): Promise<void> {
    const now = new Date().toISOString();

    setLista((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, status: novoStatus, updatedAt: now } : x))
    );

    try {
      await updateVipCliente(item.id, { status: novoStatus, updatedAt: now });
      toast("✅ Status atualizado!");
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast("⚠️ Não consegui atualizar o status.", 3200);
      await refresh(true);
    }
  }

  async function abrirWhatsApp(item: VipCliente): Promise<void> {
    const numeroBase = onlyDigits(item.telefone || "");
    if (!numeroBase) {
      toast("⚠️ Cliente sem telefone válido.", 2200);
      return;
    }

    const numero = numeroBase.length <= 11 ? `55${numeroBase}` : numeroBase;
    const mensagem = encodeURIComponent(
      `Olá, ${item.nome}! Tudo bem? Aqui é da Maison Noor Parfums. ` +
        `Passando para te atender de forma exclusiva e te mostrar nossas opções disponíveis hoje ✨`
    );
    const url = `https://wa.me/${numero}?text=${mensagem}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function onConverterLead(item: VipCliente): Promise<void> {
    try {
      await convertVipToLead(item);
      toast("✅ Cliente VIP convertido em lead!");
      await refresh(true);
    } catch (error) {
      console.error("Erro ao converter VIP em lead:", error);
      toast("⚠️ Não consegui converter em lead.", 3200);
    }
  }

  return (
    <>
      <main className="page">
        <div className="pageShell">
          <header className="pageHeader">
            <div className="pageHeaderLeft">
              <div className="kicker">Maison Noor</div>
              <h1 className="pageTitle">CRM • Clientes VIP</h1>
              <p className="pageSub">
                Gestão premium dos seus clientes mais valiosos com acompanhamento comercial,
                relacionamento e conversão para lead no padrão Maison Noor.
              </p>
            </div>

            <div className="pageHeaderRight">
              <div className="actionsTop">
                <button className="btn" type="button" onClick={() => void refresh()}>
                  Atualizar
                </button>
                <button className="btnPrimary" type="button" onClick={abrirNovo}>
                  Novo VIP
                </button>
              </div>
            </div>
          </header>

          {msg ? <div className="toast">{msg}</div> : null}

          <section className="statsGrid">
            <div className="statCard">
              <div className="statIcon">👑</div>
              <div className="statLabel">Total VIP</div>
              <div className="statValue">{stats.total}</div>
            </div>

            <div className="statCard">
              <div className="statIcon">✨</div>
              <div className="statLabel">Novos</div>
              <div className="statValue">{stats.novos}</div>
            </div>

            <div className="statCard">
              <div className="statIcon">💬</div>
              <div className="statLabel">Em conversa</div>
              <div className="statValue">{stats.emConversa}</div>
            </div>

            <div className="statCard">
              <div className="statIcon">🛍️</div>
              <div className="statLabel">Compraram</div>
              <div className="statValue">{stats.compraram}</div>
            </div>

            <div className="statCard">
              <div className="statIcon">📈</div>
              <div className="statLabel">Conversão %</div>
              <div className="statValue">{stats.conversao}%</div>
              <div className="statMeta">{stats.convertidos} convertido(s) em lead</div>
            </div>
          </section>

          <section className="card">
            <div className="toolbar">
              <div className="field grow">
                <label>Buscar</label>
                <input
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Buscar por nome, telefone, Instagram, cidade..."
                />
              </div>

              <div className="field statusField">
                <label>Status</label>
                <select
                  value={statusFiltro}
                  onChange={(e) => setStatusFiltro(e.target.value as VipStatus | "")}
                >
                  <option value="">Todos os status</option>
                  {VIP_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.v} value={opt.v}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="cardHead">
              <div>
                <div className="cardTitle">Base VIP</div>
                <div className="cardSub">Clientes de alto potencial e relacionamento premium.</div>
              </div>
              <div className="cardCount">{filtered.length} registro(s)</div>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Status</th>
                    <th>Resumo</th>
                    <th>Ações rápidas</th>
                  </tr>
                </thead>

                <tbody>
                  {!loading && filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="emptyState">
                          <div className="emptyTitle">Nenhum cliente VIP encontrado</div>
                          <div className="emptySub">
                            Ajuste a busca ou crie um novo VIP para começar sua gestão comercial.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="name">{item.nome}</div>
                        <div className="meta">
                          {item.cidade || "Cidade não informada"}
                        </div>
                      </td>

                      <td>
                        <div className="mono">{item.telefone || "—"}</div>
                        <div className="meta">
                          {item.instagram ? `@${item.instagram}` : "Sem Instagram"}
                        </div>
                      </td>

                      <td>
                        <span className={`statusBadge ${statusClass(item.status)}`}>
                          <span className="statusDot" />
                          {statusLabel(item.status)}
                        </span>
                      </td>

                      <td>
                        <div className="summaryList">
                          <div>
                            Ticket médio:{" "}
                            <strong>
                              {Number(item.ticketMedio || 0).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </strong>
                          </div>
                          <div>
                            Total compras:{" "}
                            <strong>
                              {Number(item.totalCompras || 0).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </strong>
                          </div>
                          <div className="meta">
                            Atualizado em{" "}
                            {new Date(item.updatedAt || item.createdAt).toLocaleString("pt-BR")}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="actions">
                          <button className="miniBtn" type="button" onClick={() => void abrirWhatsApp(item)}>
                            WhatsApp
                          </button>
                          <button className="miniBtn" type="button" onClick={() => void mudarStatus(item, "em_conversa")}>
                            Em conversa
                          </button>
                          <button className="miniBtn" type="button" onClick={() => void mudarStatus(item, "comprou")}>
                            Comprou
                          </button>
                          <button className="miniBtn accent" type="button" onClick={() => void onConverterLead(item)}>
                            Converter Lead
                          </button>
                          <button className="miniBtn" type="button" onClick={() => abrirEditar(item)}>
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {openModal ? (
        <div className="modalOverlay" onClick={() => setOpenModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="cardTitle">{editingId ? "Editar cliente VIP" : "Novo cliente VIP"}</div>
                <div className="cardSub">Cadastro premium no padrão Maison Noor.</div>
              </div>

              <button className="closeBtn" type="button" onClick={() => setOpenModal(false)}>
                ×
              </button>
            </div>

            <div className="modalBody">
              <div className="row">
                <div className="field">
                  <label>Nome *</label>
                  <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Fernandes" />
                </div>

                <div className="field">
                  <label>Telefone *</label>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex: (12) 99999-9999" />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>Instagram</label>
                  <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@clientevip" />
                </div>

                <div className="field">
                  <label>Cidade</label>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São José dos Campos" />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as VipStatus)}>
                    {VIP_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.v} value={opt.v}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Ticket médio (R$)</label>
                  <input
                    value={ticketMedio}
                    onChange={(e) => setTicketMedio(e.target.value)}
                    placeholder="Ex: 320"
                  />
                </div>

                <div className="field">
                  <label>Total compras (R$)</label>
                  <input
                    value={totalCompras}
                    onChange={(e) => setTotalCompras(e.target.value)}
                    placeholder="Ex: 950"
                  />
                </div>
              </div>

              <div className="field">
                <label>Observações</label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Preferências, perfil de compra, observações de atendimento..."
                  rows={4}
                />
              </div>

              <div className="modalActions">
                <button className="btn" type="button" onClick={() => setOpenModal(false)}>
                  Cancelar
                </button>
                <button className="btnPrimary" type="button" onClick={() => void salvar()}>
                  {editingId ? "Salvar alterações" : "Cadastrar VIP"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        :global(body) {
          background:
            radial-gradient(circle at top, rgba(200, 162, 106, 0.08), transparent 28%),
            linear-gradient(180deg, #08080c 0%, #0b0b10 100%);
          color: #f5f2ea;
        }

        .page {
          min-height: 100%;
          color: #f5f2ea;
        }

        .pageShell {
          max-width: 1400px;
          margin: 0 auto;
          padding: 26px 24px 40px;
        }

        .pageHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 18px;
        }

        .pageHeaderLeft {
          max-width: 860px;
        }

        .kicker {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(200, 162, 106, 0.95);
          font-weight: 900;
          margin-bottom: 8px;
        }

        .pageTitle {
          margin: 0;
          font-size: clamp(28px, 4vw, 42px);
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .pageSub {
          margin: 10px 0 0;
          font-size: 16px;
          line-height: 1.6;
          color: rgba(245, 242, 234, 0.85);
          max-width: 900px;
        }

        .pageHeaderRight {
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
        }

        .actionsTop {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .toast {
          margin-bottom: 16px;
          border: 1px solid rgba(200, 162, 106, 0.28);
          background: rgba(200, 162, 106, 0.08);
          color: #f7ebd3;
          padding: 12px 14px;
          border-radius: 16px;
          font-weight: 700;
        }

        .statsGrid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .statCard,
        .card {
          border-radius: 22px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            linear-gradient(180deg, rgba(200, 162, 106, 0.08), rgba(255,255,255,0.02)),
            rgba(15, 15, 20, 0.9);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
          overflow: hidden;
        }

        .statCard {
          padding: 18px;
        }

        .statIcon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(200, 162, 106, 0.1);
          border: 1px solid rgba(200, 162, 106, 0.18);
          margin-bottom: 12px;
          font-size: 20px;
        }

        .statLabel {
          color: rgba(245, 242, 234, 0.75);
          font-size: 13px;
          font-weight: 700;
        }

        .statValue {
          margin-top: 6px;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
          color: #f5e6c9;
        }

        .statMeta {
          margin-top: 8px;
          color: rgba(245, 242, 234, 0.62);
          font-size: 12px;
          font-weight: 700;
        }

        .card {
          padding: 20px;
          margin-bottom: 18px;
        }

        .cardHead {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }

        .cardTitle {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .cardSub {
          margin-top: 6px;
          color: rgba(245, 242, 234, 0.74);
          font-size: 14px;
        }

        .cardCount {
          color: #f1d4a0;
          font-weight: 800;
          white-space: nowrap;
        }

        .toolbar,
        .row {
          display: grid;
          grid-template-columns: 1.6fr 0.9fr;
          gap: 14px;
        }

        .row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .grow {
          min-width: 0;
        }

        .statusField {
          min-width: 220px;
        }

        .field {
          display: grid;
          gap: 8px;
        }

        .field label {
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(245, 242, 234, 0.72);
        }

        .field input,
        .field select,
        .field textarea {
          width: 100%;
          min-width: 0;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          padding: 12px 14px;
          outline: none;
          font-size: 14px;
        }

        .field input::placeholder,
        .field textarea::placeholder {
          color: rgba(255, 255, 255, 0.42);
        }

        .field input:focus,
        .field select:focus,
        .field textarea:focus {
          border-color: rgba(200, 162, 106, 0.5);
          box-shadow: 0 0 0 3px rgba(200, 162, 106, 0.12);
        }

        .btn,
        .btnPrimary,
        .miniBtn,
        .closeBtn {
          border: 1px solid rgba(200, 162, 106, 0.22);
          border-radius: 14px;
          padding: 11px 15px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.08s ease, border 0.14s ease, background 0.14s ease;
        }

        .btn {
          background: rgba(200, 162, 106, 0.08);
          color: #f5f2ea;
        }

        .btnPrimary {
          background: linear-gradient(180deg, #d7b177, #b98b49);
          color: #160f07;
          border-color: rgba(200, 162, 106, 0.75);
        }

        .btn:hover,
        .btnPrimary:hover,
        .miniBtn:hover,
        .closeBtn:hover {
          transform: translateY(-1px);
        }

        .tableWrap {
          overflow-x: auto;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.12);
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1100px;
        }

        .table thead th {
          text-align: left;
          padding: 14px 16px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(245, 242, 234, 0.68);
          border-bottom: 1px solid rgba(200, 162, 106, 0.12);
          background: rgba(255, 255, 255, 0.02);
        }

        .table tbody td {
          padding: 16px;
          border-bottom: 1px solid rgba(200, 162, 106, 0.08);
          vertical-align: top;
        }

        .table tbody tr:hover {
          background: rgba(200, 162, 106, 0.04);
        }

        .name {
          font-size: 16px;
          font-weight: 900;
        }

        .meta {
          margin-top: 4px;
          color: rgba(245, 242, 234, 0.62);
          font-size: 12px;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-weight: 700;
        }

        .summaryList {
          display: grid;
          gap: 6px;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .miniBtn {
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          padding: 9px 12px;
          font-size: 13px;
        }

        .miniBtn.accent {
          background: rgba(200, 162, 106, 0.12);
          color: #f3d29d;
        }

        .statusBadge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .statusDot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 10px currentColor;
          flex: 0 0 auto;
        }

        .sNovo {
          background: rgba(104, 143, 255, 0.14);
          color: #bad0ff;
          border-color: rgba(104, 143, 255, 0.22);
        }

        .sWhatsapp {
          background: rgba(45, 198, 83, 0.13);
          color: #a6f0ba;
          border-color: rgba(45, 198, 83, 0.24);
        }

        .sConversa {
          background: rgba(255, 193, 7, 0.12);
          color: #ffe39b;
          border-color: rgba(255, 193, 7, 0.22);
        }

        .sInteressado {
          background: rgba(186, 104, 200, 0.12);
          color: #edb9f5;
          border-color: rgba(186, 104, 200, 0.22);
        }

        .sComprou {
          background: rgba(255, 152, 0, 0.12);
          color: #ffcf8b;
          border-color: rgba(255, 152, 0, 0.22);
        }

        .sAtivo {
          background: rgba(200, 162, 106, 0.15);
          color: #f1d39d;
          border-color: rgba(200, 162, 106, 0.32);
        }

        .sPerdido {
          background: rgba(244, 67, 54, 0.12);
          color: #ffb3ad;
          border-color: rgba(244, 67, 54, 0.22);
        }

        .sConverteu {
          background: rgba(0, 188, 212, 0.12);
          color: #99eef9;
          border-color: rgba(0, 188, 212, 0.22);
        }

        .emptyState {
          padding: 28px 10px;
          text-align: center;
        }

        .emptyTitle {
          font-size: 18px;
          font-weight: 900;
          margin-bottom: 8px;
        }

        .emptySub {
          color: rgba(245, 242, 234, 0.68);
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.62);
          backdrop-filter: blur(6px);
          display: grid;
          place-items: center;
          z-index: 90;
          padding: 20px;
        }

        .modalCard {
          width: min(920px, 100%);
          border-radius: 24px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background:
            linear-gradient(180deg, rgba(200, 162, 106, 0.08), rgba(255,255,255,0.02)),
            #101015;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
          overflow: hidden;
        }

        .modalHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(200, 162, 106, 0.12);
        }

        .closeBtn {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          padding: 0;
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          font-size: 22px;
        }

        .modalBody {
          padding: 20px;
          display: grid;
          gap: 14px;
        }

        .modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 6px;
        }

        @media (max-width: 1180px) {
          .statsGrid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 920px) {
          .pageShell {
            padding: 20px 16px 30px;
          }

          .pageHeader {
            flex-direction: column;
            align-items: stretch;
          }

          .pageHeaderRight {
            justify-content: flex-start;
          }

          .statsGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .toolbar,
          .row {
            grid-template-columns: 1fr;
          }

          .cardTitle {
            font-size: 24px;
          }
        }

        @media (max-width: 560px) {
          .statsGrid {
            grid-template-columns: 1fr;
          }

          .actionsTop,
          .modalActions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .card {
            padding: 16px;
          }

          .statCard {
            padding: 16px;
          }
        }
      `}</style>
    </>
  );
}
