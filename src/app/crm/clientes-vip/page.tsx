 "use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

type VipStatus =
  | "novo"
  | "chamou_no_whatsapp"
  | "interessado"
  | "aguardando_retorno"
  | "converteu"
  | "arquivado";

type ClienteVip = {
  id: string;
  nome: string;
  whatsapp: string;
  email: string;
  preferencia: string;
  estilo: string;
  origem: string;
  createdAt: string;
  atualizadoEm: string;
  status: VipStatus;
  observacoes: string;
};

const STATUS_OPTIONS: { v: VipStatus; label: string }[] = [
  { v: "novo", label: "Novo" },
  { v: "chamou_no_whatsapp", label: "Chamou no WhatsApp" },
  { v: "interessado", label: "Interessado" },
  { v: "aguardando_retorno", label: "Aguardando retorno" },
  { v: "converteu", label: "Converteu" },
  { v: "arquivado", label: "Arquivado" },
];

const CLIENTES_VIP_COL = collection(db, "clientes_vip");

function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function formatPhoneBR(v: string): string {
  const d = onlyDigits(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v || "—";
}

function formatDateBR(iso?: string): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("pt-BR");
}

function timestampToISO(value: any): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  return new Date().toISOString();
}

function normalizeVip(id: string, data: any): ClienteVip {
  const statusValues = STATUS_OPTIONS.map((s) => s.v);
  const status = statusValues.includes(data?.status) ? data.status : "novo";

  return {
    id,
    nome: typeof data?.nome === "string" && data.nome.trim() ? data.nome.trim() : "Sem nome",
    whatsapp: typeof data?.whatsapp === "string" ? onlyDigits(data.whatsapp) : "",
    email: typeof data?.email === "string" ? data.email : "",
    preferencia: typeof data?.preferencia === "string" ? data.preferencia : "—",
    estilo: typeof data?.estilo === "string" ? data.estilo : "—",
    origem: typeof data?.origem === "string" ? data.origem : "site-maison-noor",
    createdAt: timestampToISO(data?.createdAt),
    atualizadoEm: timestampToISO(data?.atualizadoEm || data?.updatedAt || data?.createdAt),
    status,
    observacoes: typeof data?.observacoes === "string" ? data.observacoes : "",
  };
}

async function fetchClientesVip(): Promise<ClienteVip[]> {
  const q = query(CLIENTES_VIP_COL, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeVip(d.id, d.data() || {}));
}

async function updateClienteVip(
  id: string,
  patch: Partial<Pick<ClienteVip, "status" | "observacoes">>
): Promise<void> {
  const ref = doc(CLIENTES_VIP_COL, id);
  await updateDoc(ref, {
    ...patch,
    atualizadoEm: new Date().toISOString(),
  } as any);
}

