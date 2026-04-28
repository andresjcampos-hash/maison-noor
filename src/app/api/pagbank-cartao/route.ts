import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGBANK_API_URL =
  process.env.PAGBANK_ENV === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.maisonnoor.com.br";

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
    const parcelas = Math.min(Math.max(Number(body.installments || 1), 1), 3);
    const cpf = String(body.cpf || "").replace(/\D/g, "");

    if (!body.encryptedCard) {
      return NextResponse.json(
        { erro: true, mensagem: "Cartão criptografado não informado." },
        { status: 400 }
      );
    }

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { erro: true, mensagem: "Valor inválido para pagamento." },
        { status: 400 }
      );
    }

    const numeroPedido = body.numeroPedido || `pedido-${Date.now()}`;

    const payload = {
      reference_id: numeroPedido,

      customer: {
        name: body.nome || "Cliente Maison Noor",
        email: body.email || "cliente@maisonnoor.com.br",
        tax_id: cpf || "12345678909",
      },

      items: [
        {
          reference_id: numeroPedido,
          name: body.produto || "Pedido Maison Noor",
          quantity: 1,
          unit_amount: valor,
        },
      ],

      charges: [
        {
          reference_id: numeroPedido,
          description: body.produto || "Pedido Maison Noor",
          amount: {
            value: valor,
            currency: "BRL",
          },
          payment_method: {
            type: "CREDIT_CARD",
            installments: parcelas,
            capture: true,
            card: {
              encrypted: body.encryptedCard,
              store: false,
            },
          },
        },
      ],

      notification_urls: [`${SITE_URL}/api/pagbank-webhook`],
    };

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
      return NextResponse.json(
        {
          erro: true,
          mensagem: "Erro ao processar pagamento com cartão no PagBank.",
          status: res.status,
          detalhes: data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro cartão PagBank:", error);

    return NextResponse.json(
      { erro: true, mensagem: "Erro interno ao processar cartão." },
      { status: 500 }
    );
  }
} 