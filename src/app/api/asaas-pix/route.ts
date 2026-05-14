import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const SITE_URL = "https://www.maisonnoor.com.br";
const PEDIDOS_COLLECTION = "pedidos";
const CONTEXTOS_COLLECTION = "whatsapp_contextos";
const ASAAS_API_URL =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

type ProdutoBot = {
  id: string;
  nome: string;
  marca?: string;
  categoria?: string;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  imagem?: string;
  imageUrl?: string;
  observacoes?: string;
  descricao?: string;
  tipo?: string;
  familiaOlfativa?: string;
  notasTopo?: string;
  notasCoracao?: string;
  notasFundo?: string;
};

type ContextoConversa = {
  telefone?: string;
  ultimaMensagem?: string;
  ultimaResposta?: string;
  ultimoProdutoId?: string;
  ultimoProdutoNome?: string;
  ultimoProdutoPreco?: number;
  ultimaCategoria?: string;
  ultimaIntencao?: string;
  pedidoEmAndamentoId?: string;
  pedidoEmAndamentoStatus?: string;
  ultimoPedidoId?: string;
  ultimoPedidoStatus?: string;
  atualizadoEm?: unknown;
  criadoEm?: unknown;
};

type DadosPedidoMensagem = {
  nome?: string;
  cpf?: string;
  cep?: string;
  cidadeOuBairro?: string;
  formaPagamento?: "pix" | "cartao" | "cartão";
};

function normalizarTexto(texto: unknown) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,”“\"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatarMoeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function limparCpf(cpf: unknown) {
  return String(cpf || "").replace(/\D/g, "");
}

function cpfValido(cpf: unknown) {
  const clean = limparCpf(cpf);
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(clean[i]) * (10 - i);
  let digito = (soma * 10) % 11;
  if (digito === 10) digito = 0;
  if (digito !== Number(clean[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(clean[i]) * (11 - i);
  digito = (soma * 10) % 11;
  if (digito === 10) digito = 0;
  return digito === Number(clean[10]);
}

function getAsaasToken() {
  return String(
    process.env.ASAAS_API_KEY_PROD ||
      process.env.ASAAS_API_KEY ||
      process.env.ASAAS_TOKEN ||
      ""
  ).trim();
}

function extrairMensagemErroAsaas(data: any) {
  return (
    data?.errors?.[0]?.description ||
    data?.error_messages?.[0]?.description ||
    data?.error ||
    data?.message ||
    "Erro ao gerar Pix no Asaas."
  );
}

function extrairMensagem(body: any) {
  const mensagemZapi =
    body?.text?.message ||
    body?.message?.text ||
    body?.data?.text?.message ||
    body?.data?.message?.text;

  const mensagemMeta =
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

  return String(
    mensagemZapi ||
      mensagemMeta ||
      body?.message ||
      body?.mensagem ||
      body?.text ||
      body?.body ||
      body?.data?.message ||
      body?.data?.text ||
      body?.data?.body ||
      ""
  ).trim();
}

function extrairTelefoneZapi(body: any) {
  return String(
    body?.phone ||
      body?.senderPhone ||
      body?.from ||
      body?.data?.phone ||
      ""
  )
    .replace(/\D/g, "")
    .trim();
}

function extrairTelefoneWhatsAppMeta(body: any) {
  return String(
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || ""
  )
    .replace(/\D/g, "")
    .trim();
}

function isWebhookZapi(body: any) {
  return Boolean(
    body?.phone ||
      body?.senderPhone ||
      body?.text?.message ||
      body?.fromMe !== undefined ||
      body?.data?.phone
  );
}

function isWebhookWhatsAppMeta(body: any) {
  return Boolean(body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]);
}

function categoriaLabel(categoria?: string) {
  const cat = normalizarTexto(categoria);
  if (cat.includes("fem")) return "Feminino";
  if (cat.includes("masc")) return "Masculino";
  if (cat.includes("unissex") || cat.includes("unisex")) return "Unissex";
  if (cat.includes("kit") || cat.includes("presente")) return "Kit presente";
  return "Maison Noor";
}

function categoriaBate(categoriaProduto: string | undefined, categoriaBusca: string) {
  const produto = normalizarTexto(categoriaProduto);
  const busca = normalizarTexto(categoriaBusca);
  if (busca === "feminino") return produto.includes("fem");
  if (busca === "masculino") return produto.includes("masc");
  if (busca === "unissex") return produto.includes("unissex") || produto.includes("unisex");
  if (busca === "kits-presente") return produto.includes("kit") || produto.includes("presente");
  return produto === busca;
}

function produtoDisponivel(produto: ProdutoBot) {
  const estoque = Number(produto.estoque || 0);
  const reservado = Number(produto.reservado || 0);
  return Math.max(0, estoque - reservado);
}

function linkProduto(produto: ProdutoBot) {
  return `${SITE_URL}/produto/${produto.id}`;
}

async function buscarProdutos() {
  const snapshot = await adminDb.collection("products").get();
  const produtos: ProdutoBot[] = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as any;
    produtos.push({
      id: docSnap.id,
      nome: String(data.nome || data.name || data.title || ""),
      marca: String(data.marca || data.brand || ""),
      categoria: String(data.categoria || data.category || ""),
      precoVenda: Number(data.precoVenda ?? data.preco ?? data.price ?? data.valor ?? 0),
      estoque: Number(data.estoque ?? data.stock ?? data.quantidade ?? data.qtd ?? 0),
      reservado: Number(data.reservado ?? data.reserved ?? 0),
      ativo: data.ativo ?? data.active ?? true,
      imagem: data.imagem,
      imageUrl: data.imageUrl,
      observacoes: data.observacoes,
      descricao: data.descricao,
      tipo: data.tipo,
      familiaOlfativa: data.familiaOlfativa,
      notasTopo: data.notasTopo,
      notasCoracao: data.notasCoracao,
      notasFundo: data.notasFundo,
    });
  });

  return produtos
    .filter((p) => p.ativo !== false)
    .filter((p) => p.nome)
    .filter((p) => Number(p.precoVenda || 0) > 0);
}

