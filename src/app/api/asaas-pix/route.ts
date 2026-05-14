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

function normalizarTexto(texto: unknown) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,"'()]/g, " ")
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
      body?.data?.senderPhone ||
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
    "tem",
    "voce",
    "voces",
    "preco",
    "valor",
    "perfume",
    "perfum",
    "produto",
    "quero",
    "saber",
    "sobre",
    "qual",
    "quanto",
    "custa",
    "disponivel",
    "estoque",
    "do",
    "da",
    "de",
    "o",
    "a",
    "os",
    "as",
    "um",
    "uma",
    "no",
    "na",
    "para",
    "pra",
    "comprar",
    "pedido",
    "finalizar",
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

  if (/\b(comprar|compra|quero comprar|finalizar|fechar pedido|pode reservar|reserva|reservar|vou querer|quero esse|quero essa)\b/.test(msg)) {
    return "comprar";
  }

  if (/\b(status|pedido|meu pedido|acompanhar|rastreio|rastreamento|cadastro do pedido|andamento)\b/.test(msg)) {
    return "status_pedido";
  }

  if (/\b(atendente|humano|pessoa|falar com alguem|falar com atendente|vendedor|consultor|consultora)\b/.test(msg)) {
    return "humano";
  }

  if (/\b(encomenda|encomendar|traz por encomenda|sob encomenda|fornecedor|consegue trazer)\b/.test(msg)) {
    return "encomenda";
  }

  if (/\b(entrega|frete|envio|cep|chega|prazo|retirar|retirada)\b/.test(msg)) {
    return "entrega";
  }

  if (/\b(pix|cartao|cartão|credito|crédito|debito|débito|parcel|pagamento|pagar)\b/.test(msg)) {
    return "pagamento";
  }

  if (/\b(troca|devolver|devolucao|devolução|reclama|problema|errado|urgente)\b/.test(msg)) {
    return "humano";
  }

  if (/\b(presente|esposa|namorada|mae|mãe|aniversario|aniversário|namorado|marido)\b/.test(msg)) {
    return "presente";
  }

  if (/\b(doce|adocicado|baunilha|vanilla|gourmand|candy)\b/.test(msg)) {
    return "perfil_doce";
  }

  if (/\b(fresco|fresh|citrico|cítrico|limpo|leve|verao|verão|dia a dia)\b/.test(msg)) {
    return "perfil_fresco";
  }

  if (/\b(amadeirado|madeira|oud|intenso|forte|marcante|noturno|noite)\b/.test(msg)) {
    return "perfil_intenso";
  }

  if (/\b(parecido|similar|lembra|contratipo|inspirado)\b/.test(msg)) {
    return "similar";
  }

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

