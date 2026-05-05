import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AsaasError = {
  code?: string;
  description?: string;
};

function limparEnv(valor: unknown) {
  const limpo = String(valor || "")
    .trim()
    .replace(/^[\'\"]|[\'\"]$/g, "")
    .replace(/^\\\$/, "$");

  // Vercel/PowerShell às vezes entregam a chave sem o "$" inicial.
  // O Asaas exige o prefixo completo: $aact_prod_... ou $aact_hmlg_...
  if (limpo.startsWith("aact_prod_")) return `$${limpo}`;
  if (limpo.startsWith("aact_hmlg_")) return `$${limpo}`;

  return limpo;
}

const ASAAS_ENV = limparEnv(process.env.ASAAS_ENV || "sandbox").toLowerCase();
const ASAAS_API_URL =
  ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

function obterChaveAsaas() {
  const chaveProducao = limparEnv(process.env.ASAAS_API_KEY_PROD);
  const chavePadrao = limparEnv(process.env.ASAAS_API_KEY);
  const chaveLegada = limparEnv(process.env.ASAAS_TOKEN);

  if (ASAAS_ENV === "production") {
    return chaveProducao || chavePadrao || chaveLegada;
  }

  return chavePadrao || chaveProducao || chaveLegada;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function somenteNumeros(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarTexto(valor: unknown, fallback = "") {
  return String(valor || fallback).trim();
}

function separarValidade(validade: unknown) {
  const clean = somenteNumeros(validade);

  if (clean.length === 4) {
    return {
      expiryMonth: clean.slice(0, 2),
      expiryYear: `20${clean.slice(2, 4)}`,
    };
  }

  if (clean.length === 6) {
    return {
      expiryMonth: clean.slice(0, 2),
      expiryYear: clean.slice(2, 6),
    };
  }

  return {
    expiryMonth: "",
    expiryYear: "",
  };
}

function isPago(status?: string) {
  return ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(
    String(status || "").toUpperCase()
  );
}

function isEmAnalise(status?: string) {
  return ["PENDING", "AWAITING_RISK_ANALYSIS"].includes(
    String(status || "").toUpperCase()
  );
}

function statusInternoPagamento(status?: string) {
  const statusUpper = String(status || "").toUpperCase();

  if (isPago(statusUpper)) return "pago";
  if (isEmAnalise(statusUpper)) return "em_analise";

  return "aguardando_pagamento";
}

function extrairMensagemAsaas(data: any, fallback: string) {
  const errors: AsaasError[] = data?.errors || data?.error_messages || [];
  return (
    errors?.[0]?.description ||
    data?.mensagem ||
    data?.message ||
    data?.error ||
    fallback
  );
}

function isErroAmbienteAsaas(data: any) {
  const errors: AsaasError[] = data?.errors || data?.error_messages || [];
  return errors.some((erro) => erro?.code === "invalid_environment");
}

function getRemoteIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const realIp = req.headers.get("x-real-ip") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || realIp.trim() || "127.0.0.1";

  if (ip === "::1" || ip === "::ffff:127.0.0.1") return "127.0.0.1";
  return ip;
}

async function asaasFetch(path: string, payload: any) {
  const apiKey = obterChaveAsaas();

  if (!apiKey) {
    throw new Error(
      ASAAS_ENV === "production"
        ? "ASAAS_API_KEY_PROD não configurada no Vercel."
        : "ASAAS_API_KEY não configurada."
    );
  }

  return fetch(`${ASAAS_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    body: JSON.stringify(payload),
  });
}


async function salvarClienteCartaoAutomatico(params: {
  nome: string;
  email: string;
  cpfCnpj: string;
  telefone: string;
  numeroPedido: string;
  valor: number;
  status: "em_conversa" | "cartao_recusado" | "comprou" | "em_analise";
  asaasCustomerId?: string | null;
  asaasPaymentId?: string | null;
  asaasStatus?: string | null;
  erroTecnico?: any;
}) {
  try {
    const db = admin.apps.length ? admin.firestore() : null;
    if (!db || !params.cpfCnpj) return;

    const agoraIso = new Date().toISOString();
    const statusCliente = params.status === "comprou" ? "comprou" : params.status;

    const payloadBase = {
      cpf: params.cpfCnpj,
      cpfCnpj: params.cpfCnpj,
      nome: params.nome,
      email: params.email,
      telefone: params.telefone,
      whatsapp: params.telefone,
      origem: "checkout-site-cartao",
      status: statusCliente,
      ultimoPedido: params.numeroPedido,
      ultimoValor: params.valor,
      ultimaFormaPagamento: "cartao",
      asaasCustomerId: params.asaasCustomerId || null,
      asaasPaymentId: params.asaasPaymentId || null,
      asaasStatus: params.asaasStatus || null,
      erroCartao: params.erroTecnico || null,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: agoraIso,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: agoraIso,
    };

    await db.collection("clientes").doc(params.cpfCnpj).set(payloadBase, { merge: true });

    await db.collection("clientes_vip").doc(params.cpfCnpj).set(
      {
        ...payloadBase,
        preferencia: "Não informado",
        estilo: "Não informado",
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Erro ao salvar cliente automático do cartão no CRM:", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const valor = Number(body?.valor || body?.value || body?.total || 0);
    const numeroPedido = normalizarTexto(body?.numeroPedido);
    const pedidoId = normalizarTexto(body?.pedidoId);

    const nome = normalizarTexto(body?.nome || body?.cardNome, "Cliente Maison Noor");
    const cardNome = normalizarTexto(body?.cardNome || body?.nome, nome).toUpperCase();
    const email = normalizarTexto(body?.email, "cliente@maisonnoor.com.br");
    const cpfCnpj = somenteNumeros(body?.cpf || body?.cpfCnpj);
    const telefone = somenteNumeros(body?.telefone || body?.phone || body?.mobilePhone);

    const numeroCartao = somenteNumeros(body?.cardNumero || body?.numeroCartao);
    const validade = body?.cardValidade || body?.validade || "";
    const cvv = somenteNumeros(body?.cardCvv || body?.cvv || body?.ccv);
    const parcelas = Math.max(1, Number(body?.parcelas || body?.installments || 1));

    const cep = somenteNumeros(body?.cep || body?.postalCode);
    const numeroEndereco = normalizarTexto(body?.numeroEndereco || body?.addressNumber, "0");
    const { expiryMonth, expiryYear } = separarValidade(validade);
    const remoteIp = getRemoteIp(req);
    const chaveAsaasAtual = obterChaveAsaas();

    console.log("ASAAS CONFIG SEGURO:", {
      ambiente: ASAAS_ENV,
      url: ASAAS_API_URL,
      chaveConfigurada: Boolean(chaveAsaasAtual),
      prefixoChave: chaveAsaasAtual ? chaveAsaasAtual.slice(0, 12) : "vazio",
      tamanhoChave: chaveAsaasAtual.length,
    });

    if (!chaveAsaasAtual) {
      return NextResponse.json(
        {
          erro: true,
          mensagem:
            ASAAS_ENV === "production"
              ? "ASAAS_API_KEY_PROD não configurada no Vercel."
              : "ASAAS_API_KEY não configurada.",
          ambienteAtual: ASAAS_ENV,
        },
        { status: 500 }
      );
    }

    if (!valor || valor <= 0) {
      return NextResponse.json({ erro: true, mensagem: "Valor inválido." }, { status: 400 });
    }

    if (!numeroPedido) {
      return NextResponse.json(
        { erro: true, mensagem: "numeroPedido não informado." },
        { status: 400 }
      );
    }

    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      return NextResponse.json(
        { erro: true, mensagem: "CPF/CNPJ do cliente não informado ou inválido." },
        { status: 400 }
      );
    }

    if (telefone.length < 10 || telefone.length > 11) {
      return NextResponse.json(
        { erro: true, mensagem: "Telefone do titular inválido. Informe DDD + número." },
        { status: 400 }
      );
    }

    if (!cep || cep.length !== 8) {
      return NextResponse.json(
        { erro: true, mensagem: "CEP inválido. Informe um CEP com 8 números." },
        { status: 400 }
      );
    }

    if (!numeroEndereco) {
      return NextResponse.json(
        { erro: true, mensagem: "Número do endereço não informado." },
        { status: 400 }
      );
    }

    if (!numeroCartao || numeroCartao.length < 13) {
      return NextResponse.json(
        { erro: true, mensagem: "Número do cartão inválido." },
        { status: 400 }
      );
    }

    if (!expiryMonth || !expiryYear) {
      return NextResponse.json(
        { erro: true, mensagem: "Validade do cartão inválida." },
        { status: 400 }
      );
    }

    const mes = Number(expiryMonth);
    const ano = Number(expiryYear);
    const anoAtual = new Date().getFullYear();

    if (mes < 1 || mes > 12) {
      return NextResponse.json(
        { erro: true, mensagem: "Mês de validade do cartão inválido." },
        { status: 400 }
      );
    }

    if (ano < anoAtual) {
      return NextResponse.json(
        { erro: true, mensagem: "Ano de validade do cartão expirado." },
        { status: 400 }
      );
    }

    if (!cvv || cvv.length < 3) {
      return NextResponse.json({ erro: true, mensagem: "CVV inválido." }, { status: 400 });
    }

    await salvarClienteCartaoAutomatico({
      nome,
      email,
      cpfCnpj,
      telefone,
      numeroPedido,
      valor,
      status: "em_conversa",
    });

    const customerPayload: any = {
      name: nome,
      email,
      cpfCnpj,
      notificationDisabled: true,
    };

    // Não envie phone e mobilePhone juntos com o mesmo número.
    if (telefone.length === 11) {
      customerPayload.mobilePhone = telefone;
    } else {
      customerPayload.phone = telefone;
    }

    const customerResponse = await asaasFetch("/customers", customerPayload);
    const customerData = await customerResponse.json().catch(() => null);

    if (!customerResponse.ok || !customerData?.id) {
      console.error("ERRO ASAAS CUSTOMER:", customerData);

      if (isErroAmbienteAsaas(customerData)) {
        return NextResponse.json(
          {
            erro: true,
            mensagem:
              ASAAS_ENV === "production"
                ? "A chave usada não pertence à produção. Verifique ASAAS_ENV e ASAAS_API_KEY_PROD."
                : "A chave usada não pertence ao sandbox. Verifique ASAAS_ENV e ASAAS_API_KEY.",
            ambienteAtual: ASAAS_ENV,
            urlAtual: ASAAS_API_URL,
            detalhe: customerData,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          erro: true,
          mensagem: extrairMensagemAsaas(customerData, "Erro ao criar cliente no Asaas."),
          detalhe: customerData,
        },
        { status: customerResponse.status || 400 }
      );
    }

    const creditCardHolderInfo: any = {
      name: cardNome,
      email,
      cpfCnpj,
      postalCode: cep,
      addressNumber: numeroEndereco,
    };

    if (telefone.length === 11) {
      creditCardHolderInfo.mobilePhone = telefone;
    } else {
      creditCardHolderInfo.phone = telefone;
    }

    const paymentPayload: any = {
      customer: customerData.id,
      billingType: "CREDIT_CARD",
      value: valor,
      dueDate: hojeISO(),
      description: `Pedido Maison Noor - ${numeroPedido}`,
      externalReference: String(numeroPedido),
      creditCard: {
        holderName: cardNome,
        number: numeroCartao,
        expiryMonth,
        expiryYear,
        ccv: cvv,
      },
      creditCardHolderInfo,
      remoteIp,
    };

    if (parcelas > 1) {
      paymentPayload.installmentCount = parcelas;
      paymentPayload.totalValue = valor;
    }

    console.log("ASAAS CARTAO PAYLOAD SEGURO:", {
      ambiente: ASAAS_ENV,
      url: `${ASAAS_API_URL}/payments`,
      customer: customerData.id,
      value: valor,
      numeroPedido,
      holderName: cardNome,
      cardFinal: numeroCartao.slice(-4),
      expiryMonth,
      expiryYear,
      telefoneTamanho: telefone.length,
      remoteIp,
      parcelas,
    });

    const paymentResponse = await asaasFetch("/payments", paymentPayload);
    const paymentData = await paymentResponse.json().catch(() => null);
    const db = admin.apps.length ? admin.firestore() : null;

    if (!paymentResponse.ok) {
      console.error("ERRO ASAAS CARTAO:", paymentData);

      if (db && pedidoId) {
        await db
          .collection("pedidos")
          .doc("default")
          .collection("lista")
          .doc(String(pedidoId))
          .set(
            {
              formaPagamento: "cartao",
              pagamentoStatus: "recusado",
              statusPagamento: "recusado",
              status: "aguardando_pagamento",

              cpf: cpfCnpj,
              telefone,
              phone: telefone.length === 10 ? telefone : "",
              mobilePhone: telefone.length === 11 ? telefone : "",
              parcelas,

              asaasCustomerId: customerData.id,
              asaasPaymentId: paymentData?.id || null,
              asaasStatus: paymentData?.status || "RECUSADO",
              asaasCartao: paymentData || null,
              asaasErroCartao: paymentData || null,

              valor,
              total: valor,
              valorTotal: valor,
              totalPedido: valor,
              totalCartao: valor,
              numeroPedido,

              atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
      }

      await salvarClienteCartaoAutomatico({
        nome,
        email,
        cpfCnpj,
        telefone,
        numeroPedido,
        valor,
        status: "cartao_recusado",
        asaasCustomerId: customerData.id,
        asaasPaymentId: paymentData?.id || null,
        asaasStatus: paymentData?.status || "RECUSADO",
        erroTecnico: paymentData || null,
      });

      return NextResponse.json(
        {
          erro: true,
          mensagem: extrairMensagemAsaas(
            paymentData,
            "Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente."
          ),
          detalhe: paymentData,
        },
        { status: paymentResponse.status || 400 }
      );
    }

    const statusAsaas = String(paymentData?.status || "").toUpperCase();
    const pagamentoAprovado = isPago(statusAsaas);
    const pagamentoEmAnalise = isEmAnalise(statusAsaas);
    const statusInterno = statusInternoPagamento(statusAsaas);

    if (db && pedidoId) {
      await db
        .collection("pedidos")
        .doc("default")
        .collection("lista")
        .doc(String(pedidoId))
        .set(
          {
            formaPagamento: "cartao",
            pagamentoStatus: statusInterno,
            statusPagamento: statusInterno,
            status: pagamentoAprovado ? "pago" : "aguardando_pagamento",

            cpf: cpfCnpj,
            telefone,
            phone: telefone.length === 10 ? telefone : "",
            mobilePhone: telefone.length === 11 ? telefone : "",
            parcelas,

            asaasCustomerId: customerData.id,
            asaasPaymentId: paymentData?.id || null,
            asaasInvoiceUrl: paymentData?.invoiceUrl || null,
            asaasStatus: statusAsaas || paymentData?.status || null,
            asaasCartao: paymentData || null,

            valor,
            total: valor,
            valorTotal: valor,
            totalPedido: valor,
            totalCartao: valor,
            numeroPedido,

            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: new Date().toISOString(),
            ...(pagamentoAprovado
              ? { pagoEm: admin.firestore.FieldValue.serverTimestamp() }
              : {}),
          },
          { merge: true }
        );
    }

    await salvarClienteCartaoAutomatico({
      nome,
      email,
      cpfCnpj,
      telefone,
      numeroPedido,
      valor,
      status: pagamentoAprovado ? "comprou" : pagamentoEmAnalise ? "em_analise" : "em_conversa",
      asaasCustomerId: customerData.id,
      asaasPaymentId: paymentData?.id || null,
      asaasStatus: statusAsaas || paymentData?.status || null,
      erroTecnico: pagamentoAprovado || pagamentoEmAnalise ? null : paymentData || null,
    });

    return NextResponse.json({
      ok: true,
      aprovado: pagamentoAprovado,
      id: paymentData?.id,
      asaasPaymentId: paymentData?.id,
      asaasCustomerId: customerData.id,
      invoiceUrl: paymentData?.invoiceUrl,
      status: statusAsaas || paymentData?.status,
      numeroPedido,
      mensagem: pagamentoAprovado
        ? "Pagamento aprovado."
        : pagamentoEmAnalise
        ? "Pagamento enviado para análise."
        : "Pagamento criado e aguardando confirmação.",
    });
  } catch (error: any) {
    console.error("ERRO API ASAAS CARTAO:", error);

    return NextResponse.json(
      {
        erro: true,
        mensagem: "Erro interno ao processar pagamento com cartão.",
        detalhe: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
