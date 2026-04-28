import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const token = process.env.PAGBANK_TOKEN;

    const body = await req.json();

    const valor = Math.round(Number(body.total || 0) * 100);

    const res = await fetch("https://sandbox.api.pagseguro.com/orders", {
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