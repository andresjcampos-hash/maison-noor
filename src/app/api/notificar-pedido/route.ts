import { NextResponse } from "next/server";
import { Resend } from "resend";

function formatBRL(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
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

    const cliente = pedido.clienteNome || "Cliente do site";
    const telefone = pedido.telefone || "";
    const telefoneDigits = onlyDigits(telefone);
    const whatsappLink = telefoneDigits
      ? `https://wa.me/55${telefoneDigits}`
      : "https://www.maisonnoor.com.br/crm/pedidos";

    const numero =
      pedido.numeroPedido ||
      pedido.numeroSite ||
      pedido.numero ||
      pedido.id ||
      "Novo pedido";

    const total = pedido.total || pedido.valorTotal || 0;

    const itens = Array.isArray(pedido.itens)
      ? pedido.itens
          .map((item: any) => {
            const nome = item.nome || "Produto";
            const qtd = item.qtd || item.quantidade || 1;
            const preco = item.preco || item.precoUnitario || 0;

            return `
              <tr>
                <td style="padding:14px 12px;border-bottom:1px solid #eee;color:#222;">
                  ${nome}
                </td>
                <td style="padding:14px 12px;border-bottom:1px solid #eee;text-align:center;color:#222;">
                  ${qtd}
                </td>
                <td style="padding:14px 12px;border-bottom:1px solid #eee;text-align:right;color:#222;font-weight:700;">
                  ${formatBRL(preco)}
                </td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="3" style="padding:14px;border-bottom:1px solid #eee;">
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
      subject: `🛍️ Novo Pedido Maison Noor - ${cliente}`,
      html: `
        <div style="margin:0;padding:0;background:#fcf2e5;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:720px;margin:0 auto;padding:32px 18px;">

            <div style="text-align:center;margin-bottom:22px;">
              <img 
                src="https://www.maisonnoor.com.br/logo.png" 
                alt="Maison Noor" 
                style="width:82px;height:82px;object-fit:contain;border-radius:999px;margin-bottom:10px;"
              />
              <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#1f1a14;">
                MAISON NOOR
              </div>
              <div style="font-size:12px;letter-spacing:3px;color:#b8914b;margin-top:4px;">
                PARFUMS
              </div>
            </div>

            <div style="background:#ffffff;border:1px solid #d6b06a;border-radius:24px;overflow:hidden;box-shadow:0 12px 35px rgba(0,0,0,0.08);">
              
              <div style="background:linear-gradient(135deg,#1f1a14,#3a2c1b);padding:26px 28px;color:#fff;">
                <div style="font-size:13px;letter-spacing:2px;color:#d6b06a;font-weight:700;">
                  NOVO PEDIDO RECEBIDO
                </div>
                <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;">
                  Pedido #${numero}
                </h1>
                <p style="margin:10px 0 0;color:#f5ead8;font-size:14px;">
                  Um novo pedido foi criado no site e está aguardando aprovação no CRM.
                </p>
              </div>

              <div style="padding:26px 28px;">
                <div style="background:#faf7ef;border:1px solid #ead8b8;border-radius:18px;padding:18px;margin-bottom:22px;">
                  <p style="margin:0 0 10px;"><b>Cliente:</b> ${cliente}</p>
                  <p style="margin:0 0 10px;"><b>Telefone:</b> ${
                    telefone || "Não informado"
                  }</p>
                  <p style="margin:0 0 10px;"><b>Status:</b> ${
                    pedido.status || "aguardando_pagamento"
                  }</p>
                  <p style="margin:0 0 10px;"><b>Forma:</b> ${
                    pedido.formaPagamento || "Não informado"
                  }</p>
                  <p style="margin:14px 0 0;font-size:24px;font-weight:900;color:#1f1a14;">
                    Total: ${formatBRL(total)}
                  </p>
                </div>

                <h2 style="font-size:18px;margin:0 0 12px;color:#1f1a14;">
                  Itens do pedido
                </h2>

                <table style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #eee;border-radius:16px;overflow:hidden;margin-bottom:26px;">
                  <thead>
                    <tr style="background:#1f1a14;color:#fff;">
                      <th style="padding:13px 12px;text-align:left;">Produto</th>
                      <th style="padding:13px 12px;text-align:center;">Qtd</th>
                      <th style="padding:13px 12px;text-align:right;">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itens}
                  </tbody>
                </table>

                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                  <a href="https://www.maisonnoor.com.br/crm/pedidos"
                    style="background:#1f1a14;color:#fff;padding:14px 20px;border-radius:14px;text-decoration:none;font-weight:800;display:inline-block;">
                    Abrir CRM Pedidos
                  </a>

                  <a href="${whatsappLink}"
                    style="background:#d6b06a;color:#1f1a14;padding:14px 20px;border-radius:14px;text-decoration:none;font-weight:800;display:inline-block;">
                    Chamar no WhatsApp
                  </a>
                </div>
              </div>

              <div style="background:#faf7ef;border-top:1px solid #ead8b8;padding:18px 28px;text-align:center;">
                <p style="margin:0;color:#7b6a52;font-size:12px;line-height:1.5;">
                  Maison Noor Parfums • Perfumes Árabes Premium<br/>
                  Alerta automático gerado pelo site oficial.
                </p>
              </div>
            </div>

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