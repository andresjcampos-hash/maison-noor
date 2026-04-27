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
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY ausente" },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const pedido = await req.json();

    const itens = Array.isArray(pedido.itens)
      ? pedido.itens
          .map((item: any) => {
            const nome = item.nome || "Produto";
            const qtd = item.qtd || item.quantidade || 1;
            const preco = item.preco || item.precoUnitario || 0;

            return `
              <tr>
                <td style="padding:10px;border-bottom:1px solid #eee;">${nome}</td>
                <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${qtd}</td>
                <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatBRL(preco)}</td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="3" style="padding:10px;border-bottom:1px solid #eee;">
            Itens não informados
          </td>
        </tr>
      `;

    await resend.emails.send({
      from: "Maison Noor Pedidos <pedidos@maisonnoor.com.br>",
      to: [
        "andresjcampos@gmail.com",
        "maison.noor.parfums@gmail.com",
        "andre_lbatista@outlook.com",
      ],
      replyTo: "maison.noor.parfums@gmail.com",
      subject: `🛍️ Novo Pedido Maison Noor - ${
        pedido.clienteNome || "Cliente do site"
      }`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#fcf2e5;padding:28px;">
          <div style="max-width:680px;margin:auto;background:#fff;border-radius:20px;padding:28px;border:1px solid #d6b06a;">
            <h2 style="margin:0 0 8px;color:#111;">🛍️ Novo Pedido Recebido</h2>
            <p style="margin:0 0 22px;color:#666;">
              Um novo pedido foi criado no site Maison Noor e está aguardando aprovação no CRM.
            </p>

            <div style="background:#faf7ef;border:1px solid #ead8b8;border-radius:14px;padding:16px;margin-bottom:18px;">
              <p><b>Cliente:</b> ${pedido.clienteNome || "Cliente do site"}</p>
              <p><b>Telefone:</b> ${pedido.telefone || "Não informado"}</p>
              <p><b>Total:</b> ${formatBRL(pedido.total || pedido.valorTotal || 0)}</p>
              <p><b>Status:</b> ${pedido.status || "aguardando_pagamento"}</p>
              <p><b>Forma:</b> ${pedido.formaPagamento || "Não informado"}</p>
            </div>

            <h3 style="margin:18px 0 10px;color:#111;">Itens do pedido</h3>

            <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:12px;overflow:hidden;">
              <thead>
                <tr style="background:#111;color:#fff;">
                  <th style="padding:10px;text-align:left;">Produto</th>
                  <th style="padding:10px;text-align:center;">Qtd</th>
                  <th style="padding:10px;text-align:right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${itens}
              </tbody>
            </table>

            <div style="margin-top:26px;">
              <a href="https://www.maisonnoor.com.br/crm/pedidos"
                style="background:#111;color:#fff;padding:13px 20px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;">
                Abrir CRM Pedidos
              </a>
            </div>

            <p style="margin-top:26px;font-size:12px;color:#777;">
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