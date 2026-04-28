"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PixData = {
  qr: string;
  copia: string;
  pedido: string;
  total?: number;
  criadoEm?: string;
};

function formatarMoeda(valor?: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function CheckoutPixPage() {
  const [pix, setPix] = useState<PixData | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("maison_noor_pix_pagbank");
    if (raw) setPix(JSON.parse(raw));
  }, []);

  const valor = useMemo(() => formatarMoeda(pix?.total), [pix?.total]);

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
        <p style={styles.kicker}>PAGAMENTO PIX</p>
        <h2 style={styles.title}>Finalize seu pedido</h2>
        <p style={styles.text}>Escaneie o QR Code ou copie o código Pix abaixo.</p>

        <div style={styles.orderBox}>
          <div>
            <span style={styles.label}>Pedido</span>
            <strong style={styles.order}>{pix.pedido}</strong>
          </div>
          <div>
            <span style={styles.label}>Total</span>
            <strong style={styles.total}>{valor}</strong>
          </div>
        </div>

        <div style={styles.qrWrap}>
          <img src={pix.qr} alt="QR Code Pix" style={styles.qr} />
        </div>

        <textarea readOnly value={pix.copia} style={styles.textarea} />

        <button onClick={copiarPix} style={styles.goldButton}>
          {copiado ? "Código Pix copiado ✅" : "Copiar código Pix"}
        </button>

        <div style={styles.actions}>
          <a
            href="https://wa.me/5512982627108"
            target="_blank"
            rel="noreferrer"
            style={styles.darkButton}
          >
            Já paguei / avisar no WhatsApp
          </a>

          <Link href="/" style={styles.lightButton}>
            Voltar para loja
          </Link>
        </div>

        <p style={styles.note}>
          Após o pagamento, a confirmação pode levar alguns instantes. Em caso de dúvida,
          fale com a Maison Noor pelo WhatsApp.
        </p>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#fcf2e5",
    padding: "34px 16px",
    fontFamily: "Arial, Helvetica, sans-serif",
    color: "#1f1a14",
  },
  header: {
    textAlign: "center",
    marginBottom: 24,
  },
  logo: {
    width: 86,
    height: 86,
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
    maxWidth: 660,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #d6b06a",
    borderRadius: 26,
    padding: 28,
    boxShadow: "0 18px 45px rgba(0,0,0,.08)",
    textAlign: "center",
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
    fontSize: 28,
    fontWeight: 900,
  },
  text: {
    color: "#6f6252",
    lineHeight: 1.5,
  },
  orderBox: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    margin: "22px 0",
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
    fontSize: 22,
    color: "#b8914b",
  },
  qrWrap: {
    background: "#fffaf2",
    border: "1px solid #ead8b8",
    borderRadius: 24,
    padding: 18,
    display: "inline-block",
    marginBottom: 20,
  },
  qr: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    borderRadius: 16,
    border: "1px solid #d6b06a",
    padding: 14,
    resize: "vertical",
    fontSize: 13,
    boxSizing: "border-box",
  },
  goldButton: {
    width: "100%",
    marginTop: 14,
    background: "#d6b06a",
    color: "#1f1a14",
    border: "none",
    borderRadius: 16,
    padding: "15px 18px",
    fontWeight: 900,
    cursor: "pointer",
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
    padding: "14px 16px",
    textDecoration: "none",
    fontWeight: 900,
    display: "inline-block",
  },
  lightButton: {
    background: "#fffaf2",
    color: "#1f1a14",
    border: "1px solid #d6b06a",
    borderRadius: 16,
    padding: "14px 16px",
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