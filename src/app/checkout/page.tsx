"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";

type CartItem = {
  id?: string;
  nome: string;
  preco: number;
  qtd?: number;
  quantidade?: number;
  imagem?: string;
  imageUrl?: string;
  produtoId?: string;
  precoVenda?: number;
};

type FreightOption = {
  id: string;
  nome: string;
  prazo: string;
  valor: number;
  destaque?: string;
};

type SavedOrderItem = {
  produtoId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  imagem: string;
};

function gerarNumeroPedido() {
  const agora = new Date();
  const yyyy = agora.getFullYear();
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  const dd = String(agora.getDate()).padStart(2, "0");
  const sufixo = String(Math.floor(Math.random() * 900) + 100);
  return `${yyyy}${mm}${dd}-${sufixo}`;
}

function mapOrderItems(items: CartItem[]): SavedOrderItem[] {
  return items.map((item) => {
    const quantidade = Number(item.qtd || item.quantidade || 1);
    const precoUnitario = Number(item.preco || item.precoVenda || 0);
    return {
      produtoId: String(item.id || item.produtoId || item.nome),
      nome: item.nome,
      quantidade,
      precoUnitario,
      subtotal: precoUnitario * quantidade,
      imagem: String(item.imagem || item.imageUrl || ""),
    };
  });
}

const CART_KEYS = [
  "maison_noor_sacola",
  "maison_noor_sacola_v1",
  "maison_noor_cart",
  "maison_noor_cart_v1",
  "cart",
  "cartItems",
  "sacola",
  "sacolaItems",
  "maison_cart",
  "maison_noor_bag",
] as const;

function getCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];

  for (const key of CART_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      const items = parsed
        .map((item: any) => ({
          id: String(item.id ?? item.produtoId ?? ""),
          produtoId: item.produtoId,
          nome: String(item.nome ?? item.name ?? item.title ?? "").trim(),
          preco: Number(item.preco ?? item.precoVenda ?? item.price ?? item.valor ?? 0),
          precoVenda: Number(item.precoVenda ?? item.preco ?? item.price ?? item.valor ?? 0),
          qtd: Number(item.qtd ?? item.quantidade ?? 1),
          quantidade: Number(item.quantidade ?? item.qtd ?? 1),
          imagem: String(item.imagem ?? item.imageUrl ?? item.image ?? ""),
          imageUrl: item.imageUrl,
        }))
        .filter((item) => item.nome && Number.isFinite(item.preco));

      if (items.length) return items;
    } catch (_) {}
  }

  return [];
}

function clearCartStorage() {
  if (typeof window === "undefined") return;

  for (const key of CART_KEYS) {
    window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new Event("storage"));
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function calcularFretes(cepDigits: string, subtotal: number): FreightOption[] {
  if (cepDigits.length < 8) return [];

  const prefixo = Number(cepDigits.slice(0, 2));

  let pac = 22.9;
  let sedex = 31.9;
  let mini = 18.9;

  if (prefixo <= 19) {
    pac = 15.9;
    sedex = 24.9;
    mini = 13.9;
  } else if (prefixo <= 29) {
    pac = 18.9;
    sedex = 27.9;
    mini = 15.9;
  } else if (prefixo <= 49) {
    pac = 21.9;
    sedex = 30.9;
    mini = 17.9;
  } else if (prefixo <= 69) {
    pac = 25.9;
    sedex = 35.9;
    mini = 21.9;
  } else {
    pac = 29.9;
    sedex = 39.9;
    mini = 24.9;
  }

  if (subtotal >= 399) {
    pac = Math.max(0, pac - 4);
    mini = Math.max(0, mini - 3);
  }

  return [
    {
      id: "mini",
      nome: "Correios Mini Envios",
      prazo: "5 a 9 dias úteis",
      valor: mini,
      destaque: "Opção econômica",
    },
    {
      id: "pac",
      nome: "Correios PAC",
      prazo: "4 a 8 dias úteis",
      valor: pac,
      destaque: "Mais escolhido",
    },
    {
      id: "sedex",
      nome: "Correios Sedex",
      prazo: "1 a 3 dias úteis",
      valor: sedex,
      destaque: "Entrega mais rápida",
    },
  ];
}

function formatarCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}


