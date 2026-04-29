"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type PixData = {
  qr: string;
  copia: string;
  pedido: string;
  numeroPedido?: string;
  pedidoId?: string;
  total?: number;
  criadoEm?: string;
};

type StatusPedido =
  | "aguardando_pagamento"
  | "pendente"
  | "pago"
  | "cancelado"
  | "vencido"
  | string;

function formatarMoeda(valor?: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizarPixData(data: any): PixData {
  const qrCode = data?.qr_codes?.[0];

  const qrLink =
    qrCode?.links?.find((l: any) =>
      String(l?.rel || "").toUpperCase().includes("QRCODE")
    )?.href ||
    qrCode?.links?.find((l: any) =>
      String(l?.media || "").toLowerCase().includes("image")
    )?.href ||
    qrCode?.links?.[0]?.href ||
    data?.qr ||
    data?.qrCode ||
    data?.qrcode ||
    data?.imagemQrCode ||
    data?.imagemQRCode ||
    "";

  const copia =
    data?.copia ||
    data?.copiaECola ||
    data?.codigoPix ||
    data?.textoPix ||
    data?.pixCopiaECola ||
    qrCode?.text ||
    "";

  const totalCentavos = qrCode?.amount?.value;
  const pedidoLimpo = String(
    data?.numeroPedido || data?.pedido || data?.reference_id || data?.id || ""
  ).replace(/^#/, "");

  return {
    qr: qrLink,
    copia,
    pedido:
      data?.pedido ||
      data?.numeroPedido ||
      data?.reference_id ||
      data?.id ||
      "Pedido Maison Noor",
    numeroPedido: data?.numeroPedido || pedidoLimpo || undefined,
    pedidoId: data?.pedidoId || data?.id || undefined,
    total:
      data?.total ||
      data?.valor ||
      (typeof totalCentavos === "number" ? totalCentavos / 100 : undefined),
    criadoEm: data?.criadoEm || data?.created_at,
  };
}

function statusPago(status?: StatusPedido) {
  const s = String(status || "").toLowerCase();
  return s === "pago" || s === "paid" || s === "received" || s === "confirmed";
}

function tocarSomPagamentoAprovado() {
  if (typeof window === "undefined") return;

  const audio = new Audio("/sounds/pagamento-aprovado.mp3");
  audio.volume = 0.8;

  audio.play().catch(() => {
    console.log("Som de pagamento bloqueado pelo navegador até haver interação do usuário.");
  });
}

export default function CheckoutPixPage() {
  const [pix, setPix] = useState<PixData | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [statusPedido, setStatusPedido] =
    useState<StatusPedido>("aguardando_pagamento");
  const [statusMensagem, setStatusMensagem] = useState(
    "Aguardando confirmação do pagamento..."
  );
  const [consultando, setConsultando] = useState(false);
  const somPagamentoTocadoRef = useRef(false);

  useEffect(() => {
    const chaves = [
      "maison_noor_pix_pagbank",
      "maison_noor_pix_asaas",
      "asaas_pix",
      "pagbank_pix",
      "pix_pagbank",
      "pixData",
      "pix",
      "checkout_pix",
      "maison_noor_pix",
    ];

    for (const chave of chaves) {
      const raw = sessionStorage.getItem(chave) || localStorage.getItem(chave);
      if (!raw) continue;

      try {
        const data = JSON.parse(raw);
        const pixNormalizado = normalizarPixData(data);

        if (pixNormalizado.qr || pixNormalizado.copia) {
          setPix(pixNormalizado);
          return;
        }
      } catch (error) {
        console.error("Erro ao ler Pix salvo:", chave, error);
      }
    }
  }, []);

  useEffect(() => {
    if (!pix?.numeroPedido) return;
    if (statusPago(statusPedido)) return;

    const numeroPedidoAtual = pix.numeroPedido;

    let ativo = true;
    let tentativas = 0;
    let interval: number | null = null;

    const LIMITE_TENTATIVAS = 60;

    async function consultarStatus() {
      if (!ativo) return;

      try {
        tentativas += 1;
        setConsultando(true);

        const response = await fetch(
          `/api/pedido-status?numeroPedido=${encodeURIComponent(
            String(numeroPedidoAtual)
          )}`,
          { cache: "no-store" }
        );

        const data = await response.json().catch(() => null);
        if (!ativo) return;

        if (response.ok && data?.ok) {
          const novoStatus =
            data.pagamentoStatus || data.status || "aguardando_pagamento";

          setStatusPedido(novoStatus);

          if (statusPago(novoStatus)) {
            setStatusMensagem(
              "Pagamento aprovado! Seu pedido foi confirmado com sucesso."
            );

            if (!somPagamentoTocadoRef.current) {
              somPagamentoTocadoRef.current = true;
              tocarSomPagamentoAprovado();
            }

            if (interval) window.clearInterval(interval);
            return;
          }

          if (
            novoStatus === "cancelado" ||
            novoStatus === "vencido" ||
            novoStatus === "cancelled" ||
            novoStatus === "overdue"
          ) {
            setStatusMensagem("Pagamento não confirmado ou expirado.");
            if (interval) window.clearInterval(interval);
            return;
          }

          setStatusMensagem("Aguardando confirmação do pagamento...");
        }

        if (tentativas >= LIMITE_TENTATIVAS) {
          setStatusMensagem(
            "Ainda aguardando confirmação. Você pode acompanhar pela sua conta."
          );

          if (interval) window.clearInterval(interval);
        }
      } catch (error) {
        console.error("Erro ao consultar status do pedido:", error);
      } finally {
        if (ativo) setConsultando(false);
      }
    }

    consultarStatus();
    interval = window.setInterval(consultarStatus, 5000);

    return () => {
      ativo = false;
      if (interval) window.clearInterval(interval);
    };
  }, [pix?.numeroPedido]);

  const valor = useMemo(() => formatarMoeda(pix?.total), [pix?.total]);
  const pago = statusPago(statusPedido);

  async function copiarPix() {
    if (!pix?.copia) return;

    await navigator.clipboard.writeText(pix.copia);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  }

  if (!pix) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>Pix não encontrado</h1>
          <p style={styles.text}>Volte ao checkout e gere o pagamento novamente.</p>
          <Link href="/checkout" style={styles.darkButton}>
            Voltar ao checkout
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <img src="/logo.png" alt="Maison Noor" style={styles.logo} />
        <h1 style={styles.brand}>MAISON NOOR</h1>
        <p style={styles.tagline}>PERFUMES ÁRABES PREMIUM</p>
      </section>

      <section style={styles.card}>
        <div style={pago ? styles.successBox : styles.statusBox}>
          <strong style={pago ? styles.successTitle : styles.statusTitle}>
            {pago ? "✅ Pagamento aprovado" : "⏳ Aguardando pagamento"}
          </strong>
          <span style={styles.statusText}>
            {statusMensagem} {consultando && !pago ? "Verificando..." : ""}
          </span>
        </div>

        <p style={styles.kicker}>PAGAMENTO PIX</p>
        <h2 style={styles.title}>{pago ? "Pedido confirmado" : "Finalize seu pedido"}</h2>
        <p style={styles.text}>
          {pago
            ? "Recebemos a confirmação do pagamento. Obrigado pela compra!"
            : "Escaneie o QR Code ou copie o código Pix abaixo."}
        </p>

        <div style={styles.orderBox}>
          <div style={styles.infoBox}>
            <span style={styles.label}>Pedido</span>
            <strong style={styles.order}>{pix.pedido}</strong>
          </div>

          <div style={styles.infoBox}>
            <span style={styles.label}>Total</span>
            <strong style={styles.total}>{valor}</strong>
          </div>
        </div>

        {!pago && pix.qr ? (
          <div style={styles.qrArea}>
            <div style={styles.qrWrap}>
              <img src={pix.qr} alt="QR Code Pix" style={styles.qr} />
            </div>
            <p style={styles.qrHint}>Aponte a câmera do banco para o QR Code.</p>
          </div>
        ) : null}

        {!pago ? (
          <>
            <button onClick={copiarPix} style={styles.goldButton}>
              {copiado ? "Código Pix copiado ✅" : "Copiar código Pix"}
            </button>

            <textarea readOnly value={pix.copia} style={styles.textarea} />
          </>
        ) : null}

        <div style={styles.actions}>
          {pago ? (
            <Link href="/" style={styles.darkButton}>
              Voltar para loja
            </Link>
          ) : (
            <a
              href="https://wa.me/5512982627108"
              target="_blank"
              rel="noreferrer"
              style={styles.darkButton}
            >
              Preciso de ajuda
            </a>
          )}

          <Link href="/minha-conta" style={styles.lightButton}>
            Minha conta
          </Link>
        </div>

        <p style={styles.note}>
          {pago
            ? "Seu pedido será preparado pela Maison Noor. Você também pode acompanhar pelo atendimento."
            : "Após o pagamento, a confirmação pode levar alguns instantes. Esta tela verifica automaticamente o status do pedido."}
        </p>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#fcf2e5",
    padding: "24px 14px 40px",
    fontFamily: "Arial, Helvetica, sans-serif",
    color: "#1f1a14",
  },
  header: {
    textAlign: "center",
    marginBottom: 18,
  },
  logo: {
    width: 82,
    height: 82,
    objectFit: "contain",
    marginBottom: 8,
  },
  brand: {
    margin: 0,
    fontSize: 30,
    fontWeight: 900,
    letterSpacing: 4,
  },
  tagline: {
    marginTop: 6,
    fontSize: 12,
    letterSpacing: 4,
    color: "#b8914b",
    fontWeight: 700,
  },
  card: {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #d6b06a",
    borderRadius: 28,
    padding: "30px 24px",
    boxShadow: "0 18px 45px rgba(0,0,0,.10)",
    textAlign: "center",
    boxSizing: "border-box",
  },
  statusBox: {
    background: "#fffaf2",
    border: "1px solid #ead8b8",
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    display: "grid",
    gap: 6,
  },
  successBox: {
    background: "#f2fff6",
    border: "1px solid #93d7a5",
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    display: "grid",
    gap: 6,
  },
  statusTitle: {
    color: "#9c7b38",
    fontSize: 16,
  },
  successTitle: {
    color: "#19783b",
    fontSize: 17,
  },
  statusText: {
    color: "#6f6252",
    fontSize: 13,
    lineHeight: 1.4,
  },
  kicker: {
    margin: 0,
    color: "#b8914b",
    letterSpacing: 3,
    fontSize: 12,
    fontWeight: 900,
  },
  title: {
    margin: "8px 0",
    fontSize: 30,
    fontWeight: 900,
  },
  text: {
    color: "#6f6252",
    lineHeight: 1.5,
    marginBottom: 18,
  },
  orderBox: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    margin: "18px auto 24px",
    maxWidth: 520,
  },
  infoBox: {
    background: "#fffaf2",
    border: "1px solid #ead8b8",
    borderRadius: 18,
    padding: 14,
  },
  label: {
    display: "block",
    color: "#9c7b38",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 2,
    marginBottom: 6,
  },
  order: {
    fontSize: 18,
  },
  total: {
    fontSize: 24,
    color: "#b8914b",
  },
  qrArea: {
    margin: "0 auto 18px",
  },
  qrWrap: {
    background: "#ffffff",
    border: "2px solid #d6b06a",
    borderRadius: 26,
    padding: 20,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 12px 30px rgba(0,0,0,.10)",
  },
  qr: {
    width: "min(78vw, 440px)",
    height: "auto",
    display: "block",
    imageRendering: "pixelated",
    borderRadius: 12,
  },
  qrHint: {
    margin: "12px 0 0",
    fontSize: 13,
    color: "#6f6252",
    fontWeight: 700,
  },
  textarea: {
    width: "100%",
    minHeight: 108,
    marginTop: 14,
    borderRadius: 16,
    border: "1px solid #d6b06a",
    padding: 14,
    resize: "vertical",
    fontSize: 14,
    lineHeight: 1.5,
    boxSizing: "border-box",
    color: "#1f1a14",
    background: "#fffaf2",
    fontWeight: 700,
  },
  goldButton: {
    width: "100%",
    maxWidth: 520,
    marginTop: 4,
    background: "#d6b06a",
    color: "#1f1a14",
    border: "none",
    borderRadius: 18,
    padding: "17px 18px",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(184,145,75,.28)",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 14,
  },
  darkButton: {
    background: "#1f1a14",
    color: "#fff",
    borderRadius: 16,
    padding: "15px 16px",
    textDecoration: "none",
    fontWeight: 900,
    display: "inline-block",
  },
  lightButton: {
    background: "#fffaf2",
    color: "#1f1a14",
    border: "1px solid #d6b06a",
    borderRadius: 16,
    padding: "15px 16px",
    textDecoration: "none",
    fontWeight: 900,
    display: "inline-block",
  },
  note: {
    fontSize: 12,
    color: "#7b6a52",
    marginTop: 20,
    lineHeight: 1.5,
  },
};