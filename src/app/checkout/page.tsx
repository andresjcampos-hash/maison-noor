"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

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

export default function CheckoutPage() {
  const [mounted, setMounted] = useState(false);
  const [carrinho, setCarrinho] = useState<CartItem[]>([]);
  const [cep, setCep] = useState("");
  const [freightOptions, setFreightOptions] = useState<FreightOption[]>([]);
  const [selectedFreight, setSelectedFreight] = useState<string>("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [checkoutFeedback, setCheckoutFeedback] = useState("");

  useEffect(() => {
    setMounted(true);
    setCarrinho(getCartFromStorage());
  }, []);

  const subtotal = useMemo(() => {
    return carrinho.reduce(
      (acc, item) =>
        acc +
        Number(item.preco || item.precoVenda || 0) *
          Number(item.qtd || item.quantidade || 1),
      0
    );
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

  const pixTotal = subtotal + freteSelecionado;
  const total = subtotal + freteSelecionado;

  async function salvarPedido(formaPagamento: "whatsapp" | "pix") {
    if (!carrinho.length) return null;

    const user = auth.currentUser;
    const itensPedido = mapOrderItems(carrinho);
    const freteAtual = freightOptions.find((opt) => opt.id === selectedFreight);
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
      freteNome: freteAtual?.nome || "",
      fretePrazo: freteAtual?.prazo || "",
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
    };

    const ref = await addDoc(collection(db, "pedidos", "default", "lista"), payload);
    return { id: ref.id, numeroPedido };
  }

  async function finalizarWhatsapp() {
    const itens = carrinho
      .map(
        (item) =>
          `• ${item.nome} - Qtd: ${Number(item.qtd || item.quantidade || 1)} - ${formatarMoeda(
            Number(item.preco || item.precoVenda || 0) *
              Number(item.qtd || item.quantidade || 1)
          )}`
      )
      .join("\n");

    const freteTexto = freightOptions.length
      ? `${freightOptions.find((opt) => opt.id === selectedFreight)?.nome ?? "Frete"} - ${formatarMoeda(freteSelecionado)}`
      : "Ainda não calculado";

    const fallbackTexto = encodeURIComponent(
      `Olá! Quero finalizar minha compra na Maison Noor.

CEP: ${cep || "não informado"}
Frete: ${freteTexto}

Pedido:
${itens || "Sacola vazia"}

Subtotal: ${formatarMoeda(subtotal)}
Total: ${formatarMoeda(total)}`
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
          })
        );
      }

      const texto = encodeURIComponent(
        `Olá! Quero finalizar minha compra na Maison Noor.

Pedido: ${pedidoNumeroTexto}
CEP: ${cep || "não informado"}
Frete: ${freteTexto}

Pedido:
${itens || "Sacola vazia"}

Subtotal: ${formatarMoeda(subtotal)}
Total: ${formatarMoeda(total)}`
      );
      setCheckoutFeedback(`Pedido ${pedidoNumeroTexto} salvo com sucesso.`);
      window.open(`https://wa.me/5512982627108?text=${texto}`, "_blank");
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
            Number(item.preco || item.precoVenda || 0) *
              Number(item.qtd || item.quantidade || 1)
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
          })
        );
      }

      const texto = encodeURIComponent(
        `Olá! Quero receber a chave Pix / link de pagamento do meu pedido na Maison Noor.\n\nPedido: ${pedidoNumeroTexto}\nCEP: ${cep || "não informado"}\nFrete: ${freteTexto}\n\nPedido:\n${itens || "Sacola vazia"}\n\nSubtotal: ${formatarMoeda(subtotal)}\nTotal no Pix: ${formatarMoeda(pixTotal)}`
      );

      setCheckoutFeedback(`Pedido ${pedidoNumeroTexto} salvo com sucesso. Abrindo o atendimento Pix...`);
      window.open(`https://wa.me/5512982627108?text=${texto}`, "_blank");
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
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={styles.kicker}>Maison Noor</p>
            <h1 style={styles.title}>Checkout</h1>
            <p style={styles.subtitle}>
              Revise sua seleção, escolha a melhor opção de frete e finalize sua compra com atendimento premium.
            </p>
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

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Resumo do pedido</h2>
              <span style={styles.itemCount}>
                {mounted ? carrinho.length : 0} item(ns)
              </span>
            </div>

            {!mounted ? (
              <div style={styles.emptyWrap}>
                <p style={styles.empty}>Carregando sacola...</p>
              </div>
            ) : carrinho.length === 0 ? (
              <div style={styles.emptyWrap}>
                <p style={styles.empty}>Sua sacola está vazia.</p>
              </div>
            ) : (
              <div style={styles.itemsList}>
                {carrinho.map((item, i) => (
                  <div key={i} style={styles.item}>
                    <div style={styles.thumbWrap}>
                      <img
                        src={item.imagem || item.imageUrl || "/logo-maison-noor.png"}
                        alt={item.nome}
                        style={styles.thumb}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/logo-maison-noor.png";
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={styles.itemName}>{item.nome}</p>
                      <p style={styles.itemMeta}>
                        Qtd: {item.qtd || item.quantidade || 1}
                      </p>
                    </div>

                    <strong style={styles.price}>
                      {formatarMoeda(
                        Number(item.preco || item.precoVenda || 0) *
                          Number(item.qtd || item.quantidade || 1)
                      )}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Pagamento</h2>

            <div style={styles.fieldWrap}>
              <label style={styles.label}>CEP para calcular frete</label>
              <div style={styles.cepRow}>
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
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

            {freightOptions.length > 0 && (
              <div style={styles.freightBox}>
                <div style={styles.freightHeader}>
                  <strong style={styles.freightTitle}>Opções de frete</strong>
                  <span style={styles.freightSub}>Estimativa via Correios</span>
                </div>

                <div style={styles.freightList}>
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
                        <div>
                          <div style={styles.freightName}>{option.nome}</div>
                          <div style={styles.freightPrazo}>{option.prazo}</div>
                          {option.destaque ? (
                            <span style={styles.freightBadge}>{option.destaque}</span>
                          ) : null}
                        </div>
                        <strong style={styles.freightPrice}>{formatarMoeda(option.valor)}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={styles.summaryRow}>
              <span>Subtotal</span>
              <strong>{formatarMoeda(subtotal)}</strong>
            </div>

            <div style={styles.summaryRow}>
              <span>Frete</span>
              <strong>{freightOptions.length ? formatarMoeda(freteSelecionado) : "Informe o CEP"}</strong>
            </div>

            <div style={styles.divider} />

            <div style={styles.summaryRowBig}>
              <span>Total</span>
              <strong>{formatarMoeda(total)}</strong>
            </div>

            <div style={styles.noticeBox}>
              Os valores de frete exibidos aqui são estimativas para facilitar a compra. Na próxima etapa,
              podemos integrar cálculo automático e pagamento PagBank dentro do site.
            </div>

            {checkoutFeedback ? (
              <div style={styles.checkoutFeedback}>{checkoutFeedback}</div>
            ) : null}

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

            <p style={styles.safeText}>
              Pedido salvo antes da abertura do atendimento • Compra protegida • Maison Noor
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f0e7",
    padding: "20px 16px 28px",
  },
  container: {
    maxWidth: 1240,
    margin: "0 auto",
  },
  hero: {
    background: "#fbf7f0",
    border: "1px solid #e7d5b5",
    borderRadius: 22,
    padding: "20px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
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
    fontSize: 30,
    fontWeight: 800,
    color: "#2b2118",
    lineHeight: 1.05,
  },
  subtitle: {
    margin: 0,
    color: "#6b5c4e",
    fontSize: 15,
    lineHeight: 1.5,
    maxWidth: 620,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 20,
  },
  card: {
    background: "#fffaf4",
    borderRadius: 22,
    padding: 22,
    border: "1px solid #ead8b7",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: "#2b2118",
    lineHeight: 1.1,
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
    gap: 14,
    padding: "14px 0",
    borderBottom: "1px solid #eee0ca",
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
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
    fontSize: 15,
    lineHeight: 1.25,
  },
  itemMeta: {
    margin: "4px 0 0",
    color: "#7a6d61",
    fontSize: 13,
  },
  price: {
    color: "#b98a3e",
    fontSize: 17,
    whiteSpace: "nowrap",
  },
  fieldWrap: {
    display: "grid",
    gap: 8,
    marginBottom: 16,
  },
  label: {
    color: "#7a6d61",
    fontSize: 13,
    fontWeight: 700,
  },
  cepRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },
  input: {
    width: "100%",
    height: 46,
    borderRadius: 14,
    border: "1px solid #e0c79f",
    background: "#fff",
    padding: "0 14px",
    fontSize: 15,
    color: "#2b2118",
    outline: "none",
    boxSizing: "border-box",
  },
  calcButton: {
    minWidth: 150,
    height: 46,
    borderRadius: 14,
    border: "1px solid #e0c79f",
    background: "#fff",
    color: "#2b2118",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    padding: "0 16px",
  },
  freightBox: {
    marginBottom: 16,
    borderRadius: 18,
    border: "1px solid #ead8b7",
    background: "#fdf8f0",
    padding: 16,
  },
  freightHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  freightTitle: {
    color: "#2b2118",
    fontSize: 16,
  },
  freightSub: {
    color: "#8b7a67",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  freightList: {
    display: "grid",
    gap: 10,
  },
  freightOption: {
    width: "100%",
    borderRadius: 16,
    border: "1px solid #e7d5b5",
    background: "#fff",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    cursor: "pointer",
  },
  freightOptionActive: {
    border: "1px solid #c79d61",
    background: "linear-gradient(180deg, #fff8ef, #f5e6d0)",
    boxShadow: "0 10px 22px rgba(120, 87, 45, 0.08)",
  },
  freightName: {
    color: "#2b2118",
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 4,
  },
  freightPrazo: {
    color: "#7a6d61",
    fontSize: 13,
  },
  freightBadge: {
    display: "inline-flex",
    marginTop: 8,
    padding: "5px 9px",
    borderRadius: 999,
    background: "#f1e1c7",
    color: "#8c6732",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  freightPrice: {
    color: "#b98a3e",
    fontSize: 18,
    whiteSpace: "nowrap",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    color: "#4a4037",
    fontSize: 15,
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
  noticeBox: {
    marginTop: 14,
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#f7efe3",
    border: "1px solid #ead8b7",
    color: "#6e5c4d",
    fontSize: 13,
    lineHeight: 1.45,
  },
  checkoutFeedback: {
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#fff7ec",
    border: "1px solid #ead8b7",
    color: "#6e5c4d",
    fontSize: 13,
    lineHeight: 1.45,
  },
  mainButton: {
    width: "100%",
    height: 50,
    border: "none",
    borderRadius: 15,
    background: "linear-gradient(135deg,#D4AF77,#BE9155)",
    color: "#241A12",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    marginBottom: 10,
  },
  pixButton: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: 48,
    borderRadius: 15,
    border: "1px solid #e0c79f",
    color: "#2b2118",
    fontWeight: 700,
    background: "#fff",
    fontSize: 15,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
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
    padding: "12px 18px",
    borderRadius: 15,
    border: "1px solid #e0c79f",
    color: "#2b2118",
    fontWeight: 700,
    background: "#fff",
    fontSize: 15,
    whiteSpace: "nowrap",
  },
  emptyWrap: {
    minHeight: 180,
    display: "flex",
    alignItems: "center",
  },
  empty: {
    color: "#6f6155",
    fontSize: 15,
    margin: 0,
  },
};
