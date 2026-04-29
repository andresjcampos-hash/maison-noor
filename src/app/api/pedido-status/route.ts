import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const db = admin.firestore();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const numeroPedido = searchParams.get("numeroPedido");

    if (!numeroPedido) {
      return NextResponse.json(
        { ok: false, mensagem: "numeroPedido não informado." },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          ok: false,
          mensagem: "Pedido não encontrado.",
          numeroPedido,
        },
        { status: 404 }
      );
    }

    const pedido = snapshot.docs[0].data();

    return NextResponse.json({
      ok: true,
      numeroPedido,
      status: pedido.status || pedido.pagamentoStatus || "aguardando_pagamento",
      pagamentoStatus:
        pedido.pagamentoStatus || pedido.status || "aguardando_pagamento",
      formaPagamento: pedido.formaPagamento || null,
      atualizadoEm: pedido.atualizadoEm || null,
    });
  } catch (error: any) {
    console.error("Erro ao consultar status do pedido:", error);

    return NextResponse.json(
      {
        ok: false,
        mensagem: "Erro interno ao consultar status do pedido.",
        erro: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}