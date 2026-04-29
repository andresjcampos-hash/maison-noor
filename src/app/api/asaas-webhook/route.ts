import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusPorEvento(evento: string) {
  switch (evento) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "pago";

    case "PAYMENT_OVERDUE":
      return "vencido";

    case "PAYMENT_DELETED":
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
      return "cancelado";

    case "PAYMENT_CREATED":
      return "aguardando_pagamento";

    default:
      return null;
  }
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

    const evento = body?.event;
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

    if (!externalReference && !asaasPaymentId) {
      return NextResponse.json({
        ok: true,
        mensagem: "Webhook sem externalReference e sem paymentId.",
      });
    }

    const pedidosRef = db
      .collection("pedidos")
      .doc("default")
      .collection("lista");

    let pedidoDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    if (externalReference) {
      const snapNumero = await pedidosRef
        .where("numeroPedido", "==", externalReference)
        .limit(1)
        .get();

      if (!snapNumero.empty) pedidoDoc = snapNumero.docs[0];
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
        payment,
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
      pagamentoStatus: novoStatus,
      formaPagamento: "Pix Asaas",
      asaasPaymentId,
      asaasEvento: evento,
      asaasUltimoWebhook: payment,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (novoStatus === "pago") {
      updateData.pagoEm = admin.firestore.FieldValue.serverTimestamp();
    }

    await pedidoDoc.ref.update(updateData);

    return NextResponse.json({
      ok: true,
      mensagem: "Webhook Asaas processado com sucesso.",
      pedidoId: pedidoDoc.id,
      externalReference,
      asaasPaymentId,
      status: novoStatus,
    });
  } catch (error: any) {
    console.error("ERRO WEBHOOK ASAAS:", error);

    return NextResponse.json({
      ok: false,
      mensagem: "Erro interno capturado no webhook Asaas.",
      erro: error?.message || String(error),
    });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    mensagem: "Webhook Asaas ativo.",
  });
}