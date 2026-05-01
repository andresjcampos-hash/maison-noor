"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type StatusPedido =
  | "rascunho"
  | "aguardando_pagamento"
  | "pago"
  | "enviado"
  | "entregue"
  | "cancelado";

type PedidoItem = {
  nome?: string;
  qtd?: number;
  quantidade?: number;
  preco?: number;
  precoUnitario?: number;
};

type Pedido = {
  id: string;
  numero?: number;
  numeroPedido?: string;
  numeroSite?: string;
  clienteNome?: string;
  nome?: string;
  telefone?: string;
  origem?: string;
  itens?: PedidoItem[];
  items?: PedidoItem[];
  desconto?: number;
  frete?: number;
  total?: number;
  valor?: number;
  valorTotal?: number;
  status?: StatusPedido;
  formaPagamento?: string;
  visualizado?: boolean;
  alertaNovoPedido?: boolean;
  statusInterno?: string;
  prioridade?: "baixa" | "normal" | "alta" | "urgente";
  followUpFeito?: boolean;
  followUpAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

type InsightTipo = "critico" | "alerta" | "sucesso" | "info";

type Insight = {
  tipo: InsightTipo;
  titulo: string;
  descricao: string;
  acao?: string;
  href?: string;
};

function formatBRL(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pedidoCodigo(p: Pedido) {
  if (p.numeroPedido) return p.numeroPedido;
  if (p.numeroSite) return p.numeroSite;
  if (typeof p.numero === "number" && p.numero > 0) {
    return p.numero.toString().padStart(4, "0");
  }
  return p.id?.slice(-6) || "—";
}

function getItens(p: Pedido) {
  return Array.isArray(p.itens) && p.itens.length ? p.itens : p.items || [];
}

function calcularTotal(p: Pedido) {
  const direto = Number(p.total || p.valorTotal || p.valor || 0);
  if (direto > 0) return direto;

  const subtotal = getItens(p).reduce((acc, item) => {
    const qtd = Number(item.qtd || item.quantidade || 0);
    const preco = Number(item.preco || item.precoUnitario || 0);
    return acc + qtd * preco;
  }, 0);

  return Math.max(0, subtotal - Number(p.desconto || 0) + Number(p.frete || 0));
}

function normalizarData(valor?: any): Date | null {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (typeof valor === "string" || typeof valor === "number") {
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? data : null;
  }
  return null;
}

function isPedidoNovo(p: Pedido) {
  return (
    p.alertaNovoPedido === true ||
    p.visualizado === false ||
    p.statusInterno === "novo_pedido" ||
    (p.origem === "site" && p.status === "aguardando_pagamento" && p.visualizado !== true)
  );
}

function horasDesde(valor?: any) {
  const data = normalizarData(valor);
  if (!data) return 0;
  return Math.max(0, (Date.now() - data.getTime()) / 1000 / 60 / 60);
}

function isPendenteParado(p: Pedido) {
  return p.status === "aguardando_pagamento" && horasDesde(p.createdAt || p.updatedAt) >= 24;
}

function isPagoParado(p: Pedido) {
  return p.status === "pago" && horasDesde(p.updatedAt || p.createdAt) >= 24;
}

function isEnviadoParado(p: Pedido) {
  return p.status === "enviado" && horasDesde(p.updatedAt || p.createdAt) >= 72;
}

function isFaturado(p: Pedido) {
  return p.status === "pago" || p.status === "enviado" || p.status === "entregue";
}

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    rascunho: "Rascunho",
    aguardando_pagamento: "Aguardando",
    pago: "Pago",
    enviado: "Enviado",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };
  return map[String(status || "")] || "Sem status";
}

function limparTelefone(telefone?: string) {
  return String(telefone || "").replace(/\D/g, "");
}

function whatsappPedido(p: Pedido) {
  const telefone = limparTelefone(p.telefone);
  const numero = pedidoCodigo(p);
  const nome = p.clienteNome || p.nome || "Cliente";
  const total = formatBRL(calcularTotal(p));

  const mensagem = encodeURIComponent(
    `Olá, ${nome}! Tudo bem? Aqui é da Maison Noor Parfums. Estou passando para acompanhar seu pedido #${numero} no valor de ${total}. Posso te ajudar com alguma informação?`
  );

  if (telefone.length >= 10) return `https://wa.me/55${telefone}?text=${mensagem}`;
  return `https://wa.me/?text=${mensagem}`;
}

