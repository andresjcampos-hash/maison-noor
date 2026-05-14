import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

type ProdutoBot = {
  id: string;
  nome: string;
  marca?: string;
  categoria?: string;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
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
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function extrairMensagem(body: any) {
  const mensagemWhatsApp =
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

  return String(
    mensagemWhatsApp ||
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

function extrairTelefoneWhatsApp(body: any) {
  return String(
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || ""
  ).trim();
}

function isWebhookWhatsApp(body: any) {
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
    });
  });

  return produtos
    .filter((p) => p.ativo !== false)
    .filter((p) => p.nome)
    .filter((p) => Number(p.precoVenda || 0) > 0);
}

function montarRespostaProduto(produto: ProdutoBot) {
  const estoque = Number(produto.estoque || 0);
  const reservado = Number(produto.reservado || 0);
  const disponivel = Math.max(0, estoque - reservado);
  const preco = Number(produto.precoVenda || 0);

  const link = `https://www.maisonnoor.com.br/produto/${produto.id}`;

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
Estoque disponível: *${disponivel} unidade${disponivel > 1 ? "s" : ""}*

Link do produto:
${link}

Posso reservar uma unidade para você ou te ajudar a escolher uma fragrância parecida?`;
}

function montarListaCategoria(produtos: ProdutoBot[], categoria: string) {
  const filtrados = produtos
    .filter((p) => categoriaBate(p.categoria, categoria))
    .filter((p) => Math.max(0, Number(p.estoque || 0) - Number(p.reservado || 0)) > 0)
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
    .map((p, index) => {
      const disponivel = Math.max(0, Number(p.estoque || 0) - Number(p.reservado || 0));

      return `${index + 1}. *${p.nome}* — ${formatarMoeda(Number(p.precoVenda || 0))} — estoque: ${disponivel}`;
    })
    .join("\n");

  return `✨ Encontrei estes ${titulo} disponíveis na Maison Noor:

${lista}

Quer que eu te envie o link de algum deles?`;
}

function montarRespostaGenerica() {
  return `Olá! Eu sou o assistente virtual da Maison Noor ✨

Posso te ajudar com:
1. Consultar preço de um perfume
2. Ver se tem estoque
3. Listar perfumes femininos
4. Listar perfumes masculinos
5. Listar perfumes unissex
6. Ajudar você a escolher uma fragrância

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

      const disponivel = Math.max(
        0,
        Number(produto.estoque || 0) - Number(produto.reservado || 0)
      );

      if (disponivel > 0) score += 15;

      return { produto, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const melhor = candidatos[0];

  if (!melhor || melhor.score < 120) return undefined;

  return melhor.produto;
}

function contemAlgum(texto: string, termos: string[]) {
  return termos.some((termo) => texto.includes(normalizarTexto(termo)));
}

function pegarProdutosDisponiveis(produtos: ProdutoBot[]) {
  return produtos.filter((p) => {
    const disponivel = Math.max(0, Number(p.estoque || 0) - Number(p.reservado || 0));
    return disponivel > 0;
  });
}

function montarListaRecomendados(produtos: ProdutoBot[], titulo: string, filtro: (p: ProdutoBot) => boolean) {
  const filtrados = pegarProdutosDisponiveis(produtos)
    .filter(filtro)
    .slice(0, 5);

  if (!filtrados.length) {
    return `${titulo}\n\nNo momento não encontrei uma opção exata no catálogo, mas posso chamar o atendimento humano da Maison Noor para te indicar a melhor fragrância ✨`;
  }

  const lista = filtrados
    .map((p, index) => {
      return `${index + 1}. *${p.nome}* — ${formatarMoeda(Number(p.precoVenda || 0))}\nhttps://www.maisonnoor.com.br/produto/${p.id}`;
    })
    .join("\n\n");

  return `${titulo}\n\n${lista}\n\nQuer que eu te ajude a escolher entre essas opções?`;
}

function responderEncomenda() {
  return `✨ Sim, trabalhamos com encomendas e pedidos sob consulta.

Me envie o nome do perfume que você procura ou uma referência de fragrância. A Maison Noor verifica disponibilidade, prazo e valor para você.

Se preferir, posso chamar o atendimento humano para seguir com sua encomenda.`;
}

function responderEntregaFrete() {
  return `🚚 Fazemos entrega/envio conforme a região e disponibilidade.

Para calcular corretamente, precisamos do seu CEP ou cidade.

Você pode enviar assim:
*Meu CEP é 12200-000*

Também é possível finalizar pelo site e seguir para o checkout.`;
}

function responderPagamento() {
  return `💳 Aceitamos formas de pagamento conforme disponibilidade no checkout e atendimento:

• Pix
• Cartão
• Condições combinadas no atendimento

Se quiser, me diga qual perfume você deseja que eu envio o link direto para compra.`;
}

function responderAtendimentoHumano() {
  return `✨ Claro. Vou te direcionar para o atendimento humano da Maison Noor.

Pode enviar sua dúvida por aqui ou chamar diretamente:
https://wa.me/5512982389658

Um especialista poderá te ajudar com escolha, pagamento, encomenda e finalização do pedido.`;
}

function responderReserva() {
  return `✨ Posso te ajudar com a reserva.

Para reservar, me envie:
• Nome do perfume
• Seu nome
• Forma de pagamento desejada

Um atendimento humano da Maison Noor confirma a disponibilidade e finaliza com você.`;
}

function responderSaudacao() {
  return `Olá! Eu sou o assistente virtual da Maison Noor ✨

Posso te ajudar com:
• Consultar valor de perfume
• Ver disponibilidade
• Indicar fragrâncias
• Falar sobre encomendas
• Informar entrega e pagamento
• Chamar atendimento humano

Me diga o nome do perfume ou o estilo que você procura.`;
}

function responderParecidoCom(produtos: ProdutoBot[], mensagem: string) {
  const msg = normalizarTexto(mensagem);

  if (contemAlgum(msg, ["good girl", "god girl", "212", "scandal", "la vie", "olympea", "olimpia"])) {
    return montarListaRecomendados(
      produtos,
      "✨ Para uma proposta feminina, marcante, doce e sofisticada, eu indicaria estas opções da Maison Noor:",
      (p) => {
        const texto = normalizarTexto(`${p.nome} ${p.marca} ${p.categoria}`);
        return texto.includes("yara") || texto.includes("fakhar") || texto.includes("shagaf") || texto.includes("rose") || texto.includes("candy");
      }
    );
  }

  if (contemAlgum(msg, ["sauvage", "invictus", "one million", "malbec", "bad boy", "eros"] )) {
    return montarListaRecomendados(
      produtos,
      "✨ Para uma proposta masculina marcante, elegante e de presença, eu indicaria estas opções:",
      (p) => {
        const texto = normalizarTexto(`${p.nome} ${p.marca} ${p.categoria}`);
        return texto.includes("asad") || texto.includes("fakhar") || texto.includes("ramz") || texto.includes("khamrah") || p.categoria === "masculino";
      }
    );
  }

  return `✨ Consigo te ajudar a encontrar uma fragrância parecida.

Me diga o nome do perfume de referência ou o estilo que você gosta, por exemplo:
• doce feminino
• masculino forte
• fresco para o dia
• amadeirado elegante
• baunilha ou gourmand`;
}

function responderPorPerfil(produtos: ProdutoBot[], mensagem: string) {
  const msg = normalizarTexto(mensagem);

  if (contemAlgum(msg, ["doce", "adocicado", "baunilha", "gourmand", "chocolate", "candy"])) {
    return montarListaRecomendados(
      produtos,
      "🍓 Para quem gosta de perfume doce/gourmand, eu separaria estas opções:",
      (p) => {
        const texto = normalizarTexto(`${p.nome} ${p.marca} ${p.categoria}`);
        return texto.includes("yara") || texto.includes("candy") || texto.includes("khamrah") || texto.includes("shagaf") || texto.includes("vanilla");
      }
    );
  }

  if (contemAlgum(msg, ["fresco", "fresh", "citrico", "cítrico", "leve", "calor", "dia a dia"])) {
    return montarListaRecomendados(
      produtos,
      "🌿 Para uma proposta fresca, leve e boa para o dia a dia, eu indicaria:",
      (p) => {
        const texto = normalizarTexto(`${p.nome} ${p.marca} ${p.categoria}`);
        return texto.includes("fresh") || texto.includes("sabah") || texto.includes("ward") || texto.includes("haya") || texto.includes("fakhar");
      }
    );
  }

  if (contemAlgum(msg, ["amadeirado", "madeira", "oud", "intenso", "forte", "marcante", "projecao", "projeção"])) {
    return montarListaRecomendados(
      produtos,
      "🖤 Para uma fragrância mais marcante, intensa e sofisticada, eu indicaria:",
      (p) => {
        const texto = normalizarTexto(`${p.nome} ${p.marca} ${p.categoria}`);
        return texto.includes("oud") || texto.includes("asad") || texto.includes("khamrah") || texto.includes("intense") || texto.includes("black") || p.categoria === "masculino";
      }
    );
  }

  if (contemAlgum(msg, ["presente", "namorada", "namorado", "mae", "mãe", "esposa", "marido", "aniversario", "aniversário"])) {
    return montarListaRecomendados(
      produtos,
      "🎁 Para presente, eu recomendo opções mais seguras, elegantes e com ótima aceitação:",
      (p) => {
        const texto = normalizarTexto(`${p.nome} ${p.marca} ${p.categoria}`);
        return texto.includes("yara") || texto.includes("fakhar") || texto.includes("sabah") || texto.includes("shagaf") || texto.includes("asad");
      }
    );
  }

  return null;
}

function gerarResposta(produtos: ProdutoBot[], mensagem: string) {
  const msg = normalizarTexto(mensagem);

  if (!msg) return montarRespostaGenerica();

  if (contemAlgum(msg, ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "menu", "ajuda"])) {
    return responderSaudacao();
  }

  if (contemAlgum(msg, ["atendente", "humano", "pessoa", "vendedor", "vendedora", "especialista", "falar com", "comprar", "finalizar"])) {
    return responderAtendimentoHumano();
  }

  if (contemAlgum(msg, ["encomenda", "encomendar", "sob encomenda", "pedido especial", "consegue trazer", "trazer perfume", "importar"])) {
    return responderEncomenda();
  }

  if (contemAlgum(msg, ["entrega", "frete", "envio", "cep", "cidade", "retirada", "delivery", "prazo", "chega quando"])) {
    return responderEntregaFrete();
  }

  if (contemAlgum(msg, ["pagamento", "pagar", "pix", "cartao", "cartão", "credito", "crédito", "debito", "débito", "parcel", "parcelamento"])) {
    return responderPagamento();
  }

  if (contemAlgum(msg, ["reservar", "reserva", "separar", "guarda", "guardar"])) {
    return responderReserva();
  }

  if (contemAlgum(msg, ["parecido", "similar", "lembra", "contratipo", "inspirado", "tipo good", "good girl", "sauvage", "invictus", "one million", "scandal", "olympea", "olimpia"])) {
    return responderParecidoCom(produtos, mensagem);
  }

  const respostaPerfil = responderPorPerfil(produtos, mensagem);
  if (respostaPerfil) {
    return respostaPerfil;
  }

  if (msg.includes("feminino") || msg.includes("feminina") || msg.includes("mulher")) {
    return montarListaCategoria(produtos, "feminino");
  }

  if (msg.includes("masculino") || msg.includes("masculina") || msg.includes("homem")) {
    return montarListaCategoria(produtos, "masculino");
  }

  if (msg.includes("unissex") || msg.includes("unisex")) {
    return montarListaCategoria(produtos, "unissex");
  }

  if (msg.includes("presente") || msg.includes("kit") || msg.includes("namorada") || msg.includes("namorado")) {
    return responderPorPerfil(produtos, mensagem) || montarListaCategoria(produtos, "kits-presente");
  }

  const produtoEncontrado = encontrarProdutoPorMensagem(produtos, mensagem);

  if (produtoEncontrado) {
    return montarRespostaProduto(produtoEncontrado);
  }

  return `Ainda não encontrei essa informação no catálogo automático da Maison Noor.

Posso te ajudar com:
• Nome de um perfume específico
• Perfume feminino, masculino ou unissex
• Perfume doce, fresco, amadeirado ou marcante
• Encomendas
• Entrega/frete
• Pagamento
• Atendimento humano

Me envie uma dessas opções ou o nome completo do perfume ✨`;
}

async function enviarMensagemWhatsApp(telefoneCliente: string, texto: string) {
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
    console.error("Erro ao enviar WhatsApp:", errorText);
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
    message: "API whatsapp-bot Maison Noor ativa com Firebase Admin e WhatsApp Cloud API.",
    webhook: "Use esta URL no painel da Meta para configurar o Webhook.",
    exemploPost: {
      message: "Tem Yara Candy?",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mensagem = extrairMensagem(body);

    const produtos = await buscarProdutos();
    const resposta = gerarResposta(produtos, mensagem);

    if (isWebhookWhatsApp(body)) {
      const telefoneCliente = extrairTelefoneWhatsApp(body);

      if (telefoneCliente && resposta) {
        await enviarMensagemWhatsApp(telefoneCliente, resposta);
      }

      return NextResponse.json({
        ok: true,
        origem: "whatsapp",
        totalProdutosLidos: produtos.length,
        mensagemRecebida: mensagem,
        respostaEnviada: Boolean(telefoneCliente),
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