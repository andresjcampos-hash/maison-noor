"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ResultadoIA = {
  sucesso?: boolean;
  perfil?: {
    familia?: string;
    descricao?: string;
    tags?: string[];
    intensidadeSugerida?: string;
    ocasiaoSugerida?: string;
    sugestaoAtendimento?: string;
  };
  mensagem?: string;
  origem?: "api" | "local";
};

type FormState = {
  genero: string;
  intensidade: string;
  estilo: string;
  ocasiao: string;
  clima: string;
  preferencia: string;
};

type ProdutoIA = {
  id: string;
  nome: string;
  marca?: string;
  tipo?: string;
  categoria?: string;
  volumeMl?: number;
  precoVenda?: number;
  precoFinal: number;
  estoque?: number;
  reservado?: number;
  disponivel: number;
  imagem: string;
  observacoes?: string;
  score?: number;
  motivo?: string;
};

const productsCollection = collection(db, "products");

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

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(texto: string) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatarMoeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getImagemProduto(data: any, nome: string) {
  if (data?.imagem) return String(data.imagem);
  if (data?.imageUrl) return String(data.imageUrl);
  if (data?.image) return String(data.image);
  const slug = slugify(nome);
  return slug ? `/produtos/${slug}.png` : "/produtos/sem-imagem.png";
}

function getTextoProduto(produto: ProdutoIA) {
  return normalizarTexto(`${produto.nome} ${produto.marca || ""} ${produto.tipo || ""} ${produto.categoria || ""} ${produto.observacoes || ""}`);
}

function produtoCombinaComGenero(produto: ProdutoIA, generoEscolhido: string, modoFlexivel = false) {
  const genero = normalizarTexto(generoEscolhido);
  if (!genero) return true;

  const texto = getTextoProduto(produto);
  const categoria = normalizarTexto(produto.categoria);

  const feminino =
    categoria === "feminino" ||
    texto.includes("feminino") ||
    texto.includes("fem") ||
    ["yara", "rose", "ward", "sabah", "lay", "layan", "laya", "maya", "mayar", "haya", "candy", "moi", "tous", "hiyam", "sama", "shagaf", "durrat", "hayaati", "ameerat"].some((palavra) => texto.includes(palavra));

  const masculino =
    categoria === "masculino" ||
    texto.includes("masculino") ||
    texto.includes("masc") ||
    ["asad", "hawas", "club", "fakhar", "zanzibar", "black", "watani", "bourbon", "homme", "men", "man"].some((palavra) => texto.includes(palavra));

  const unissex =
    categoria === "unissex" ||
    texto.includes("unissex") ||
    texto.includes("unisex") ||
    ["oud", "bade", "badee", "khamrah", "amber", "ambar", "oriental", "intense"].some((palavra) => texto.includes(palavra));

  if (genero === "feminino") {
    if (feminino) return true;
    if (modoFlexivel && unissex && !masculino) return true;
    return false;
  }

  if (genero === "masculino") {
    if (masculino) return true;
    if (modoFlexivel && unissex && !feminino) return true;
    return false;
  }

  if (genero === "unissex") {
    if (unissex) return true;
    if (modoFlexivel && !masculino && !feminino) return true;
    return false;
  }

  return true;
}