function getExpiracaoPedidoIso(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export default function CheckoutPage() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [carrinho, setCarrinho] = useState<CartItem[]>([]);
  const [cep, setCep] = useState("");
  const [freightOptions, setFreightOptions] = useState<FreightOption[]>([]);
  const [selectedFreight, setSelectedFreight] = useState<string>("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [checkoutFeedback, setCheckoutFeedback] = useState("");

  useEffect(() => {
    setMounted(true);
    setCarrinho(getCartFromStorage());

    const handleResize = () => setIsMobile(window.innerWidth < 980);
    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("storage", () => setCarrinho(getCartFromStorage()));

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("storage", () => setCarrinho(getCartFromStorage()));
    };
  }, []);

  const subtotal = useMemo(() => {
    return carrinho.reduce(
      (acc, item) =>
        acc + Number(item.preco || item.precoVenda || 0) * Number(item.qtd || item.quantidade || 1),
      0
    );
  }, [carrinho]);

  const totalItens = useMemo(() => {
    return carrinho.reduce((acc, item) => acc + Number(item.qtd || item.quantidade || 1), 0);
  }, [carrinho]);

  useEffect(() => {
    const digits = cep.replace(/\D/g, "");

    if (digits.length < 8) {
      setFreightOptions([]);
      setSelectedFreight("");
      return;
    }

    const options = calcularFretes(digits, subtotal);
    setFreightOptions(options);
    setSelectedFreight((prev) => prev || options[1]?.id || options[0]?.id || "");
  }, [cep, subtotal]);

  const freteSelecionado = useMemo(() => {
    const current = freightOptions.find((opt) => opt.id === selectedFreight);
    return current?.valor ?? 0;
  }, [freightOptions, selectedFreight]);

  const freteAtual = useMemo(() => {
    return freightOptions.find((opt) => opt.id === selectedFreight) || null;
  }, [freightOptions, selectedFreight]);

  const pixTotal = subtotal + freteSelecionado;
  const total = subtotal + freteSelecionado;
  const economiaPix = Math.max(0, total - pixTotal);

  async function salvarPedido(formaPagamento: "whatsapp" | "pix") {
    if (!carrinho.length) return null;

    const user = auth.currentUser;
    const itensPedido = mapOrderItems(carrinho);
    const freteAtualInterno = freightOptions.find((opt) => opt.id === selectedFreight);
    const numeroPedido = gerarNumeroPedido();

    const payload = {
      numero: numeroPedido,
      numeroPedido,
      clienteUid: user?.uid || "",
      uid: user?.uid || "",
      userId: user?.uid || "",
      usuarioId: user?.uid || "",
      clienteEmail: user?.email || "",
      email: user?.email || "",
      status: "aguardando_pagamento",
      formaPagamento,
      origem: "checkout-site",
      cep: cep || "",
      freteId: selectedFreight || "",
      freteNome: freteAtualInterno?.nome || "",
      fretePrazo: freteAtualInterno?.prazo || "",
      freteValor: freteSelecionado,
      subtotal,
      total,
      valorTotal: total,
      totalPix: pixTotal,
      itens: itensPedido,
      items: itensPedido,
      itemCount: itensPedido.reduce((acc, item) => acc + item.quantidade, 0),
      moeda: "BRL",
      rastreio: "",
      createdAt: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      createdAtIso: new Date().toISOString(),
      expiresAtIso: getExpiracaoPedidoIso(24),
      statusPagamento: "pendente",
    };

    const ref = await addDoc(collection(db, "pedidos", "default", "lista"), payload);
    return { id: ref.id, numeroPedido };
  }



  async function limparSacolaAposPedido() {
    clearCartStorage();
    setCarrinho([]);

    if (auth.currentUser) {
      try {
        await setDoc(
          doc(db, "clientes", auth.currentUser.uid),
          {
            carrinho: [],
            ultimoLogin: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Erro ao limpar carrinho do cliente no Firebase:", error);
      }
    }
  }

  async function finalizarWhatsapp() {
    const itens = carrinho
      .map(
        (item) =>
          `• ${item.nome} - Qtd: ${Number(item.qtd || item.quantidade || 1)} - ${formatarMoeda(
            Number(item.preco || item.precoVenda || 0) * Number(item.qtd || item.quantidade || 1)
          )}`
      )
      .join("\n");

    const freteTexto = freightOptions.length
      ? `${freightOptions.find((opt) => opt.id === selectedFreight)?.nome ?? "Frete"} - ${formatarMoeda(freteSelecionado)}`
      : "Ainda não calculado";

    const fallbackTexto = encodeURIComponent(
      `Olá! Quero finalizar minha compra na Maison Noor.\n\nCEP: ${cep || "não informado"}\nFrete: ${freteTexto}\n\nPedido:\n${itens || "Sacola vazia"}\n\nSubtotal: ${formatarMoeda(subtotal)}\nTotal: ${formatarMoeda(total)}`
    );

    try {
      setSavingOrder(true);
      setCheckoutFeedback("");
      const pedidoSalvo = await salvarPedido("whatsapp");
      const pedidoNumeroTexto = pedidoSalvo?.numeroPedido ? `#${pedidoSalvo.numeroPedido}` : "a gerar";

      if (typeof window !== "undefined" && pedidoSalvo?.id) {
        window.sessionStorage.setItem(
          "maison_noor_checkout_last_order",
          JSON.stringify({
            id: pedidoSalvo.id,
            numeroPedido: pedidoSalvo.numeroPedido,
            formaPagamento: "whatsapp",
            createdAt: new Date().toISOString(),
            expiresAtIso: getExpiracaoPedidoIso(24),
          })
        );
      }

      const texto = encodeURIComponent(
        `Olá! Quero finalizar minha compra na Maison Noor.\n\nPedido: ${pedidoNumeroTexto}\nCEP: ${cep || "não informado"}\nFrete: ${freteTexto}\n\nPedido:\n${itens || "Sacola vazia"}\n\nSubtotal: ${formatarMoeda(subtotal)}\nTotal: ${formatarMoeda(total)}`
      );
      await limparSacolaAposPedido();

      setCheckoutFeedback(`Pedido ${pedidoNumeroTexto} salvo com sucesso.`);
      window.open(`https://wa.me/5512982627108?text=${texto}`, "_blank");

      if (typeof window !== "undefined") {
        const target = `/checkout/sucesso?pedido=${encodeURIComponent(String(pedidoSalvo?.numeroPedido || ""))}&forma=whatsapp`;
        window.location.replace(target);
      }
    } catch (error) {
      console.error("Erro ao salvar pedido:", error);
      setCheckoutFeedback("Não foi possível salvar o pedido automaticamente. Você ainda pode finalizar pelo WhatsApp.");
      window.open(`https://wa.me/5512982627108?text=${fallbackTexto}`, "_blank");
    } finally {
      setSavingOrder(false);
    }
  }

  async function solicitarPix() {
    const itens = carrinho
      .map(
        (item) =>
          `• ${item.nome} - Qtd: ${Number(item.qtd || item.quantidade || 1)} - ${formatarMoeda(
            Number(item.preco || item.precoVenda || 0) * Number(item.qtd || item.quantidade || 1)
          )}`
      )
      .join("\n");

    const freteTexto = freightOptions.length
      ? `${freightOptions.find((opt) => opt.id === selectedFreight)?.nome ?? "Frete"} - ${formatarMoeda(freteSelecionado)}`
      : "Ainda não calculado";

    const fallbackTexto = encodeURIComponent(
      `Olá! Quero receber a chave Pix / link de pagamento do meu pedido na Maison Noor.\n\nCEP: ${cep || "não informado"}\nFrete: ${freteTexto}\n\nPedido:\n${itens || "Sacola vazia"}\n\nSubtotal: ${formatarMoeda(subtotal)}\nTotal no Pix: ${formatarMoeda(pixTotal)}`
    );

    try {
      setSavingOrder(true);
      setCheckoutFeedback("");

      const pedidoSalvo = await salvarPedido("pix");
      const pedidoNumeroTexto = pedidoSalvo?.numeroPedido ? `#${pedidoSalvo.numeroPedido}` : "a gerar";

      if (typeof window !== "undefined" && pedidoSalvo?.id) {
        window.sessionStorage.setItem(
          "maison_noor_checkout_last_order",
          JSON.stringify({
            id: pedidoSalvo.id,
            numeroPedido: pedidoSalvo.numeroPedido,
            formaPagamento: "pix",
            createdAt: new Date().toISOString(),
            expiresAtIso: getExpiracaoPedidoIso(24),
          })
        );
      }

      const texto = encodeURIComponent(
        `Olá! Quero receber a chave Pix / link de pagamento do meu pedido na Maison Noor.\n\nPedido: ${pedidoNumeroTexto}\nCEP: ${cep || "não informado"}\nFrete: ${freteTexto}\n\nPedido:\n${itens || "Sacola vazia"}\n\nSubtotal: ${formatarMoeda(subtotal)}\nTotal no Pix: ${formatarMoeda(pixTotal)}`
      );

      await limparSacolaAposPedido();

      setCheckoutFeedback(`Pedido ${pedidoNumeroTexto} salvo com sucesso. Abrindo o atendimento Pix...`);
      window.open(`https://wa.me/5512982627108?text=${texto}`, "_blank");

      if (typeof window !== "undefined") {
        const target = `/checkout/sucesso?pedido=${encodeURIComponent(String(pedidoSalvo?.numeroPedido || ""))}&forma=pix`;
        window.location.replace(target);
      }
    } catch (error) {
      console.error("Erro ao salvar pedido Pix:", error);
      setCheckoutFeedback("Não foi possível salvar o pedido automaticamente. Você ainda pode solicitar o Pix pelo WhatsApp.");
      window.open(`https://wa.me/5512982627108?text=${fallbackTexto}`, "_blank");
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <div style={styles.hero}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={styles.kicker}>Maison Noor</p>
            <h1 style={styles.title}>Checkout Premium</h1>
            <p style={styles.subtitle}>
              Revise sua seleção, escolha o melhor frete e finalize com um atendimento elegante, rápido e seguro.
            </p>

            <div
              style={{
                ...styles.heroHighlights,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              }}
            >
              <div style={styles.heroHighlightCard}>
                <span style={styles.heroHighlightTitle}>Compra segura</span>
                <span style={styles.heroHighlightText}>Pedido salvo antes do atendimento</span>
              </div>
              <div style={styles.heroHighlightCard}>
                <span style={styles.heroHighlightTitle}>Atendimento real</span>
                <span style={styles.heroHighlightText}>Suporte humano via WhatsApp</span>
              </div>
              <div style={styles.heroHighlightCard}>
                <span style={styles.heroHighlightTitle}>Envio estimado</span>
                <span style={styles.heroHighlightText}>Frete em opções mais claras</span>
              </div>
            </div>
          </div>

          <div style={styles.heroActions}>
            <Link href="/" style={styles.lightButton}>
              Continuar comprando
            </Link>
            <Link href="/minha-conta" style={styles.lightButton}>
              Minha conta
            </Link>
          </div>
        </div>

        <div
          style={{
            ...styles.grid,
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.96fr) minmax(320px, 0.74fr)",
          }}
        >
          <div style={styles.leftColumn}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Resumo do pedido</h2>
                  <p style={styles.cardSubtext}>Confira os itens escolhidos antes de seguir para o pagamento.</p>
                </div>
                <span style={styles.itemCount}>{mounted ? totalItens : 0} item(ns)</span>
              </div>

              {!mounted ? (
                <div style={styles.emptyWrap}>
                  <p style={styles.empty}>Carregando sacola...</p>
                </div>
              ) : carrinho.length === 0 ? (
                <div style={styles.emptyState}>
                  <strong style={styles.emptyTitle}>Sua sacola está vazia.</strong>
                  <p style={styles.emptyDescription}>Adicione perfumes à sua seleção para continuar no checkout.</p>
                  <Link href="/" style={styles.emptyButton}>
                    Voltar para a vitrine
                  </Link>
                </div>
              ) : (
                <>
                  <div style={styles.itemsList}>
                    {carrinho.map((item, i) => (
                      <div key={i} style={styles.item}>
                        <div style={styles.thumbWrap}>
                          <img
                            src={item.imagem || item.imageUrl || "/logo-maison-noor.png"}
                            alt={item.nome}
                            style={styles.thumb}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/logo-maison-noor.png";
                            }}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={styles.itemName}>{item.nome}</p>
                          <p style={styles.itemMeta}>Qtd: {item.qtd || item.quantidade || 1}</p>
                        </div>

                        <strong style={styles.price}>
                          {formatarMoeda(
                            Number(item.preco || item.precoVenda || 0) * Number(item.qtd || item.quantidade || 1)
                          )}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      ...styles.infoMiniGrid,
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <div style={styles.infoMiniCard}>
                      <span style={styles.infoMiniLabel}>Itens</span>
                      <strong style={styles.infoMiniValue}>{totalItens}</strong>
                    </div>
                    <div style={styles.infoMiniCard}>
                      <span style={styles.infoMiniLabel}>Subtotal</span>
                      <strong style={styles.infoMiniValue}>{formatarMoeda(subtotal)}</strong>
                    </div>
                    <div style={styles.infoMiniCard}>
                      <span style={styles.infoMiniLabel}>Atendimento</span>
                      <strong style={styles.infoMiniValue}>Premium</strong>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Entrega e frete</h2>
                  <p style={styles.cardSubtext}>Selecione o CEP e escolha a opção que mais combina com sua urgência.</p>
                </div>
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>CEP para calcular frete</label>
                <div style={styles.cepRow}>
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => setCep(formatarCep(e.target.value))}
                    placeholder="Digite seu CEP"
                    style={styles.input}
                  />
                  <button
                    type="button"
                    style={styles.calcButton}
                    onClick={() => setFreightOptions(calcularFretes(cep.replace(/\D/g, ""), subtotal))}
                  >
                    Calcular frete
                  </button>
                </div>
              </div>

              {freightOptions.length > 0 ? (
                <div style={styles.freightListPremium}>
                  {freightOptions.map((option) => {
                    const active = selectedFreight === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedFreight(option.id)}
                        style={{
                          ...styles.freightOption,
                          ...(active ? styles.freightOptionActive : {}),
                        }}
                      >
                        <div style={styles.freightOptionLeft}>
                          <div style={styles.freightTopRow}>
                            <div style={styles.freightName}>{option.nome}</div>
                            {option.destaque ? <span style={styles.freightBadge}>{option.destaque}</span> : null}
                          </div>
                          <div style={styles.freightPrazo}>{option.prazo}</div>
                        </div>
                        <strong style={styles.freightPrice}>{formatarMoeda(option.valor)}</strong>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={styles.noticeSoftBox}>
                  Digite seu CEP para exibir as opções estimadas de frete e continuar com mais segurança.
                </div>
              )}
            </div>
          </div>

          <div style={styles.rightColumn}>
            <div style={styles.paymentCard}>
              <span style={styles.sectionKicker}>Pagamento</span>
              <h2 style={styles.paymentTitle}>Finalização da compra</h2>
              <p style={styles.paymentText}>
                Seu pedido é registrado antes da abertura do atendimento, trazendo mais confiança e organização.
              </p>

              <div
                style={{
                  ...styles.trustGrid,
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                }}
              >
                <div style={styles.trustCard}>
                  <span style={styles.trustCardTitle}>Pedido salvo</span>
                  <span style={styles.trustCardText}>Registro no sistema antes do contato</span>
                </div>
                <div style={styles.trustCard}>
                  <span style={styles.trustCardTitle}>Suporte humano</span>
                  <span style={styles.trustCardText}>Atendimento real Maison Noor</span>
                </div>
              </div>

              <div style={styles.summaryPanel}>
                <div style={styles.summaryRow}>
                  <span>Subtotal</span>
                  <strong>{formatarMoeda(subtotal)}</strong>
                </div>

                <div style={styles.summaryRow}>
                  <span>Frete</span>
                  <strong>{freightOptions.length ? formatarMoeda(freteSelecionado) : "Informe o CEP"}</strong>
                </div>

                <div style={styles.summaryRow}>
                  <span>Entrega selecionada</span>
                  <strong>{freteAtual ? freteAtual.prazo : "A definir"}</strong>
                </div>

                <div style={styles.divider} />

                <div style={styles.summaryRowBig}>
                  <span>Total</span>
                  <strong>{formatarMoeda(total)}</strong>
                </div>
              </div>

              <div style={styles.pixHighlightCard}>
                <div>
                  <span style={styles.pixHighlightLabel}>Pix Maison Noor</span>
                  <strong style={styles.pixHighlightTitle}>Solicite sua chave Pix com pedido já salvo</strong>
                </div>
                <span style={styles.pixHighlightValue}>{formatarMoeda(pixTotal)}</span>
              </div>

              <div style={styles.noticeBox}>
                Os valores de frete exibidos aqui são estimativas para facilitar a compra. O próximo passo pode receber integração automática com PagBank sem alterar este fluxo atual.  
              </div>

              {checkoutFeedback ? <div style={styles.checkoutFeedback}>{checkoutFeedback}</div> : null}

              <button
                type="button"
                style={{
                  ...styles.mainButton,
                  ...((savingOrder || !carrinho.length) ? styles.buttonDisabled : {}),
                }}
                onClick={finalizarWhatsapp}
                disabled={savingOrder || !carrinho.length}
              >
                {savingOrder ? "Salvando pedido..." : "Finalizar no WhatsApp"}
              </button>

              <button
                type="button"
                onClick={solicitarPix}
                style={{
                  ...styles.pixButton,
                  ...((savingOrder || !carrinho.length) ? styles.buttonDisabled : {}),
                }}
                disabled={savingOrder || !carrinho.length}
              >
                {savingOrder ? "Salvando pedido..." : "Solicitar pagamento Pix"}
              </button>

              <div
                style={{
                  ...styles.footerSafetyGrid,
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                }}
              >
                <div style={styles.footerSafetyCard}>Compra protegida</div>
                <div style={styles.footerSafetyCard}>Atendimento premium</div>
                <div style={styles.footerSafetyCard}>Maison Noor</div>
              </div>

              <p style={styles.safeText}>
                Pedido salvo antes da abertura do atendimento • checkout mais claro • experiência premium Maison Noor
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(212,175,119,0.14), transparent 22%), #f6f0e7",
    padding: "14px 12px 24px",
  },
  container: {
    maxWidth: 1060,
    margin: "0 auto",
  },
  hero: {
    background: "linear-gradient(180deg, rgba(255,250,244,0.98), rgba(249,239,225,0.96))",
    border: "1px solid #e7d5b5",
    borderRadius: 20,
    padding: "18px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
    boxShadow: "0 16px 32px rgba(77, 56, 27, 0.06)",
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  kicker: {
    margin: 0,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 3,
    color: "#b98a3e",
    fontWeight: 700,
  },
  title: {
    margin: "6px 0 8px",
    fontSize: 18,
    fontWeight: 800,
    color: "#2b2118",
    lineHeight: 1.02,
  },
  subtitle: {
    margin: 0,
    color: "#6b5c4e",
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 620,
  },
  heroHighlights: {
    marginTop: 14,
    display: "grid",
    gap: 10,
  },
  heroHighlightCard: {
    borderRadius: 16,
    padding: "12px 12px",
    background: "rgba(255,255,255,0.78)",
    border: "1px solid #ead8b7",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  heroHighlightTitle: {
    color: "#2b2118",
    fontSize: 12,
    fontWeight: 700,
  },
  heroHighlightText: {
    color: "#7b6d61",
    fontSize: 12,
    lineHeight: 1.45,
  },
  grid: {
    display: "grid",
    gap: 16,
    alignItems: "start",
  },
  leftColumn: {
    display: "grid",
    gap: 16,
  },
  rightColumn: {
    display: "grid",
    gap: 16,
  },
  card: {
    background: "#fffaf4",
    borderRadius: 20,
    padding: 18,
    border: "1px solid #ead8b7",
    boxShadow: "0 14px 28px rgba(77, 56, 27, 0.05)",
  },
  paymentCard: {
    background: "linear-gradient(180deg, #fffaf4, #f8eedf)",
    borderRadius: 20,
    padding: 18,
    border: "1px solid #e2cba7",
    boxShadow: "0 18px 32px rgba(77, 56, 27, 0.08)",
    position: "sticky",
    top: 12,
  },
  sectionKicker: {
    display: "inline-block",
    marginBottom: 8,
    color: "#a57b41",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  paymentTitle: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.08,
    color: "#2b2118",
    fontWeight: 800,
  },
  paymentText: {
    margin: "10px 0 0",
    color: "#6f6052",
    fontSize: 14,
    lineHeight: 1.6,
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#2b2118",
    lineHeight: 1.1,
  },
  cardSubtext: {
    margin: "8px 0 0",
    color: "#7b6d61",
    fontSize: 12,
    lineHeight: 1.5,
  },
  itemCount: {
    color: "#8b7a67",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  itemsList: {
    display: "grid",
    gap: 0,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #eee0ca",
  },
  thumbWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    background: "#fff",
    border: "1px solid #ead8b7",
    overflow: "hidden",
    flexShrink: 0,
  },
  thumb: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  itemName: {
    margin: 0,
    fontWeight: 700,
    color: "#2b2118",
    fontSize: 14,
    lineHeight: 1.25,
  },
  itemMeta: {
    margin: "4px 0 0",
    color: "#7a6d61",
    fontSize: 12,
  },
  price: {
    color: "#b98a3e",
    fontSize: 15,
    whiteSpace: "nowrap",
    fontWeight: 800,
  },
  infoMiniGrid: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  infoMiniCard: {
    borderRadius: 16,
    border: "1px solid #ead8b7",
    background: "linear-gradient(180deg, #fffdf8, #f8efdf)",
    padding: "12px 12px",
    display: "grid",
    gap: 5,
  },
  infoMiniLabel: {
    color: "#8c7a65",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  infoMiniValue: {
    color: "#2b2118",
    fontSize: 16,
    fontWeight: 800,
  },
  fieldWrap: {
    display: "grid",
    gap: 8,
    marginBottom: 16,
  },
  label: {
    color: "#7a6d61",
    fontSize: 12,
    fontWeight: 700,
  },
  cepRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },
  input: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: "1px solid #e0c79f",
    background: "#fff",
    padding: "0 14px",
    fontSize: 14,
    color: "#2b2118",
    outline: "none",
    boxSizing: "border-box",
  },
  calcButton: {
    minWidth: 132,
    height: 44,
    borderRadius: 14,
    border: "1px solid #e0c79f",
    background: "#fff",
    color: "#2b2118",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    padding: "0 16px",
  },
  freightListPremium: {
    display: "grid",
    gap: 12,
  },
  freightOption: {
    width: "100%",
    borderRadius: 18,
    border: "1px solid #e7d5b5",
    background: "#fff",
    padding: "13px 13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(77, 56, 27, 0.03)",
  },
  freightOptionActive: {
    border: "1px solid #c79d61",
    background: "linear-gradient(180deg, #fff8ef, #f5e6d0)",
    boxShadow: "0 14px 24px rgba(120, 87, 45, 0.10)",
  },
  freightOptionLeft: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },
  freightTopRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  freightName: {
    color: "#2b2118",
    fontWeight: 700,
    fontSize: 14,
  },
  freightPrazo: {
    color: "#7a6d61",
    fontSize: 12,
  },
  freightBadge: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: 999,
    background: "#f1e1c7",
    color: "#8c6732",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  freightPrice: {
    color: "#b98a3e",
    fontSize: 16,
    whiteSpace: "nowrap",
    fontWeight: 800,
  },
  noticeSoftBox: {
    padding: "14px 15px",
    borderRadius: 16,
    background: "#f8f0e3",
    border: "1px solid #ead8b7",
    color: "#6c5d4f",
    fontSize: 12,
    lineHeight: 1.5,
  },
  trustGrid: {
    display: "grid",
    gap: 10,
    marginTop: 14,
    marginBottom: 14,
  },
  trustCard: {
    borderRadius: 16,
    border: "1px solid #ead8b7",
    background: "rgba(255,255,255,0.78)",
    padding: "12px 12px",
    display: "grid",
    gap: 6,
  },
  trustCardTitle: {
    color: "#2b2118",
    fontSize: 12,
    fontWeight: 700,
  },
  trustCardText: {
    color: "#7a6d61",
    fontSize: 12,
    lineHeight: 1.45,
  },
  summaryPanel: {
    borderRadius: 18,
    border: "1px solid #ead8b7",
    background: "rgba(255,255,255,0.84)",
    padding: "13px 13px",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    color: "#4a4037",
    fontSize: 14,
    gap: 12,
  },
  summaryRowBig: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 18,
    fontWeight: 800,
    color: "#2b2118",
    gap: 12,
  },
  divider: {
    height: 1,
    background: "#ead8b7",
    margin: "14px 0",
  },
  pixHighlightCard: {
    marginTop: 16,
    marginBottom: 14,
    borderRadius: 18,
    padding: "13px 13px",
    border: "1px solid rgba(212, 175, 119, 0.36)",
    background: "linear-gradient(135deg, rgba(255,247,234,0.96), rgba(244,229,201,0.94))",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 14px 24px rgba(120, 87, 45, 0.08)",
  },
  pixHighlightLabel: {
    display: "block",
    color: "#a57b41",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  pixHighlightTitle: {
    color: "#2b2118",
    fontSize: 16,
    lineHeight: 1.25,
    fontWeight: 800,
  },
  pixHighlightValue: {
    color: "#a27639",
    fontSize: 20,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  noticeBox: {
    marginTop: 14,
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#f7efe3",
    border: "1px solid #ead8b7",
    color: "#6e5c4d",
    fontSize: 12,
    lineHeight: 1.55,
  },
  checkoutFeedback: {
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#fff7ec",
    border: "1px solid #ead8b7",
    color: "#6e5c4d",
    fontSize: 12,
    lineHeight: 1.45,
  },
  mainButton: {
    width: "100%",
    height: 46,
    border: "none",
    borderRadius: 15,
    background: "linear-gradient(135deg,#D4AF77,#BE9155)",
    color: "#241A12",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    marginBottom: 10,
    boxShadow: "0 14px 26px rgba(120, 87, 45, 0.12)",
  },
  pixButton: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: 46,
    borderRadius: 15,
    border: "1px solid #d6ba8e",
    color: "#2b2118",
    fontWeight: 800,
    background: "linear-gradient(180deg, #fffdf9, #f7ecd8)",
    fontSize: 14,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  footerSafetyGrid: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  footerSafetyCard: {
    borderRadius: 14,
    border: "1px solid #ead8b7",
    background: "rgba(255,255,255,0.8)",
    minHeight: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b5c4e",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    padding: "0 10px",
  },
  safeText: {
    textAlign: "center",
    marginTop: 14,
    color: "#7c6c5d",
    fontSize: 12,
    lineHeight: 1.5,
  },
  lightButton: {
    textDecoration: "none",
    padding: "10px 14px",
    borderRadius: 15,
    border: "1px solid #e0c79f",
    color: "#2b2118",
    fontWeight: 700,
    background: "#fff",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  emptyWrap: {
    minHeight: 180,
    display: "flex",
    alignItems: "center",
  },
  empty: {
    color: "#6f6155",
    fontSize: 14,
    margin: 0,
  },
  emptyState: {
    minHeight: 220,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 10,
  },
  emptyTitle: {
    color: "#2b2118",
    fontSize: 18,
    fontWeight: 800,
  },
  emptyDescription: {
    margin: 0,
    color: "#6f6155",
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 460,
  },
  emptyButton: {
    marginTop: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "0 18px",
    borderRadius: 14,
    border: "1px solid #e0c79f",
    background: "#fff",
    color: "#2b2118",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 14,
  },
};
