import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const PAGBANK_API_URL =
  process.env.PAGBANK_ENV === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

function normalizarStatus(status: string) {
  const s = String(status || "").toUpperCase();

  if (s === "PAID") return "pago";
  if (s === "DECLINED") return "cancelado";
  if (s === "CANCELED") return "cancelado";
  if (s === "WAITING") return "aguardando_pagamento";
  if (s === "IN_ANALYSIS") return "em_analise";

  return "aguardando_pagamento";
}

async function buscarPedidoPagBank(orderId: string) {
  const token = process.env.PAGBANK_TOKEN;

  if (!token) {
    throw new Error("PAGBANK_TOKEN não configurado.");
  }

  const response = await fetch(`${PAGBANK_API_URL}/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro ao consultar PagBank: ${response.status} - ${text}`);
  }

  return response.json();
}

async function registrarFinanceiroSePago(params: {
  pedidoId: string;
  numeroPedido: string;
  total: number;
}) {
  const financeiroRef = db
    .collection("financeiro")
    .doc("default")
    .collection("lancamentos")
    .doc(`pedido_${params.pedidoId}`);

  const financeiroSnap = await financeiroRef.get();

  if (financeiroSnap.exists) return;

  const hoje = new Date();
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  await financeiroRef.set({
    id: `pedido_${params.pedidoId}`,
    tipo: "receita",
    descricao: `Venda • Pedido #${params.numeroPedido}`,
    valor: params.total,
    formaPagamento: "Pix PagBank",
    categoria: "Venda",
    origem: "checkout_site",
    pedidoId: params.pedidoId,
    numeroPedido: params.numeroPedido,
    competencia,
    data: hoje.toISOString(),
    createdAt: hoje.toISOString(),
    updatedAt: hoje.toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("Webhook PagBank recebido:", JSON.stringify(body, null, 2));

    const orderId =
      body?.id ||
      body?.order_id ||
      body?.reference_id ||
      body?.data?.id ||
      body?.data?.order_id;

    if (!orderId) {
      return NextResponse.json(
        { ok: false, message: "Webhook sem orderId." },
        { status: 400 }
      );
    }

    const pedidoPagBank = await buscarPedidoPagBank(orderId);

    const referenceId = String(pedidoPagBank?.reference_id || "");
    const charge = pedidoPagBank?.charges?.[0];
    const statusPagBank = String(charge?.status || "");
    const statusInterno = normalizarStatus(statusPagBank);

    const numeroPedido =
      referenceId ||
      String(pedidoPagBank?.id || orderId);

    const pedidosRef = db.collection("pedidos").doc("default").collection("lista");

    const querySnapshot = await pedidosRef
      .where("numeroPedido", "==", numeroPedido)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      console.warn("Pedido não encontrado no CRM:", numeroPedido);

      return NextResponse.json({
        ok: true,
        message: "Webhook recebido, mas pedido não encontrado no CRM.",
        numeroPedido,
        statusPagBank,
      });
    }

    const pedidoDoc = querySnapshot.docs[0];
    const pedidoId = pedidoDoc.id;
    const pedidoAtual = pedidoDoc.data();

    const total =
      Number(pedidoAtual?.total || pedidoAtual?.valorTotal || pedidoAtual?.pixTotal || 0);

    await pedidoDoc.ref.set(
      {
        status: statusInterno,
        statusPagamento: statusInterno === "pago" ? "pago" : statusInterno,
        pagbankOrderId: pedidoPagBank?.id || orderId,
        pagbankStatus: statusPagBank,
        pagbankWebhookUltimoPayload: body,
        pagbankUltimaConsulta: pedidoPagBank,
        pagoEm:
          statusInterno === "pago"
            ? new Date().toISOString()
            : pedidoAtual?.pagoEm || null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    if (statusInterno === "pago") {
      await registrarFinanceiroSePago({
        pedidoId,
        numeroPedido,
        total,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Webhook processado com sucesso.",
      pedidoId,
      numeroPedido,
      statusPagBank,
      statusInterno,
    });
  } catch (error: any) {
    console.error("Erro no webhook PagBank:", error);

    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Erro ao processar webhook PagBank.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Webhook PagBank Maison Noor ativo.",
  });
}