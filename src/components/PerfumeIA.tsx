"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

type ResultadoIA = {
  sucesso?: boolean;
  perfil?: {
    familia?: string;
    descricao?: string;
    tags?: string[];
  };
  mensagem?: string;
};

type FormState = {
  genero: string;
  intensidade: string;
  estilo: string;
  ocasiao: string;
  clima: string;
  preferencia: string;
};

const initialForm: FormState = {
  genero: "",
  intensidade: "",
  estilo: "",
  ocasiao: "",
  clima: "",
  preferencia: "",
};

const fields: Array<{
  key: keyof FormState;
  label: string;
  icon: string;
  placeholder: string;
  options: string[];
}> = [
  {
    key: "genero",
    label: "Perfil",
    icon: "◈",
    placeholder: "Escolha o perfil",
    options: ["Masculino", "Feminino", "Unissex"],
  },
  {
    key: "intensidade",
    label: "Intensidade",
    icon: "🔥",
    placeholder: "Intensidade desejada",
    options: ["Leve", "Moderado", "Intenso"],
  },
  {
    key: "ocasiao",
    label: "Ocasião",
    icon: "🌙",
    placeholder: "Quando pretende usar?",
    options: ["Dia a dia", "Noite", "Encontro", "Evento especial"],
  },
  {
    key: "clima",
    label: "Clima",
    icon: "🌡️",
    placeholder: "Clima ideal",
    options: ["Calor", "Frio", "Qualquer clima"],
  },
  {
    key: "preferencia",
    label: "Preferência olfativa",
    icon: "✦",
    placeholder: "Família preferida",
    options: ["Doce", "Amadeirado", "Fresco", "Especiado", "Oud"],
  },
  {
    key: "estilo",
    label: "Estilo",
    icon: "👑",
    placeholder: "Seu estilo",
    options: ["Elegante", "Sedutor", "Moderno", "Luxuoso"],
  },
];

function gerarMensagemWhatsapp(form: FormState, resultado: ResultadoIA | null) {
  const familia = resultado?.perfil?.familia || "perfil olfativo Maison Noor";
  const descricao = resultado?.perfil?.descricao || "";

  return encodeURIComponent(
    `Olá! Fiz a Perfume IA no site da Maison Noor e meu perfil foi: ${familia}.

Minhas escolhas:
- Perfil: ${form.genero || "não informado"}
- Intensidade: ${form.intensidade || "não informado"}
- Ocasião: ${form.ocasiao || "não informado"}
- Clima: ${form.clima || "não informado"}
- Preferência: ${form.preferencia || "não informado"}
- Estilo: ${form.estilo || "não informado"}

${descricao}

Pode me indicar perfumes disponíveis que combinam comigo?`
  );
}

