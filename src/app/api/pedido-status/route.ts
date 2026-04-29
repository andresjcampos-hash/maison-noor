import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    // 🔥 BLOQUEIO TOTAL DE FIREBASE NO BUILD
    if (!admin.apps.length) {
      return NextResponse.json({
        ok: false,
        mensagem: "Firebase não inicializado (build/local).",
      });
    }

    const db = admin.firestore();

    const { searchParams } = new URL(req.url);
    const numeroPedido = searchParams.get("numeroPedido");

    if (!numeroPedido) {
      return NextResponse.json(
        { ok: false, mensagem: "numeroPedido não informado" },
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
        { ok: false, mensagem: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    const pedido = snapshot.docs[0].data();

    return NextResponse.json({
      ok: true,
      status: pedido.status,
      pagamentoStatus: pedido.pagamentoStatus,
    });
  } catch (error: any) {
    console.error("ERRO PEDIDO STATUS:", error);

    return NextResponse.json(
      {
        ok: false,
        mensagem: "Erro ao consultar pedido",
        erro: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}