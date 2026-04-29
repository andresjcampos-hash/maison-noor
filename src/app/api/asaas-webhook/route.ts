import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const db = admin.firestore();

function statusPorEvento(evento: string) {
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

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const evento = body?.event;
    const payment = body?.payment;

    if (!evento || !payment) {
      return NextResponse.json({ ok: true, mensagem: "Payload ignorado." });
    }

    const numeroPedido = payment.externalReference || "";
    const asaasPaymentId = payment.id || "";

    // Eventos como PAYMENT_CREATED não devem quebrar nem atualizar como pago
    const novoStatus = statusPorEvento(evento);

    if (!novoStatus) {
      return NextResponse.json({
        ok: true,
        mensagem: `Evento ${evento} recebido e ignorado.`,
        pedido: numeroPedido,
      });
    }

    if (!numeroPedido) {
      return NextResponse.json({
        ok: true,
        mensagem: "Webhook recebido sem externalReference.",
      });
    }

    const pedidosRef = db
      .collection("pedidos")
      .doc("default")
      .collection("lista");

    const snapshot = await pedidosRef
      .where("numeroPedido", "==", numeroPedido)
      .limit(1)
      .get();

    if (snapshot.empty) {
      await db.collection("asaas_webhooks_nao_encontrados").add({
        evento,
        numeroPedido,
        asaasPaymentId,
        payment,
        recebidoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        ok: true,
        mensagem: "Pedido não encontrado. Webhook salvo para análise.",
        pedido: numeroPedido,
      });
    }

    const pedidoDoc = snapshot.docs[0];

    await pedidoDoc.ref.update({
      status: novoStatus,
      pagamentoStatus: novoStatus,
      formaPagamento: "Pix Asaas",
      asaasPaymentId,
      asaasEvento: evento,
      asaasUltimoWebhook: payment,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      mensagem: "Webhook Asaas processado com sucesso.",
      pedido: numeroPedido,
      status: novoStatus,
    });
  } catch (error: any) {
    console.error("Erro webhook Asaas:", error);

    return NextResponse.json(
      {
        ok: false,
        mensagem: "Erro interno no webhook Asaas.",
        erro: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}