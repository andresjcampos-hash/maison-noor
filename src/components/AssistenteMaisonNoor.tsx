"use client";

import { useEffect, useRef, useState } from "react";

type Mensagem = {
  tipo: "cliente" | "bot";
  texto: string;
};

export default function AssistenteMaisonNoor() {
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [loading, setLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1280);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [conversa, setConversa] = useState<Mensagem[]>([
    {
      tipo: "bot",
      texto:
        "Olá! Eu sou o assistente da Maison Noor ✨\n\nPosso consultar preço, estoque e te ajudar a escolher um perfume.",
    },
  ]);

  const isMobile = windowWidth < 768;

  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!aberto) return;

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [conversa, loading, aberto]);

  async function enviarMensagem() {
    const texto = mensagem.trim();
    if (!texto || loading) return;

    setMensagem("");
    setLoading(true);

    setConversa((prev) => [...prev, { tipo: "cliente", texto }]);

    try {
      const response = await fetch("/api/whatsapp-bot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: texto }),
      });

      const data = await response.json();

      setConversa((prev) => [
        ...prev,
        {
          tipo: "bot",
          texto:
            data?.resposta ||
            "Não consegui consultar agora. Tente novamente em instantes.",
        },
      ]);
    } catch {
      setConversa((prev) => [
        ...prev,
        {
          tipo: "bot",
          texto:
            "Tive um problema para consultar o estoque agora. Chame a Maison Noor no WhatsApp ✨",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {aberto && (
        <div
          style={{
            ...styles.chatBox,
            ...(isMobile ? styles.chatBoxMobile : {}),
          }}
        >
          <div style={styles.header}>
            <div>
              <strong style={styles.title}>Assistente Maison Noor</strong>
              <span style={styles.subtitle}>Consulta de perfumes e estoque</span>
            </div>

            <button
              type="button"
              onClick={() => setAberto(false)}
              style={styles.closeButton}
              aria-label="Fechar assistente"
            >
              ×
            </button>
          </div>

          <div style={styles.messages}>
            {conversa.map((item, index) => (
              <div
                key={index}
                style={{
                  ...styles.message,
                  ...(item.tipo === "cliente"
                    ? styles.clientMessage
                    : styles.botMessage),
                  ...(isMobile ? styles.messageMobile : {}),
                }}
              >
                {item.texto}
              </div>
            ))}

            {loading && (
              <div
                style={{
                  ...styles.message,
                  ...styles.botMessage,
                  ...(isMobile ? styles.messageMobile : {}),
                }}
              >
                Consultando estoque...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={styles.inputArea}>
            <input
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviarMensagem();
              }}
              placeholder="Ex: Tem Yara Candy?"
              style={styles.input}
            />

            <button
              type="button"
              onClick={enviarMensagem}
              disabled={loading}
              style={{
                ...styles.sendButton,
                ...(loading ? styles.sendButtonDisabled : {}),
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        style={{
          ...styles.floatButton,
          ...(isMobile ? styles.floatButtonMobile : {}),
        }}
        aria-label="Abrir assistente Maison Noor"
      >
        {isMobile ? "✨ IA" : "✨ Assistente"}
      </button>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  floatButton: {
    position: "fixed",
    right: "18px",
    bottom: "92px",
    zIndex: 260,
    border: "1px solid rgba(216, 193, 162, 0.75)",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    borderRadius: "999px",
    padding: "14px 18px",
    fontWeight: 900,
    fontSize: "14px",
    boxShadow: "0 16px 34px rgba(120, 87, 45, 0.25)",
    cursor: "pointer",
  },

  floatButtonMobile: {
    right: "14px",
    bottom: "154px",
    padding: "12px 16px",
    fontSize: "13px",
    minWidth: "64px",
    height: "48px",
    zIndex: 260,
  },

  chatBox: {
    position: "fixed",
    right: "18px",
    bottom: "154px",
    width: "min(380px, calc(100vw - 28px))",
    height: "520px",
    maxHeight: "calc(100vh - 190px)",
    zIndex: 270,
    borderRadius: "24px",
    overflow: "hidden",
    background: "linear-gradient(180deg, #FFF9F1, #F3E6D5)",
    border: "1px solid #E1CFBB",
    boxShadow: "0 26px 60px rgba(30, 21, 12, 0.22)",
    display: "flex",
    flexDirection: "column",
  },

  chatBoxMobile: {
    left: "12px",
    right: "12px",
    bottom: "218px",
    width: "auto",
    height: "min(520px, calc(100vh - 260px))",
    maxHeight: "calc(100vh - 260px)",
    borderRadius: "22px",
    zIndex: 270,
  },

  header: {
    padding: "16px",
    background: "linear-gradient(135deg, #18120D, #2B2118)",
    color: "#F6E9D6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
  },

  title: {
    display: "block",
    fontSize: "16px",
    lineHeight: 1.2,
  },

  subtitle: {
    display: "block",
    fontSize: "12px",
    color: "#D8BE97",
    marginTop: "4px",
  },

  closeButton: {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#FFF",
    fontSize: "24px",
    cursor: "pointer",
    flexShrink: 0,
  },

  messages: {
    flex: 1,
    padding: "14px",
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  message: {
    whiteSpace: "pre-line",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    borderRadius: "16px",
    padding: "11px 13px",
    fontSize: "13px",
    lineHeight: 1.55,
    maxWidth: "86%",
  },

  messageMobile: {
    maxWidth: "92%",
    fontSize: "12.5px",
  },

  botMessage: {
    alignSelf: "flex-start",
    background: "#FFFFFF",
    color: "#3E3027",
    border: "1px solid #E6D7C5",
  },

  clientMessage: {
    alignSelf: "flex-end",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontWeight: 700,
  },

  inputArea: {
    padding: "12px",
    borderTop: "1px solid #E6D7C5",
    display: "flex",
    gap: "8px",
    background: "rgba(255,255,255,0.55)",
  },

  input: {
    flex: 1,
    minWidth: 0,
    height: "42px",
    borderRadius: "14px",
    border: "1px solid #D9C6B0",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    background: "#FFFDF9",
    color: "#2B2118",
  },

  sendButton: {
    height: "42px",
    borderRadius: "14px",
    border: "1px solid #D8C1A2",
    background: "linear-gradient(135deg, #18120D, #2B2118)",
    color: "#F6E9D6",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  sendButtonDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
};