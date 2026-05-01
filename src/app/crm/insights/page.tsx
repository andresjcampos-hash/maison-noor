"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

type PedidoItem = { nome?: string; qtd?: number; preco?: number; produtoId?: string };
type Pedido = {
  id: string;
  clienteNome?: string;
  telefone?: string;
  status?: string;
  itens?: PedidoItem[];
  desconto?: number;
  frete?: number;
  total?: number;
  valor?: number;
  valorTotal?: number;
  createdAt?: string;
  updatedAt?: string;
};
type Produto = { id: string; nome?: string; estoque?: number; precoVenda?: number; ativo?: boolean; updatedAt?: string };

function formatBRL(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function digits(v?: string) { return String(v || "").replace(/\D/g, ""); }
function totalPedido(p: Pedido) {
  const direto = Number(p.total || p.valorTotal || p.valor || 0);
  if (direto > 0) return direto;
  const subtotal = (p.itens || []).reduce((acc, it) => acc + Number(it.preco || 0) * Number(it.qtd || 0), 0);
  return Math.max(0, subtotal - Number(p.desconto || 0) + Number(p.frete || 0));
}
function isFaturado(p: Pedido) { return ["pago", "enviado", "entregue"].includes(String(p.status)); }
function horasDesde(iso?: string) {
  if (!iso) return 0;
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return 0;
  return (Date.now() - d) / 36e5;
}

export default function CrmInsightsPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  useEffect(() => {
    const pedidosRef = collection(db, "pedidos", "default", "lista");
    const produtosRef = collection(db, "produtos", "default", "lista");

    const unsubPedidos = onSnapshot(query(pedidosRef, orderBy("createdAt", "desc")), (snap) => {
      setPedidos(snap.docs.map((d) => ({ ...(d.data() as Pedido), id: d.id })));
    });

    const unsubProdutos = onSnapshot(produtosRef, (snap) => {
      setProdutos(snap.docs.map((d) => ({ ...(d.data() as Produto), id: d.id })));
    });

    return () => {
      unsubPedidos();
      unsubProdutos();
    };
  }, []);

  const dados = useMemo(() => {
    const faturados = pedidos.filter(isFaturado);
    const faturamento = faturados.reduce((acc, p) => acc + totalPedido(p), 0);
    const ticketMedio = faturados.length ? faturamento / faturados.length : 0;

    const pendentes = pedidos.filter((p) => p.status === "aguardando_pagamento");
    const potencialPendente = pendentes.reduce((acc, p) => acc + totalPedido(p), 0);
    const parados48 = pendentes.filter((p) => horasDesde(p.createdAt || p.updatedAt) >= 48);

    const clientesMap = new Map<string, { nome: string; telefone: string; compras: number; total: number }>();
    faturados.forEach((p) => {
      const key = digits(p.telefone) || String(p.clienteNome || "").toLowerCase();
      if (!key) return;
      const atual = clientesMap.get(key) || { nome: p.clienteNome || "Cliente", telefone: p.telefone || "", compras: 0, total: 0 };
      atual.compras += 1;
      atual.total += totalPedido(p);
      clientesMap.set(key, atual);
    });

    const topClientes = Array.from(clientesMap.values()).sort((a, b) => b.total - a.total).slice(0, 6);

    const perfumesMap = new Map<string, { nome: string; qtd: number; total: number }>();
    faturados.forEach((p) => {
      (p.itens || []).forEach((it) => {
        const nome = String(it.nome || "Produto").trim();
        const qtd = Math.max(1, Number(it.qtd || 1));
        const total = Number(it.preco || 0) * qtd;
        const atual = perfumesMap.get(nome) || { nome, qtd: 0, total: 0 };
        atual.qtd += qtd;
        atual.total += total;
        perfumesMap.set(nome, atual);
      });
    });

    const topPerfumes = Array.from(perfumesMap.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 8);
    const estoqueBaixo = produtos.filter((p) => p.ativo !== false && Number(p.estoque || 0) <= 3).sort((a, b) => Number(a.estoque || 0) - Number(b.estoque || 0));

    return { faturamento, ticketMedio, potencialPendente, parados48, topClientes, topPerfumes, estoqueBaixo };
  }, [pedidos, produtos]);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <div className="kicker">Maison Noor</div>
          <h1>CRM • Insights</h1>
          <p>Área separada para inteligência do negócio: clientes, perfumes, estoque e oportunidades.</p>
        </div>
        <div className="actions">
          <span className="realtime">● Tempo real ativo</span>
          <Link href="/crm" className="btn">Dashboard</Link>
          <Link href="/crm/pedidos" className="btnPrimary">Ver pedidos</Link>
        </div>
      </header>

      <section className="stats">
        <div className="stat"><span>💰 Faturamento</span><strong>{formatBRL(dados.faturamento)}</strong><small>Pago, enviado ou entregue</small></div>
        <div className="stat"><span>📈 Ticket médio</span><strong>{formatBRL(dados.ticketMedio)}</strong><small>Pedidos faturados</small></div>
        <div className="stat"><span>⏳ Potencial pendente</span><strong>{formatBRL(dados.potencialPendente)}</strong><small>Se aguardando pagar</small></div>
        <div className="stat danger"><span>🚨 Parados 48h+</span><strong>{dados.parados48.length}</strong><small>Follow-up urgente</small></div>
      </section>

      <section className="grid">
        <Panel title="Top clientes" kicker="Recorrência" link="/crm/clientes-vip">
          {dados.topClientes.length ? dados.topClientes.map((c, i) => (
            <div className="row" key={`${c.telefone}_${i}`}>
              <div><strong>{i + 1}. {c.nome}</strong><p>{c.compras} compra(s) • {c.telefone || "sem telefone"}</p></div>
              <b>{formatBRL(c.total)}</b>
            </div>
          )) : <Empty text="Ainda não há clientes com pedidos faturados." />}
        </Panel>

        <Panel title="Perfumes mais vendidos" kicker="Ranking" link="/crm/produtos">
          {dados.topPerfumes.length ? dados.topPerfumes.map((p, i) => (
            <div className="row" key={p.nome}>
              <div><strong>{i + 1}. {p.nome}</strong><p>{p.qtd} unidade(s) vendida(s)</p></div>
              <b>{formatBRL(p.total)}</b>
            </div>
          )) : <Empty text="Ainda não há ranking de perfumes." />}
        </Panel>

        <Panel title="Estoque inteligente" kicker="Reposição" link="/crm/produtos">
          {dados.estoqueBaixo.length ? dados.estoqueBaixo.slice(0, 10).map((p) => (
            <div className="row dangerRow" key={p.id}>
              <div><strong>{p.nome || "Produto"}</strong><p>{Number(p.estoque || 0) <= 0 ? "Produto zerado" : "Estoque baixo"}</p></div>
              <b>{Number(p.estoque || 0)} un.</b>
            </div>
          )) : <Empty text="Nenhum produto com estoque baixo." />}
        </Panel>

        <Panel title="Ações recomendadas" kicker="IA operacional" link="/crm/pedidos">
          {dados.parados48.length > 0 ? <Insight tone="danger" text={`${dados.parados48.length} pedido(s) estão parados há mais de 48h. Priorize contato ou cancelamento.`} /> : null}
          {dados.potencialPendente > 0 ? <Insight text={`${formatBRL(dados.potencialPendente)} em pedidos aguardando pagamento.`} /> : null}
          {dados.estoqueBaixo.length > 0 ? <Insight tone="danger" text={`${dados.estoqueBaixo.length} produto(s) com estoque baixo ou zerado.`} /> : null}
          {!dados.parados48.length && !dados.potencialPendente && !dados.estoqueBaixo.length ? <Empty text="Nenhuma ação crítica no momento." /> : null}
        </Panel>
      </section>

      <style jsx>{`
        .page { padding: 24px; color: #f7f0e6; }
        .hero, .panel, .stat { border: 1px solid rgba(200,162,106,.18); background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015)); box-shadow: 0 18px 40px rgba(0,0,0,.22); }
        .hero { border-radius: 22px; padding: 22px; display: flex; justify-content: space-between; gap: 18px; flex-wrap: wrap; align-items: flex-end; max-width: 1180px; }
        .kicker { color: rgba(200,162,106,.98); text-transform: uppercase; letter-spacing: .16em; font-size: 12px; font-weight: 900; }
        h1 { margin: 8px 0 0; font-size: 32px; line-height: 1.05; }
        h2 { margin: 8px 0 0; font-size: 21px; }
        p { margin: 10px 0 0; opacity: .78; line-height: 1.55; }
        .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .btn, .btnPrimary { text-decoration: none; color: #fff; border-radius: 14px; padding: 13px 16px; font-weight: 900; border: 1px solid rgba(200,162,106,.32); background: rgba(200,162,106,.08); }
        .btnPrimary { background: linear-gradient(180deg, rgba(200,162,106,.22), rgba(200,162,106,.09)); }
        .realtime { color: #8dffbd; background: rgba(40,190,105,.12); border: 1px solid rgba(40,190,105,.45); border-radius: 999px; padding: 11px 14px; font-weight: 900; }
        .stats { max-width: 1180px; margin-top: 16px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
        .stat { border-radius: 20px; padding: 18px; }
        .stat span { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; font-weight: 900; opacity: .88; }
        .stat strong { display: block; margin-top: 12px; font-size: 25px; color: #d9ad68; }
        .stat small { display: block; margin-top: 8px; opacity: .72; }
        .danger { border-color: rgba(255,120,90,.38); background: rgba(255,120,90,.06); }
        .grid { max-width: 1180px; margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .panel { border-radius: 22px; padding: 18px; min-height: 310px; }
        .panelHead { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
        .panelHead a { color: #d9ad68; text-decoration: none; font-weight: 900; }
        .row { display: flex; justify-content: space-between; gap: 12px; align-items: center; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18); border-radius: 16px; padding: 13px; margin-top: 10px; }
        .row p { font-size: 13px; margin-top: 5px; }
        .row b { color: #d9ad68; white-space: nowrap; }
        .dangerRow { border-color: rgba(255,120,90,.22); }
        .insight { border: 1px solid rgba(85,160,255,.24); background: rgba(85,160,255,.08); border-radius: 16px; padding: 14px; margin-top: 10px; line-height: 1.5; }
        .insight.dangerTone { border-color: rgba(255,120,90,.3); background: rgba(255,120,90,.08); }
        .empty { opacity: .72; padding: 14px; border: 1px dashed rgba(255,255,255,.14); border-radius: 14px; margin-top: 10px; }
        @media (max-width: 980px) { .stats, .grid { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}

function Panel({ title, kicker, link, children }: { title: string; kicker: string; link: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panelHead">
        <div><div className="kicker">{kicker}</div><h2>{title}</h2></div>
        <Link href={link}>Abrir →</Link>
      </div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function Insight({ text, tone }: { text: string; tone?: "danger" }) { return <div className={tone === "danger" ? "insight dangerTone" : "insight"}>{text}</div>; }
