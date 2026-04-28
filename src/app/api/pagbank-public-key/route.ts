import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGBANK_API_URL =
  process.env.PAGBANK_ENV === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";

export async function GET() {
  try {
    const token = process.env.PAGBANK_TOKEN;

    if (!token) {
      return NextResponse.json(
        { erro: true, mensagem: "PAGBANK_TOKEN não configurado." },
        { status: 500 }
      );
    }

    const res = await fetch(`${PAGBANK_API_URL}/public-keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "card",
      }),
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          erro: true,
          mensagem: "Erro ao gerar chave pública PagBank.",
          status: res.status,
          detalhes: data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro public-key PagBank:", error);

    return NextResponse.json(
      { erro: true, mensagem: "Erro interno ao gerar public key." },
      { status: 500 }
    );
  }
}