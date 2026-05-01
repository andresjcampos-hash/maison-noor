import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusPorEvento(evento: string, statusAsaas?: string) {
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
    statusUpper === "REFUSED" ||
    statusUpper === "REFUNDED" ||
    statusUpper === "CANCELLED"
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

    const pedidosRef = adminDb
      .collection("pedidos")
      .doc("default")
      .collection("lista");

    let pedidoDoc: any = null;

    if (externalReference) {
      const snap = await pedidosRef
        .where("numeroPedido", "==", externalReference)
        .limit(1)
        .get();

      if (!snap.empty) pedidoDoc = snap.docs[0];
    }

    if (!pedidoDoc && externalReference) {
      const snap = await pedidosRef
        .where("numeroSite", "==", externalReference)
        .limit(1)
        .get();

      if (!snap.empty) pedidoDoc = snap.docs[0];
    }

    if (!pedidoDoc && asaasPaymentId) {
      const snap = await pedidosRef
        .where("asaasPaymentId", "==", asaasPaymentId)
        .limit(1)
        .get();

      if (!snap.empty) pedidoDoc = snap.docs[0];
    }

    if (!pedidoDoc) {
      await adminDb.collection("asaas_webhooks_nao_encontrados").add({
        evento,
        externalReference,
        asaasPaymentId,
        billingType,
        asaasStatus,
        formaPagamento,
        payment,
        body,
        recebidoEm: admin.firestore.FieldValue.serverTimestamp(),
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

    console.log("ASAAS WEBHOOK PEDIDO ATUALIZADO:", {
      pedidoId: pedidoDoc.id,
      numeroPedido: pedidoAtual?.numeroPedido,
      evento,
      asaasStatus,
      statusFinal,
      formaPagamento,
      asaasPaymentId,
    });

    return NextResponse.json({
      ok: true,
      mensagem: "Webhook Asaas processado com sucesso.",
      pedidoId: pedidoDoc.id,
      externalReference,
      asaasPaymentId,
      status: statusFinal,
      formaPagamento,
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