function hashTexto(valor: string) {
  let hash = 0;
  for (let i = 0; i < valor.length; i += 1) {
    hash = (hash << 5) - hash + valor.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getPerfilChave(form: FormState, perfil?: ResultadoIA["perfil"]) {
  return normalizarTexto(
    `${form.genero}|${form.intensidade}|${form.ocasiao}|${form.clima}|${form.preferencia}|${form.estilo}|${perfil?.familia || ""}`
  );
}

function getDesempatePorPerfil(produto: ProdutoIA, form: FormState, perfil?: ResultadoIA["perfil"]) {
  return hashTexto(`${getPerfilChave(form, perfil)}|${produto.id}|${produto.nome}`) % 97;
}

function getMotivoRecomendacao(produto: ProdutoIA, form: FormState, perfil?: ResultadoIA["perfil"]) {
  const texto = getTextoProduto(produto);

  if (normalizarTexto(form.preferencia).includes("doce") || texto.includes("yara") || texto.includes("candy") || texto.includes("baunilha") || texto.includes("vanilla")) {
    if (texto.includes("yara") || texto.includes("candy") || texto.includes("baunilha") || texto.includes("vanilla") || texto.includes("doce")) {
      return "Combina com perfil doce, envolvente e memorável.";
    }
  }

  if (normalizarTexto(form.preferencia).includes("amadeirado") || normalizarTexto(form.preferencia).includes("oud") || normalizarTexto(form.intensidade).includes("intenso")) {
    if (texto.includes("oud") || texto.includes("wood") || texto.includes("amadeir") || texto.includes("ambar") || texto.includes("âmbar") || texto.includes("asad") || texto.includes("club")) {
      return "Combina com presença intensa, amadeirada e sofisticada.";
    }
  }

  if (normalizarTexto(form.preferencia).includes("fresco") || normalizarTexto(form.clima).includes("calor") || normalizarTexto(form.ocasiao).includes("dia")) {
    if (texto.includes("fresh") || texto.includes("fresco") || texto.includes("aqua") || texto.includes("hawas") || texto.includes("citr")) {
      return "Combina com uso versátil, fresco e elegante.";
    }
  }

  if (normalizarTexto(form.ocasiao).includes("noite") || normalizarTexto(form.ocasiao).includes("encontro") || normalizarTexto(form.estilo).includes("sedutor")) {
    return "Boa escolha para noite, encontros e momentos especiais.";
  }

  return `Selecionado para o perfil ${perfil?.familia || "Maison Noor"}.`;
}

function calcularScoreProduto(produto: ProdutoIA, form: FormState, perfil?: ResultadoIA["perfil"]) {
  const texto = getTextoProduto(produto);
  const preferencia = normalizarTexto(form.preferencia);
  const genero = normalizarTexto(form.genero);
  const intensidade = normalizarTexto(form.intensidade);
  const ocasiao = normalizarTexto(form.ocasiao);
  const clima = normalizarTexto(form.clima);
  const estilo = normalizarTexto(form.estilo);
  const familia = normalizarTexto(perfil?.familia);

  let score = 0;

  const palavrasDoces = ["yara", "candy", "baunilha", "vanilla", "sweet", "doce", "gourmand", "caramel", "choco", "rose", "ward", "sabah", "lay", "laya", "moi", "tous"];
  const palavrasAmadeiradas = ["oud", "wood", "amadeir", "ambar", "amber", "oriental", "bade", "asad", "club", "fakhar", "black", "elixir", "watani", "ameer", "arab", "intense"];
  const palavrasFrescas = ["fresh", "fresco", "aqua", "hawas", "citr", "blue", "zanzibar", "sport", "cool", "ocean", "lavanda", "bergamota"];
  const palavrasEspeciadas = ["spice", "espec", "pimenta", "canela", "cardamomo", "oriental", "asad", "oud", "fakhar", "musamam", "khamrah"];
  const palavrasNoturnas = ["intense", "intenso", "oud", "asad", "club", "elixir", "black", "night", "noir", "khamrah", "bade", "amber"];
  const palavrasElegantes = ["royal", "ameer", "arab", "fakhar", "club", "noor", "lattafa", "armaf", "al", "gold", "prestige", "signature"];

  const possui = (lista: string[]) => lista.some((palavra) => texto.includes(palavra));

  if (produto.disponivel > 0) score += 16;
  if (produto.precoFinal > 0) score += 6;

  // Gênero/perfil do cliente
  if (genero && texto.includes(genero)) score += 34;
  if (genero === "feminino" && (texto.includes("fem") || possui(["yara", "rose", "ward", "sabah", "lay", "maya", "haya", "candy", "moi", "tous"]))) score += 26;
  if (genero === "masculino" && (texto.includes("masc") || possui(["asad", "hawas", "club", "fakhar", "zanzibar", "black", "watani"]))) score += 26;
  if (genero === "unissex" && (texto.includes("unissex") || possui(["oud", "bade", "oriental", "khamrah", "amber", "intense"]))) score += 24;

  // Família olfativa escolhida
  if (preferencia.includes("doce") || familia.includes("doce") || familia.includes("gourmand")) {
    if (possui(palavrasDoces)) score += 70;
    if (possui(palavrasAmadeiradas)) score -= 10;
  }

  if (preferencia.includes("amadeirado") || preferencia.includes("oud") || familia.includes("amadeir") || familia.includes("intenso")) {
    if (possui(palavrasAmadeiradas)) score += 74;
    if (possui(palavrasDoces) && !possui(["oud", "amber", "ambar", "oriental"])) score -= 8;
  }

  if (preferencia.includes("fresco") || familia.includes("fresco") || clima.includes("calor") || ocasiao.includes("dia")) {
    if (possui(palavrasFrescas)) score += 72;
    if (possui(palavrasNoturnas) && clima.includes("calor")) score -= 12;
  }

  if (preferencia.includes("especiado")) {
    if (possui(palavrasEspeciadas)) score += 68;
    if (possui(palavrasDoces)) score += 6;
  }

  // Intensidade e ocasião
  if (intensidade.includes("leve")) {
    if (possui(palavrasFrescas)) score += 28;
    if (possui(palavrasNoturnas)) score -= 16;
  }

  if (intensidade.includes("moderado")) {
    if (possui([...palavrasFrescas, ...palavrasDoces, ...palavrasElegantes])) score += 18;
  }

  if (intensidade.includes("intenso") || ocasiao.includes("noite") || ocasiao.includes("encontro") || estilo.includes("sedutor") || familia.includes("noturno")) {
    if (possui(palavrasNoturnas)) score += 46;
    if (possui(palavrasDoces) && ocasiao.includes("encontro")) score += 16;
  }

  if (estilo.includes("luxuoso") || estilo.includes("elegante")) {
    if (possui(palavrasElegantes)) score += 30;
    if (possui(palavrasAmadeiradas)) score += 12;
  }

  if (estilo.includes("moderno")) {
    if (possui(["hawas", "club", "yara", "candy", "blue", "zanzibar", "fresh"])) score += 24;
  }

  // Pequeno desempate determinístico por perfil, para evitar sempre os mesmos produtos quando há empate.
  score += getDesempatePorPerfil(produto, form, perfil) / 100;

  return score;
}

function analisarPerfilLocal(form: FormState): ResultadoIA {
  const perfilTexto = Object.values(form).map(normalizarTexto).join(" ");

  let familia = "Elegante / Versátil";
  let descricao =
    "Você combina com fragrâncias equilibradas, sofisticadas e fáceis de usar em diferentes momentos.";
  let intensidadeSugerida = "Moderada";
  let ocasiaoSugerida = "Uso diário e ocasiões especiais";
  let sugestaoAtendimento =
    "Buscar perfumes versáteis, com presença elegante e assinatura olfativa refinada.";

  if (
    perfilTexto.includes("doce") ||
    perfilTexto.includes("baunilha") ||
    perfilTexto.includes("gourmand")
  ) {
    familia = "Doce / Gourmand";
    descricao =
      "Seu perfil combina com perfumes doces, envolventes, confortáveis e memoráveis.";
    intensidadeSugerida = "Moderada a intensa";
    ocasiaoSugerida = "Encontros, noite e momentos especiais";
    sugestaoAtendimento =
      "Priorizar fragrâncias adocicadas, cremosas, femininas ou unissex com fundo marcante.";
  } else if (
    perfilTexto.includes("amadeirado") ||
    perfilTexto.includes("oud") ||
    perfilTexto.includes("intenso")
  ) {
    familia = "Amadeirado / Intenso";
    descricao =
      "Seu perfil combina com perfumes marcantes, sofisticados, de presença alta e assinatura luxuosa.";
    intensidadeSugerida = "Intensa";
    ocasiaoSugerida = "Noite, eventos e presença pessoal";
    sugestaoAtendimento =
      "Indicar fragrâncias com madeira, oud, âmbar, especiarias ou perfil oriental sofisticado.";
  } else if (
    perfilTexto.includes("fresco") ||
    perfilTexto.includes("dia") ||
    perfilTexto.includes("calor")
  ) {
    familia = "Fresco / Versátil";
    descricao =
      "Seu perfil combina com fragrâncias leves, elegantes, limpas e confortáveis para o dia a dia.";
    intensidadeSugerida = "Leve a moderada";
    ocasiaoSugerida = "Dia a dia, trabalho e clima quente";
    sugestaoAtendimento =
      "Sugerir perfumes frescos, cítricos, aromáticos ou limpos, com boa versatilidade.";
  } else if (
    perfilTexto.includes("noite") ||
    perfilTexto.includes("encontro") ||
    perfilTexto.includes("sedutor")
  ) {
    familia = "Noturno / Marcante";
    descricao =
      "Seu perfil combina com perfumes intensos, sensuais, memoráveis e perfeitos para ocasiões especiais.";
    intensidadeSugerida = "Moderada a intensa";
    ocasiaoSugerida = "Noite, encontro e eventos";
    sugestaoAtendimento =
      "Buscar opções com rastro marcante, boa fixação e apelo emocional para momentos especiais.";
  }

  const tags = [
    form.genero || "Unissex",
    form.intensidade || intensidadeSugerida,
    form.estilo || "Elegante",
    form.ocasiao || ocasiaoSugerida,
  ].filter(Boolean);

  return {
    sucesso: true,
    origem: "local",
    perfil: {
      familia,
      descricao,
      tags,
      intensidadeSugerida,
      ocasiaoSugerida,
      sugestaoAtendimento,
    },
    mensagem: "Perfil olfativo analisado pela Perfume IA Maison Noor.",
  };
}

function gerarMensagemWhatsapp(form: FormState, resultado: ResultadoIA | null) {
  const familia = resultado?.perfil?.familia || "perfil olfativo Maison Noor";
  const descricao = resultado?.perfil?.descricao || "";
  const sugestao = resultado?.perfil?.sugestaoAtendimento || "";

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
${sugestao ? `\nDireção sugerida: ${sugestao}` : ""}

Pode me indicar perfumes disponíveis que combinam comigo?`
  );
}

export default function PerfumeIA() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [produtos, setProdutos] = useState<ProdutoIA[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function carregarProdutos() {
      setLoadingProdutos(true);
      try {
        const snapshot = await getDocs(query(productsCollection));
        if (cancelled) return;

        const lista: ProdutoIA[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const nome = String(data.nome ?? data.name ?? "").trim();
          const precoFinal = Number(data.precoVenda ?? data.preco ?? data.price ?? 0);
          const estoque = Number(data.estoque ?? 0);
          const reservado = Number(data.reservado ?? 0);
          const disponivel = Math.max(0, estoque - reservado);

          if (!nome || precoFinal <= 0 || data.ativo === false) return;

          lista.push({
            id: docSnap.id,
            nome,
            marca: data.marca,
            tipo: data.tipo,
            categoria: data.categoria,
            volumeMl: data.volumeMl,
            precoVenda: precoFinal,
            precoFinal,
            estoque,
            reservado,
            disponivel,
            imagem: getImagemProduto(data, nome),
            observacoes: data.observacoes,
          });
        });

        lista.sort((a, b) => b.disponivel - a.disponivel || a.nome.localeCompare(b.nome));
        setProdutos(lista);
      } catch (error) {
        console.error("Erro ao carregar produtos para Perfume IA:", error);
      } finally {
        if (!cancelled) setLoadingProdutos(false);
      }
    }

    carregarProdutos();

    return () => {
      cancelled = true;
    };
  }, []);

  const preenchidos = useMemo(() => {
    return Object.values(form).filter(Boolean).length;
  }, [form]);

  const progresso = Math.round((preenchidos / fields.length) * 100);

  const recomendados = useMemo(() => {
    if (!resultado?.perfil || produtos.length === 0) return [];

    const generoEscolhido = normalizarTexto(form.genero);
    const disponiveis = produtos.filter((produto) => produto.disponivel > 0);

    const generoRestrito = generoEscolhido
      ? disponiveis.filter((produto) => produtoCombinaComGenero(produto, generoEscolhido, false))
      : disponiveis;

    const generoFlexivel = generoEscolhido
      ? disponiveis.filter((produto) => produtoCombinaComGenero(produto, generoEscolhido, true))
      : disponiveis;

    const poolProdutos =
      generoRestrito.length >= 3
        ? generoRestrito
        : generoFlexivel.length >= 3
          ? generoFlexivel
          : generoRestrito.length > 0
            ? generoRestrito
            : generoFlexivel.length > 0
              ? generoFlexivel
              : disponiveis;

    const avaliados = poolProdutos
      .map((produto) => {
        const score = calcularScoreProduto(produto, form, resultado.perfil);
        return {
          ...produto,
          score,
          motivo: getMotivoRecomendacao(produto, form, resultado.perfil),
        };
      })
      .sort((a, b) => {
        const diferencaScore = Number(b.score || 0) - Number(a.score || 0);
        if (Math.abs(diferencaScore) > 0.01) return diferencaScore;
        return getDesempatePorPerfil(a, form, resultado.perfil) - getDesempatePorPerfil(b, form, resultado.perfil);
      });

    const fortes = avaliados.filter((produto) => Number(produto.score || 0) >= 55);
    const base = fortes.length >= 3 ? fortes : avaliados;

    const escolhidos: typeof avaliados = [];
    const marcasUsadas = new Set<string>();
    const nomesUsados = new Set<string>();

    for (const produto of base) {
      const marca = normalizarTexto(produto.marca || produto.tipo || "maison");
      const nomeChave = normalizarTexto(produto.nome).split(" ").slice(0, 2).join(" ");

      if (nomesUsados.has(nomeChave)) continue;
      if (marcasUsadas.has(marca) && escolhidos.length < 2 && base.length > 3) continue;

      escolhidos.push(produto);
      marcasUsadas.add(marca);
      nomesUsados.add(nomeChave);

      if (escolhidos.length >= 3) break;
    }

    if (escolhidos.length < 3) {
      for (const produto of avaliados) {
        if (escolhidos.some((item) => item.id === produto.id)) continue;
        escolhidos.push(produto);
        if (escolhidos.length >= 3) break;
      }
    }

    return escolhidos;
  }, [form, produtos, resultado]);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setAviso("");
  }

  async function analisarPerfil() {
    setAviso("");
    setLoading(true);
    setResultado(null);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6500);

      const response = await fetch("/api/perfume-ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      let data: ResultadoIA | null = null;
      try {
        data = (await response.json()) as ResultadoIA;
      } catch {
        data = null;
      }

      if (response.ok && data?.sucesso !== false && data?.perfil) {
        setResultado({ ...data, origem: "api" });
        return;
      }

      const fallback = analisarPerfilLocal(form);
      setResultado(fallback);
      setAviso("A análise foi feita em modo consultivo local para manter a experiência ativa.");
    } catch (error) {
      console.error("Perfume IA fallback:", error);
      const fallback = analisarPerfilLocal(form);
      setResultado(fallback);
      setAviso("A análise foi feita em modo consultivo local para manter a experiência ativa.");
    } finally {
      setLoading(false);
    }
  }

  function limparPerfil() {
    setForm(initialForm);
    setResultado(null);
    setAviso("");
  }

  return (
    <section style={styles.shell}>
      <div style={styles.bgGlowOne} />
      <div style={styles.bgGlowTwo} />

      <div style={styles.header}>
        <div style={styles.topBar}>
          <div style={styles.logoRow}>
            <span style={styles.seal}>Maison Noor IA</span>
            <span style={styles.liveBadge}>Consultoria digital</span>
          </div>

          <Link href="/" style={styles.homeLink}>
            ← Voltar à Maison Noor
          </Link>
        </div>

        <h1 style={styles.title}>Descubra seu perfil olfativo</h1>

        <p style={styles.subtitle}>
          Responda perguntas rápidas e receba uma leitura olfativa com o estilo
          de fragrância que mais combina com você.
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

          {aviso && <div style={styles.noticeBox}>{aviso}</div>}

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
              {loading ? "Analisando..." : "Analisar meu perfil"}
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

          <div style={styles.resultDetailsGrid}>
            <div style={styles.resultDetailCard}>
              <span>Intensidade sugerida</span>
              <strong>{resultado.perfil.intensidadeSugerida || "Equilibrada"}</strong>
            </div>
            <div style={styles.resultDetailCard}>
              <span>Melhor ocasião</span>
              <strong>{resultado.perfil.ocasiaoSugerida || "Uso especial"}</strong>
            </div>
          </div>


          {loadingProdutos && (
            <div style={styles.recommendLoading}>
              Buscando perfumes reais da vitrine Maison Noor...
            </div>
          )}

          {!loadingProdutos && recomendados.length > 0 && (
            <div style={styles.productRecommendSection}>
              <div style={styles.productRecommendHeader}>
                <span style={styles.resultKicker}>Recomendação da vitrine</span>
                <strong>Perfumes que mais combinam com seu perfil</strong>
              </div>

              <div style={styles.productRecommendGrid}>
                {recomendados.map((produto) => (
                  <article key={produto.id} style={styles.productCard}>
                    <Link href={`/produto/${produto.id}`} style={styles.productImageLink}>
                      <img
                        src={produto.imagem}
                        alt={produto.nome}
                        loading="lazy"
                        decoding="async"
                        style={styles.productImage}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/produtos/sem-imagem.png";
                        }}
                      />
                    </Link>

                    <div style={styles.productInfo}>
                      <span style={styles.productMeta}>
                        {produto.volumeMl ? `${produto.volumeMl}ml` : produto.tipo || produto.marca || "Maison Noor"}
                      </span>
                      <Link href={`/produto/${produto.id}`} style={styles.productNameLink}>
                        {produto.nome}
                      </Link>
                      <span style={styles.productReason}>Por que recomendamos: {produto.motivo}</span>
                      <strong style={styles.productPrice}>{formatarMoeda(produto.precoFinal)}</strong>

                      <div style={styles.productActions}>
                        <Link href={`/produto/${produto.id}`} style={styles.viewProductButton}>
                          Ver fragrância
                        </Link>
                        <a
                          href={`https://wa.me/5512982627108?text=${encodeURIComponent(
                            `Olá! Fiz a Perfume IA e ela indicou o perfume ${produto.nome}. Gostaria de atendimento para comprar ou confirmar se combina comigo.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.productWhatsappButton}
                        >
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div style={styles.resultBottom}>
            <div style={styles.recommendBox}>
              <strong>Próximo passo</strong>
              <span>
                {recomendados.length > 0
                  ? "A Perfume IA selecionou fragrâncias reais da vitrine Maison Noor para esse perfil."
                  : "Fale com a Maison Noor para receber opções disponíveis no estoque que combinam com esse perfil."}
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
    width: "min(100%, 1180px)",
    margin: "0 auto",
    borderRadius: "22px",
    border: "1px solid rgba(216, 193, 162, 0.22)",
    background:
      "radial-gradient(circle at 15% 10%, rgba(212,175,119,0.18), transparent 28%), linear-gradient(135deg, #120E0A 0%, #1E1711 48%, #090806 100%)",
    padding: "clamp(12px, 1.55vw, 18px)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.30)",
    color: "#F8EBD8",
    fontFamily: "Inter, Arial, sans-serif",
    boxSizing: "border-box",
  },
  bgGlowOne: {
    position: "absolute",
    width: "280px",
    height: "280px",
    borderRadius: "999px",
    right: "-110px",
    top: "-100px",
    background: "rgba(212, 175, 119, 0.14)",
    filter: "blur(18px)",
  },
  bgGlowTwo: {
    position: "absolute",
    width: "220px",
    height: "220px",
    borderRadius: "999px",
    left: "-90px",
    bottom: "-100px",
    background: "rgba(255, 244, 220, 0.06)",
    filter: "blur(18px)",
  },
  header: {
    position: "relative",
    zIndex: 2,
    maxWidth: "100%",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "8px",
  },
  logoRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  seal: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "30px",
    padding: "0 12px",
    borderRadius: "999px",
    border: "1px solid rgba(216, 193, 162, 0.30)",
    background: "rgba(212,175,119,0.12)",
    color: "#E8C98E",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  homeLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "31px",
    padding: "0 13px",
    borderRadius: "999px",
    border: "1px solid rgba(216, 193, 162, 0.32)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(212,175,119,0.10))",
    color: "#F1D7A8",
    fontSize: "11px",
    fontWeight: 900,
    textDecoration: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "30px",
    padding: "0 12px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(248,235,216,0.72)",
    fontSize: "11px",
    fontWeight: 700,
  },
  title: {
    margin: "0 0 8px",
    color: "#FFF7EA",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(26px, 3vw, 36px)",
    lineHeight: 1.01,
    letterSpacing: "-0.052em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(248,235,216,0.75)",
    fontSize: "clamp(12px, 1.2vw, 14px)",
    lineHeight: 1.45,
    maxWidth: "660px",
  },
  progressCard: {
    marginTop: "10px",
    borderRadius: "14px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "rgba(255,255,255,0.055)",
    padding: "9px 10px",
    maxWidth: "520px",
  },
  progressTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "8px",
  },
  progressLabel: {
    color: "rgba(248,235,216,0.72)",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
  },
  progressValue: {
    color: "#E8C98E",
    fontSize: "13px",
  },
  progressTrack: {
    height: "8px",
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
    marginTop: "8px",
    color: "rgba(248,235,216,0.55)",
    lineHeight: 1.45,
    fontSize: "12px",
  },
  contentGrid: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(300px, 0.95fr)",
    gap: "14px",
    marginTop: "12px",
  },
  formPanel: {
    borderRadius: "20px",
    border: "1px solid rgba(216,193,162,0.18)",
    background: "rgba(255,255,255,0.075)",
    padding: "clamp(12px, 1.35vw, 16px)",
    backdropFilter: "blur(12px)",
  },
  formHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "8px",
  },
  formKicker: {
    color: "#D8BE97",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.17em",
    textTransform: "uppercase",
  },
  formTitle: {
    color: "#FFF7EA",
    fontSize: "17px",
  },
  fieldsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
    gap: "10px",
  },
  fieldCard: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    borderRadius: "14px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "rgba(0,0,0,0.22)",
    padding: "9px",
  },
  fieldTop: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  fieldIcon: {
    width: "31px",
    height: "31px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#241A12",
    fontSize: "15px",
    flexShrink: 0,
  },
  fieldLabel: {
    display: "block",
    color: "#FFF7EA",
    fontSize: "13px",
    marginBottom: "2px",
  },
  fieldHelp: {
    display: "block",
    color: "rgba(248,235,216,0.56)",
    fontSize: "11px",
  },
  select: {
    width: "100%",
    minHeight: "40px",
    borderRadius: "14px",
    border: "1px solid rgba(216,193,162,0.24)",
    background: "#FFF8EF",
    color: "#2B2118",
    padding: "0 12px",
    fontSize: "13px",
    fontWeight: 700,
    outline: "none",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  noticeBox: {
    marginTop: "14px",
    borderRadius: "14px",
    border: "1px solid rgba(216, 193, 162, 0.24)",
    background: "rgba(212,175,119,0.10)",
    color: "#F6DDAE",
    padding: "11px 12px",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "12px",
  },
  primaryButton: {
    minHeight: "44px",
    borderRadius: "16px",
    border: "1px solid rgba(255, 232, 184, 0.42)",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#211810",
    padding: "0 20px",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    boxShadow: "0 14px 28px rgba(120,87,45,0.22)",
  },
  secondaryButton: {
    minHeight: "44px",
    borderRadius: "16px",
    border: "1px solid rgba(216,193,162,0.20)",
    background: "rgba(255,255,255,0.07)",
    color: "#F8EBD8",
    padding: "0 18px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  asidePanel: {
    borderRadius: "24px",
    border: "1px solid rgba(216,193,162,0.16)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
    padding: "16px",
    alignSelf: "start",
  },
  asideIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#211810",
    fontWeight: 900,
    marginBottom: "13px",
  },
  asideTitle: {
    display: "block",
    color: "#FFF7EA",
    fontSize: "17px",
    lineHeight: 1.1,
    marginBottom: "9px",
  },
  asideText: {
    margin: 0,
    color: "rgba(248,235,216,0.68)",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  asideList: {
    display: "grid",
    gap: "8px",
    marginTop: "11px",
    color: "#E8C98E",
    fontSize: "12px",
    fontWeight: 800,
  },
  resultPanel: {
    position: "relative",
    zIndex: 2,
    marginTop: "14px",
    borderRadius: "22px",
    border: "1px solid rgba(216,193,162,0.24)",
    background:
      "radial-gradient(circle at top right, rgba(34,197,94,0.10), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.055))",
    padding: "clamp(14px, 1.8vw, 20px)",
    boxShadow: "0 18px 38px rgba(0,0,0,0.18)",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  resultKicker: {
    color: "#D8BE97",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  resultTitle: {
    margin: "6px 0 0",
    color: "#FFF7EA",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(24px, 2.6vw, 32px)",
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
  },
  resultSeal: {
    borderRadius: "999px",
    background: "rgba(212,175,119,0.14)",
    border: "1px solid rgba(216,193,162,0.24)",
    color: "#E8C98E",
    padding: "9px 12px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.17em",
    textTransform: "uppercase",
  },
  resultText: {
    margin: "10px 0 0",
    color: "rgba(248,235,216,0.76)",
    fontSize: "15px",
    lineHeight: 1.455,
    maxWidth: "820px",
  },
  tagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "11px",
  },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "28px",
    borderRadius: "999px",
    border: "1px solid rgba(216,193,162,0.22)",
    background: "rgba(212,175,119,0.12)",
    color: "#F2D39A",
    padding: "0 12px",
    fontSize: "12px",
    fontWeight: 800,
  },
  resultDetailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "10px",
    marginTop: "10px",
  },
  resultDetailCard: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    borderRadius: "16px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "rgba(0,0,0,0.18)",
    padding: "9px",
    color: "rgba(248,235,216,0.70)",
    fontSize: "12px",
  },
  resultBottom: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid rgba(216,193,162,0.14)",
  },
  recommendBox: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    color: "rgba(248,235,216,0.72)",
    fontSize: "13px",
    lineHeight: 1.45,
    maxWidth: "580px",
  },

  recommendLoading: {
    marginTop: "10px",
    borderRadius: "14px",
    border: "1px solid rgba(216,193,162,0.16)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(248,235,216,0.68)",
    padding: "10px",
    fontSize: "13px",
  },
  productRecommendSection: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid rgba(216,193,162,0.14)",
  },
  productRecommendHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#FFF7EA",
    fontSize: "19px",
    marginBottom: "9px",
  },
  productRecommendGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
    gap: "10px",
  },
  productCard: {
    display: "grid",
    gridTemplateColumns: "82px 1fr",
    gap: "13px",
    borderRadius: "20px",
    border: "1px solid rgba(216,193,162,0.18)",
    background: "rgba(255,255,255,0.07)",
    padding: "10px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  productImageLink: {
    width: "82px",
    height: "96px",
    borderRadius: "16px",
    background: "linear-gradient(180deg, rgba(255,248,239,0.98), rgba(235,219,198,0.84))",
    border: "1px solid rgba(216,193,162,0.22)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productImage: {
    width: "72px",
    height: "84px",
    objectFit: "contain",
    mixBlendMode: "multiply",
    filter: "drop-shadow(0 10px 18px rgba(40,28,18,0.16))",
  },
  productInfo: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  productMeta: {
    color: "#D8BE97",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  productNameLink: {
    color: "#FFF7EA",
    textDecoration: "none",
    fontSize: "15px",
    fontWeight: 900,
    lineHeight: 1.14,
  },
  productReason: {
    color: "rgba(248,235,216,0.66)",
    fontSize: "12px",
    lineHeight: 1.42,
  },
  productPrice: {
    color: "#E8C98E",
    fontSize: "15px",
  },
  productActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginTop: "4px",
  },
  viewProductButton: {
    minHeight: "36px",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    color: "#211810",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: "11px",
    fontWeight: 900,
  },
  productWhatsappButton: {
    minHeight: "36px",
    borderRadius: "12px",
    border: "1px solid rgba(34,197,94,0.26)",
    background: "rgba(34,197,94,0.12)",
    color: "#BBF7D0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: "11px",
    fontWeight: 900,
  },
  whatsappButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    borderRadius: "16px",
    border: "1px solid rgba(34,197,94,0.34)",
    background: "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(22,163,74,0.12))",
    color: "#BBF7D0",
    textDecoration: "none",
    padding: "0 18px",
    fontSize: "13px",
    fontWeight: 900,
    boxShadow: "0 14px 28px rgba(22,163,74,0.10)",
  },
};
