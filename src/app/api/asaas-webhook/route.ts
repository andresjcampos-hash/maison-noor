import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StatusPedido =
  | "pago"
  | "recusado"
  | "em_analise"
  | "vencido"
  | "aguardando_pagamento";

function statusPorEvento(evento: string, statusAsaas?: string): StatusPedido {
  const eventoUpper = String(evento || "").toUpperCase();
  const statusUpper = String(statusAsaas || "").toUpperCase();

  if (
    eventoUpper.includes("CONFIRMED") ||
    eventoUpper.includes("RECEIVED") ||
    statusUpper === "CONFIRMED" ||
    statusUpper === "RECEIVED" ||
    statusUpper === "RECEIVED_IN_CASH"
  ) {
    return "pago";
  }

  if (
    eventoUpper.includes("REFUSED") ||
    eventoUpper.includes("REFUNDED") ||
    eventoUpper.includes("DELETED") ||
    eventoUpper.includes("CANCELLED") ||
    eventoUpper.includes("FAILED") ||
    eventoUpper.includes("CHARGEBACK") ||
    statusUpper === "REFUSED" ||
    statusUpper === "REFUNDED" ||
    statusUpper === "CANCELLED" ||
    statusUpper === "FAILED" ||
    statusUpper === "CHARGEBACK_REQUESTED" ||
    statusUpper === "CHARGEBACK_DISPUTE" ||
    statusUpper === "AWAITING_CHARGEBACK_REVERSAL"
  ) {
    return "recusado";
  }

  if (
    eventoUpper.includes("AWAITING_RISK_ANALYSIS") ||
    statusUpper === "AWAITING_RISK_ANALYSIS"
  ) {
    return "em_analise";
  }

  if (eventoUpper.includes("OVERDUE") || statusUpper === "OVERDUE") {
    return "vencido";
  }

  return "aguardando_pagamento";
}

function formaPagamentoPorBillingType(billingType?: string) {
  const tipo = String(billingType || "").toUpperCase();

  if (tipo === "CREDIT_CARD") return "cartao";
  if (tipo === "PIX") return "pix";
  if (tipo === "BOLETO") return "boleto";

  return "asaas";
}

function numero(valor: any) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
}

function quantidadeItem(item: any) {
  return Math.max(1, Number(item?.qtd || item?.quantidade || item?.quantity || 1));
}

function produtoIdItem(item: any) {
  return String(item?.produtoId || item?.productId || item?.id || "").trim();
}

function nomeItem(item: any) {
  return String(item?.nome || item?.name || item?.titulo || item?.title || "Produto").trim();
}

function totalPedido(pedido: any, payment: any) {
  return (
    numero(pedido?.total) ||
    numero(pedido?.valorTotal) ||
    numero(pedido?.valor) ||
    numero(pedido?.totalPedido) ||
    numero(pedido?.totalGeral) ||
    numero(payment?.value) ||
    numero(payment?.netValue)
  );
}

async function encontrarPedido({
  externalReference,
  asaasPaymentId,
}: {
  externalReference: string;
  asaasPaymentId: string;
}) {
  if (!adminDb) return null;

  const pedidosRef = adminDb
    .collection("pedidos")
    .doc("default")
    .collection("lista");

  if (externalReference) {
    const porNumeroPedido = await pedidosRef
      .where("numeroPedido", "==", externalReference)
      .limit(1)
      .get();

    if (!porNumeroPedido.empty) return porNumeroPedido.docs[0];

    const porNumeroSite = await pedidosRef
      .where("numeroSite", "==", externalReference)
      .limit(1)
      .get();

    if (!porNumeroSite.empty) return porNumeroSite.docs[0];

    const porCodigo = await pedidosRef
      .where("codigoPedido", "==", externalReference)
      .limit(1)
      .get();

    if (!porCodigo.empty) return porCodigo.docs[0];
  }

  if (asaasPaymentId) {
    const porAsaas = await pedidosRef
      .where("asaasPaymentId", "==", asaasPaymentId)
      .limit(1)
      .get();

    if (!porAsaas.empty) return porAsaas.docs[0];
  }

  return null;
}

