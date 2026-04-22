"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PedidoSalvo = {
  id?: string;
  numeroPedido?: string;
  formaPagamento?: "pix" | "whatsapp" | string;
  createdAt?: string;
};

function formatarFormaPagamento(forma?: string) {
  if (forma === "pix") return "Pix";
  if (forma === "whatsapp") return "WhatsApp";
  return "Atendimento";
}

function formatarData(data?: string) {
  if (!data) return "Agora mesmo";

  const parsed = new Date(data);
  if (Number.isNaN(parsed.getTime())) return "Agora mesmo";

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckoutSucessoPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [pedido, setPedido] = useState<PedidoSalvo | null>(null);
  const [autoOpenTentado, setAutoOpenTentado] = useState(false);
  const [autoOpenBloqueado, setAutoOpenBloqueado] = useState(false);

  useEffect(() => {
    setMounted(true);

    try {
      const raw = window.sessionStorage.getItem("maison_noor_checkout_last_order");
      if (raw) {
        const parsed = JSON.parse(raw);
        setPedido(parsed);
      }
    } catch (error) {
      console.error("Erro ao ler último pedido salvo:", error);
    }

    try {
      const auto = searchParams.get("auto");
      const whatsappUrl = window.sessionStorage.getItem("maison_noor_checkout_next_whatsapp_url");

      if (auto === "1" && whatsappUrl) {
        const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        setAutoOpenTentado(true);
        setAutoOpenBloqueado(!popup);
        window.sessionStorage.removeItem("maison_noor_checkout_next_whatsapp_url");
      }
    } catch (error) {
      console.error("Erro ao abrir WhatsApp automático:", error);
      setAutoOpenTentado(true);
      setAutoOpenBloqueado(true);
    }
  }, [searchParams]);

  const numeroPedido = useMemo(() => {
    if (!mounted) return "em geração";
    return pedido?.numeroPedido || "em geração";
  }, [mounted, pedido]);

  const formaPagamento = useMemo(() => {
    if (!mounted) return "Atendimento";
    return formatarFormaPagamento(pedido?.formaPagamento);
  }, [mounted, pedido]);

  const dataPedido = useMemo(() => {
    if (!mounted) return "Agora mesmo";
    return formatarData(pedido?.createdAt);
  }, [mounted, pedido]);

  const whatsappHref = useMemo(() => {
    const numeroTexto =
      mounted && pedido?.numeroPedido ? `#${pedido.numeroPedido}` : "meu pedido recente";

    const texto = encodeURIComponent(
      `Olá! Quero continuar o atendimento do pedido ${numeroTexto} na Maison Noor.`
    );

    return `https://wa.me/5512982627108?text=${texto}`;
  }, [mounted, pedido]);

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <div style={styles.heroCard}>
          <p style={styles.kicker}>Maison Noor</p>
          <h1 style={styles.title}>Pedido criado com sucesso</h1>
          <p style={styles.subtitle}>
            Seu pedido foi registrado e o atendimento foi iniciado. Você também pode
            acompanhar tudo pela sua área do cliente.
          </p>
        </div>

        <div style={styles.grid}>
          <section style={styles.mainCard}>
            <div style={styles.successBadge}>✓ Pedido registrado</div>

            <h2 style={styles.sectionTitle}>
              Pedido{" "}
              <span style={styles.orderNumber}>
                #{numeroPedido}
              </span>
            </h2>

            <p style={styles.sectionText}>
              Tudo certo por aqui. Seu pedido foi salvo com sucesso e a Maison Noor
              seguirá com o atendimento pela forma escolhida.
            </p>

            <div style={styles.infoGrid}>
              <div style={styles.infoCard}>
                <span style={styles.infoLabel}>Forma de pagamento</span>
                <strong style={styles.infoValue}>{formaPagamento}</strong>
              </div>

              <div style={styles.infoCard}>
                <span style={styles.infoLabel}>Registrado em</span>
                <strong style={styles.infoValue}>{dataPedido}</strong>
              </div>
            </div>

            <div style={styles.timeline}>
              <div style={styles.timelineItem}>
                <div style={styles.timelineDotActive} />
                <div>
                  <strong style={styles.timelineTitle}>Pedido recebido</strong>
                  <p style={styles.timelineText}>
                    Seu pedido já está salvo no sistema da Maison Noor.
                  </p>
                </div>
              </div>

              <div style={styles.timelineItem}>
                <div style={styles.timelineDot} />
                <div>
                  <strong style={styles.timelineTitle}>Atendimento em andamento</strong>
                  <p style={styles.timelineText}>
                    Você pode continuar pelo WhatsApp para concluir pagamento e próximos passos.
                  </p>
                </div>
              </div>

              <div style={styles.timelineItem}>
                <div style={styles.timelineDot} />
                <div>
                  <strong style={styles.timelineTitle}>Acompanhe em Minha Conta</strong>
                  <p style={styles.timelineText}>
                    O histórico e o status do pedido ficarão disponíveis na sua conta.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside style={styles.sideCard}>
            <span style={styles.sideKicker}>Próximos passos</span>
            <h3 style={styles.sideTitle}>Sua compra segue organizada</h3>

            {autoOpenTentado ? (
              <div style={autoOpenBloqueado ? styles.autoOpenWarning : styles.autoOpenSuccess}>
                {autoOpenBloqueado
                  ? "O navegador bloqueou a abertura automática do WhatsApp. Use o botão abaixo para continuar o atendimento."
                  : "WhatsApp aberto com sucesso. Se preferir, você também pode continuar pelos botões abaixo."}
              </div>
            ) : null}

            <div style={styles.actionList}>
              <a href={whatsappHref} target="_blank" rel="noreferrer" style={styles.primaryButton}>
                Falar no WhatsApp
              </a>

              <Link href="/minha-conta" style={styles.secondaryButton}>
                Ir para Minha Conta
              </Link>

              <Link href="/" style={styles.secondaryButton}>
                Continuar comprando
              </Link>
            </div>

            <div style={styles.noticeCard}>
              <span style={styles.noticeLabel}>Atendimento premium</span>
              <p style={styles.noticeText}>
                Seu pedido fica salvo para facilitar o acompanhamento, pagamento e suporte.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(215,192,160,0.20), transparent 24%), #F5EFE6",
    color: "#2B2B2B",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "1080px",
    margin: "0 auto",
    padding: "24px 18px 40px",
  },
  heroCard: {
    borderRadius: 24,
    border: "1px solid #E2D2BF",
    background: "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(244,234,220,0.96))",
    boxShadow: "0 14px 30px rgba(62, 44, 24, 0.07)",
    padding: "24px 24px",
    marginBottom: 18,
  },
  kicker: {
    margin: 0,
    color: "#B1874E",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
  },
  title: {
    margin: "8px 0 10px",
    color: "#3A2F29",
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    fontSize: 30,
  },
  subtitle: {
    margin: 0,
    color: "#6D6157",
    fontSize: 14,
    lineHeight: 1.65,
    maxWidth: 760,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: 18,
  },
  mainCard: {
    background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
    borderRadius: 22,
    boxShadow: "0 12px 26px rgba(48,34,20,0.07)",
    border: "1px solid #EADBC8",
    padding: 22,
  },
  sideCard: {
    borderRadius: 22,
    border: "1px solid #E1CFBB",
    background: "linear-gradient(135deg, rgba(24,19,14,0.96), rgba(41,30,20,0.96))",
    boxShadow: "0 18px 38px rgba(34, 24, 15, 0.14)",
    color: "#F6E9D6",
    padding: 22,
    alignSelf: "start",
  },
  successBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(221, 242, 226, 0.95)",
    border: "1px solid #B9DEC0",
    color: "#2F6A3C",
    fontWeight: 700,
    fontSize: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    margin: "0 0 10px",
    color: "#3A2F29",
    fontSize: 26,
    lineHeight: 1.1,
  },
  orderNumber: {
    color: "#9B7441",
  },
  sectionText: {
    margin: 0,
    color: "#6D6157",
    fontSize: 14,
    lineHeight: 1.7,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginTop: 18,
    marginBottom: 18,
  },
  infoCard: {
    padding: "16px 16px",
    borderRadius: 18,
    border: "1px solid #E8D8C5",
    background: "rgba(255,255,255,0.72)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  infoLabel: {
    color: "#8B7A6A",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 700,
  },
  infoValue: {
    color: "#3E3027",
    fontSize: 18,
    lineHeight: 1.2,
  },
  timeline: {
    display: "grid",
    gap: 16,
    marginTop: 8,
  },
  timelineItem: {
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    gap: 12,
    alignItems: "flex-start",
  },
  timelineDotActive: {
    width: 14,
    height: 14,
    borderRadius: 999,
    marginTop: 4,
    background: "#BE9155",
    boxShadow: "0 0 0 4px rgba(190,145,85,0.14)",
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    marginTop: 4,
    background: "#DCC7AA",
  },
  timelineTitle: {
    display: "block",
    color: "#3E3027",
    fontSize: 15,
    marginBottom: 4,
  },
  timelineText: {
    margin: 0,
    color: "#78695B",
    fontSize: 13,
    lineHeight: 1.55,
  },
  sideKicker: {
    display: "inline-block",
    color: "#D8BE97",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    marginBottom: 8,
  },
  sideTitle: {
    margin: "0 0 14px",
    fontSize: 24,
    lineHeight: 1.08,
    color: "#FFF6EB",
  },
  actionList: {
    display: "grid",
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 14,
    border: "1px solid rgba(212, 175, 119, 0.34)",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
    boxShadow: "0 12px 22px rgba(120, 87, 45, 0.11)",
    padding: "0 18px",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "0 18px",
    borderRadius: 14,
    border: "1px solid rgba(216,193,162,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#F6E9D6",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
  },
  noticeCard: {
    borderRadius: 18,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(216,193,162,0.14)",
    padding: "16px 16px",
  },
  noticeLabel: {
    display: "inline-block",
    color: "#D8BE97",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: 8,
  },
  noticeText: {
    margin: 0,
    color: "#F3E8DA",
    fontSize: 13,
    lineHeight: 1.6,
  },
};