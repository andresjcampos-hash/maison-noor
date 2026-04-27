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

function dataAgora() {
  return new Date().toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function traduzStatus(status: string) {
  const s = String(status || "").toLowerCase();

  if (s.includes("pag")) return "🟢 Pago";
  if (s.includes("env")) return "📦 Enviado";
  if (s.includes("cancel")) return "🔴 Cancelado";
  return "🟡 Aguardando Pagamento";
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

    const cliente = pedido.clienteNome || "Cliente";
    const telefone = pedido.telefone || "";
    const numero =
      pedido.numeroPedido ||
      pedido.numero ||
      pedido.id ||
      Math.floor(Math.random() * 999999);

    const total = pedido.total || pedido.valorTotal || 0;
    const status = traduzStatus(pedido.status);
    const telefoneLink = onlyDigits(telefone);

    const whatsappLink = telefoneLink
      ? `https://wa.me/55${telefoneLink}`
      : `https://www.maisonnoor.com.br/crm/pedidos`;

    const itens = Array.isArray(pedido.itens)
      ? pedido.itens
          .map((item: any) => {
            const nome = item.nome || "Produto";
            const qtd = item.qtd || item.quantidade || 1;
            const preco = item.preco || item.precoUnitario || 0;

            return `
              <tr>
                <td style="padding:14px;border-bottom:1px solid #eee;">${nome}</td>
                <td style="padding:14px;border-bottom:1px solid #eee;text-align:center;">${qtd}</td>
                <td style="padding:14px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">
                  ${formatBRL(preco)}
                </td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="3" style="padding:14px;">Itens não informados</td>
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
      subject: `🛍️ Pedido #${numero} • ${cliente} • Maison Noor`,
      html: `
      <div style="margin:0;padding:0;background:#fcf2e5;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:760px;margin:auto;padding:30px 18px;">

          <div style="text-align:center;margin-bottom:20px;">
            <img src="https://www.maisonnoor.com.br/logo.png"
                 style="width:88px;height:88px;border-radius:50%;object-fit:contain;" />
            <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#1b1712;margin-top:8px;">
              MAISON NOOR
            </div>
            <div style="font-size:12px;letter-spacing:4px;color:#b8914b;">
              PERFUMES ÁRABES PREMIUM
            </div>
          </div>

          <div style="background:#fff;border-radius:24px;overflow:hidden;border:1px solid #d9bb7a;box-shadow:0 12px 30px rgba(0,0,0,.08);">

            <div style="padding:26px;background:linear-gradient(135deg,#14110e,#3a2a16);color:#fff;">
              <div style="font-size:12px;letter-spacing:2px;color:#d8b36d;font-weight:700;">
                NOVO PEDIDO RECEBIDO
              </div>

              <h1 style="margin:8px 0 8px;font-size:32px;">
                Pedido #${numero}
              </h1>

              <div style="font-size:14px;color:#eee;">
                Recebido em ${dataAgora()}
              </div>
            </div>

            <div style="padding:28px;">

              <div style="background:#faf8f2;border:1px solid #ead7aa;border-radius:18px;padding:18px;margin-bottom:24px;">
                <p><b>Cliente:</b> ${cliente}</p>
                <p><b>Telefone:</b> ${telefone || "Não informado"}</p>
                <p><b>Status:</b> ${status}</p>
                <p><b>Pagamento:</b> ${pedido.formaPagamento || "Não informado"}</p>

                <div style="margin-top:16px;font-size:34px;font-weight:900;color:#b8914b;">
                  ${formatBRL(total)}
                </div>
              </div>

              <h2 style="margin:0 0 14px;font-size:20px;color:#1a1713;">
                Itens do pedido
              </h2>

              <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:14px;overflow:hidden;">
                <thead>
                  <tr style="background:#15120f;color:#fff;">
                    <th style="padding:14px;text-align:left;">Produto</th>
                    <th style="padding:14px;text-align:center;">Qtd</th>
                    <th style="padding:14px;text-align:right;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${itens}
                </tbody>
              </table>

              <div style="margin-top:26px;display:flex;gap:12px;flex-wrap:wrap;">

                <a href="https://www.maisonnoor.com.br/crm/pedidos"
                   style="background:#111;color:#fff;padding:14px 22px;border-radius:14px;text-decoration:none;font-weight:800;">
                  Abrir CRM
                </a>

                <a href="${whatsappLink}"
                   style="background:#25D366;color:#fff;padding:14px 22px;border-radius:14px;text-decoration:none;font-weight:800;">
                  Chamar Cliente
                </a>

              </div>

            </div>

            <div style="padding:20px;background:#faf7ef;border-top:1px solid #eee;text-align:center;font-size:12px;color:#666;">
              Maison Noor Parfums • www.maisonnoor.com.br <br/>
              Sistema automático de pedidos premium.
            </div>

          </div>
        </div>
      </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao enviar e-mail:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}