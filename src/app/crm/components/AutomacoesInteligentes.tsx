"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type PedidoStatus =
  | "rascunho"
  | "aguardando_pagamento"
  | "pago"
  | "enviado"
  | "entregue"
  | "cancelado";

type Pedido = {
  id: string;
  numeroPedido?: number | string;
  clienteNome?: string;
  nome?: string;
  total?: number;
  valorTotal?: number;
  status?: PedidoStatus | string;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
};

type Insight = {
  tipo: "critico" | "alerta" | "sucesso" | "info";
  titulo: string;
  descricao: string;
  acao?: string;
};

function dataPedido(valor: any): Date {
  if (!valor) return new Date(0);
  if (valor?.toDate) return valor.toDate();
  return new Date(valor);
}

function horasDesde(data: Date) {
  return (Date.now() - data.getTime()) / 1000 / 60 / 60;
}

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function AutomacoesInteligentes() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, "pedidos", "default", "lista");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Pedido[];

      setPedidos(lista);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const dados = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const pedidosMes = pedidos.filter(
      (p) => dataPedido(p.createdAt).getTime() >= inicioMes.getTime()
    );

    const pagos = pedidos.filter((p) => p.status === "pago");
    const aguardando = pedidos.filter((p) => p.status === "aguardando_pagamento");
    const enviados = pedidos.filter((p) => p.status === "enviado");

    const faturamentoPago = pagos.reduce(
      (acc, p) => acc + Number(p.total || p.valorTotal || 0),
      0
    );

    const faturamentoMes = pedidosMes
      .filter((p) => p.status === "pago" || p.status === "entregue")
      .reduce((acc, p) => acc + Number(p.total || p.valorTotal || 0), 0);

    const diasDoMes = new Date(
      agora.getFullYear(),
      agora.getMonth() + 1,
      0
    ).getDate();

    const diaAtual = Math.max(1, agora.getDate());
    const previsaoMes = (faturamentoMes / diaAtual) * diasDoMes;

    const pedidosParados = pedidos.filter((p) => {
      const dataBase = dataPedido(p.updatedAt || p.createdAt);
      const horas = horasDesde(dataBase);

      return (
        (p.status === "aguardando_pagamento" && horas >= 24) ||
        (p.status === "pago" && horas >= 24) ||
        (p.status === "enviado" && horas >= 72)
      );
    });

    const ticketMedio =
      pagos.length > 0 ? faturamentoPago / pagos.length : 0;

    const conversao =
      pedidos.length > 0 ? (pagos.length / pedidos.length) * 100 : 0;

    return {
      pedidosMes,
      pagos,
      aguardando,
      enviados,
      pedidosParados,
      faturamentoMes,
      previsaoMes,
      ticketMedio,
      conversao,
    };
  }, [pedidos]);

  const insights: Insight[] = useMemo(() => {
    const lista: Insight[] = [];

    if (dados.pedidosParados.length > 0) {
      lista.push({
        tipo: "critico",
        titulo: `${dados.pedidosParados.length} pedido(s) precisam de atenção`,
        descricao:
          "Existem pedidos parados por muito tempo. Recomendo priorizar follow-up ou atualização de status.",
        acao: "Verificar pedidos parados",
      });
    }

    if (dados.aguardando.length > 0) {
      lista.push({
        tipo: "alerta",
        titulo: `${dados.aguardando.length} pedido(s) aguardando pagamento`,
        descricao:
          "Clientes com Pix gerado ou pedido aberto podem receber uma mensagem de lembrete.",
        acao: "Enviar follow-up",
      });
    }

    if (dados.previsaoMes > dados.faturamentoMes) {
      lista.push({
        tipo: "info",
        titulo: `Previsão mensal: ${moeda(dados.previsaoMes)}`,
        descricao:
          "Com base no ritmo atual de vendas, esta é a estimativa de faturamento até o fim do mês.",
      });
    }

    if (dados.conversao >= 50) {
      lista.push({
        tipo: "sucesso",
        titulo: `Conversão forte: ${dados.conversao.toFixed(1)}%`,
        descricao:
          "A taxa de pedidos pagos está saudável. Vale reforçar os produtos mais vendidos.",
      });
    }

    if (lista.length === 0) {
      lista.push({
        tipo: "sucesso",
        titulo: "CRM funcionando sem alertas críticos",
        descricao:
          "Nenhum pedido parado ou problema relevante encontrado no momento.",
      });
    }

    return lista;
  }, [dados]);

  const badgeStyle = {
    critico: "bg-red-50 text-red-700 border-red-200",
    alerta: "bg-amber-50 text-amber-800 border-amber-200",
    sucesso: "bg-emerald-50 text-emerald-700 border-emerald-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <section className="w-full rounded-3xl border border-[#ead9b8] bg-[#fffaf1] p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b78a28]">
            Automação inteligente
          </p>
          <h2 className="text-xl font-bold text-[#2f2418]">
            Central de insights do CRM
          </h2>
        </div>

        <span className="rounded-full border border-[#d6b56d] bg-white px-4 py-2 text-xs font-semibold text-[#9a741f]">
          Tempo real Firestore
        </span>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-5 text-sm text-[#8b7355]">
          Carregando automações...
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <KpiCard
              titulo="Pedidos parados"
              valor={String(dados.pedidosParados.length)}
              detalhe="Precisam de ação"
            />
            <KpiCard
              titulo="Aguardando Pix"
              valor={String(dados.aguardando.length)}
              detalhe="Follow-up recomendado"
            />
            <KpiCard
              titulo="Ticket médio"
              valor={moeda(dados.ticketMedio)}
              detalhe="Pedidos pagos"
            />
            <KpiCard
              titulo="Previsão mês"
              valor={moeda(dados.previsaoMes)}
              detalhe="Estimativa automática"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {insights.map((item, index) => (
              <div
                key={index}
                className={`rounded-2xl border bg-white p-4 ${badgeStyle[item.tipo]}`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-bold">{item.titulo}</h3>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold uppercase">
                    {item.tipo}
                  </span>
                </div>

                <p className="text-sm leading-relaxed">{item.descricao}</p>

                {item.acao && (
                  <button className="mt-3 rounded-full bg-[#2f2418] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90">
                    {item.acao}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function KpiCard({
  titulo,
  valor,
  detalhe,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
}) {
  return (
    <div className="rounded-2xl border border-[#ead9b8] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#b78a28]">
        {titulo}
      </p>
      <strong className="mt-2 block text-2xl font-black text-[#2f2418]">
        {valor}
      </strong>
      <span className="mt-1 block text-xs text-[#8b7355]">{detalhe}</span>
    </div>
  );
}