async function baixarEstoqueSeNecessario(pedidoDoc: any, pedidoAtual: any) {
  if (!adminDb) return { baixado: false, motivo: "Firebase Admin não inicializado" };

  if (pedidoAtual?.estoqueBaixado === true) {
    return { baixado: false, motivo: "Estoque já baixado anteriormente" };
  }

  const itens = Array.isArray(pedidoAtual?.itens)
    ? pedidoAtual.itens
    : Array.isArray(pedidoAtual?.items)
      ? pedidoAtual.items
      : [];

  if (!itens.length) {
    await pedidoDoc.ref.set(
      {
        estoqueBaixado: false,
        estoqueStatus: "sem_itens",
        estoqueAtualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { baixado: false, motivo: "Pedido sem itens" };
  }

  const batch = adminDb.batch();
  const movimentacoes: any[] = [];
  const semProdutoId: any[] = [];

  for (const item of itens) {
    const produtoId = produtoIdItem(item);
    const qtd = quantidadeItem(item);

    if (!produtoId) {
      semProdutoId.push({ nome: nomeItem(item), qtd });
      continue;
    }

    const produtoRef = adminDb.collection("products").doc(produtoId);

    batch.set(
      produtoRef,
      {
        estoque: admin.firestore.FieldValue.increment(-qtd),
        estoqueAtualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    movimentacoes.push({
      produtoId,
      nome: nomeItem(item),
      qtd,
      tipo: "saida",
      origem: "webhook_asaas",
    });
  }

  if (movimentacoes.length) {
    await batch.commit();
  }

  await pedidoDoc.ref.set(
    {
      estoqueBaixado: movimentacoes.length > 0,
      estoqueStatus: movimentacoes.length > 0 ? "baixado" : "sem_produto_id",
      estoqueMovimentacoes: movimentacoes,
      estoqueItensSemProdutoId: semProdutoId,
      estoqueAtualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    baixado: movimentacoes.length > 0,
    movimentacoes,
    semProdutoId,
  };
}

async function criarFinanceiroSeNecessario({
  pedidoDoc,
  pedidoAtual,
  payment,
  formaPagamento,
  asaasPaymentId,
}: {
  pedidoDoc: any;
  pedidoAtual: any;
  payment: any;
  formaPagamento: string;
  asaasPaymentId: string;
}) {
  if (!adminDb) return { criado: false, motivo: "Firebase Admin não inicializado" };

  const financeiroId = `asaas_${asaasPaymentId || pedidoDoc.id}`;
  const financeiroRef = adminDb
    .collection("financeiro")
    .doc("default")
    .collection("lancamentos")
    .doc(financeiroId);

  const jaExiste = await financeiroRef.get();

  if (jaExiste.exists) {
    return { criado: false, motivo: "Lançamento financeiro já existe", id: financeiroId };
  }

  const agora = new Date();
  const dataIso = agora.toISOString();
  const competencia = dataIso.slice(0, 7);
  const valor = totalPedido(pedidoAtual, payment);
  const numeroPedido = String(pedidoAtual?.numeroPedido || pedidoAtual?.numeroSite || payment?.externalReference || "");

  await financeiroRef.set(
    {
      id: financeiroId,
      tipo: "receita",
      natureza: "receita",
      categoria: "Venda",
      descricao: `Venda • Pedido #${numeroPedido || pedidoDoc.id}`,
      valor,
      formaPagamento,
      forma: formaPagamento,
      status: "pago",
      origem: "asaas_webhook",
      pedidoId: pedidoDoc.id,
      numeroPedido,
      asaasPaymentId,
      asaasStatus: payment?.status || "",
      clienteNome: pedidoAtual?.clienteNome || pedidoAtual?.nome || "Cliente Maison Noor",
      clienteEmail: pedidoAtual?.clienteEmail || pedidoAtual?.email || "",
      data: dataIso,
      dataPagamento: dataIso,
      competencia,
      createdAt: dataIso,
      updatedAt: dataIso,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { criado: true, id: financeiroId, valor };
}

async function enviarEmailConfirmacaoSePossivel({
  pedidoDoc,
  pedidoAtual,
  payment,
  formaPagamento,
}: {
  pedidoDoc: any;
  pedidoAtual: any;
  payment: any;
  formaPagamento: string;
}) {
  try {
    if (pedidoAtual?.emailConfirmacaoPagamentoEnviado === true) {
      return { enviado: false, motivo: "E-mail já enviado anteriormente" };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` ||
      process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
      "";

    if (!baseUrl) {
      return { enviado: false, motivo: "NEXT_PUBLIC_SITE_URL/VERCEL_URL não configurada" };
    }

    const numeroPedido = String(pedidoAtual?.numeroPedido || pedidoAtual?.numeroSite || payment?.externalReference || "");
    const valor = totalPedido(pedidoAtual, payment);

    const response = await fetch(`${baseUrl}/api/notificar-pedido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...pedidoAtual,
        id: pedidoDoc.id,
        numeroPedido,
        formaPagamento,
        status: "pago",
        statusPagamento: "pago",
        pagamentoStatus: "pago",
        total: valor,
        valor,
        valorTotal: valor,
        origemNotificacao: "asaas_webhook_pagamento_confirmado",
        assunto: `Pagamento confirmado • Pedido #${numeroPedido}`,
      }),
    });

    if (!response.ok) {
      const texto = await response.text().catch(() => "");
      console.warn("E-mail de confirmação não enviado:", texto);
      return { enviado: false, motivo: texto || `HTTP ${response.status}` };
    }

    await pedidoDoc.ref.set(
      {
        emailConfirmacaoPagamentoEnviado: true,
        emailConfirmacaoPagamentoEnviadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { enviado: true };
  } catch (error: any) {
    console.error("Erro ao enviar e-mail de confirmação:", error);
    return { enviado: false, motivo: error?.message || String(error) };
  }
}

async function registrarWebhookNaoEncontrado(dados: any) {
  if (!adminDb) return;

  await adminDb.collection("asaas_webhooks_nao_encontrados").add({
    ...dados,
    recebidoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("ASAAS WEBHOOK RECEBIDO:", JSON.stringify(body, null, 2));

    if (!adminDb) {
      return NextResponse.json(
        {
          ok: false,
          mensagem: "Firebase Admin não inicializado.",
        },
        { status: 500 }
      );
    }

    const evento = String(body?.event || "");
    const payment = body?.payment;

    if (!evento || !payment) {
      return NextResponse.json({
        ok: true,
        mensagem: "Webhook ignorado: evento ou pagamento ausente.",
      });
    }

    const asaasPaymentId = String(payment?.id || "");
    const externalReference = String(payment?.externalReference || "").trim();
    const billingType = String(payment?.billingType || "");
    const asaasStatus = String(payment?.status || "");
    const formaPagamento = formaPagamentoPorBillingType(billingType);
    const novoStatus = statusPorEvento(evento, asaasStatus);

    const pedidoDoc = await encontrarPedido({ externalReference, asaasPaymentId });

    if (!pedidoDoc) {
      await registrarWebhookNaoEncontrado({
        evento,
        externalReference,
        asaasPaymentId,
        billingType,
        asaasStatus,
        formaPagamento,
        payment,
        body,
      });

      return NextResponse.json({
        ok: true,
        mensagem: "Pedido não encontrado. Webhook salvo para análise.",
        externalReference,
        asaasPaymentId,
      });
    }

    const pedidoAtual = pedidoDoc.data() || {};
    const statusAtual = String(pedidoAtual?.status || "");

    // Proteção: não rebaixa pedido já pago para aguardando por evento atrasado.
    const statusFinal =
      statusAtual === "pago" && novoStatus === "aguardando_pagamento"
        ? "pago"
        : novoStatus;

    const updateData: any = {
      status: statusFinal,
      statusPagamento: statusFinal,
      pagamentoStatus: statusFinal,
      formaPagamento,
      billingType,
      asaasPaymentId,
      asaasStatus,
      asaasEvento: evento,
      asaasUltimoWebhook: payment,
      asaasWebhookBody: body,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: new Date().toISOString(),
    };

    if (statusFinal === "pago") {
      updateData.pagoEm = admin.firestore.FieldValue.serverTimestamp();
      updateData.dataPagamento = new Date().toISOString();
    }

    if (statusFinal === "recusado") {
      updateData.recusadoEm = admin.firestore.FieldValue.serverTimestamp();
      updateData.motivoRecusa =
        payment?.description ||
        payment?.statusDescription ||
        "Pagamento recusado pelo Asaas/banco.";
    }

    await pedidoDoc.ref.set(updateData, { merge: true });

    let estoqueResultado: any = null;
    let financeiroResultado: any = null;
    let emailResultado: any = null;

    if (statusFinal === "pago") {
      const pedidoAtualizado = {
        ...pedidoAtual,
        ...updateData,
      };

      estoqueResultado = await baixarEstoqueSeNecessario(pedidoDoc, pedidoAtualizado);

      financeiroResultado = await criarFinanceiroSeNecessario({
        pedidoDoc,
        pedidoAtual: pedidoAtualizado,
        payment,
        formaPagamento,
        asaasPaymentId,
      });

      emailResultado = await enviarEmailConfirmacaoSePossivel({
        pedidoDoc,
        pedidoAtual: pedidoAtualizado,
        payment,
        formaPagamento,
      });

      await pedidoDoc.ref.set(
        {
          automacaoPagamento: {
            estoque: estoqueResultado,
            financeiro: financeiroResultado,
            email: emailResultado,
            processadoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    }

    console.log("ASAAS WEBHOOK PEDIDO ATUALIZADO:", {
      pedidoId: pedidoDoc.id,
      numeroPedido: pedidoAtual?.numeroPedido,
      evento,
      asaasStatus,
      statusFinal,
      formaPagamento,
      asaasPaymentId,
      estoqueResultado,
      financeiroResultado,
      emailResultado,
    });

    return NextResponse.json({
      ok: true,
      mensagem: "Webhook Asaas processado com sucesso.",
      pedidoId: pedidoDoc.id,
      externalReference,
      asaasPaymentId,
      status: statusFinal,
      formaPagamento,
      automacao: {
        estoque: estoqueResultado,
        financeiro: financeiroResultado,
        email: emailResultado,
      },
    });
  } catch (error: any) {
    console.error("ERRO WEBHOOK ASAAS:", error);

    return NextResponse.json(
      {
        ok: false,
        mensagem: "Erro interno capturado no webhook Asaas.",
        erro: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    mensagem: "Webhook Asaas ativo.",
  });
}
