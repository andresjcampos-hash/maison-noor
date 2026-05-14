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
    .trim();
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function extrairMensagem(body: any) {
  return String(
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

function encontrarProdutoPorMensagem(produtos: ProdutoBot[], mensagem: string) {
  const msg = normalizarTexto(mensagem);

  const palavrasMensagem = msg
    .replace(/[?!.,"']/g, " ")
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.length >= 3)
    .filter((p) => !["tem", "voce", "voces", "preco", "valor", "perfume"].includes(p));

  const produtosOrdenados = [...produtos].sort((a, b) => {
    return String(b.nome || "").length - String(a.nome || "").length;
  });

  return produtosOrdenados.find((produto) => {
    const nome = normalizarTexto(produto.nome || "");
    const marca = normalizarTexto(produto.marca || "");

    if (!nome) return false;

    if (msg.includes(nome)) return true;
    if (nome.includes(msg)) return true;
    if (marca && msg.includes(marca)) return true;

    const palavrasNome = nome.split(" ").filter((p) => p.length >= 3);

    const acertos = palavrasMensagem.filter((palavra) =>
      palavrasNome.some((n) => n.includes(palavra) || palavra.includes(n))
    );

    return acertos.length >= 1;
  });
}

function gerarResposta(produtos: ProdutoBot[], mensagem: string) {
  const msg = normalizarTexto(mensagem);

  if (!msg) return montarRespostaGenerica();

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
    return montarListaCategoria(produtos, "kits-presente");
  }

  const produtoEncontrado = encontrarProdutoPorMensagem(produtos, mensagem);

  if (produtoEncontrado) {
    return montarRespostaProduto(produtoEncontrado);
  }

  if (msg.includes("oi") || msg.includes("ola") || msg.includes("bom dia") || msg.includes("boa tarde") || msg.includes("boa noite")) {
    return montarRespostaGenerica();
  }

  return `Não encontrei esse perfume no catálogo agora.

Você pode me mandar o nome completo ou escolher uma categoria:
- Feminino
- Masculino
- Unissex
- Presentes

Também posso chamar o atendimento humano da Maison Noor para te ajudar ✨`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mensagem = extrairMensagem(body);

    const produtos = await buscarProdutos();
    const resposta = gerarResposta(produtos, mensagem);

    return NextResponse.json({
      ok: true,
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

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "API whatsapp-bot Maison Noor ativa com Firebase Admin.",
    exemploPost: {
      message: "Tem Yara Candy?",
    },
  });
}