function NavCRM() {
  const pathname = usePathname();

  const items = [
    { href: "/crm", label: "Dashboard" },
    { href: "/crm/leads", label: "Leads" },
    { href: "/crm/clientes-vip", label: "Clientes VIP" },
    { href: "/crm/kanban", label: "Kanban" },
    { href: "/crm/pedidos", label: "Pedidos" },
  ];

  const isActive = (href: string) => {
    if (href === "/crm") return pathname === "/crm" || pathname === "/crm/";
    return pathname?.startsWith(href);
  };

  return (
    <nav className="nav">
      <div className="navInner">
        <div className="brand">
          <div className="brandKicker">Maison Noor</div>
          <div className="brandTitle">CRM</div>
        </div>

        <div className="links" role="navigation" aria-label="CRM">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`link ${isActive(it.href) ? "active" : ""}`}
            >
              {it.label}
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .nav {
          position: sticky;
          top: 0;
          z-index: 60;
          border-bottom: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(10, 10, 14, 0.92);
          backdrop-filter: blur(8px);
        }
        .navInner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          max-width: 1320px;
          margin: 0 auto;
          padding: 14px 18px;
        }
        .brandKicker {
          color: #b48a55;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .brandTitle {
          color: #f4e2c3;
          font-size: 24px;
          font-weight: 800;
          line-height: 1.05;
        }
        .links {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .link {
          color: #d4c2a8;
          text-decoration: none;
          font-weight: 700;
          font-size: 14px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          border-radius: 999px;
          padding: 10px 14px;
          transition: 0.2s ease;
        }
        .link:hover,
        .link.active {
          color: #111;
          background: linear-gradient(135deg, #d8be97, #bf9458);
          border-color: rgba(200, 162, 106, 0.45);
          box-shadow: 0 10px 24px rgba(191, 148, 88, 0.18);
        }
      `}</style>
    </nav>
  );
}

export default function ClientesVipPage() {
  const [clientes, setClientes] = useState<ClienteVip[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"" | VipStatus>("");
  const [editing, setEditing] = useState<ClienteVip | null>(null);
  const [editStatus, setEditStatus] = useState<VipStatus>("novo");
  const [editObs, setEditObs] = useState("");

  function toast(text: string, ms = 2400) {
    setMsg(text);
    window.setTimeout(() => setMsg(""), ms);
  }

  async function refresh() {
    setLoading(true);
    try {
      const data = await fetchClientesVip();
      setClientes(data);
    } catch (e) {
      console.error(e);
      toast("⚠️ Não consegui carregar os clientes VIP do Firebase.", 3200);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      const bateBusca =
        !termo ||
        c.nome.toLowerCase().includes(termo) ||
        c.email.toLowerCase().includes(termo) ||
        c.whatsapp.includes(onlyDigits(termo)) ||
        c.preferencia.toLowerCase().includes(termo) ||
        c.estilo.toLowerCase().includes(termo);

      const bateStatus = !filtroStatus || c.status === filtroStatus;
      return bateBusca && bateStatus;
    });
  }, [clientes, busca, filtroStatus]);

  const totalNovos = clientes.filter((c) => c.status === "novo").length;

  function abrirEditar(c: ClienteVip) {
    setEditing(c);
    setEditStatus(c.status);
    setEditObs(c.observacoes || "");
  }

  function fecharEditar() {
    setEditing(null);
    setEditObs("");
    setEditStatus("novo");
  }

  async function salvarEdicao() {
    if (!editing) return;
    try {
      await updateClienteVip(editing.id, {
        status: editStatus,
        observacoes: editObs,
      });
      toast("✅ Cliente VIP atualizado.");
      await refresh();
      fecharEditar();
    } catch (e) {
      console.error(e);
      toast("⚠️ Não consegui salvar a edição no Firebase.", 3200);
    }
  }

  return (
    <>
      <NavCRM />

      <main className="page">
        <div className="pageShell">
          <header className="pageHeader">
            <div className="pageHeaderLeft">
              <div className="kicker">Maison Noor</div>
              <h1 className="pageTitle">CRM • Clientes VIP</h1>
              <p className="pageSub">
                Cadastros captados no site, com atendimento e acompanhamento pelo CRM.
              </p>
            </div>

            <div className="pageHeaderRight">
              <div className="stats">
                <div className="stat">
                  <div className="statLabel">Total VIP</div>
                  <div className="statValue">{clientes.length}</div>
                </div>
                <div className="stat">
                  <div className="statLabel">Novos</div>
                  <div className="statValue">{totalNovos}</div>
                </div>
                <button className="btn" type="button" onClick={() => void refresh()}>
                  Atualizar
                </button>
              </div>
            </div>
          </header>

          {msg ? <div className="toast">{msg}</div> : null}

          <section className="pageBody">
            <div className="toolbar">
              <input
                className="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, WhatsApp, e-mail, preferência..."
              />

              <select
                className="select"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus((e.target.value || "") as "" | VipStatus)}
              >
                <option value="">Todos os status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="card">
              <div className="cardTitle">Clientes VIP cadastrados</div>

              {loading ? (
                <div className="empty">Carregando clientes VIP...</div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="empty">Nenhum cliente VIP encontrado.</div>
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Contato</th>
                        <th>Perfil</th>
                        <th>Cadastro</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>

                    <tbody>
                      {clientesFiltrados.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="name">{c.nome}</div>
                            <div className="meta">{c.origem || "site-maison-noor"}</div>
                          </td>

                          <td>
                            <div className="mono">{formatPhoneBR(c.whatsapp)}</div>
                            <div className="meta">{c.email || "Sem e-mail"}</div>
                          </td>

                          <td>
                            <div className="chips">
                              <span className="chip">{c.preferencia}</span>
                              <span className="chip">{c.estilo}</span>
                            </div>
                          </td>

                          <td>
                            <div className="meta">{formatDateBR(c.createdAt)}</div>
                            <div className="meta">Atualizado: {formatDateBR(c.atualizadoEm)}</div>
                          </td>

                          <td>
                            <span className={`status status-${c.status}`}>
                              {STATUS_OPTIONS.find((s) => s.v === c.status)?.label || "Novo"}
                            </span>
                          </td>

                          <td>
                            <div className="actions">
                              <a
                                className="btnGhost"
                                href={`https://wa.me/55${c.whatsapp}?text=${encodeURIComponent(
                                  `Olá ${c.nome}! Vi seu cadastro no Clube VIP Maison Noor ✨ Posso te mostrar algumas fragrâncias especiais?`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                WhatsApp
                              </a>

                              <button className="btnGhost" type="button" onClick={() => abrirEditar(c)}>
                                Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        {editing ? (
          <div className="overlay" onClick={fecharEditar}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div>
                  <div className="kicker">Cliente VIP</div>
                  <h2 className="modalTitle">{editing.nome}</h2>
                </div>

                <button className="closeBtn" type="button" onClick={fecharEditar}>
                  ×
                </button>
              </div>

              <div className="row">
                <div className="field">
                  <label>Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as VipStatus)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>WhatsApp</label>
                  <input value={formatPhoneBR(editing.whatsapp)} readOnly />
                </div>
              </div>

              <div className="field">
                <label>Observações</label>
                <textarea
                  value={editObs}
                  onChange={(e) => setEditObs(e.target.value)}
                  placeholder="Ex: chamou no WhatsApp, gostou de fragrâncias doces, aguardar retorno..."
                />
              </div>

              <div className="modalActions">
                <button className="btnGhost" type="button" onClick={fecharEditar}>
                  Cancelar
                </button>
                <button className="btn" type="button" onClick={() => void salvarEdicao()}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top, rgba(215, 192, 160, 0.08), transparent 24%),
            linear-gradient(180deg, #0b0b0f 0%, #121218 100%);
          color: #efe6d7;
        }
        .pageShell {
          max-width: 1320px;
          margin: 0 auto;
          padding: 28px 18px 44px;
        }
        .pageHeader {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        .kicker {
          color: #b48a55;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .pageTitle {
          margin: 0;
          font-size: 34px;
          line-height: 1.05;
          color: #f7e7cf;
        }
        .pageSub {
          margin: 8px 0 0;
          color: #b8aa98;
          max-width: 680px;
          line-height: 1.6;
        }
        .stats {
          display: flex;
          gap: 12px;
          align-items: stretch;
          flex-wrap: wrap;
        }
        .stat {
          min-width: 132px;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: linear-gradient(180deg, rgba(24, 24, 30, 0.92), rgba(16, 16, 20, 0.92));
        }
        .statLabel {
          color: #a89172;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .statValue {
          font-size: 24px;
          font-weight: 800;
          color: #f4e2c3;
        }
        .btn,
        .btnGhost {
          border-radius: 14px;
          height: 42px;
          padding: 0 16px;
          font-weight: 800;
          cursor: pointer;
          transition: 0.2s ease;
        }
        .btn {
          border: 1px solid rgba(200, 162, 106, 0.35);
          background: linear-gradient(135deg, #d8be97, #bf9458);
          color: #111;
          box-shadow: 0 10px 24px rgba(191, 148, 88, 0.18);
        }
        .btnGhost {
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: rgba(255, 255, 255, 0.03);
          color: #e7d5bb;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn:hover,
        .btnGhost:hover {
          transform: translateY(-1px);
        }
        .toast {
          margin-bottom: 14px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(20, 20, 26, 0.88);
          color: #f4e2c3;
          padding: 12px 14px;
          border-radius: 14px;
        }
        .pageBody {
          display: grid;
          gap: 16px;
        }
        .toolbar {
          display: grid;
          grid-template-columns: 1fr 260px;
          gap: 12px;
        }
        .search,
        .select,
        .field input,
        .field select,
        .field textarea {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(20, 20, 26, 0.9);
          color: #f1e8db;
          outline: none;
          box-sizing: border-box;
        }
        .search,
        .select,
        .field input,
        .field select {
          height: 46px;
          padding: 0 14px;
        }
        .field textarea {
          min-height: 130px;
          padding: 12px 14px;
          resize: vertical;
        }
        .card {
          border-radius: 24px;
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: linear-gradient(180deg, rgba(16, 16, 20, 0.94), rgba(10, 10, 14, 0.94));
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.16);
          overflow: hidden;
        }
        .cardTitle {
          padding: 18px 18px 0;
          font-size: 20px;
          font-weight: 800;
          color: #f4e2c3;
        }
        .empty {
          padding: 18px;
          color: #b8aa98;
        }
        .tableWrap {
          width: 100%;
          overflow: auto;
          padding: 14px 18px 18px;
          box-sizing: border-box;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 980px;
        }
        th,
        td {
          text-align: left;
          padding: 14px 12px;
          border-bottom: 1px solid rgba(200, 162, 106, 0.1);
          vertical-align: top;
        }
        th {
          color: #b48a55;
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .name {
          color: #f6ead7;
          font-weight: 800;
          font-size: 15px;
        }
        .meta,
        .mono {
          color: #b8aa98;
          font-size: 13px;
          line-height: 1.5;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chip {
          border-radius: 999px;
          padding: 7px 10px;
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: rgba(255, 255, 255, 0.04);
          color: #e9dac3;
          font-size: 12px;
        }
        .status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(255, 255, 255, 0.04);
          color: #f5e4c7;
          white-space: nowrap;
        }
        .status-novo { background: rgba(212, 175, 106, 0.14); }
        .status-chamou_no_whatsapp { background: rgba(59, 130, 246, 0.14); }
        .status-interessado { background: rgba(16, 185, 129, 0.14); }
        .status-aguardando_retorno { background: rgba(245, 158, 11, 0.14); }
        .status-converteu { background: rgba(34, 197, 94, 0.16); }
        .status-arquivado { background: rgba(107, 114, 128, 0.16); }
        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
          padding: 18px;
        }
        .modal {
          width: min(760px, 100%);
          border-radius: 24px;
          border: 1px solid rgba(200, 162, 106, 0.16);
          background: linear-gradient(180deg, rgba(18, 18, 24, 0.98), rgba(10, 10, 14, 0.98));
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.24);
          padding: 20px;
          color: #f5ebdc;
        }
        .modalHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .modalTitle {
          margin: 0;
          color: #f7e7cf;
          font-size: 28px;
          line-height: 1.06;
        }
        .closeBtn {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(255, 255, 255, 0.03);
          color: #f7e7cf;
          font-size: 28px;
          cursor: pointer;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .field {
          display: grid;
          gap: 8px;
          margin-bottom: 12px;
        }
        .field label {
          color: #b48a55;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
        @media (max-width: 920px) {
          .pageHeader {
            grid-template-columns: 1fr;
            display: grid;
          }
          .toolbar,
          .row {
            grid-template-columns: 1fr;
          }
          .links {
            justify-content: flex-start;
          }
        }
      `}</style>
    </>
  );
}
