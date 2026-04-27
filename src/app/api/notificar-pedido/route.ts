import { NextResponse } from "next/server";
import { Resend } from "resend";

function formatBRL(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export async function POST(req: Request) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const pedido = await req.json();

    const itens = Array.isArray(pedido.itens)
      ? pedido.itens
          .map(
            (item: any) =>
              `<li>${item.nome || "Produto"} × ${item.qtd || item.quantidade || 1}</li>`
          )
          .join("")
      : "<li>Itens não informados</li>";

    await resend.emails.send({
      from: "Maison Noor <onboarding@resend.dev>",
      to: [
        "andresjcampos@gmail.com",
        "maison.noor.parfums@gmail.com",
        "andre_lbatista@outlook.com",
      ],
      subject: `🛍️ Novo Pedido Maison Noor - ${pedido.clienteNome || "Cliente"}`,
      html: `
        <div style="font-family: Arial, sans-serif; background:#fcf2e5; padding:24px;">
          <div style="max-width:620px; margin:auto; background:white; border-radius:18px; padding:24px; border:1px solid #d6b06a;">
            <h2 style="margin:0 0 16px;">🛍️ Novo Pedido Recebido</h2>

            <p><b>Cliente:</b> ${pedido.clienteNome || "Cliente do site"}</p>
            <p><b>Telefone:</b> ${pedido.telefone || "Não informado"}</p>
            <p><b>Total:</b> ${formatBRL(pedido.total || pedido.valorTotal || 0)}</p>
            <p><b>Status:</b> ${pedido.status || "aguardando_pagamento"}</p>
            <p><b>Forma:</b> ${pedido.formaPagamento || "Não informado"}</p>

            <h3>Itens</h3>
            <ul>${itens}</ul>

            <br />

            <a href="https://www.maisonnoor.com.br/crm/pedidos"
              style="background:#111; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
              Abrir CRM
            </a>

            <p style="margin-top:24px; font-size:12px; color:#777;">
              Maison Noor Parfums • Alerta automático do site
            </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Erro ao enviar e-mail:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}