async function lerContexto(telefone?: string): Promise<ContextoConversa | null> {
  if (!telefone) return null;
  try {
    const ref = adminDb.collection(CONTEXTOS_COLLECTION).doc(telefone);
    const snap = await ref.get();
    if (!snap.exists) return null;
    return snap.data() as ContextoConversa;
  } catch (error) {
    console.error("Erro ao ler contexto do WhatsApp:", error);
    return null;
  }
}

async function salvarContexto(telefone: string | undefined, dados: Partial<ContextoConversa>) {
  if (!telefone) return;
  try {
    const ref = adminDb.collection(CONTEXTOS_COLLECTION).doc(telefone);
    const snap = await ref.get();
    await ref.set(
      {
        telefone,
        ...(snap.exists ? {} : { criadoEm: FieldValue.serverTimestamp() }),
        ...dados,
        atualizadoEm: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Erro ao salvar contexto do WhatsApp:", error);
  }
}

function montarRespostaProduto(produto: ProdutoBot) {
  const disponivel = produtoDisponivel(produto);
  const preco = Number(produto.precoVenda || 0);

  if (disponivel <= 0) {
    return `✨ Encontrei o perfume *${produto.nome}*, mas no momento ele está indisponível.

Categoria: ${categoriaLabel(produto.categoria)}
Valor: ${formatarMoeda(preco)}

Posso te indicar uma fragrância parecida ou avisar quando chegar reposição?`;
  }

  return `✨ Temos sim!

*${produto.nome}*
Categoria: ${categoriaLabel(produto.categoria)}
Valor: *${formatarMoeda(preco)}*
Disponibilidade: *disponível para compra*

Link do produto:
${linkProduto(produto)}

Para comprar, você pode responder *quero comprar* que eu já inicio seu pedido por aqui.`;
}

function montarListaCategoria(produtos: ProdutoBot[], categoria: string) {
  const filtrados = produtos
    .filter((p) => categoriaBate(p.categoria, categoria))
    .filter((p) => produtoDisponivel(p) > 0)
    .slice(0, 8);

  if (!filtrados.length) {
    return `No momento não encontrei perfumes disponíveis nessa categoria. Posso te ajudar com outra opção?`;
  }

  const titulo =
    categoria === "feminino"
      ? "perfumes femininos"
      : categoria === "masculino"
      ? "perfumes masculinos"
      : categoria === "unissex"
      ? "perfumes unissex"
      : "kits presente";

  const lista = filtrados
    .map((p, index) => `${index + 1}. *${p.nome}* — ${formatarMoeda(Number(p.precoVenda || 0))} — disponível`)
    .join("\n");

  return `✨ Encontrei estes ${titulo} disponíveis na Maison Noor:

${lista}

Quer que eu te envie o link de algum deles?`;
}

function montarRespostaGenerica() {
  return `Olá! Eu sou o assistente virtual da Maison Noor ✨

Posso te ajudar com:
1. Consultar preço de um perfume
2. Ver disponibilidade
3. Listar perfumes femininos, masculinos ou unissex
4. Ajudar você a escolher uma fragrância
5. Iniciar um pedido pelo WhatsApp

Me diga o nome do perfume ou o tipo que você procura.`;
}

function tokenizarBusca(mensagem: string) {
  const palavrasIgnoradas = new Set([
    "tem", "voce", "voces", "preco", "valor", "perfume", "perfum", "produto",
    "quero", "saber", "sobre", "qual", "quanto", "custa", "disponivel", "estoque",
    "do", "da", "de", "o", "a", "os", "as", "um", "uma", "no", "na", "para", "pra",
    "comprar", "pedido", "finalizar",
  ]);

  return normalizarTexto(mensagem)
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.length >= 3)
    .filter((p) => !palavrasIgnoradas.has(p));
}

function encontrarProdutoPorMensagem(produtos: ProdutoBot[], mensagem: string) {
  const msg = normalizarTexto(mensagem);
  const tokensBusca = tokenizarBusca(mensagem);
  if (!tokensBusca.length) return undefined;

  const fraseBusca = tokensBusca.join(" ");
  const candidatos = produtos
    .map((produto) => {
      const nome = normalizarTexto(produto.nome || "");
      const marca = normalizarTexto(produto.marca || "");
      const tokensNome = nome.split(" ").filter((p) => p.length >= 3);
      let score = 0;
      if (!nome) return { produto, score: 0 };

      if (msg.includes(nome)) score += 1000;
      if (nome === fraseBusca) score += 900;
      if (nome.includes(fraseBusca)) score += 750;
      if (fraseBusca.includes(nome)) score += 650;
      if (marca && msg.includes(marca)) score += 80;

      const acertosExatos = tokensBusca.filter((token) => tokensNome.includes(token));
      const acertosParciais = tokensBusca.filter((token) =>
        tokensNome.some((n) => n.includes(token) || token.includes(n))
      );
      score += acertosExatos.length * 180;
      score += acertosParciais.length * 70;

      const faltantes = tokensBusca.filter(
        (token) => !tokensNome.some((n) => n.includes(token) || token.includes(n))
      );
      score -= faltantes.length * 220;
      if (tokensBusca.length >= 2 && acertosExatos.length >= 2) score += 260;
      if (tokensBusca.length >= 2 && acertosExatos.length < 2) score -= 260;
      if (produtoDisponivel(produto) > 0) score += 15;
      return { produto, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const melhor = candidatos[0];
  if (!melhor || melhor.score < 120) return undefined;
  return melhor.produto;
}

function detectarIntencao(mensagem: string) {
  const msg = normalizarTexto(mensagem);

  if (/\b(comprar|compra|quero comprar|finalizar|fechar pedido|pode reservar|reserva|reservar|vou querer|quero esse|quero essa)\b/.test(msg)) return "comprar";
  if (/\b(status|pedido|meu pedido|acompanhar|rastreio|rastreamento|cadastro do pedido|andamento)\b/.test(msg)) return "status_pedido";
  if (/\b(atendente|humano|pessoa|falar com alguem|falar com atendente|vendedor|consultor|consultora)\b/.test(msg)) return "humano";
  if (/\b(encomenda|encomendar|traz por encomenda|sob encomenda|fornecedor|consegue trazer)\b/.test(msg)) return "encomenda";
  if (/\b(entrega|frete|envio|cep|chega|prazo|retirar|retirada)\b/.test(msg)) return "entrega";
  if (/\b(pix|cartao|cartão|credito|crédito|debito|débito|parcel|pagamento|pagar)\b/.test(msg)) return "pagamento";
  if (/\b(troca|devolver|devolucao|devolução|reclama|problema|errado|urgente)\b/.test(msg)) return "humano";
  if (/\b(presente|esposa|namorada|mae|mãe|aniversario|aniversário|namorado|marido)\b/.test(msg)) return "presente";
  if (/\b(doce|adocicado|baunilha|vanilla|gourmand|candy)\b/.test(msg)) return "perfil_doce";
  if (/\b(fresco|fresh|citrico|cítrico|limpo|leve|verao|verão|dia a dia)\b/.test(msg)) return "perfil_fresco";
  if (/\b(amadeirado|madeira|oud|intenso|forte|marcante|noturno|noite)\b/.test(msg)) return "perfil_intenso";
  if (/\b(parecido|similar|lembra|contratipo|inspirado)\b/.test(msg)) return "similar";
  return "catalogo";
}

function produtoPorId(produtos: ProdutoBot[], id?: string) {
  if (!id) return undefined;
  return produtos.find((p) => p.id === id);
}

function textoProdutoBusca(produto: ProdutoBot) {
  return normalizarTexto(
    `${produto.nome} ${produto.marca || ""} ${produto.categoria || ""} ${produto.tipo || ""} ${produto.observacoes || ""} ${produto.descricao || ""} ${produto.familiaOlfativa || ""} ${produto.notasTopo || ""} ${produto.notasCoracao || ""} ${produto.notasFundo || ""}`
  );
}

function recomendarPorPerfil(produtos: ProdutoBot[], perfil: "doce" | "fresco" | "intenso" | "presente" | "similar", mensagem = "") {
  const msg = normalizarTexto(mensagem);
  const filtrados = produtos
    .filter((p) => produtoDisponivel(p) > 0)
    .map((produto) => {
      const texto = textoProdutoBusca(produto);
      let score = 0;

      if (perfil === "doce") {
        if (texto.includes("doce") || texto.includes("gourmand") || texto.includes("baunilha") || texto.includes("vanilla") || texto.includes("candy") || texto.includes("yara")) score += 8;
        if (categoriaBate(produto.categoria, "feminino")) score += 2;
      }
      if (perfil === "fresco") {
        if (texto.includes("fresh") || texto.includes("fresco") || texto.includes("citr") || texto.includes("limpo") || texto.includes("aquatico") || texto.includes("leve")) score += 8;
        if (categoriaBate(produto.categoria, "unissex")) score += 2;
      }
      if (perfil === "intenso") {
        if (texto.includes("oud") || texto.includes("amadeir") || texto.includes("oriental") || texto.includes("ambar") || texto.includes("âmbar") || texto.includes("intenso") || texto.includes("forte")) score += 8;
        if (categoriaBate(produto.categoria, "masculino") || categoriaBate(produto.categoria, "unissex")) score += 2;
      }
      if (perfil === "presente") {
        if (categoriaBate(produto.categoria, "feminino")) score += 4;
        if (texto.includes("yara") || texto.includes("rose") || texto.includes("floral") || texto.includes("presente") || texto.includes("doce")) score += 4;
      }
      if (perfil === "similar") {
        const tokens = tokenizarBusca(msg);
        score += tokens.filter((token) => texto.includes(token)).length * 4;
        if (texto.includes("sofisticado") || texto.includes("doce") || texto.includes("floral") || texto.includes("intenso")) score += 2;
      }
      return { produto, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.produto);

  const fallback = produtos.filter((p) => produtoDisponivel(p) > 0).slice(0, 5);
  const lista = filtrados.length ? filtrados : fallback;
  const titulo =
    perfil === "doce"
      ? "opções doces e envolventes"
      : perfil === "fresco"
      ? "opções frescas e elegantes"
      : perfil === "intenso"
      ? "opções marcantes e intensas"
      : perfil === "presente"
      ? "opções para presente"
      : "opções parecidas";

  return `✨ Separei algumas ${titulo} da Maison Noor:

${lista
    .map((p, index) => `${index + 1}. *${p.nome}* — ${formatarMoeda(Number(p.precoVenda || 0))}`)
    .join("\n")}

Me diga o nome de uma delas que eu te envio o link e os detalhes.`;
}

function extrairDadosPedidoDaMensagem(mensagem: string): DadosPedidoMensagem {
  const linhas = mensagem.split(/\n|\r|;/g).map((l) => l.trim()).filter(Boolean);
  const msg = normalizarTexto(mensagem);
  const dados: DadosPedidoMensagem = {};

  for (const linha of linhas) {
    const normalizada = normalizarTexto(linha);
    const valor = linha.split(":").slice(1).join(":").trim();
    if (!valor) continue;

    if (normalizada.startsWith("nome")) dados.nome = valor;
    if (normalizada.startsWith("cpf") || normalizada.startsWith("documento")) dados.cpf = limparCpf(valor);
    if (normalizada.startsWith("cep")) dados.cep = valor.replace(/\D/g, "").slice(0, 8);
    if (normalizada.startsWith("cidade") || normalizada.startsWith("bairro") || normalizada.startsWith("endereco") || normalizada.startsWith("endereço")) dados.cidadeOuBairro = valor;
    if (normalizada.startsWith("pagamento") || normalizada.startsWith("forma")) {
      const forma = normalizarTexto(valor);
      if (forma.includes("pix")) dados.formaPagamento = "pix";
      if (forma.includes("cart")) dados.formaPagamento = "cartao";
    }
  }

  if (!dados.cpf) {
    const cpfMatch = mensagem.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    if (cpfMatch) dados.cpf = limparCpf(cpfMatch[0]);
  }

  if (!dados.cep) {
    const cepMatch = mensagem.match(/\b\d{5}-?\d{3}\b/);
    if (cepMatch) dados.cep = cepMatch[0].replace(/\D/g, "");
  }

  if (!dados.formaPagamento) {
    if (msg.includes("pix")) dados.formaPagamento = "pix";
    if (msg.includes("cartao") || msg.includes("cartao") || msg.includes("credito") || msg.includes("debito")) dados.formaPagamento = "cartao";
  }

  if (!dados.nome) {
    const nomeMatch = mensagem.match(/nome\s*[:\-]\s*([^\n\r]+)/i);
    if (nomeMatch?.[1]) dados.nome = nomeMatch[1].trim();
  }

  return dados;
}

function resumoDadosFaltantes(dados: any) {
  const faltantes: string[] = [];
  if (!String(dados?.clienteNome || "").trim()) faltantes.push("Nome completo");
  if (!cpfValido(dados?.clienteCpf || dados?.cpf)) faltantes.push("CPF");
  if (!String(dados?.clienteCep || dados?.cep || dados?.clienteEndereco || "").trim()) faltantes.push("CEP ou cidade/bairro");
  if (!String(dados?.formaPagamento || "").trim()) faltantes.push("Forma de pagamento: Pix ou cartão");
  return faltantes;
}

async function criarPedidoWhatsapp(telefone: string, produto: ProdutoBot) {
  const preco = Number(produto.precoVenda || 0);
  const pedido = {
    origem: "whatsapp-bot",
    canal: "whatsapp",
    status: "aguardando_dados",
    statusPagamento: "pendente",
    clienteWhatsapp: telefone,
    clienteTelefone: telefone,
    clienteNome: "",
    clienteCpf: "",
    clienteCep: "",
    clienteEndereco: "",
    formaPagamento: "",
    itens: [
      {
        produtoId: produto.id,
        id: produto.id,
        nome: produto.nome,
        preco,
        precoVenda: preco,
        quantidade: 1,
        qtd: 1,
        imagem: produto.imagem || produto.imageUrl || "",
        tamanho: "Maison Noor",
      },
    ],
    subtotal: preco,
    total: preco,
    valorTotal: preco,
    observacoes: `Pedido iniciado automaticamente pelo robô do WhatsApp para o produto ${produto.nome}.`,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  };

  const ref = await adminDb.collection(PEDIDOS_COLLECTION).add(pedido);
  return { id: ref.id, ...pedido };
}

async function lerPedidoPorId(id?: string) {
  if (!id) return null;
  const snap = await adminDb.collection(PEDIDOS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as any;
}

async function atualizarPedidoComDados(pedidoId: string, dados: DadosPedidoMensagem) {
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  };

  if (dados.nome) update.clienteNome = dados.nome;
  if (dados.cpf) update.clienteCpf = limparCpf(dados.cpf);
  if (dados.cep) update.clienteCep = dados.cep;
  if (dados.cidadeOuBairro) update.clienteEndereco = dados.cidadeOuBairro;
  if (dados.formaPagamento) update.formaPagamento = dados.formaPagamento === "cartão" ? "cartao" : dados.formaPagamento;

  await adminDb.collection(PEDIDOS_COLLECTION).doc(pedidoId).set(update, { merge: true });
  return lerPedidoPorId(pedidoId);
}

async function consultarUltimoPedido(telefone: string) {
  const clean = telefone.replace(/\D/g, "");
  const consultas = [
    adminDb.collection(PEDIDOS_COLLECTION).where("clienteWhatsapp", "==", clean).limit(10).get(),
    adminDb.collection(PEDIDOS_COLLECTION).where("clienteTelefone", "==", clean).limit(10).get(),
  ];
  const snaps = await Promise.allSettled(consultas);
  const pedidos: any[] = [];

  for (const resultado of snaps) {
    if (resultado.status !== "fulfilled") continue;
    resultado.value.forEach((docSnap) => pedidos.push({ id: docSnap.id, ...docSnap.data() }));
  }

  if (!pedidos.length) return null;
  pedidos.sort((a, b) => {
    const dataA = typeof a.createdAt?.toDate === "function" ? a.createdAt.toDate().getTime() : 0;
    const dataB = typeof b.createdAt?.toDate === "function" ? b.createdAt.toDate().getTime() : 0;
    return dataB - dataA;
  });
  return pedidos[0];
}

function pedidoEstaAbertoParaAtendimento(pedido: any) {
  if (!pedido) return false;

  const status = normalizarTexto(pedido.status || pedido.statusPedido || "");
  const statusPagamento = normalizarTexto(pedido.statusPagamento || "");

  if (["cancelado", "cancelada", "finalizado", "finalizada", "pago", "entregue", "concluido", "concluida"].some((item) => status.includes(item))) {
    return false;
  }

  return (
    status.includes("aguardando") ||
    status.includes("pendente") ||
    status.includes("dados") ||
    status.includes("aberto") ||
    statusPagamento.includes("pendente") ||
    statusPagamento.includes("aguardando")
  );
}

async function consultarPedidoAbertoParaTelefone(telefone: string) {
  const ultimoPedido = await consultarUltimoPedido(telefone);
  if (pedidoEstaAbertoParaAtendimento(ultimoPedido)) return ultimoPedido;
  return null;
}

function respostaPedidoAguardandoDados(pedido: any) {
  const faltantes = resumoDadosFaltantes(pedido);

  return `✨ Já existe um pedido em andamento para você:

Pedido: *${pedido?.id || "em andamento"}*
Produto: *${pedido?.itens?.[0]?.nome || "Produto Maison Noor"}*

Para finalizar e gerar o Pix, ainda preciso destas informações:
${faltantes.length ? faltantes.map((item) => `- ${item}`).join("\n") : "- Confirmação dos dados"}

Pode enviar tudo assim:
Nome: Seu nome completo
CPF: 00000000000
CEP: 00000000
Pagamento: Pix`;
}

function respostaStatusAguardandoPagamento(pedido: any) {
  return `✨ Seu pedido já está em andamento e aguardando pagamento.

Pedido: *${pedido?.id || "em andamento"}*
Produto: *${pedido?.itens?.[0]?.nome || "Produto Maison Noor"}*
Total: *${formatarMoeda(Number(pedido?.total || pedido?.valorTotal || 0))}*

Se quiser, posso chamar nossa equipe humana para reenviar ou confirmar o Pix.`;
}

function respostaStatusPedido(pedido: any) {
  if (!pedido) {
    return `Não encontrei um pedido recente vinculado a este WhatsApp.

Se você fez o pedido por outro número ou pelo site, me envie o nome usado na compra ou fale com nosso atendimento humano.`;
  }

  const status = String(pedido.status || pedido.statusPedido || "pendente");
  const total = Number(pedido.total || pedido.valorTotal || pedido.subtotal || 0);
  const itemNome = pedido.itens?.[0]?.nome || "produto Maison Noor";

  return `✨ Encontrei seu pedido mais recente:

Pedido: *${pedido.id}*
Produto: *${itemNome}*
Status: *${status}*
Total: *${formatarMoeda(total)}*

Se quiser, posso chamar o atendimento humano para confirmar pagamento, entrega ou retirada.`;
}

function respostaAtendimentoHumano() {
  return `✨ Claro! Vou direcionar para o atendimento humano da Maison Noor.

Enquanto isso, me envie por favor:
- seu nome;
- o perfume desejado;
- cidade/CEP, se for entrega.

Nossa equipe continua o atendimento por aqui.`;
}

function respostaEncomenda() {
  return `✨ Sim, trabalhamos com possibilidade de encomenda.

Me diga o nome do perfume que você procura. Se não estiver disponível no catálogo, nossa equipe verifica possibilidade de reposição ou encomenda com fornecedores.

Para agilizar, envie:
- nome do perfume;
- marca, se souber;
- quantidade desejada.`;
}

function respostaEntrega() {
  return `✨ Fazemos atendimento com envio e também podemos orientar sobre retirada, conforme disponibilidade.

Para calcular/confirmar entrega, envie seu *CEP* ou cidade/bairro.

No checkout do site você também pode avançar com a compra e informar os dados de entrega.`;
}

function respostaPagamento() {
  return `✨ Aceitamos formas de pagamento como *Pix* e *cartão*, conforme disponibilidade no checkout/atendimento.

Se quiser comprar agora, me diga o nome do perfume ou responda *quero comprar* depois de consultar um produto.`;
}

function montarRespostaCompraSemProduto() {
  return `✨ Perfeito! Qual perfume você quer comprar?

Você pode me mandar o nome, por exemplo:
*Yara Candy*
*Yara*
*Asad*
*Club de Nuit*

Assim eu consulto a disponibilidade e inicio seu pedido.`;
}

async function buscarOuCriarClienteAsaas(params: {
  nome: string;
  cpf: string;
  telefone?: string;
}) {
  const token = getAsaasToken();
  if (!token) throw new Error("Chave Asaas não configurada.");

  const cpf = limparCpf(params.cpf);
  const search = await fetch(`${ASAAS_API_URL}/customers?cpfCnpj=${cpf}`, {
    method: "GET",
    headers: {
      access_token: token,
      "Content-Type": "application/json",
    },
  });

  const searchData = await search.json().catch(() => ({}));
  const existente = searchData?.data?.[0];
  if (existente?.id) return existente;

  const create = await fetch(`${ASAAS_API_URL}/customers`, {
    method: "POST",
    headers: {
      access_token: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.nome,
      cpfCnpj: cpf,
      mobilePhone: params.telefone || undefined,
    }),
  });

  const createData = await create.json().catch(() => ({}));
  if (!create.ok) {
    throw new Error(extrairMensagemErroAsaas(createData));
  }
  return createData;
}

async function gerarPixAsaasParaPedido(pedido: any) {
  const token = getAsaasToken();
  if (!token) {
    return { erro: true, mensagem: "Chave Asaas não configurada." };
  }

  const nome = String(pedido?.clienteNome || "").trim();
  const cpf = limparCpf(pedido?.clienteCpf || pedido?.cpf);
  const valor = Number(pedido?.total || pedido?.valorTotal || pedido?.subtotal || 0);

  if (!nome) return { erro: true, mensagem: "Nome do cliente não informado." };
  if (!cpfValido(cpf)) return { erro: true, mensagem: "CPF inválido. Informe 11 dígitos válidos." };
  if (!valor || valor <= 0) return { erro: true, mensagem: "Valor inválido para gerar Pix." };

  const cliente = await buscarOuCriarClienteAsaas({
    nome,
    cpf,
    telefone: pedido?.clienteTelefone || pedido?.clienteWhatsapp,
  });

  const paymentResponse = await fetch(`${ASAAS_API_URL}/payments`, {
    method: "POST",
    headers: {
      access_token: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: cliente.id,
      billingType: "PIX",
      value: valor,
      dueDate: hojeISO(),
      description: `Pedido Maison Noor ${pedido.id || "WhatsApp"}`,
      externalReference: String(pedido.id || "whatsapp-bot"),
    }),
  });

  const paymentData = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok || !paymentData?.id) {
    return { erro: true, mensagem: extrairMensagemErroAsaas(paymentData) };
  }

  const qrResponse = await fetch(`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`, {
    method: "GET",
    headers: {
      access_token: token,
      "Content-Type": "application/json",
    },
  });

  const qrData = await qrResponse.json().catch(() => ({}));
  if (!qrResponse.ok) {
    return { erro: true, mensagem: extrairMensagemErroAsaas(qrData) };
  }

  await adminDb.collection(PEDIDOS_COLLECTION).doc(pedido.id).set(
    {
      status: "aguardando_pagamento",
      statusPagamento: "aguardando_pix",
      formaPagamento: "pix",
      asaasPaymentId: paymentData.id,
      asaasCustomerId: cliente.id,
      pixInvoiceUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl || "",
      pixPayload: qrData.payload || "",
      pixEncodedImage: qrData.encodedImage || "",
      pixExpirationDate: qrData.expirationDate || "",
      updatedAt: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    erro: false,
    paymentId: paymentData.id,
    invoiceUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl || "",
    payload: qrData.payload || "",
    encodedImage: qrData.encodedImage || "",
    expirationDate: qrData.expirationDate || "",
  };
}

async function tratarPedidoEmAndamento(params: {
  telefone: string;
  mensagem: string;
  contexto: ContextoConversa | null;
}) {
  const { telefone, mensagem, contexto } = params;
  const pedidoId = contexto?.pedidoEmAndamentoId;
  if (!pedidoId) return null;

  let pedido = await lerPedidoPorId(pedidoId);
  if (!pedido) return null;

  const dadosExtraidos = extrairDadosPedidoDaMensagem(mensagem);
  pedido = await atualizarPedidoComDados(pedidoId, dadosExtraidos);

  const faltantes = resumoDadosFaltantes(pedido);
  const cpfAtual = limparCpf(pedido?.clienteCpf || pedido?.cpf);

  if (cpfAtual && !cpfValido(cpfAtual)) {
    return {
      texto: `Recebi seus dados, mas o CPF informado parece inválido.

Para gerar o Pix automaticamente, me envie um CPF válido com 11 dígitos.

Exemplo:
CPF: 12345678909`,
      intencao: "pedido_em_andamento",
    };
  }

  if (faltantes.length) {
    return {
      texto: respostaPedidoAguardandoDados(pedido),
      intencao: "pedido_em_andamento",
    };
  }

  if (normalizarTexto(pedido.formaPagamento).includes("pix")) {
    const pix = await gerarPixAsaasParaPedido(pedido);

    if (pix.erro) {
      return {
        texto: `Recebi seus dados, mas não consegui gerar o Pix automaticamente agora.

Motivo: ${pix.mensagem}

Nossa equipe humana pode continuar o atendimento por aqui e gerar o pagamento para você. ✨`,
        intencao: "pedido_em_andamento",
      };
    }

    await salvarContexto(telefone, {
      pedidoEmAndamentoStatus: "aguardando_pagamento",
      ultimoPedidoId: pedido.id,
      ultimoPedidoStatus: "aguardando_pagamento",
    });

    const payloadTexto = pix.payload
      ? `

Pix copia e cola:
${pix.payload}`
      : "";

    return {
      texto: `✨ Pedido confirmado!

Produto: *${pedido.itens?.[0]?.nome || "Produto Maison Noor"}*
Total: *${formatarMoeda(Number(pedido.total || pedido.valorTotal || 0))}*
Pagamento: *Pix*

${pix.invoiceUrl ? `Link para pagamento/QR Code:
${pix.invoiceUrl}` : "O QR Code foi gerado no sistema."}${payloadTexto}

Após o pagamento, nossa equipe confirma e continua o atendimento por aqui.`,
      intencao: "pix_gerado",
    };
  }

  await adminDb.collection(PEDIDOS_COLLECTION).doc(pedido.id).set(
    {
      status: "aguardando_atendimento",
      statusPagamento: "pendente",
      updatedAt: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await salvarContexto(telefone, {
    pedidoEmAndamentoStatus: "aguardando_atendimento",
    ultimoPedidoId: pedido.id,
    ultimoPedidoStatus: "aguardando_atendimento",
  });

  return {
    texto: `✨ Pedido recebido!

Produto: *${pedido.itens?.[0]?.nome || "Produto Maison Noor"}*
Total: *${formatarMoeda(Number(pedido.total || pedido.valorTotal || 0))}*
Forma de pagamento: *${pedido.formaPagamento || "cartão/atendimento"}*

Nossa equipe humana continuará o atendimento por aqui para finalizar o pagamento e a entrega.`,
    intencao: "pedido_recebido",
  };
}

async function gerarResposta(
  produtos: ProdutoBot[],
  mensagem: string,
  contexto: ContextoConversa | null,
  telefone?: string
) {
  const msg = normalizarTexto(mensagem);
  const intencao = detectarIntencao(mensagem);

  if (!msg) {
    return { texto: montarRespostaGenerica(), produto: undefined as ProdutoBot | undefined, intencao: "saudacao" };
  }

  if (telefone) {
    let contextoPedido = contexto;

    if (!contextoPedido?.pedidoEmAndamentoId) {
      const pedidoAberto = await consultarPedidoAbertoParaTelefone(telefone);

      if (pedidoAberto?.id) {
        contextoPedido = {
          ...(contexto || {}),
          pedidoEmAndamentoId: pedidoAberto.id,
          pedidoEmAndamentoStatus: pedidoAberto.status || pedidoAberto.statusPedido || "aguardando_dados",
          ultimoPedidoId: pedidoAberto.id,
          ultimoPedidoStatus: pedidoAberto.status || pedidoAberto.statusPedido || "aguardando_dados",
        };

        await salvarContexto(telefone, {
          pedidoEmAndamentoId: pedidoAberto.id,
          pedidoEmAndamentoStatus: pedidoAberto.status || pedidoAberto.statusPedido || "aguardando_dados",
          ultimoPedidoId: pedidoAberto.id,
          ultimoPedidoStatus: pedidoAberto.status || pedidoAberto.statusPedido || "aguardando_dados",
        });
      }
    }

    if (contextoPedido?.pedidoEmAndamentoId) {
      const respostaPedido = await tratarPedidoEmAndamento({ telefone, mensagem, contexto: contextoPedido });
      if (respostaPedido) {
        return {
          texto: respostaPedido.texto,
          produto: produtoPorId(produtos, contextoPedido.ultimoProdutoId),
          intencao: respostaPedido.intencao,
        };
      }
    }
  }

  const produtoEncontrado = encontrarProdutoPorMensagem(produtos, mensagem);
  const produtoContexto = produtoPorId(produtos, contexto?.ultimoProdutoId);
  const produtoAlvo = produtoEncontrado || produtoContexto;

  if (intencao === "status_pedido" && telefone) {
    const pedido = await consultarUltimoPedido(telefone);
    return { texto: respostaStatusPedido(pedido), produto: produtoAlvo, intencao };
  }

  if (intencao === "comprar") {
    if (!produtoAlvo) return { texto: montarRespostaCompraSemProduto(), produto: undefined, intencao };

    if (produtoDisponivel(produtoAlvo) <= 0) {
      return {
        texto: `✨ Entendi que você quer comprar *${produtoAlvo.nome}*, mas no momento ele está indisponível.

Posso te indicar uma fragrância parecida ou avisar o atendimento humano para verificar reposição?`,
        produto: produtoAlvo,
        intencao,
      };
    }

    let pedidoId = "";
    if (telefone) {
      const pedidoAberto = contexto?.pedidoEmAndamentoId ? await lerPedidoPorId(contexto.pedidoEmAndamentoId) : null;
      if (pedidoAberto && ["aguardando_dados", "dados_parciais", "aguardando_pagamento"].includes(String(pedidoAberto.status || ""))) {
        pedidoId = pedidoAberto.id;
      } else {
        const pedido = await criarPedidoWhatsapp(telefone, produtoAlvo);
        pedidoId = pedido.id;
        await salvarContexto(telefone, {
          pedidoEmAndamentoId: pedidoId,
          pedidoEmAndamentoStatus: "aguardando_dados",
          ultimoPedidoId: pedidoId,
          ultimoPedidoStatus: "aguardando_dados",
        });
      }
    }

    return {
      texto: `✨ Perfeito! Iniciei seu pedido para:

*${produtoAlvo.nome}*
Valor: *${formatarMoeda(Number(produtoAlvo.precoVenda || 0))}*
Disponibilidade: *disponível para compra*

${pedidoId ? `Pedido criado no sistema: *${pedidoId}*\n\n` : ""}Link do produto:
${linkProduto(produtoAlvo)}

Para finalizar e gerar o Pix, envie:
1. Nome completo
2. CPF
3. CEP ou cidade/bairro
4. Forma de pagamento desejada: Pix ou cartão

Exemplo:
Nome: Maria Silva
CPF: 12345678909
CEP: 12230000
Pagamento: Pix`,
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "humano") return { texto: respostaAtendimentoHumano(), produto: produtoAlvo, intencao };
  if (intencao === "encomenda") return { texto: respostaEncomenda(), produto: produtoAlvo, intencao };
  if (intencao === "entrega") return { texto: respostaEntrega(), produto: produtoAlvo, intencao };
  if (intencao === "pagamento") return { texto: respostaPagamento(), produto: produtoAlvo, intencao };
  if (intencao === "perfil_doce") return { texto: recomendarPorPerfil(produtos, "doce", mensagem), produto: produtoAlvo, intencao };
  if (intencao === "perfil_fresco") return { texto: recomendarPorPerfil(produtos, "fresco", mensagem), produto: produtoAlvo, intencao };
  if (intencao === "perfil_intenso") return { texto: recomendarPorPerfil(produtos, "intenso", mensagem), produto: produtoAlvo, intencao };
  if (intencao === "presente") return { texto: recomendarPorPerfil(produtos, "presente", mensagem), produto: produtoAlvo, intencao };
  if (intencao === "similar") return { texto: recomendarPorPerfil(produtos, "similar", mensagem), produto: produtoAlvo, intencao };

  if (msg.includes("feminino") || msg.includes("feminina") || msg.includes("mulher")) return { texto: montarListaCategoria(produtos, "feminino"), produto: produtoAlvo, intencao: "categoria_feminino", categoria: "feminino" };
  if (msg.includes("masculino") || msg.includes("masculina") || msg.includes("homem")) return { texto: montarListaCategoria(produtos, "masculino"), produto: produtoAlvo, intencao: "categoria_masculino", categoria: "masculino" };
  if (msg.includes("unissex") || msg.includes("unisex")) return { texto: montarListaCategoria(produtos, "unissex"), produto: produtoAlvo, intencao: "categoria_unissex", categoria: "unissex" };
  if (msg.includes("oi") || msg.includes("ola") || msg.includes("bom dia") || msg.includes("boa tarde") || msg.includes("boa noite")) return { texto: montarRespostaGenerica(), produto: produtoAlvo, intencao: "saudacao" };

  if (produtoEncontrado) return { texto: montarRespostaProduto(produtoEncontrado), produto: produtoEncontrado, intencao: "produto" };

  return {
    texto: `Não encontrei esse perfume no catálogo agora.

Você pode me mandar o nome completo ou escolher uma categoria:
- Feminino
- Masculino
- Unissex
- Presentes

Também posso chamar o atendimento humano da Maison Noor para te ajudar ✨`,
    produto: produtoAlvo,
    intencao: "nao_encontrado",
  };
}

async function enviarMensagemZapi(telefoneCliente: string, texto: string) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !instanceToken || !clientToken) {
    console.error("Z-API não configurada corretamente.");
    return false;
  }

  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone: telefoneCliente, message: texto }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Erro ao enviar mensagem pela Z-API:", errorText);
    return false;
  }

  return true;
}

async function enviarMensagemMeta(telefoneCliente: string, texto: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefoneCliente,
      type: "text",
      text: { preview_url: true, body: texto },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Erro ao enviar WhatsApp Meta:", errorText);
    return false;
  }

  return true;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken) {
    return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({
    ok: true,
    message: "API whatsapp-bot Maison Noor ativa com CPF, Pix Asaas, memória, pedidos e Z-API.",
    exemploPost: { message: "Tem Yara Candy?" },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (isWebhookZapi(body)) {
      if (body?.fromMe === true) {
        return NextResponse.json({ ok: true, origem: "z-api", ignorado: true, motivo: "Mensagem enviada pelo próprio número." });
      }
      if (body?.isGroup === true || body?.chatName?.includes?.("grupo")) {
        return NextResponse.json({ ok: true, origem: "z-api", ignorado: true, motivo: "Mensagem de grupo ignorada." });
      }
    }

    const mensagem = extrairMensagem(body);
    const telefoneCliente = isWebhookZapi(body)
      ? extrairTelefoneZapi(body)
      : isWebhookWhatsAppMeta(body)
      ? extrairTelefoneWhatsAppMeta(body)
      : "";

    const produtos = await buscarProdutos();
    const contexto = telefoneCliente ? await lerContexto(telefoneCliente) : null;
    const resultado = await gerarResposta(produtos, mensagem, contexto, telefoneCliente);
    const resposta = resultado.texto;

    if (telefoneCliente) {
      await salvarContexto(telefoneCliente, {
        ultimaMensagem: mensagem,
        ultimaResposta: resposta,
        ultimaIntencao: resultado.intencao,
        ultimoProdutoId: resultado.produto?.id || contexto?.ultimoProdutoId,
        ultimoProdutoNome: resultado.produto?.nome || contexto?.ultimoProdutoNome,
        ultimoProdutoPreco: resultado.produto?.precoVenda || contexto?.ultimoProdutoPreco,
        ultimaCategoria: (resultado as any).categoria || contexto?.ultimaCategoria,
      });
    }

    if (isWebhookZapi(body)) {
      if (telefoneCliente && resposta) {
        const enviado = await enviarMensagemZapi(telefoneCliente, resposta);
        return NextResponse.json({
          ok: true,
          origem: "z-api",
          totalProdutosLidos: produtos.length,
          mensagemRecebida: mensagem,
          telefoneCliente,
          respostaEnviada: enviado,
        });
      }
      return NextResponse.json({ ok: false, origem: "z-api", error: "Telefone do cliente não encontrado no webhook." });
    }

    if (isWebhookWhatsAppMeta(body)) {
      if (telefoneCliente && resposta) {
        const enviado = await enviarMensagemMeta(telefoneCliente, resposta);
        return NextResponse.json({
          ok: true,
          origem: "meta-whatsapp",
          totalProdutosLidos: produtos.length,
          mensagemRecebida: mensagem,
          telefoneCliente,
          respostaEnviada: enviado,
        });
      }
      return NextResponse.json({ ok: false, origem: "meta-whatsapp", error: "Telefone do cliente não encontrado no webhook." });
    }

    return NextResponse.json({
      ok: true,
      origem: "site-ou-teste-local",
      totalProdutosLidos: produtos.length,
      mensagemRecebida: mensagem,
      resposta,
    });
  } catch (error) {
    console.error("Erro no whatsapp-bot:", error);
    return NextResponse.json(
      { ok: false, error: "Erro ao processar mensagem do WhatsApp." },
      { status: 500 }
    );
  }
}
