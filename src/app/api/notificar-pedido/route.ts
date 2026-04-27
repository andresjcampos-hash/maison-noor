import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatBRL(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export async function POST(req: Request) {
  try {
    const pedido = await req.json();

    await resend.emails.send({
      from: "Maison Noor <onboarding@resend.dev>",
      to: [
        "maison.noor.parfums@gmail.com",
        "andre_lbatista@outlook.com",
      ],
      subject: `🛍️ Novo Pedido Maison Noor`,
      html: `
        <h2>Novo Pedido Recebido</h2>
        <p><b>Cliente:</b> ${pedido.clienteNome || "Cliente do site"}</p>
        <p><b>Total:</b> ${formatBRL(pedido.total || pedido.valorTotal || 0)}</p>
        <p><b>Status:</b> ${pedido.status || "aguardando_pagamento"}</p>
        <p><b>Forma:</b> ${pedido.formaPagamento || "Não informado"}</p>
        <br/>
        <a href="https://www.maisonnoor.com.br/crm/pedidos">
          Abrir CRM
        </a>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false });
  }
}