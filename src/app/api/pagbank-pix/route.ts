import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const token = process.env.PAGBANK_TOKEN;

    const body = await req.json();

    const valor = Math.round(Number(body.total || 0) * 100);

    // 🔥 CONTROLE AUTOMÁTICO DE AMBIENTE
    const PAGBANK_API_URL =
      process.env.PAGBANK_ENV === "production"
        ? "https://api.pagseguro.com"
        : "https://sandbox.api.pagseguro.com";

    const res = await fetch(`${PAGBANK_API_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reference_id: body.numeroPedido || `pedido-${Date.now()}`,

        customer: {
          name: body.nome || "Cliente Maison Noor",
          email: body.email || "cliente@email.com",
          tax_id: body.cpf || "12345678909",
        },

        items: [
          {
            name: body.produto || "Pedido Maison Noor",
            quantity: 1,
            unit_amount: valor,
          },
        ],

        qr_codes: [
          {
            amount: {
              value: valor,
            },
          },
        ],

        // 🔥 WEBHOOK ATIVADO
        notification_urls: [
          "https://www.maisonnoor.com.br/api/pagbank-webhook",
        ],
      }),
    });

    const data = await res.json();

    return NextResponse.json(data);
  } catch (error) {
    console.log(error);

    return NextResponse.json(
      { erro: true, mensagem: "Erro ao gerar PIX" },
      { status: 500 }
    );
  }
}