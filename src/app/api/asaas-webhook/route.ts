import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusPorEvento(evento: string) {
  switch (evento) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "pago";

    case "PAYMENT_AWAITING_RISK_ANALYSIS":
      return "em_analise";

    case "PAYMENT_OVERDUE":
      return "vencido";

    case "PAYMENT_DELETED":
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
      return "cancelado";

    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED":
      return "aguardando_pagamento";

    default:
      return null;
  }
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

    const db = admin.apps.length ? admin.firestore() : null;

    if (!db) {
      return NextResponse.json({
        ok: false,
        mensagem: "Firebase Admin não inicializado.",
      });
    }

    const evento = String(body?.event || "");
    const payment = body?.payment;

    if (!evento || !payment) {
      return NextResponse.json({
        ok: true,
        mensagem: "Payload ignorado. Evento ou payment ausente.",
      });
    }

    const novoStatus = statusPorEvento(evento);

    if (!novoStatus) {
      return NextResponse.json({
        ok: true,
        mensagem: `Evento ${evento} ignorado.`,
      });
    }

    const asaasPaymentId = String(payment?.id || "");
    const externalReference = String(payment?.externalReference || "").trim();
    const billingType = String(payment?.billingType || "");
    const formaPagamento = formaPagamentoPorBillingType(billingType);

    if (!externalReference && !asaasPaymentId) {
      return NextResponse.json({
        ok: true,
        mensagem: "Webhook sem externalReference e sem paymentId.",
      });
    }

    const pedidosRef = db.collection("pedidos").doc("default").collection("lista");

    let pedidoDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    if (externalReference) {
      const snapNumero = await pedidosRef
        .where("numeroPedido", "==", externalReference)
        .limit(1)
        .get();

      if (!snapNumero.empty) pedidoDoc = snapNumero.docs[0];
    }

    if (!pedidoDoc && externalReference) {
      const snapNumeroSite = await pedidosRef
        .where("numeroSite", "==", externalReference)
        .limit(1)
        .get();

      if (!snapNumeroSite.empty) pedidoDoc = snapNumeroSite.docs[0];
    }

    if (!pedidoDoc && asaasPaymentId) {
      const snapAsaas = await pedidosRef
        .where("asaasPaymentId", "==", asaasPaymentId)
        .limit(1)
        .get();

      if (!snapAsaas.empty) pedidoDoc = snapAsaas.docs[0];
    }

    if (!pedidoDoc) {
      await db.collection("asaas_webhooks_nao_encontrados").add({
        evento,
        externalReference,
        asaasPaymentId,
        billingType,
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

    const updateData: any = {
      status: novoStatus,
      statusPagamento: novoStatus,
      pagamentoStatus: novoStatus,
      formaPagamento,
      billingType,
      asaasPaymentId,
      asaasStatus: payment?.status || "",
      asaasEvento: evento,
      asaasUltimoWebhook: payment,
      asaasWebhookBody: body,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: new Date().toISOString(),
    };

    if (novoStatus === "pago") {
      updateData.pagoEm = admin.firestore.FieldValue.serverTimestamp();
      updateData.dataPagamento = new Date().toISOString();
    }

    await pedidoDoc.ref.set(updateData, { merge: true });

    return NextResponse.json({
      ok: true,
      mensagem: "Webhook Asaas processado com sucesso.",
      pedidoId: pedidoDoc.id,
      externalReference,
      asaasPaymentId,
      status: novoStatus,
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