function classificarPrioridade(p: Pedido): Pedido["prioridade"] {
  if (p.prioridade) return p.prioridade;
  if (isPendenteParado(p) || isPagoParado(p)) return "urgente";
  if (p.status === "aguardando_pagamento") return "alta";
  if (isPedidoNovo(p)) return "alta";
  return "normal";
}

export default function CrmPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    const ref = collection(db, "pedidos", "default", "lista");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((docSnap) => ({
          ...(docSnap.data() as Pedido),
          id: docSnap.id,
        }));

        setPedidos(lista);
        setLoading(false);
        setErro("");
      },
      (error) => {
        console.error("Erro no dashboard em tempo real:", error);
        setErro("Não foi possível carregar os dados do CRM.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  async function atualizarPedido(pedidoId: string, dados: Partial<Pedido>) {
    try {
      setSalvandoId(pedidoId);
      const ref = doc(db, "pedidos", "default", "lista", pedidoId);
      await updateDoc(ref, {
        ...dados,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erro ao atualizar pedido:", error);
      alert("Não foi possível atualizar o pedido agora.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function marcarFollowUp(p: Pedido) {
    await atualizarPedido(p.id, {
      followUpFeito: true,
      followUpAt: serverTimestamp(),
      statusInterno: "follow_up_feito",
      prioridade: p.prioridade === "urgente" ? "alta" : p.prioridade || "normal",
    } as Partial<Pedido>);
  }

  async function priorizarPedido(p: Pedido) {
    await atualizarPedido(p.id, {
      prioridade: "urgente",
      statusInterno: "prioridade_urgente",
    });
  }

  async function marcarVisualizado(p: Pedido) {
    await atualizarPedido(p.id, {
      visualizado: true,
      alertaNovoPedido: false,
      statusInterno: p.statusInterno === "novo_pedido" ? "visualizado" : p.statusInterno,
    });
  }

  const resumo = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const diaAtual = Math.max(1, agora.getDate());
    const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();

    const novos = pedidos.filter(isPedidoNovo);
    const aguardando = pedidos.filter((p) => p.status === "aguardando_pagamento");
    const parados = pedidos.filter((p) => isPendenteParado(p) || isPagoParado(p) || isEnviadoParado(p));
    const pagos = pedidos.filter((p) => p.status === "pago");
    const faturados = pedidos.filter(isFaturado);
    const enviados = pedidos.filter((p) => p.status === "enviado");
    const entregues = pedidos.filter((p) => p.status === "entregue");

    const pedidosMes = pedidos.filter((p) => {
      const data = normalizarData(p.createdAt);
      return data ? data.getTime() >= inicioMes.getTime() : false;
    });

    const faturamentoMes = pedidosMes.filter(isFaturado).reduce((acc, p) => acc + calcularTotal(p), 0);
    const previsaoMes = faturamentoMes > 0 ? (faturamentoMes / diaAtual) * diasNoMes : 0;
    const faturamento = faturados.reduce((acc, p) => acc + calcularTotal(p), 0);
    const potencialPendente = aguardando.reduce((acc, p) => acc + calcularTotal(p), 0);
    const ticketMedio = faturados.length > 0 ? faturamento / faturados.length : 0;
    const conversao = pedidos.length > 0 ? (faturados.length / pedidos.length) * 100 : 0;

    const pedidosOrdenadosPorPrioridade = [...pedidos].sort((a, b) => {
      const peso: Record<string, number> = { urgente: 4, alta: 3, normal: 2, baixa: 1 };
      const pa = peso[classificarPrioridade(a) || "normal"] || 0;
      const pb = peso[classificarPrioridade(b) || "normal"] || 0;
      if (pb !== pa) return pb - pa;
      return horasDesde(b.createdAt || b.updatedAt) - horasDesde(a.createdAt || a.updatedAt);
    });

    return {
      novos: novos.length,
      aguardando: aguardando.length,
      parados: parados.length,
      pagos: pagos.length,
      enviados: enviados.length,
      entregues: entregues.length,
      faturamento,
      faturamentoMes,
      previsaoMes,
      potencialPendente,
      totalGeral: pedidos.reduce((acc, p) => acc + calcularTotal(p), 0),
      ticketMedio,
      conversao,
      pedidoMaisAntigo: parados[0] || aguardando[0] || null,
      pedidosPrioritarios: pedidosOrdenadosPorPrioridade.slice(0, 5),
      pedidosParadosAtrasados: parados.slice(0, 5),
    };
  }, [pedidos]);

  const insights = useMemo<Insight[]>(() => {
    const lista: Insight[] = [];

    if (resumo.parados > 0) {
      lista.push({
        tipo: "critico",
        titulo: `${resumo.parados} pedido(s) precisam de atenção`,
        descricao: "Existem pedidos parados. Priorize follow-up, envio ou atualização de status.",
        acao: "Ver pedidos",
        href: "/crm/pedidos",
      });
    }

    if (resumo.aguardando > 0) {
      lista.push({
        tipo: "alerta",
        titulo: `${resumo.aguardando} pedido(s) aguardando pagamento`,
        descricao: "Clientes com Pix pendente podem receber lembrete pelo WhatsApp.",
        acao: "Abrir pedidos",
        href: "/crm/pedidos",
      });
    }

    if (resumo.previsaoMes > 0) {
      lista.push({
        tipo: "info",
        titulo: `Previsão do mês: ${formatBRL(resumo.previsaoMes)}`,
        descricao: "Estimativa calculada automaticamente com base no ritmo atual de faturamento.",
      });
    }

    if (resumo.conversao >= 50) {
      lista.push({
        tipo: "sucesso",
        titulo: `Conversão forte: ${resumo.conversao.toFixed(1)}%`,
        descricao: "A taxa de pedidos faturados está saudável. Vale reforçar os produtos campeões.",
      });
    }

    if (lista.length === 0) {
      lista.push({
        tipo: "sucesso",
        titulo: "CRM sem alertas críticos",
        descricao: "Pedidos, follow-ups e faturamento estão sob controle neste momento.",
      });
    }

    return lista;
  }, [resumo]);

  const pedidosTabela = resumo.pedidosParadosAtrasados.length
    ? resumo.pedidosParadosAtrasados
    : resumo.pedidosPrioritarios;

  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <main className="crmDashPage">
      <div className="crmDashShell">
        <section className="crmTopBar">
          <div className="crmTopBrand">
            <div className="crmDashKicker">Maison Noor</div>
            <h1>CRM • Dashboard</h1>
            <p>Visão inteligente dos pedidos, alertas, faturamento e automações do CRM em tempo real.</p>
          </div>

          <div className="crmTopActions">
            <span className="crmDashRealtime">● Tempo real ativo</span>
            <span className="crmDateBadge">📅 {hoje}</span>
            <span className="crmUserBadge">
              <b>A</b>
              <span>
                Admin
                <small>Administrador</small>
              </span>
            </span>
          </div>
        </section>

        <div className="crmHeroButtons">
          <Link href="/crm/pedidos" className="crmDashLinkPrimary">Ver pedidos</Link>
          <Link href="/crm/financeiro" className="crmDashLinkSoft">Financeiro</Link>
        </div>

        {erro ? <div className="crmDashAlert crmDashError">{erro}</div> : null}

        <section className="crmDashMetricsOneRow">
          <MetricCard icon="🔔" label="Novos pedidos" value={loading ? "..." : resumo.novos} hint="Ainda não visualizados" href="/crm/pedidos" active={resumo.novos > 0} />
          <MetricCard icon="⏳" label="Aguardando" value={loading ? "..." : resumo.aguardando} hint="Pix ou atendimento pendente" href="/crm/pedidos" active={resumo.aguardando > 0} />
          <MetricCard icon="⚠️" label="Parados" value={loading ? "..." : resumo.parados} hint="Follow-up prioritário" href="/crm/pedidos" danger={resumo.parados > 0} />
          <MetricCard icon="✅" label="Pagos" value={loading ? "..." : resumo.pagos} hint="Pedidos confirmados" href="/crm/pedidos" success={resumo.pagos > 0} />
          <MetricCard icon="💰" label="Faturamento (mês)" value={loading ? "..." : formatBRL(resumo.faturamentoMes)} hint="Pago, enviado ou entregue" active={resumo.faturamentoMes > 0} />
          <MetricCard icon="📈" label="Previsão (mês)" value={loading ? "..." : formatBRL(resumo.previsaoMes)} hint="Estimativa automática" active={resumo.previsaoMes > 0} />
          <MetricCard icon="🧾" label="Ticket médio" value={loading ? "..." : formatBRL(resumo.ticketMedio)} hint="Média dos pedidos faturados" />
          <MetricCard icon="🔥" label="Conversão" value={loading ? "..." : `${resumo.conversao.toFixed(1)}%`} hint="Pedidos faturados no CRM" success={resumo.conversao >= 50} />
        </section>

        {resumo.parados > 0 ? (
          <Link href="/crm/pedidos" className="crmDashAlert crmDashWarning">
            <strong>⚠️ {resumo.parados} pedido(s) parado(s) ou atrasado(s).</strong>
            <span>Clique para agir e priorizar follow-up.</span>
            <b>Ver agora →</b>
          </Link>
        ) : null}

        <section className="crmMainGrid">
          <div className="crmDashPanel crmTablePanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Pedidos parados / atrasados</div>
                <h2>Fila de ação</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">Ver todos</Link>
            </div>

            <div className="crmTableWrap">
              <table className="crmTable">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Tempo parado</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5}>Carregando pedidos...</td></tr>
                  ) : pedidosTabela.length === 0 ? (
                    <tr><td colSpan={5}>Nenhum pedido crítico agora.</td></tr>
                  ) : (
                    pedidosTabela.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>#{pedidoCodigo(p)}</strong>
                          <small>{normalizarData(p.createdAt)?.toLocaleString("pt-BR") || "—"}</small>
                        </td>
                        <td>{p.clienteNome || p.nome || "Cliente"}</td>
                        <td>
                          <span className={`crmDashStatus ${p.status || "rascunho"}`}>{statusLabel(p.status)}</span>
                          <small>{p.formaPagamento || "Pagamento"}</small>
                        </td>
                        <td>{Math.round(horasDesde(p.updatedAt || p.createdAt))}h</td>
                        <td>
                          <div className="crmTableActions">
                            <a href={whatsappPedido(p)} target="_blank" rel="noreferrer" className="crmIconBtn whatsapp" title="WhatsApp">☘</a>
                            <button type="button" className="crmIconBtn" disabled={salvandoId === p.id} onClick={() => marcarFollowUp(p)} title="Follow-up feito">☑</button>
                            <button type="button" className="crmIconBtn purple" disabled={salvandoId === p.id} onClick={() => priorizarPedido(p)} title="Priorizar">⚑</button>
                            {isPedidoNovo(p) ? (
                              <button type="button" className="crmIconBtn soft" disabled={salvandoId === p.id} onClick={() => marcarVisualizado(p)} title="Visualizado">👁</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crmDashPanel crmInsightsPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Insights inteligentes</div>
                <h2>O que agir agora</h2>
              </div>
              <Link href="/crm/pedidos" className="crmDashSmallLink">Ver todos</Link>
            </div>

            <div className="crmInsightList">
              {insights.map((item, index) => {
                const content = (
                  <>
                    <span className={`crmInsightIcon ${item.tipo}`}>{item.tipo === "critico" ? "⚠️" : item.tipo === "alerta" ? "🔔" : item.tipo === "sucesso" ? "⭐" : "📈"}</span>
                    <span className="crmInsightText">
                      <strong>{item.titulo}</strong>
                      <small>{item.descricao}</small>
                    </span>
                    <b>→</b>
                  </>
                );

                return item.href ? (
                  <Link key={index} href={item.href} className="crmInsightItem">{content}</Link>
                ) : (
                  <div key={index} className="crmInsightItem">{content}</div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="crmBottomGrid">
          <div className="crmDashPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Automações ativas</div>
                <h2>Motor do CRM</h2>
              </div>
              <span className="crmAutoTag">Configurar</span>
            </div>

            <div className="crmAutomationGrid">
              <AutomationItem text="Alertas de pedidos parados" />
              <AutomationItem text="Follow-up automático" />
              <AutomationItem text="Priorização inteligente" />
              <AutomationItem text="Status automático" />
            </div>
          </div>

          <div className="crmDashPanel">
            <div className="crmDashPanelHead compact">
              <div>
                <div className="crmDashPanelKicker">Ação rápida</div>
                <h2>Atalhos de produtividade</h2>
              </div>
            </div>

            <div className="crmQuickGrid">
              <Link href="/crm/pedidos" className="crmQuickAction"><b>☘</b><span>Enviar follow-up<small>WhatsApp</small></span></Link>
              <Link href="/crm/pedidos" className="crmQuickAction"><b>⚑</b><span>Priorizar pedidos<small>Fila inteligente</small></span></Link>
              <Link href="/crm/pedidos" className="crmQuickAction"><b>☑</b><span>Marcar como feito<small>Follow-up</small></span></Link>
              <Link href="/crm/pedidos" className="crmQuickAction"><b>👁</b><span>Ver todos pedidos<small>Lista completa</small></span></Link>
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .crmDashPage {
          padding: 14px 18px 18px;
          color: #f4f1eb;
        }

        .crmDashShell {
          width: 100%;
          max-width: 1320px;
          margin: 0 auto;
        }

        .crmTopBar,
        .crmDashPanel,
        .crmDashMetric,
        .crmDashAlert {
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.014));
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.22);
        }

        .crmTopBar {
          min-height: 74px;
          border-radius: 16px;
          padding: 14px 18px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 9px;
        }

        .crmTopBrand h1 {
          margin: 4px 0 4px;
          font-size: 24px;
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .crmTopBrand p,
        .crmDashPage p {
          margin: 0;
          color: rgba(244, 241, 235, 0.72);
          line-height: 1.32;
        }

        .crmDashKicker,
        .crmDashPanelKicker {
          color: rgba(200, 162, 106, 0.98);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .crmTopActions,
        .crmHeroButtons {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }

        .crmHeroButtons {
          margin: 8px 0 0;
        }

        .crmDashRealtime,
        .crmDateBadge,
        .crmUserBadge,
        .crmDashLinkPrimary,
        .crmDashLinkSoft {
          min-height: 30px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          font-size: 12px;
          font-weight: 950;
        }

        .crmDashRealtime {
          padding: 0 12px;
          color: #8dffb1;
          border: 1px solid rgba(87, 255, 149, 0.28);
          background: rgba(87, 255, 149, 0.08);
        }

        .crmDateBadge {
          padding: 0 12px;
          color: #f4f1eb;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.08);
        }

        .crmUserBadge {
          gap: 9px;
          color: #f4f1eb;
        }

        .crmUserBadge > b {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: linear-gradient(135deg, #347b70, #2c5b54);
        }

        .crmUserBadge span {
          display: grid;
          gap: 1px;
        }

        .crmUserBadge small {
          color: rgba(244, 241, 235, 0.58);
          font-weight: 700;
        }

        .crmDashLinkPrimary,
        .crmDashLinkSoft {
          padding: 0 13px;
          color: #f4f1eb;
        }

        .crmDashLinkPrimary {
          border: 1px solid rgba(200, 162, 106, 0.45);
          background: rgba(200, 162, 106, 0.14);
        }

        .crmDashLinkSoft {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
        }

        .crmDashMetricsOneRow {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 7px;
        }

        .crmDashMetric {
          min-height: 78px;
          border-radius: 12px;
          padding: 10px;
          color: inherit;
          text-decoration: none;
          position: relative;
          overflow: hidden;
          transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
        }

        .crmDashMetric:hover {
          transform: translateY(-2px);
          border-color: rgba(200, 162, 106, 0.42);
        }

        .crmDashMetric.crmDashMetricActive {
          border-color: rgba(255, 211, 120, 0.42);
          background: linear-gradient(180deg, rgba(255, 211, 120, 0.11), rgba(255, 255, 255, 0.014));
        }

        .crmDashMetric.crmDashMetricDanger {
          border-color: rgba(255, 132, 86, 0.45);
          background: linear-gradient(180deg, rgba(255, 132, 86, 0.12), rgba(255, 255, 255, 0.014));
        }

        .crmDashMetric.crmDashMetricSuccess {
          border-color: rgba(91, 255, 146, 0.24);
        }

        .crmDashMetricIcon {
          width: 27px;
          height: 27px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(200, 162, 106, 0.24);
          background: rgba(200, 162, 106, 0.1);
          margin-bottom: 7px;
          font-size: 12px;
        }

        .crmDashMetricLabel {
          display: block;
          color: rgba(244, 241, 235, 0.72);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          font-weight: 950;
          min-height: 16px;
        }

        .crmDashMetricValue {
          display: block;
          margin-top: 3px;
          color: #d8ad68;
          font-size: 16px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -0.03em;
          white-space: nowrap;
        }

        .crmDashMetricHint {
          display: block;
          margin-top: 5px;
          color: rgba(244, 241, 235, 0.58);
          font-size: 9px;
          line-height: 1.28;
        }

        .crmDashAlert {
          margin-top: 10px;
          padding: 10px 13px;
          border-radius: 12px;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 9px;
          color: #ffe1a5;
        }

        .crmDashAlert b {
          color: #d8ad68;
        }

        .crmDashWarning {
          border-color: rgba(255, 180, 80, 0.35);
          background: linear-gradient(180deg, rgba(255, 180, 80, 0.13), rgba(255, 180, 80, 0.05));
        }

        .crmDashError {
          color: #ffd0d0;
          border-color: rgba(255, 100, 100, 0.32);
          background: rgba(255, 100, 100, 0.08);
        }

        .crmMainGrid,
        .crmBottomGrid {
          display: grid;
          gap: 10px;
          margin-top: 10px;
        }

        .crmMainGrid {
          grid-template-columns: minmax(0, 1.28fr) minmax(360px, 0.72fr);
        }

        .crmBottomGrid {
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        }

        .crmDashPanel {
          border-radius: 14px;
          padding: 12px;
          overflow: hidden;
        }

        .crmDashPanelHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 9px;
          margin-bottom: 9px;
        }

        .crmDashPanelHead.compact h2,
        .crmDashPage h2 {
          margin: 5px 0 0;
          font-size: 16px;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .crmDashSmallLink,
        .crmAutoTag {
          color: #d8ad68;
          text-decoration: none;
          white-space: nowrap;
          border: 1px solid rgba(200, 162, 106, 0.24);
          background: rgba(200, 162, 106, 0.08);
          border-radius: 999px;
          padding: 6px 9px;
          font-size: 12px;
          font-weight: 950;
        }

        .crmTableWrap {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.18);
        }

        .crmTable {
          width: 100%;
          border-collapse: collapse;
          min-width: 680px;
        }

        .crmTable th,
        .crmTable td {
          padding: 7px 9px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.065);
          font-size: 12px;
        }

        .crmTable th {
          color: rgba(244, 241, 235, 0.62);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 9px;
          font-weight: 950;
        }

        .crmTable td {
          color: rgba(244, 241, 235, 0.78);
        }

        .crmTable tr:last-child td {
          border-bottom: 0;
        }

        .crmTable td strong {
          display: block;
          color: #d8ad68;
        }

        .crmTable small {
          display: block;
          margin-top: 3px;
          color: rgba(244, 241, 235, 0.58);
        }

        .crmDashStatus,
        .crmPriority {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 9px;
          font-weight: 950;
          text-transform: capitalize;
        }

        .crmDashStatus {
          color: #d8ad68;
          border: 1px solid rgba(200, 162, 106, 0.28);
          background: rgba(200, 162, 106, 0.08);
        }

        .crmDashStatus.pago,
        .crmDashStatus.enviado,
        .crmDashStatus.entregue {
          color: #9dffbd;
          border-color: rgba(91, 255, 146, 0.28);
          background: rgba(91, 255, 146, 0.08);
        }

        .crmDashStatus.aguardando_pagamento {
          color: #ffe1a5;
          border-color: rgba(255, 211, 120, 0.28);
          background: rgba(255, 211, 120, 0.08);
        }

        .crmTableActions {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .crmIconBtn {
          width: 26px;
          height: 26px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.055);
          color: #f4f1eb;
          display: inline-grid;
          place-items: center;
          text-decoration: none;
          cursor: pointer;
          font-size: 12px;
        }

        .crmIconBtn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .crmIconBtn.whatsapp {
          color: #9dffbd;
          border-color: rgba(91, 255, 146, 0.24);
          background: rgba(91, 255, 146, 0.08);
        }

        .crmIconBtn.purple {
          color: #d6b7ff;
          border-color: rgba(166, 116, 255, 0.24);
          background: rgba(166, 116, 255, 0.08);
        }

        .crmIconBtn.soft {
          color: #d8ad68;
          border-color: rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.07);
        }

        .crmInsightList {
          display: grid;
          gap: 7px;
        }

        .crmInsightItem {
          min-height: 52px;
          display: grid;
          grid-template-columns: 34px 1fr auto;
          align-items: center;
          gap: 7px;
          color: inherit;
          text-decoration: none;
          border-radius: 10px;
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
          transition: transform 0.16s ease, border-color 0.16s ease;
        }

        .crmInsightItem:hover {
          transform: translateY(-1px);
          border-color: rgba(200, 162, 106, 0.32);
        }

        .crmInsightIcon {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: rgba(200, 162, 106, 0.1);
          border: 1px solid rgba(200, 162, 106, 0.2);
        }

        .crmInsightText {
          display: grid;
          gap: 3px;
        }

        .crmInsightText strong {
          font-size: 12px;
        }

        .crmInsightText small {
          color: rgba(244, 241, 235, 0.58);
          line-height: 1.3;
        }

        .crmInsightItem b {
          color: rgba(244, 241, 235, 0.58);
        }

        .crmAutomationGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 12px;
          margin-top: 6px;
        }

        .crmAutomationItem {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          color: rgba(244, 241, 235, 0.76);
          font-size: 12px;
        }

        .crmAutomationItem b {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          color: #9dffbd;
          border: 1px solid rgba(91, 255, 146, 0.25);
          background: rgba(91, 255, 146, 0.08);
          font-size: 9px;
          flex: 0 0 auto;
        }

        .crmAutomationItem small {
          display: block;
          color: #80e6a2;
          margin-top: 2px;
        }

        .crmQuickGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
        }

        .crmQuickAction {
          min-height: 52px;
          color: inherit;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 7px;
          border-radius: 10px;
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.18);
        }

        .crmQuickAction b {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #d8ad68;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background: rgba(200, 162, 106, 0.08);
        }

        .crmQuickAction span {
          display: grid;
          font-size: 12px;
          font-weight: 950;
        }

        .crmQuickAction small {
          color: rgba(244, 241, 235, 0.55);
          font-size: 9px;
          font-weight: 700;
          margin-top: 2px;
        }

        @media (max-width: 1320px) {
          .crmDashMetricsOneRow {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .crmQuickGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 1080px) {
          .crmMainGrid,
          .crmBottomGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .crmDashPage {
            padding: 14px;
          }

          .crmTopBar {
            flex-direction: column;
            padding: 14px;
          }

          .crmTopBrand h1 {
            font-size: 23px;
          }

          .crmDashMetricsOneRow,
          .crmAutomationGrid,
          .crmQuickGrid {
            grid-template-columns: 1fr;
          }

          .crmDashAlert {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}

function AutomationItem({ text }: { text: string }) {
  return (
    <div className="crmAutomationItem">
      <b>✓</b>
      <span>
        {text}
        <small>Ativo</small>
      </span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  href,
  active,
  danger,
  success,
}: {
  icon: string;
  label: string;
  value: string | number;
  hint: string;
  href?: string;
  active?: boolean;
  danger?: boolean;
  success?: boolean;
}) {
  const className = `crmDashMetric ${active ? "crmDashMetricActive" : ""} ${
    danger ? "crmDashMetricDanger" : ""
  } ${success ? "crmDashMetricSuccess" : ""}`;

  const content = (
    <>
      <div className="crmDashMetricIcon">{icon}</div>
      <div>
        <span className="crmDashMetricLabel">{label}</span>
        <strong className="crmDashMetricValue">{value}</strong>
        <span className="crmDashMetricHint">{hint}</span>
      </div>
    </>
  );

  if (href) {
    return <Link href={href} className={className}>{content}</Link>;
  }

  return <div className={className}>{content}</div>;
}