export default function PerfumeIA() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);

  const preenchidos = useMemo(() => {
    return Object.values(form).filter(Boolean).length;
  }, [form]);

  const progresso = Math.round((preenchidos / fields.length) * 100);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setErro("");
  }

  async function analisarPerfil() {
    try {
      setErro("");
      setLoading(true);
      setResultado(null);

      const response = await fetch("/api/perfume-ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as ResultadoIA;

      if (!response.ok || data?.sucesso === false) {
        setErro(data?.mensagem || "Não foi possível analisar seu perfil agora.");
        return;
      }

      setResultado(data);
    } catch (error) {
      console.error(error);
      setErro("Não foi possível conectar com a Perfume IA agora.");
    } finally {
      setLoading(false);
    }
  }

  function limparPerfil() {
    setForm(initialForm);
    setResultado(null);
    setErro("");
  }

  return (
    <section style={styles.shell}>
      <div style={styles.bgGlowOne} />
      <div style={styles.bgGlowTwo} />

      <div style={styles.header}>
        <div style={styles.logoRow}>
          <span style={styles.seal}>Maison Noor IA</span>
          <span style={styles.liveBadge}>Consultoria digital</span>
        </div>

        <h1 style={styles.title}>Descubra seu perfil olfativo</h1>

        <p style={styles.subtitle}>
          Responda algumas perguntas rápidas e receba uma leitura olfativa com
          o estilo de fragrância que mais combina com você.
        </p>

        <div style={styles.progressCard}>
          <div style={styles.progressTop}>
            <span style={styles.progressLabel}>Diagnóstico olfativo</span>
            <strong style={styles.progressValue}>{progresso}%</strong>
          </div>
          <div style={styles.progressTrack}>
            <span style={{ ...styles.progressFill, width: `${progresso}%` }} />
          </div>
          <small style={styles.progressHint}>
            Quanto mais campos preencher, mais certeira fica a recomendação.
          </small>
        </div>
      </div>

      <div style={styles.contentGrid}>
        <div style={styles.formPanel}>
          <div style={styles.formHeader}>
            <span style={styles.formKicker}>Preferências</span>
            <strong style={styles.formTitle}>Conte para a Maison Noor</strong>
          </div>

          <div style={styles.fieldsGrid}>
            {fields.map((field) => (
              <label key={field.key} style={styles.fieldCard}>
                <span style={styles.fieldTop}>
                  <span style={styles.fieldIcon}>{field.icon}</span>
                  <span>
                    <strong style={styles.fieldLabel}>{field.label}</strong>
                    <small style={styles.fieldHelp}>{field.placeholder}</small>
                  </span>
                </span>

                <select
                  value={form[field.key]}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  style={styles.select}
                >
                  <option value="">{field.placeholder}</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {erro && <div style={styles.errorBox}>{erro}</div>}

          <div style={styles.actionRow}>
            <button
              type="button"
              onClick={analisarPerfil}
              disabled={loading}
              style={{
                ...styles.primaryButton,
                opacity: loading ? 0.72 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? "Analisando seu perfil..." : "Analisar meu perfil"}
            </button>

            <button type="button" onClick={limparPerfil} style={styles.secondaryButton}>
              Limpar
            </button>
          </div>
        </div>

        <aside style={styles.asidePanel}>
          <span style={styles.asideIcon}>✦</span>
          <strong style={styles.asideTitle}>Como a Perfume IA ajuda?</strong>
          <p style={styles.asideText}>
            Ela interpreta intensidade, ocasião, clima e preferência olfativa
            para indicar uma direção de fragrância antes do atendimento.
          </p>

          <div style={styles.asideList}>
            <span>✓ Escolha mais rápida</span>
            <span>✓ Atendimento mais assertivo</span>
            <span>✓ Sugestão com perfil premium</span>
          </div>
        </aside>
      </div>

      {resultado?.perfil && (
        <div style={styles.resultPanel}>
          <div style={styles.resultHeader}>
            <div>
              <span style={styles.resultKicker}>Perfil identificado</span>
              <h2 style={styles.resultTitle}>{resultado.perfil.familia}</h2>
            </div>
            <span style={styles.resultSeal}>Maison Noor</span>
          </div>

          <p style={styles.resultText}>{resultado.perfil.descricao}</p>

          <div style={styles.tagsRow}>
            {resultado.perfil.tags?.map((tag) => (
              <span key={tag} style={styles.tag}>
                {tag}
              </span>
            ))}
          </div>

          <div style={styles.resultBottom}>
            <div style={styles.recommendBox}>
              <strong>Próximo passo</strong>
              <span>
                Fale com a Maison Noor para receber opções disponíveis no estoque
                que combinam com esse perfil.
              </span>
            </div>

            <a
              href={`https://wa.me/5512982627108?text=${gerarMensagemWhatsapp(form, resultado)}`}
              target="_blank"
              rel="noreferrer"
              style={styles.whatsappButton}
            >
              Receber indicação no WhatsApp
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "34px",
    border: "1px solid rgba(216, 193, 162, 0.22)",
    background:
      "radial-gradient(circle at 15% 10%, rgba(212,175,119,0.20), transparent 28%), linear-gradient(135deg, #120E0A 0%, #1E1711 48%, #090806 100%)",
    padding: "clamp(22px, 4vw, 44px)",
    boxShadow: "0 32px 80px rgba(0,0,0,0.42)",
    color: "#F8EBD8",
    fontFamily: "Inter, Arial, sans-serif",
  },
  bgGlowOne: {
    position: "absolute",
    width: "360px",
    height: "360px",
    borderRadius: "999px",
    right: "-140px",
    top: "-120px",
    background: "rgba(212, 175, 119, 0.16)",
    filter: "blur(18px)",
  },
  bgGlowTwo: {
    position: "absolute",
    width: "280px",
    height: "280px",
    borderRadius: "999px",
    left: "-110px",
    bottom: "-120px",
    background: "rgba(255, 244, 220, 0.08)",
    filter: "blur(18px)",
  },
  header: {
    position: "relative",
    zIndex: 2,
    maxWidth: "860px",
  },
  logoRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    marginBottom: "18px",
  },
  seal: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "34px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid rgba(216, 193, 162, 0.30)",
    background: "rgba(212,175,119,0.12)",
    color: "#E8C98E",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.20em",
    textTransform: "uppercase",
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "34px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(248,235,216,0.72)",
    fontSize: "12px",
    fontWeight: 700,
  },
  title: {
    margin: "0 0 14px",
    color: "#FFF7EA",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(36px, 6vw, 72px)",
    lineHeight: 0.96,
    letterSpacing: "-0.055em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(248,235,216,0.75)",
    fontSize: "clamp(15px, 2vw, 18px)",
    lineHeight: 1.7,
    maxWidth: "760px",
  },
  progressCard: {
    marginTop: "24px",
    borderRadius: "22px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "rgba(255,255,255,0.055)",
    padding: "16px",
    maxWidth: "620px",
  },
  progressTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "10px",
  },
  progressLabel: {
    color: "rgba(248,235,216,0.72)",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  progressValue: {
    color: "#E8C98E",
    fontSize: "14px",
  },
  progressTrack: {
    height: "9px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "rgba(216,193,162,0.16)",
  },
  progressFill: {
    display: "block",
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #D4AF77, #F0CF91)",
    boxShadow: "0 0 18px rgba(212,175,119,0.34)",
    transition: "width 0.28s ease",
  },
  progressHint: {
    display: "block",
    marginTop: "10px",
    color: "rgba(248,235,216,0.55)",
    lineHeight: 1.5,
  },
  contentGrid: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.65fr)",
    gap: "18px",
    marginTop: "26px",
  },
  formPanel: {
    borderRadius: "28px",
    border: "1px solid rgba(216,193,162,0.18)",
    background: "rgba(255,255,255,0.075)",
    padding: "clamp(18px, 3vw, 28px)",
    backdropFilter: "blur(12px)",
  },
  formHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    marginBottom: "18px",
  },
  formKicker: {
    color: "#D8BE97",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  formTitle: {
    color: "#FFF7EA",
    fontSize: "22px",
  },
  fieldsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "14px",
  },
  fieldCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    borderRadius: "20px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "rgba(0,0,0,0.22)",
    padding: "15px",
  },
  fieldTop: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  fieldIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: "17px",
    flexShrink: 0,
  },
  fieldLabel: {
    display: "block",
    color: "#FFF7EA",
    fontSize: "14px",
    marginBottom: "3px",
  },
  fieldHelp: {
    display: "block",
    color: "rgba(248,235,216,0.56)",
    fontSize: "12px",
  },
  select: {
    width: "100%",
    minHeight: "50px",
    borderRadius: "15px",
    border: "1px solid rgba(216,193,162,0.24)",
    background: "#FFF8EF",
    color: "#2B2118",
    padding: "0 14px",
    fontSize: "15px",
    fontWeight: 700,
    outline: "none",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  errorBox: {
    marginTop: "16px",
    borderRadius: "16px",
    border: "1px solid rgba(248, 113, 113, 0.35)",
    background: "rgba(127, 29, 29, 0.25)",
    color: "#FECACA",
    padding: "13px 14px",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "20px",
  },
  primaryButton: {
    minHeight: "54px",
    borderRadius: "18px",
    border: "1px solid rgba(255, 232, 184, 0.42)",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#211810",
    padding: "0 24px",
    fontSize: "13px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    boxShadow: "0 18px 34px rgba(120,87,45,0.24)",
  },
  secondaryButton: {
    minHeight: "54px",
    borderRadius: "18px",
    border: "1px solid rgba(216,193,162,0.20)",
    background: "rgba(255,255,255,0.07)",
    color: "#F8EBD8",
    padding: "0 20px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  asidePanel: {
    borderRadius: "28px",
    border: "1px solid rgba(216,193,162,0.16)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
    padding: "24px",
    alignSelf: "start",
  },
  asideIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#211810",
    fontWeight: 900,
    marginBottom: "16px",
  },
  asideTitle: {
    display: "block",
    color: "#FFF7EA",
    fontSize: "22px",
    lineHeight: 1.1,
    marginBottom: "10px",
  },
  asideText: {
    margin: 0,
    color: "rgba(248,235,216,0.68)",
    fontSize: "14px",
    lineHeight: 1.7,
  },
  asideList: {
    display: "grid",
    gap: "9px",
    marginTop: "18px",
    color: "#E8C98E",
    fontSize: "13px",
    fontWeight: 800,
  },
  resultPanel: {
    position: "relative",
    zIndex: 2,
    marginTop: "22px",
    borderRadius: "30px",
    border: "1px solid rgba(216,193,162,0.24)",
    background:
      "radial-gradient(circle at top right, rgba(34,197,94,0.10), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.055))",
    padding: "clamp(20px, 3vw, 30px)",
    boxShadow: "0 22px 48px rgba(0,0,0,0.20)",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "18px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  resultKicker: {
    color: "#D8BE97",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  resultTitle: {
    margin: "8px 0 0",
    color: "#FFF7EA",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(30px, 4vw, 46px)",
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
  },
  resultSeal: {
    borderRadius: "999px",
    background: "rgba(212,175,119,0.14)",
    border: "1px solid rgba(216,193,162,0.24)",
    color: "#E8C98E",
    padding: "10px 14px",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  resultText: {
    margin: "18px 0 0",
    color: "rgba(248,235,216,0.76)",
    fontSize: "16px",
    lineHeight: 1.75,
    maxWidth: "860px",
  },
  tagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "36px",
    borderRadius: "999px",
    border: "1px solid rgba(216,193,162,0.22)",
    background: "rgba(212,175,119,0.12)",
    color: "#F2D39A",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 800,
  },
  resultBottom: {
    display: "flex",
    gap: "14px",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: "24px",
    paddingTop: "20px",
    borderTop: "1px solid rgba(216,193,162,0.14)",
  },
  recommendBox: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    color: "rgba(248,235,216,0.72)",
    fontSize: "14px",
    lineHeight: 1.5,
    maxWidth: "620px",
  },
  whatsappButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "52px",
    borderRadius: "18px",
    border: "1px solid rgba(34,197,94,0.34)",
    background: "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(22,163,74,0.12))",
    color: "#BBF7D0",
    textDecoration: "none",
    padding: "0 20px",
    fontSize: "14px",
    fontWeight: 900,
    boxShadow: "0 16px 34px rgba(22,163,74,0.10)",
  },
};
