import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGBANK_API_URL =
  process.env.PAGBANK_ENV === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

function limparCpf(cpf: unknown) {
  return String(cpf || "").replace(/\D/g, "");
}

function extrairMensagemErro(data: any) {
  return (
    data?.error_messages?.[0]?.description ||
    data?.errors?.[0]?.description ||
    data?.message ||
    "Erro ao gerar Pix no PagBank."
  );
}

export async function POST(req: Request) {
  try {
    const token = process.env.PAGBANK_TOKEN;

    if (!token) {
      return NextResponse.json(
        { erro: true, mensagem: "PAGBANK_TOKEN não configurado." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const valor = Math.round(Number(body.total || 0) * 100);
    const cpf = limparCpf(body.cpf);

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { erro: true, mensagem: "Valor inválido para gerar Pix." },
        { status: 400 }
      );
    }

    if (!cpf || cpf.length !== 11) {
      return NextResponse.json(
        {
          erro: true,
          mensagem:
            "CPF inválido. Informe um CPF com 11 dígitos para gerar o Pix.",
        },
        { status: 400 }
      );
    }

    const numeroPedido = body.numeroPedido || `pedido-${Date.now()}`;

    const payload: any = {
      reference_id: numeroPedido,

      customer: {
        name: body.nome || "Cliente Maison Noor",
        email: body.email || "cliente@maisonnoor.com.br",
        tax_id: cpf,
      },

      items: [
        {
          reference_id: numeroPedido,
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
    };

    if (process.env.PAGBANK_ENV === "production") {
      payload.notification_urls = [
        "https://www.maisonnoor.com.br/api/pagbank-webhook",
      ];
    }

    console.log("PIX PAGBANK PAYLOAD:", JSON.stringify(payload, null, 2));

    const res = await fetch(`${PAGBANK_API_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("ERRO PAGBANK PIX:", JSON.stringify(data, null, 2));

      return NextResponse.json(
        {
          erro: true,
          mensagem: extrairMensagemErro(data),
          status: res.status,
          detalhes: data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro PIX PagBank:", error);

    return NextResponse.json(
      { erro: true, mensagem: "Erro interno ao gerar PIX." },
      { status: 500 }
    );
  }
}