async function criarPedidoWhatsapp(telefone: string, produto: ProdutoBot) {
  const preco = Number(produto.precoVenda || 0);

  const pedido = {
    origem: "whatsapp-bot",
    canal: "whatsapp",
    status: "pendente",
    statusPagamento: "pendente",
    etapaAtendimento: "aguardando_dados_cliente",
    clienteWhatsapp: telefone,
    clienteTelefone: telefone,
    clienteNome: "",
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

  return {
    id: ref.id,
    ...pedido,
  };
}


async function consultarPedidoPorId(pedidoId?: string) {
  if (!pedidoId) return null;

  try {
    const ref = adminDb.collection(PEDIDOS_COLLECTION).doc(pedidoId);
    const snap = await ref.get();

    if (!snap.exists) return null;

    return {
      id: snap.id,
      ...snap.data(),
    } as any;
  } catch (error) {
    console.error("Erro ao consultar pedido por ID:", error);
    return null;
  }
}

function pedidoEstaEmAndamento(pedido: any) {
  if (!pedido) return false;

  const status = normalizarTexto(pedido.status || pedido.statusPedido || "");
  const etapa = normalizarTexto(pedido.etapaAtendimento || "");

  if (["cancelado", "cancelada", "finalizado", "finalizada", "pago", "entregue", "concluido", "concluida"].some((item) => status.includes(item))) {
    return false;
  }

  return (
    status.includes("pendente") ||
    status.includes("aberto") ||
    status.includes("aguardando") ||
    etapa.includes("aguardando") ||
    etapa.includes("dados") ||
    etapa.includes("atendimento")
  );
}

function mensagemTemDadosDePedido(mensagem: string) {
  const msg = normalizarTexto(mensagem);

  const temPagamento = /\b(pix|cartao|cartão|credito|crédito|debito|débito|dinheiro)\b/.test(msg);
  const temCep = /\b\d{5}-?\d{3}\b/.test(mensagem) || /\b\d{8}\b/.test(mensagem);
  const temCpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(mensagem);
  const temEndereco = /\b(rua|avenida|av|bairro|cidade|cep|numero|número|complemento|entrega|retirada)\b/.test(msg);
  const linhasUteis = mensagem
    .split(/\n+/g)
    .map((linha) => linha.trim())
    .filter(Boolean);

  return temPagamento || temCep || temCpf || temEndereco || linhasUteis.length >= 2;
}

function extrairDadosFinalizacaoPedido(mensagem: string) {
  const linhas = mensagem
    .split(/\n+/g)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const texto = mensagem.trim();
  const msg = normalizarTexto(texto);
  const cepMatch = texto.match(/\b\d{5}-?\d{3}\b/) || texto.match(/\b\d{8}\b/);
  const cep = cepMatch ? cepMatch[0].replace(/\D/g, "") : "";

  const cpfMatch = texto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  const cpf = cpfMatch ? limparCpf(cpfMatch[0]) : "";

  let formaPagamento = "";
  if (/\bpix\b/.test(msg)) formaPagamento = "Pix";
  else if (/\b(cartao|cartão|credito|crédito|debito|débito)\b/.test(msg)) formaPagamento = "Cartão";
  else if (/\bdinheiro\b/.test(msg)) formaPagamento = "Dinheiro";

  const linhasSemPagamento = linhas.filter((linha) => {
    const normalizada = normalizarTexto(linha);
    if (/\b(pix|cartao|cartão|credito|crédito|debito|débito|dinheiro)\b/.test(normalizada)) return false;
    if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(linha)) return false;
    if (/^\d{5}-?\d{3}$/.test(linha) || /^\d{8}$/.test(linha)) return false;
    return true;
  });

  const clienteNome = linhasSemPagamento[0] || "";
  const localEntrega = linhasSemPagamento.slice(1).join(" - ") || (cep ? `CEP ${cep}` : "");

  return {
    clienteNome,
    cep,
    cpf,
    localEntrega,
    formaPagamento,
    observacaoCliente: texto,
  };
}

async function atualizarPedidoComDadosCliente(pedidoId: string, mensagem: string) {
  const dados = extrairDadosFinalizacaoPedido(mensagem);

  const updateData: any = {
    etapaAtendimento: "dados_cliente_recebidos",
    status: "pendente_atendimento",
    statusPedido: "pendente_atendimento",
    dadosClienteRecebidos: true,
    dadosClienteMensagem: dados.observacaoCliente,
    updatedAt: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  };

  if (dados.clienteNome) updateData.clienteNome = dados.clienteNome;
  if (dados.cep) updateData.clienteCep = dados.cep;
  if (dados.cpf) updateData.clienteCpf = dados.cpf;
  if (dados.localEntrega) updateData.clienteEnderecoResumo = dados.localEntrega;
  if (dados.formaPagamento) updateData.formaPagamento = dados.formaPagamento;

  await adminDb.collection(PEDIDOS_COLLECTION).doc(pedidoId).set(updateData, { merge: true });

  const pedidoAtualizado = await consultarPedidoPorId(pedidoId);

  return {
    pedido: pedidoAtualizado,
    dados,
  };
}


