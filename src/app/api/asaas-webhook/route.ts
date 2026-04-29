import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const db = admin.firestore();

function normalizarStatus(evento: string) {
  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
    return "pago";
  }

  if (evento === "PAYMENT_OVERDUE") {
    return "vencido";
  }

  if (
    evento === "PAYMENT_DELETED" ||
    evento === "PAYMENT_REFUNDED" ||
    evento === "PAYMENT_PARTIALLY_REFUNDED"
  ) {
    return "cancelado";
  }

  return "aguardando_pagamento";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const evento = body?.event;
    const payment = body?.payment;

    if (!evento || !payment) {
      return NextResponse.json(
        { ok: false, mensagem: "Payload inválido." },
        { status: 400 }
      );
    }

    const numeroPedido =
      payment.externalReference ||
      payment.external_reference ||
      payment.description ||
      "";

    const asaasPaymentId = payment.id;
    const status = normalizarStatus(evento);

    if (!numeroPedido) {
      return NextResponse.json(
        { ok: false, mensagem: "Pedido sem externalReference." },
        { status: 200 }
      );
    }

    const pedidosRef = db.collection("pedidos").doc("default").collection("lista");

    const query = await pedidosRef
      .where("numeroPedido", "==", numeroPedido)
      .limit(1)
      .get();

    if (query.empty) {
      await db.collection("asaas_webhooks_nao_encontrados").add({
        evento,
        numeroPedido,
        asaasPaymentId,
        payment,
        recebidoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        ok: true,
        mensagem: "Pedido não encontrado, webhook salvo para análise.",
      });
    }

    const pedidoDoc = query.docs[0];

    await pedidoDoc.ref.update({
      status,
      pagamentoStatus: status,
      formaPagamento: "Pix Asaas",
      asaasPaymentId,
      asaasEvento: evento,
      asaasUltimoWebhook: payment,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      mensagem: "Webhook Asaas processado.",
      pedido: numeroPedido,
      status,
    });
  } catch (error) {
    console.error("Erro webhook Asaas:", error);

    return NextResponse.json(
      { ok: false, mensagem: "Erro interno no webhook Asaas." },
      { status: 500 }
    );
  }
}