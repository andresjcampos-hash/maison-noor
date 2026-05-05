import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ASAAS_API_URL =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function limparCpf(cpf: unknown) {
  return String(cpf || "").replace(/\D/g, "");
}

function getAsaasToken() {
  return String(
    process.env.ASAAS_API_KEY_PROD ||
      process.env.ASAAS_API_KEY ||
      process.env.ASAAS_TOKEN ||
      ""
  ).trim();
}

function extrairMensagemErro(data: any) {
  return (
    data?.errors?.[0]?.description ||
    data?.error_messages?.[0]?.description ||
    data?.error ||
    data?.message ||
    "Erro ao gerar Pix no Asaas."
  );
}

export async function POST(req: Request) {
  try {
    const token = getAsaasToken();

    if (!token) {
      return NextResponse.json(
        {
          erro: true,
          mensagem:
            "Chave Asaas não configurada. Configure ASAAS_API_KEY_PROD, ASAAS_API_KEY ou ASAAS_TOKEN.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();

    const valor = Number(body.total || body.valor || 0);
    const cpf = limparCpf(body.cpf || body.cpfCnpj);

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { erro: true, mensagem: "Valor inválido para gerar Pix." },
        { status: 400 }
      );
    }

    if (!cpf || cpf.length !== 11) {
      return NextResponse.json(
        { erro: true, mensagem: "CPF inválido. Informe 11 dígitos." },
        { status: 400 }
      );
    }

    const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
      method: "POST",
      headers: {
        access_token: token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: body.nome || "Cliente Maison Noor",
        email: body.email || "cliente@maisonnoor.com.br",
        cpfCnpj: cpf,
      }),
    });

    const customerData = await customerRes.json().catch(() => null);

    if (!customerRes.ok) {
      return NextResponse.json(
        {
          erro: true,
          mensagem: extrairMensagemErro(customerData),
          detalhes: customerData,
        },
        { status: customerRes.status }
      );
    }

    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: {
        access_token: token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customer: customerData.id,
        billingType: "PIX",
        value: valor,
        dueDate: hojeISO(),
        description: body.produto || "Pedido Maison Noor",
        externalReference: body.numeroPedido || `pedido-${Date.now()}`,
        fine: { value: 0 },
        interest: { value: 0 },
      }),
    });

    const paymentData = await paymentRes.json().catch(() => null);

    if (!paymentRes.ok) {
      return NextResponse.json(
        {
          erro: true,
          mensagem: extrairMensagemErro(paymentData),
          detalhes: paymentData,
        },
        { status: paymentRes.status }
      );
    }

    const qrRes = await fetch(
      `${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`,
      {
        method: "GET",
        headers: {
          access_token: token,
          accept: "application/json",
        },
      }
    );

    const qrData = await qrRes.json().catch(() => null);

    if (!qrRes.ok) {
      return NextResponse.json(
        {
          erro: true,
          mensagem: extrairMensagemErro(qrData),
          detalhes: qrData,
          payment: paymentData,
        },
        { status: qrRes.status }
      );
    }

    return NextResponse.json({
      id: paymentData.id,
      reference_id: paymentData.externalReference,
      status: paymentData.status,
      provider: "asaas",
      qr_codes: [
        {
          text: qrData.payload,
          amount: {
            value: Math.round(valor * 100),
          },
          links: [
            {
              rel: "QRCODE.PNG",
              href: `data:image/png;base64,${qrData.encodedImage}`,
            },
          ],
        },
      ],
      copia: qrData.payload,
      qr: `data:image/png;base64,${qrData.encodedImage}`,
      qrCode: `data:image/png;base64,${qrData.encodedImage}`,
      copiaECola: qrData.payload,
      codigoPix: qrData.payload,
      textoPix: qrData.payload,
      payment: paymentData,
    });
  } catch (error) {
    console.error("Erro PIX Asaas:", error);

    return NextResponse.json(
      { erro: true, mensagem: "Erro interno ao gerar Pix no Asaas." },
      { status: 500 }
    );
  }
}