async function gerarPixAsaasParaPedido(pedido: any, dados: ReturnType<typeof extrairDadosFinalizacaoPedido>) {
  const token = getAsaasToken();

  if (!token) {
    return {
      ok: false,
      mensagem: "Chave Asaas não configurada no servidor.",
    };
  }

  const cpf = limparCpf(dados.cpf || pedido?.clienteCpf || pedido?.cpf || pedido?.cpfCnpj);
  const valor = Number(pedido?.total || pedido?.valorTotal || pedido?.subtotal || 0);
  const itemNome = pedido?.itens?.[0]?.nome || "Pedido Maison Noor";
  const telefone = String(pedido?.clienteWhatsapp || pedido?.clienteTelefone || "").replace(/\D/g, "");
  const nome = String(dados.clienteNome || pedido?.clienteNome || "Cliente Maison Noor").trim();
  const email = String(pedido?.clienteEmail || pedido?.email || "cliente@maisonnoor.com.br").trim();

  if (!valor || valor <= 0) {
    return {
      ok: false,
      mensagem: "Valor inválido para gerar Pix.",
    };
  }

  if (!cpf || cpf.length !== 11) {
    return {
      ok: false,
      precisaCpf: true,
      mensagem: "Para gerar o Pix com segurança, preciso do CPF do titular da compra com 11 dígitos.",
    };
  }

  try {
    const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
      method: "POST",
      headers: {
        access_token: token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: nome || "Cliente Maison Noor",
        email: email || "cliente@maisonnoor.com.br",
        cpfCnpj: cpf,
        mobilePhone: telefone || undefined,
      }),
    });

    const customerData = await customerRes.json().catch(() => null);

    if (!customerRes.ok) {
      return {
        ok: false,
        mensagem: extrairMensagemErroAsaas(customerData),
        detalhes: customerData,
      };
    }

    const externalReference = pedido?.id || `whatsapp-${Date.now()}`;

    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: {
        access_token: token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customer: customerData.id,
        billingType: "PIX",
        value: valor,
        dueDate: hojeISO(),
        description: `${itemNome} - Maison Noor`,
        externalReference,
        fine: { value: 0 },
        interest: { value: 0 },
      }),
    });

    const paymentData = await paymentRes.json().catch(() => null);

    if (!paymentRes.ok) {
      return {
        ok: false,
        mensagem: extrairMensagemErroAsaas(paymentData),
        detalhes: paymentData,
      };
    }

    const qrRes = await fetch(`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`, {
      method: "GET",
      headers: {
        access_token: token,
        accept: "application/json",
      },
    });

    const qrData = await qrRes.json().catch(() => null);

    if (!qrRes.ok) {
      return {
        ok: false,
        mensagem: extrairMensagemErroAsaas(qrData),
        detalhes: qrData,
      };
    }

    await adminDb.collection(PEDIDOS_COLLECTION).doc(String(pedido.id)).set(
      {
        status: "aguardando_pagamento",
        statusPedido: "aguardando_pagamento",
        statusPagamento: "aguardando_pagamento",
        etapaAtendimento: "pix_gerado",
        formaPagamento: "Pix",
        clienteCpf: cpf,
        asaasCustomerId: customerData.id,
        asaasPaymentId: paymentData.id,
        asaasInvoiceUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl || "",
        pixCopiaECola: qrData.payload || "",
        pixQrCodeBase64: qrData.encodedImage || "",
        pixGeradoEm: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      ok: true,
      paymentId: paymentData.id,
      invoiceUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl || "",
      copiaECola: qrData.payload || "",
      qrBase64: qrData.encodedImage || "",
      valor,
    };
  } catch (error) {
    console.error("Erro ao gerar Pix Asaas pelo WhatsApp:", error);
    return {
      ok: false,
      mensagem: "Erro interno ao gerar Pix no Asaas.",
    };
  }
}

function respostaPixGerado(pedido: any, pix: any) {
  const itemNome = pedido?.itens?.[0]?.nome || "produto Maison Noor";
  const total = Number(pix?.valor || pedido?.total || pedido?.valorTotal || pedido?.subtotal || 0);

  return `✨ Pedido recebido e Pix gerado com sucesso!

Pedido: *${pedido?.id || "em andamento"}*
Produto: *${itemNome}*
Valor: *${formatarMoeda(total)}*
Pagamento: *Pix*

${pix?.invoiceUrl ? `Link para pagar com QR Code:\n${pix.invoiceUrl}\n\n` : ""}Pix copia e cola:
${pix?.copiaECola || "Código Pix indisponível no momento."}

Assim que o pagamento for confirmado, seguimos com a separação do seu pedido. ✨`;
}

function respostaPedidoDadosRecebidos(pedido: any, dados: ReturnType<typeof extrairDadosFinalizacaoPedido>) {
  const itemNome = pedido?.itens?.[0]?.nome || "produto Maison Noor";
  const total = Number(pedido?.total || pedido?.valorTotal || pedido?.subtotal || 0);

  return `✨ Perfeito! Recebi seus dados para o pedido:

Pedido: *${pedido?.id || "em andamento"}*
Produto: *${itemNome}*
Valor: *${formatarMoeda(total)}*
${dados.clienteNome ? `Nome: *${dados.clienteNome}*\n` : ""}${dados.cep ? `CEP: *${dados.cep}*\n` : ""}${dados.cpf ? `CPF: *${dados.cpf}*\n` : ""}${dados.formaPagamento ? `Pagamento: *${dados.formaPagamento}*\n` : ""}
Nossa equipe humana vai continuar o atendimento por aqui para confirmar entrega, pagamento e finalização. ✨`;
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

    resultado.value.forEach((docSnap) => {
      pedidos.push({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });
  }

  if (!pedidos.length) return null;

  pedidos.sort((a, b) => {
    const dataA =
      typeof a.createdAt?.toDate === "function"
        ? a.createdAt.toDate().getTime()
        : 0;
    const dataB =
      typeof b.createdAt?.toDate === "function"
        ? b.createdAt.toDate().getTime()
        : 0;

    return dataB - dataA;
  });

  return pedidos[0];
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

async function gerarResposta(
  produtos: ProdutoBot[],
  mensagem: string,
  contexto: ContextoConversa | null,
  telefone?: string
) {
  const msg = normalizarTexto(mensagem);
  const intencao = detectarIntencao(mensagem);

  if (!msg) {
    return {
      texto: montarRespostaGenerica(),
      produto: undefined as ProdutoBot | undefined,
      intencao: "saudacao",
    };
  }

  const produtoEncontrado = encontrarProdutoPorMensagem(produtos, mensagem);
  const produtoContexto = produtoPorId(produtos, contexto?.ultimoProdutoId);
  const produtoAlvo = produtoEncontrado || produtoContexto;

  const pedidoEmAndamentoId = contexto?.pedidoEmAndamentoId || contexto?.ultimoPedidoId || "";
  const pedidoEmAndamento = pedidoEmAndamentoId ? await consultarPedidoPorId(pedidoEmAndamentoId) : null;

  if (
    telefone &&
    pedidoEstaEmAndamento(pedidoEmAndamento) &&
    intencao !== "status_pedido" &&
    intencao !== "humano" &&
    !produtoEncontrado
  ) {
    if (intencao === "comprar") {
      return {
        texto: `✨ Já existe um pedido em andamento para você:

Pedido: *${pedidoEmAndamento.id}*
Produto: *${pedidoEmAndamento.itens?.[0]?.nome || "produto Maison Noor"}*

Para finalizar, envie:
1. Nome completo
2. CEP ou cidade/bairro
3. Forma de pagamento desejada: Pix ou cartão

Nossa equipe humana também pode continuar o atendimento por aqui. ✨`,
        produto: produtoAlvo,
        intencao: "pedido_em_andamento",
        pedidoEmAndamentoId: pedidoEmAndamento.id,
        pedidoEmAndamentoStatus: pedidoEmAndamento.status || "pendente",
      };
    }

    if (mensagemTemDadosDePedido(mensagem) || intencao === "pagamento" || intencao === "entrega") {
      const { pedido, dados } = await atualizarPedidoComDadosCliente(pedidoEmAndamento.id, mensagem);
      const pedidoBase = pedido || pedidoEmAndamento;

      if (normalizarTexto(dados.formaPagamento || pedidoBase?.formaPagamento || pedidoEmAndamento?.formaPagamento).includes("pix") || normalizarTexto(contexto?.pedidoEmAndamentoStatus).includes("aguardando_cpf_pix")) {
        const pix = await gerarPixAsaasParaPedido(pedidoBase, dados);

        if (pix.ok) {
          return {
            texto: respostaPixGerado(pedidoBase, pix),
            produto: produtoAlvo,
            intencao: "pix_gerado",
            pedidoEmAndamentoId: "",
            pedidoEmAndamentoStatus: "aguardando_pagamento",
          };
        }

        if ((pix as any).precisaCpf) {
          return {
            texto: `✨ Perfeito, já recebi os dados do pedido.

Para gerar o Pix automaticamente, preciso que você envie o *CPF do titular da compra* com 11 dígitos.

Exemplo:
CPF: 123.456.789-00`,
            produto: produtoAlvo,
            intencao: "aguardando_cpf_pix",
            pedidoEmAndamentoId: pedidoEmAndamento.id,
            pedidoEmAndamentoStatus: "aguardando_cpf_pix",
          };
        }

        return {
          texto: `✨ Recebi seus dados, mas não consegui gerar o Pix automaticamente agora.

Motivo: ${pix.mensagem || "falha ao gerar cobrança"}

Nossa equipe humana vai continuar o atendimento por aqui para finalizar o pagamento.`,
          produto: produtoAlvo,
          intencao: "pix_erro",
          pedidoEmAndamentoId: pedidoEmAndamento.id,
          pedidoEmAndamentoStatus: "pendente_atendimento",
        };
      }

      return {
        texto: respostaPedidoDadosRecebidos(pedidoBase, dados),
        produto: produtoAlvo,
        intencao: "pedido_dados_recebidos",
        pedidoEmAndamentoId: pedidoEmAndamento.id,
        pedidoEmAndamentoStatus: "pendente_atendimento",
      };
    }
  }

  if (intencao === "status_pedido" && telefone) {
    const pedido = await consultarUltimoPedido(telefone);
    return {
      texto: respostaStatusPedido(pedido),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "comprar") {
    if (!produtoAlvo) {
      return {
        texto: montarRespostaCompraSemProduto(),
        produto: undefined,
        intencao,
      };
    }

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
      if (pedidoEstaEmAndamento(pedidoEmAndamento)) {
        pedidoId = pedidoEmAndamento.id;
      } else {
        const pedido = await criarPedidoWhatsapp(telefone, produtoAlvo);
        pedidoId = pedido.id;
      }
    }

    return {
      texto: `✨ Perfeito! ${pedidoEstaEmAndamento(pedidoEmAndamento) ? "Seu pedido já está em andamento" : "Iniciei seu pedido"} para:

*${produtoAlvo.nome}*
Valor: *${formatarMoeda(Number(produtoAlvo.precoVenda || 0))}*
Disponibilidade: *disponível para compra*

${pedidoId ? `Pedido criado no sistema: *${pedidoId}*\n\n` : ""}Link do produto:
${linkProduto(produtoAlvo)}

Para finalizar, envie:
1. Nome completo
2. CEP ou cidade/bairro
3. Forma de pagamento desejada: Pix ou cartão

Se preferir, nossa equipe humana continua o atendimento por aqui. ✨`,
      produto: produtoAlvo,
      intencao,
      pedidoEmAndamentoId: pedidoId,
      pedidoEmAndamentoStatus: "aguardando_dados_cliente",
    };
  }

  if (intencao === "humano") {
    return {
      texto: respostaAtendimentoHumano(),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "encomenda") {
    return {
      texto: respostaEncomenda(),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "entrega") {
    return {
      texto: respostaEntrega(),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "pagamento") {
    return {
      texto: respostaPagamento(),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "perfil_doce") {
    return {
      texto: recomendarPorPerfil(produtos, "doce", mensagem),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "perfil_fresco") {
    return {
      texto: recomendarPorPerfil(produtos, "fresco", mensagem),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "perfil_intenso") {
    return {
      texto: recomendarPorPerfil(produtos, "intenso", mensagem),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "presente") {
    return {
      texto: recomendarPorPerfil(produtos, "presente", mensagem),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (intencao === "similar") {
    return {
      texto: recomendarPorPerfil(produtos, "similar", mensagem),
      produto: produtoAlvo,
      intencao,
    };
  }

  if (msg.includes("feminino") || msg.includes("feminina") || msg.includes("mulher")) {
    return {
      texto: montarListaCategoria(produtos, "feminino"),
      produto: undefined,
      intencao: "categoria_feminino",
      categoria: "feminino",
    };
  }

  if (msg.includes("masculino") || msg.includes("masculina") || msg.includes("homem")) {
    return {
      texto: montarListaCategoria(produtos, "masculino"),
      produto: undefined,
      intencao: "categoria_masculino",
      categoria: "masculino",
    };
  }

  if (msg.includes("unissex") || msg.includes("unisex")) {
    return {
      texto: montarListaCategoria(produtos, "unissex"),
      produto: undefined,
      intencao: "categoria_unissex",
      categoria: "unissex",
    };
  }

  if (produtoEncontrado) {
    return {
      texto: montarRespostaProduto(produtoEncontrado),
      produto: produtoEncontrado,
      intencao: "produto",
    };
  }

  if (msg.includes("oi") || msg.includes("ola") || msg.includes("bom dia") || msg.includes("boa tarde") || msg.includes("boa noite")) {
    return {
      texto: montarRespostaGenerica(),
      produto: produtoAlvo,
      intencao: "saudacao",
    };
  }

  return {
    texto: `Não encontrei esse perfume no catálogo agora.

Você pode me mandar o nome completo ou escolher uma categoria:
- Feminino
- Masculino
- Unissex
- Presentes

Também posso chamar o atendimento humano da Maison Noor para te ajudar ✨`,
    produto: produtoAlvo,
    intencao: "fallback",
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
      body: JSON.stringify({
        phone: telefoneCliente,
        message: texto,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Erro ao enviar mensagem pela Z-API:", errorText);
    return false;
  }

  return true;
}

async function enviarMensagemWhatsAppMeta(telefoneCliente: string, texto: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("WhatsApp Cloud API não configurada.");
    return false;
  }

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefoneCliente,
        type: "text",
        text: {
          preview_url: true,
          body: texto,
        },
      }),
    }
  );

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
    return new Response(challenge || "", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    message: "API whatsapp-bot Maison Noor ativa com memória, pedidos, status e recomendações.",
    exemploPost: {
      message: "Tem Yara Candy?",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (isWebhookZapi(body)) {
      if (body?.fromMe === true) {
        return NextResponse.json({
          ok: true,
          origem: "z-api",
          ignorado: true,
          motivo: "Mensagem enviada pelo próprio número.",
        });
      }

      if (body?.isGroup === true || body?.chatName?.includes?.("grupo")) {
        return NextResponse.json({
          ok: true,
          origem: "z-api",
          ignorado: true,
          motivo: "Mensagem de grupo ignorada.",
        });
      }
    }

    const mensagem = extrairMensagem(body);
    const telefoneZapi = extrairTelefoneZapi(body);
    const telefoneMeta = extrairTelefoneWhatsAppMeta(body);
    const telefoneCliente = telefoneZapi || telefoneMeta || "";
    const contexto = await lerContexto(telefoneCliente);

    const produtos = await buscarProdutos();
    const resultado = await gerarResposta(produtos, mensagem, contexto, telefoneCliente);
    const resposta = resultado.texto;

    if (telefoneCliente) {
      await salvarContexto(telefoneCliente, {
        ultimaMensagem: mensagem,
        ultimaResposta: resposta,
        ultimoProdutoId: resultado.produto?.id || contexto?.ultimoProdutoId || "",
        ultimoProdutoNome: resultado.produto?.nome || contexto?.ultimoProdutoNome || "",
        ultimoProdutoPreco: Number(resultado.produto?.precoVenda || contexto?.ultimoProdutoPreco || 0),
        ultimaCategoria: (resultado as any).categoria || contexto?.ultimaCategoria || "",
        ultimaIntencao: resultado.intencao,
        pedidoEmAndamentoId:
          (resultado as any).pedidoEmAndamentoId ??
          (resultado.intencao === "pedido_dados_recebidos" ? "" : contexto?.pedidoEmAndamentoId || ""),
        pedidoEmAndamentoStatus:
          (resultado as any).pedidoEmAndamentoStatus || contexto?.pedidoEmAndamentoStatus || "",
        ultimoPedidoId:
          (resultado as any).pedidoEmAndamentoId || contexto?.ultimoPedidoId || "",
        ultimoPedidoStatus:
          (resultado as any).pedidoEmAndamentoStatus || contexto?.ultimoPedidoStatus || "",
      });
    }

    if (isWebhookZapi(body)) {
      const enviado = telefoneCliente ? await enviarMensagemZapi(telefoneCliente, resposta) : false;

      return NextResponse.json({
        ok: true,
        origem: "z-api",
        totalProdutosLidos: produtos.length,
        mensagemRecebida: mensagem,
        telefoneCliente,
        respostaEnviada: enviado,
      });
    }

    if (isWebhookWhatsAppMeta(body)) {
      const enviado = telefoneCliente ? await enviarMensagemWhatsAppMeta(telefoneCliente, resposta) : false;

      return NextResponse.json({
        ok: true,
        origem: "whatsapp-meta",
        totalProdutosLidos: produtos.length,
        mensagemRecebida: mensagem,
        telefoneCliente,
        respostaEnviada: enviado,
      });
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
      {
        ok: false,
        error: "Erro ao processar mensagem do WhatsApp.",
      },
      { status: 500 }
    );
  }
}
