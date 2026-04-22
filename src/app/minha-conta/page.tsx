"use client";

  import Link from "next/link";
  import { useRouter } from "next/navigation";
  import { FormEvent, useEffect, useMemo, useState } from "react";
  import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    updateProfile,
    User,
  } from "firebase/auth";
  import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
  } from "firebase/firestore";
  import { auth, db } from "@/lib/firebase";

  type ClienteDoc = {
    uid: string;
    nome: string;
    email: string;
    telefone?: string;
    tipo?: string;
    vip?: boolean;
    favoritos?: string[];
    carrinho?: Array<{
      produtoId: string;
      nome: string;
      quantidade: number;
      preco?: number;
      imagem?: string;
      tamanho?: string;
    }>;
  };

  type Produto = {
    id: string;
    nome: string;
    marca?: string;
    precoVenda?: number;
    imagem?: string;
    imageUrl?: string;
    volumeMl?: number;
  };

  type CartItem = {
    id: string;
    nome: string;
    preco: number;
    imagem: string;
    tamanho?: string;
    quantidade?: number;
  };

  type PedidoCliente = {
    id: string;
    numero: string;
    status: string;
    statusLabel: string;
    valorTotal: number;
    criadoEmLabel: string;
    criadoEmSort: number;
    codigoRastreio?: string;
    itensResumo: string[];
  };

  function traduzErroFirebase(code?: string) {
    switch (code) {
      case "auth/email-already-in-use":
        return "Este e-mail já está em uso.";
      case "auth/invalid-email":
        return "E-mail inválido.";
      case "auth/weak-password":
        return "A senha precisa ter pelo menos 6 caracteres.";
      case "auth/invalid-credential":
        return "E-mail ou senha inválidos.";
      case "auth/user-not-found":
        return "Usuário não encontrado.";
      case "auth/wrong-password":
        return "Senha incorreta.";
      default:
        return "Ocorreu um erro. Tente novamente.";
    }
  }

  function formatarMoeda(valor: number) {
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
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

  function getImagemProduto(produto: Produto): string {
    if (produto.imagem) return produto.imagem;
    if (produto.imageUrl) return produto.imageUrl;
    return `/produtos/${slugify(produto.nome)}.png`;
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

    const normalize = (item: any): CartItem | null => {
      const nome = String(item?.nome ?? item?.name ?? item?.title ?? "").trim();
      const preco = Number(item?.preco ?? item?.precoVenda ?? item?.price ?? item?.valor ?? 0);
      const quantidade = Number(item?.quantidade ?? item?.qtd ?? 1);

      if (!nome && !item?.id && !item?.produtoId) return null;
      if (!Number.isFinite(preco) || preco < 0) return null;

      return {
        id: String(item?.id ?? item?.produtoId ?? item?.slug ?? nome),
        nome: nome || "Produto Maison Noor",
        preco,
        imagem: String(item?.imagem ?? item?.imageUrl ?? item?.image ?? "/produtos/hero-perfume.png"),
        tamanho: item?.tamanho ? String(item.tamanho) : undefined,
        quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1,
      };
    };

    const candidates: CartItem[][] = [];

    for (const key of CART_KEYS) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;

        const normalized = parsed.map(normalize).filter(Boolean) as CartItem[];
        if (normalized.length) candidates.push(normalized);
      } catch (_) {}
    }

    if (!candidates.length) return [];

    const score = (items: CartItem[]) => {
      const subtotal = items.reduce(
        (acc, item) => acc + Math.max(0, Number(item.preco || 0)) * Math.max(1, Number(item.quantidade || 1)),
        0
      );

      const named = items.filter(
        (item) => item.nome && item.nome !== "Andre Teste" && item.nome !== "Produto Maison Noor"
      ).length;

      return [subtotal > 0 ? 1 : 0, subtotal, named, items.length];
    };

    candidates.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);

      for (let i = 0; i < sa.length; i++) {
        if (sa[i] !== sb[i]) return sb[i] - sa[i];
      }

      return 0;
    });

    return candidates[0];
  }

  function saveCartToStorage(items: CartItem[]) {
    if (typeof window === "undefined") return;

    const payload = JSON.stringify(items);

    if (!items.length) {
      for (const key of CART_KEYS) {
        window.localStorage.removeItem(key);
      }
      window.dispatchEvent(new Event("storage"));
      return;
    }

    for (const key of CART_KEYS) {
      window.localStorage.setItem(key, payload);
    }

    window.dispatchEvent(new Event("storage"));
  }

  function getPedidoDateInfo(value: any) {
    try {
      if (!value) {
        return { label: "Data indisponível", sort: 0 };
      }

      let date: Date | null = null;

      if (typeof value?.toDate === "function") {
        date = value.toDate();
      } else if (typeof value?.seconds === "number") {
        date = new Date(value.seconds * 1000);
      } else if (typeof value === "string" || typeof value === "number") {
        date = new Date(value);
      }

      if (!date || Number.isNaN(date.getTime())) {
        return { label: "Data indisponível", sort: 0 };
      }

      return {
        label: date.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        sort: date.getTime(),
      };
    } catch (_) {
      return { label: "Data indisponível", sort: 0 };
    }
  }

  function getPedidoStatusNormalizado(status: any) {
    const raw = String(status || "").trim().toLowerCase();

    if (!raw) return "aguardando_pagamento";
    if (["aguardando_pagamento", "aguardando pagamento", "pendente", "pending", "rascunho"].includes(raw)) return "aguardando_pagamento";
    if (["pago", "paid", "pagou", "confirmado"].includes(raw)) return "pago";
    if (["enviado", "shipped", "postado", "despachado"].includes(raw)) return "enviado";
    if (["entregue", "delivered", "finalizado", "concluido", "concluído"].includes(raw)) return "entregue";
    if (["cancelado", "cancelada", "canceled", "cancelled", "perdido"].includes(raw)) return "cancelado";
    return raw;
  }

  function getPedidoStatusLabel(status: any) {
    const normalizado = getPedidoStatusNormalizado(status);

    if (normalizado === "aguardando_pagamento") return "Aguardando pagamento";
    if (normalizado === "pago") return "Pago";
    if (normalizado === "enviado") return "Enviado";
    if (normalizado === "entregue") return "Entregue";
    if (normalizado === "cancelado") return "Cancelado";

    return "Pedido recebido";
  }

  function getPedidoItensResumo(data: any): string[] {
    const itens = Array.isArray(data?.itens)
      ? data.itens
      : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.produtos)
      ? data.produtos
      : [];

    return itens
      .map((item: any) => {
        const nome = String(item?.nome ?? item?.name ?? item?.title ?? "").trim();
        const quantidade = Number(item?.quantidade ?? item?.qtd ?? item?.quantity ?? 1);
        if (!nome) return "";
        return quantidade > 1 ? `${nome} x${quantidade}` : nome;
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  function getPedidoValorTotal(data: any) {
    const valorDireto = Number(
      data?.valorTotal ??
      data?.total ??
      data?.precoTotal ??
      data?.subtotal ??
      0
    );

    if (Number.isFinite(valorDireto) && valorDireto > 0) return valorDireto;

    const itens = Array.isArray(data?.itens)
      ? data.itens
      : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.produtos)
      ? data.produtos
      : [];

    return itens.reduce((acc: number, item: any) => {
      const preco = Number(item?.preco ?? item?.valor ?? item?.price ?? 0);
      const quantidade = Number(item?.quantidade ?? item?.qtd ?? item?.quantity ?? 1);
      return acc + (Number.isFinite(preco) ? preco : 0) * (Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1);
    }, 0);
  }

  function getPedidoStatusBadgeStyle(status: string) {
    const normalizado = getPedidoStatusNormalizado(status);

    if (normalizado === "pago") {
      return {
        background: "rgba(221, 242, 226, 0.9)",
        border: "1px solid #B9DEC0",
        color: "#2F6A3C",
      };
    }

    if (normalizado === "enviado") {
      return {
        background: "rgba(227, 236, 249, 0.9)",
        border: "1px solid #C7D5EC",
        color: "#365B8C",
      };
    }

    if (normalizado === "entregue") {
      return {
        background: "rgba(229, 244, 237, 0.9)",
        border: "1px solid #BFE0CE",
        color: "#2D6B4E",
      };
    }

    if (normalizado === "cancelado") {
      return {
        background: "rgba(255, 241, 241, 0.96)",
        border: "1px solid #E8C3C3",
        color: "#9A3B3B",
      };
    }

    return {
      background: "rgba(255, 248, 236, 0.96)",
      border: "1px solid #E4D1B2",
      color: "#8A6434",
    };
  }


  function getPedidoStatusDescricao(status: string) {
    const normalizado = getPedidoStatusNormalizado(status);

    if (normalizado === "aguardando_pagamento") return "Aguardando confirmação do pagamento.";
    if (normalizado === "pago") return "Pagamento confirmado e pedido em preparação.";
    if (normalizado === "enviado") return "Pedido despachado e em rota de entrega.";
    if (normalizado === "entregue") return "Pedido finalizado com entrega concluída.";
    if (normalizado === "cancelado") return "Pedido encerrado ou cancelado.";
    return "Pedido recebido pela Maison Noor.";
  }

  function getPedidoStatusEtapa(status: string) {
    const normalizado = getPedidoStatusNormalizado(status);

    if (normalizado === "aguardando_pagamento") return 1;
    if (normalizado === "pago") return 2;
    if (normalizado === "enviado") return 3;
    if (normalizado === "entregue") return 4;
    return 1;
  }

  export default function MinhaContaPage() {
    const router = useRouter();

    const [modo, setModo] = useState<"login" | "cadastro">("login");
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const [user, setUser] = useState<User | null>(null);
    const [cliente, setCliente] = useState<ClienteDoc | null>(null);

    const [erro, setErro] = useState("");
    const [sucesso, setSucesso] = useState("");

    const [nome, setNome] = useState("");
    const [telefone, setTelefone] = useState("");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");

    const [produtosMap, setProdutosMap] = useState<Record<string, Produto>>({});
    const [favoritosProdutos, setFavoritosProdutos] = useState<Produto[]>([]);
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
    const [loadingPedidos, setLoadingPedidos] = useState(false);

    const isCadastro = useMemo(() => modo === "cadastro", [modo]);

    useEffect(() => {
      if (typeof window === "undefined") return;

      const handleResize = () => setIsMobile(window.innerWidth < 900);
      const syncCart = () => setCartItems(getCartFromStorage());

      handleResize();
      syncCart();

      window.addEventListener("resize", handleResize);
      window.addEventListener("storage", syncCart);

      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("storage", syncCart);
      };
    }, []);

    useEffect(() => {
      async function loadProducts() {
        try {
          const snap = await getDocs(query(collection(db, "products")));
          const nextMap: Record<string, Produto> = {};
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any;
            nextMap[docSnap.id] = {
              id: docSnap.id,
              nome: data.nome ?? "",
              marca: data.marca,
              precoVenda: data.precoVenda,
              imagem: data.imagem,
              imageUrl: data.imageUrl,
              volumeMl: data.volumeMl,
            };
          });
          setProdutosMap(nextMap);
        } catch (_) {}
      }

      loadProducts();
    }, []);

    useEffect(() => {
      if (!cliente?.favoritos?.length) {
        setFavoritosProdutos([]);
        return;
      }

      const resolved = cliente.favoritos
        .map((id) => produtosMap[id])
        .filter(Boolean) as Produto[];

      setFavoritosProdutos(resolved);
    }, [cliente, produtosMap]);

    useEffect(() => {
      let active = true;

      async function loadPedidosCliente() {
        if (!user) {
          if (active) {
            setPedidos([]);
            setLoadingPedidos(false);
          }
          return;
        }

        setLoadingPedidos(true);

        try {
          const userEmail = String(user.email || email || "").trim().toLowerCase();
          const rawPedidos: Array<{ id: string; data: any }> = [];
          const colecoes = [
            collection(db, "pedidos"),
            collection(db, "pedidos", "default", "lista"),
          ];

          for (const ref of colecoes) {
            try {
              const snap = await getDocs(ref);
              snap.forEach((docSnap) => {
                rawPedidos.push({
                  id: docSnap.id,
                  data: docSnap.data(),
                });
              });
            } catch (_) {}
          }

          const vistos = new Set<string>();
          const pedidosNormalizados = rawPedidos
            .filter(({ data }) => {
              const uidCandidates = [
                data?.clienteUid,
                data?.uid,
                data?.userId,
                data?.usuarioId,
                data?.cliente?.uid,
              ]
                .map((value: any) => String(value || "").trim())
                .filter(Boolean);

              const emailCandidates = [
                data?.clienteEmail,
                data?.email,
                data?.userEmail,
                data?.compradorEmail,
                data?.cliente?.email,
              ]
                .map((value: any) => String(value || "").trim().toLowerCase())
                .filter(Boolean);

              return uidCandidates.includes(user.uid) || (!!userEmail && emailCandidates.includes(userEmail));
            })
            .map(({ id, data }) => {
              const numeroPedido = String(
                data?.numero ??
                data?.numeroPedido ??
                data?.pedidoNumero ??
                id
              );

              const createdInfo = getPedidoDateInfo(
                data?.createdAt ??
                data?.criadoEm ??
                data?.updatedAt ??
                data?.data ??
                data?.date
              );

              const status = getPedidoStatusNormalizado(
                data?.status ??
                data?.situacao ??
                data?.estado
              );

              const pedido: PedidoCliente = {
                id,
                numero: numeroPedido,
                status,
                statusLabel: getPedidoStatusLabel(status),
                valorTotal: getPedidoValorTotal(data),
                criadoEmLabel: createdInfo.label,
                criadoEmSort: createdInfo.sort,
                codigoRastreio: String(
                  data?.codigoRastreio ??
                  data?.rastreamento ??
                  data?.trackingCode ??
                  ""
                ).trim() || undefined,
                itensResumo: getPedidoItensResumo(data),
              };

              return pedido;
            })
            .filter((pedido) => {
              const dedupeKey = `${pedido.id}|${pedido.numero}|${pedido.criadoEmSort}`;
              if (vistos.has(dedupeKey)) return false
              vistos.add(dedupeKey)
              return true
            })
            .sort((a, b) => b.criadoEmSort - a.criadoEmSort);

          if (active) {
            setPedidos(pedidosNormalizados);
          }
        } finally {
          if (active) {
            setLoadingPedidos(false);
          }
        }
      }

      loadPedidosCliente();

      return () => {
        active = false;
      };
    }, [user, email]);

    useEffect(() => {
      const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser);

        if (firebaseUser) {
          const ref = doc(db, "clientes", firebaseUser.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const data = snap.data() as ClienteDoc;
            setCliente(data);
            setNome(data.nome || firebaseUser.displayName || "");
            setTelefone(data.telefone || "");
            setEmail(data.email || firebaseUser.email || "");

            const localCart = getCartFromStorage();

            if (localCart.length) {
              setCartItems(localCart);
            } else if (Array.isArray(data.carrinho) && data.carrinho.length) {
              const recovered = data.carrinho.map((item) => ({
                id: String(item.produtoId ?? item.nome ?? ""),
                nome: String(item.nome ?? "Produto Maison Noor"),
                preco: Number(item.preco ?? 0),
                imagem: String(item.imagem ?? "/produtos/hero-perfume.png"),
                tamanho: item.tamanho ? String(item.tamanho) : undefined,
                quantidade: Number(item.quantidade ?? 1),
              }));

              setCartItems(recovered);
              saveCartToStorage(recovered);
            } else {
              setCartItems([]);
            }
          } else {
            setCliente(null);
            setNome(firebaseUser.displayName || "");
            setTelefone("");
            setEmail(firebaseUser.email || "");
            setCartItems(getCartFromStorage());
          }
        } else {
          setCliente(null);
          setNome("");
          setTelefone("");
          setEmail("");
          setCartItems(getCartFromStorage());
        }

        setLoadingAuth(false);
      });

      return () => unsub();
    }, []);

    async function handleCadastro(e: FormEvent) {
      e.preventDefault();
      setErro("");
      setSucesso("");
      setSaving(true);

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, senha);

        if (nome.trim()) {
          await updateProfile(cred.user, { displayName: nome.trim() });
        }

        await setDoc(doc(db, "clientes", cred.user.uid), {
          uid: cred.user.uid,
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.trim(),
          tipo: "cliente",
          vip: false,
          favoritos: [],
          carrinho: [],
          createdAt: serverTimestamp(),
          ultimoLogin: serverTimestamp(),
        });

        setSucesso("Conta criada com sucesso.");
        setSenha("");
      } catch (err: any) {
        setErro(traduzErroFirebase(err?.code));
      } finally {
        setSaving(false);
      }
    }

    async function handleLogin(e: FormEvent) {
      e.preventDefault();
      setErro("");
      setSucesso("");
      setSaving(true);

      try {
        const cred = await signInWithEmailAndPassword(auth, email, senha);

        const ref = doc(db, "clientes", cred.user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          await updateDoc(ref, {
            ultimoLogin: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            uid: cred.user.uid,
            nome: cred.user.displayName || "",
            email: cred.user.email || email.trim().toLowerCase(),
            telefone: "",
            tipo: "cliente",
            vip: false,
            favoritos: [],
            carrinho: [],
            createdAt: serverTimestamp(),
            ultimoLogin: serverTimestamp(),
          });
        }

        setSucesso("Login realizado com sucesso.");
        setSenha("");

        window.setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 700);
      } catch (err: any) {
        setErro(traduzErroFirebase(err?.code));
      } finally {
        setSaving(false);
      }
    }

    async function handleForgotPassword() {
      setErro("");
      setSucesso("");

      const emailNormalizado = email.trim().toLowerCase();
      if (!emailNormalizado) {
        setErro("Digite seu e-mail para recuperar a senha.");
        return;
      }

      setSaving(true);
      try {
        await sendPasswordResetEmail(auth, emailNormalizado);
        setSucesso("Enviamos um link de redefinição de senha para o seu e-mail.");
      } catch (err: any) {
        setErro(traduzErroFirebase(err?.code));
      } finally {
        setSaving(false);
      }
    }

    async function handleSalvarPerfil(e: FormEvent) {
      e.preventDefault();
      if (!user) return;

      setErro("");
      setSucesso("");
      setSaving(true);

      try {
        await updateProfile(user, {
          displayName: nome.trim(),
        });

        await updateDoc(doc(db, "clientes", user.uid), {
          nome: nome.trim(),
          telefone: telefone.trim(),
          email: email.trim().toLowerCase(),
          ultimoLogin: serverTimestamp(),
        });

        setSucesso("Perfil atualizado com sucesso.");
      } catch (err: any) {
        setErro(traduzErroFirebase(err?.code));
      } finally {
        setSaving(false);
      }
    }

    async function handleLogout() {
      setErro("");
      setSucesso("Até breve.");
      setLoggingOut(true);

      try {
        await signOut(auth);
      } finally {
        router.push("/");
        router.refresh();
      }
    }

    async function handleRemoveFavorito(produtoId: string) {
    if (!user || !cliente) return;

    try {
      const favoritosAtuais = cliente.favoritos || [];
      const novosFavoritos = favoritosAtuais.filter((id) => id !== produtoId);

      const ref = doc(db, "clientes", user.uid);

      await setDoc(
        ref,
        {
          favoritos: novosFavoritos,
          ultimoLogin: serverTimestamp(),
        },
        { merge: true }
      );

      setCliente((prev) =>
        prev
          ? {
              ...prev,
              favoritos: novosFavoritos,
            }
          : prev
      );

      setFavoritosProdutos((prev) =>
        prev.filter((produto) => produto.id !== produtoId)
      );

      setSucesso("Favorito removido com sucesso.");
      setErro("");
    } catch (error) {
      console.error("Erro ao remover favorito:", error);
      setErro("Não foi possível remover o favorito.");
    }
  }

  async function handleRemoveCartItem(indexToRemove: number) {
      const nextItems = cartItems.filter((_, index) => index !== indexToRemove);
      setCartItems(nextItems);
      saveCartToStorage(nextItems);

      if (user) {
        try {
          await setDoc(
            doc(db, "clientes", user.uid),
            {
              carrinho: nextItems.map((item) => ({
                produtoId: item.id,
                nome: item.nome,
                quantidade: Number(item.quantidade ?? 1),
                preco: Number(item.preco ?? 0),
                imagem: item.imagem || "",
                tamanho: item.tamanho || "",
              })),
              ultimoLogin: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (error) {
          console.error("Erro ao atualizar carrinho:", error);
        }
      }

      setSucesso("Item removido da sacola.");
      setErro("");
    }

    const subtotalSacola = cartItems.reduce(
      (acc, item) => acc + item.preco * Number(item.quantidade ?? 1),
      0
    );
    const totalItensSacola = cartItems.reduce(
      (acc, item) => acc + Number(item.quantidade ?? 1),
      0
    );
    const percentualPerfil = [nome, email, telefone].filter((value) => String(value || "").trim()).length * 33;
    const statusPerfil = percentualPerfil >= 99 ? "Perfil completo" : percentualPerfil >= 66 ? "Perfil quase completo" : "Complete seu perfil";

    function handleFinalizarCompra() {
    if (!cartItems.length || typeof window === "undefined") return;
    window.location.href = "/checkout";
  }

    if (loadingAuth) {
      return (
        <main style={styles.page}>
          <section style={{ ...styles.container, paddingBottom: 24 }}>
            <div style={styles.heroCard}>
              <p style={styles.kicker}>Maison Noor</p>
              <h1 style={styles.heroTitle}>Minha Conta</h1>
              <p style={styles.heroText}>Carregando sua experiência premium...</p>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main style={styles.page}>
        <section style={{ ...styles.container, paddingBottom: 28 }}>
          <div style={styles.heroCard}>
            <div style={styles.heroTop}>
              <div>
                <p style={styles.kicker}>Maison Noor</p>
                <h1 style={styles.heroTitle}>Minha Conta</h1>
              </div>

              <div style={styles.heroActions}>
                <Link href="/" style={styles.heroButtonSecondary}>
                  Voltar para Home
                </Link>

                {!user ? (
                  <div style={styles.heroBadge}>Área do cliente</div>
                ) : (
                  <div style={styles.heroBadge}>
                    {cliente?.vip ? "Cliente VIP" : "Cliente Maison Noor"}
                  </div>
                )}
              </div>
            </div>

            <p style={styles.heroText}>
              Acesse sua conta para salvar seus dados, acompanhar sua jornada de
              compra e preparar favoritos e carrinho salvo.
            </p>
          </div>

          {erro && <div style={styles.alertError}>{erro}</div>}
          {sucesso && <div style={styles.alertSuccess}>{sucesso}</div>}

          {loggingOut && (
            <div style={styles.logoutOverlay}>
              <div style={styles.logoutCard}>
                <div style={styles.logoutSpinner} />
                <strong style={styles.logoutTitle}>Saindo da sua conta</strong>
                <span style={styles.logoutText}>Redirecionando para a Home...</span>
              </div>
            </div>
          )}

          {!user ? (
            <div
              style={{
                ...styles.gridLogin,
                gridTemplateColumns: isMobile ? "1fr" : "1.08fr 0.92fr",
              }}
            >
              <section style={styles.card}>
                <div style={styles.tabs}>
                  <button
                    type="button"
                    onClick={() => {
                      setModo("login");
                      setErro("");
                      setSucesso("");
                    }}
                    style={{
                      ...styles.tabButton,
                      ...(modo === "login" ? styles.tabButtonActive : {}),
                    }}
                  >
                    Entrar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModo("cadastro");
                      setErro("");
                      setSucesso("");
                    }}
                    style={{
                      ...styles.tabButton,
                      ...(modo === "cadastro" ? styles.tabButtonActive : {}),
                    }}
                  >
                    Criar conta
                  </button>
                </div>

                <form onSubmit={isCadastro ? handleCadastro : handleLogin} style={styles.form}>
                  {isCadastro && (
                    <div style={styles.field}>
                      <label style={styles.label}>Nome completo</label>
                      <input
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        style={styles.input}
                        placeholder="Seu nome"
                      />
                    </div>
                  )}

                  {isCadastro && (
                    <div style={styles.field}>
                      <label style={styles.label}>Telefone</label>
                      <input
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        style={styles.input}
                        placeholder="(12) 99999-9999"
                      />
                    </div>
                  )}

                  <div style={styles.field}>
                    <label style={styles.label}>E-mail</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={styles.input}
                      placeholder="voce@email.com"
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Senha</label>
                    <input
                      type="password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      style={styles.input}
                      placeholder="********"
                    />
                  </div>

                  {!isCadastro && (
                    <div style={styles.forgotPasswordWrap}>
                      <div style={styles.forgotPasswordTextWrap}>
                        <strong style={styles.forgotPasswordTitle}>Esqueceu sua senha?</strong>
                        <span style={styles.forgotPasswordText}>
                          Digite seu e-mail e enviamos o link de recuperação.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        style={styles.forgotPasswordButton}
                        disabled={saving}
                      >
                        Enviar link de recuperação
                      </button>
                    </div>
                  )}

                  <button type="submit" disabled={saving} style={styles.primaryButton}>
                    {saving ? "Processando..." : isCadastro ? "Criar conta" : "Entrar"}
                  </button>
                </form>
              </section>

              <aside style={styles.darkCard}>
                <span style={styles.darkKicker}>Experiência Maison Noor</span>
                <h2 style={styles.darkTitle}>Sua conta, do jeito certo</h2>

                <div style={styles.benefitsList}>
                  <div style={styles.benefitItem}>✦ Compra mais rápida e organizada</div>
                  <div style={styles.benefitItem}>⌁ Preparada para favoritos</div>
                  <div style={styles.benefitItem}>◈ Sacola salva em próximas etapas</div>
                  <div style={styles.benefitItem}>✺ Evolução para benefícios VIP</div>
                </div>
              </aside>
            </div>
          ) : (
            <div style={styles.loggedWrap}>
              <section style={styles.card}>
                <div
                  style={{
                    ...styles.topLogged,
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "flex-start" : "center",
                  }}
                >
                  <div>
                    <p style={styles.kicker}>Cliente Maison Noor</p>
                    <h2 style={styles.sectionTitle}>
                      Olá, {nome || user.displayName || "Cliente"}
                    </h2>
                    <p style={styles.sectionText}>
                      Seus produtos salvos, favoritos e sacola ficam reunidos aqui em uma área mais organizada.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    style={styles.secondaryButton}
                  >
                    {loggingOut ? "Saindo..." : "Sair"}
                  </button>
                </div>
              </section>

              <section style={styles.accountRailCard}>
                <div
                  style={{
                    ...styles.accountRailGrid,
                    gridTemplateColumns: isMobile ? "1fr" : "1.15fr 0.85fr",
                  }}
                >
                  <div>
                    <span style={styles.accountRailKicker}>Acesso rápido</span>
                    <div
                      style={{
                        ...styles.accountAnchorGrid,
                        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
                      }}
                    >
                      <a href="#perfil" style={styles.accountAnchorCard}>Meu perfil</a>
                      <a href="#favoritos" style={styles.accountAnchorCard}>Favoritos</a>
                      <a href="#sacola" style={styles.accountAnchorCard}>Sacola</a>
                      <a href="#pedidos-suporte" style={styles.accountAnchorCard}>Pedidos & suporte</a>
                    </div>
                  </div>

                  <div style={styles.profileProgressCard}>
                    <span style={styles.profileProgressLabel}>Status do perfil</span>
                    <strong style={styles.profileProgressTitle}>{statusPerfil}</strong>
                    <div style={styles.progressTrack}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${Math.min(100, percentualPerfil)}%`,
                        }}
                      />
                    </div>
                    <span style={styles.profileProgressHint}>
                      Preencha nome, e-mail e telefone para deixar sua conta pronta para compras futuras.
                    </span>
                  </div>
                </div>
              </section>

              <section style={styles.premiumBannerCard}>
                <div style={styles.premiumBannerContent}>
                  <div>
                    <span style={styles.darkKicker}>Painel premium</span>
                    <h3 style={styles.premiumBannerTitle}>Sua jornada Maison Noor em um só lugar</h3>
                    <p style={styles.premiumBannerText}>
                      Gerencie perfil, confira itens salvos e finalize sua compra com mais rapidez.
                    </p>
                  </div>

                  <div
                    style={{
                      ...styles.quickActionsGrid,
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <a href="#favoritos" style={styles.quickActionCard}>
                      <span style={styles.quickActionLabel}>Favoritos</span>
                      <strong style={styles.quickActionValue}>{favoritosProdutos.length} salvo(s)</strong>
                    </a>

                    <a href="#sacola" style={styles.quickActionCard}>
                      <span style={styles.quickActionLabel}>Sacola</span>
                      <strong style={styles.quickActionValue}>{totalItensSacola} item(ns)</strong>
                    </a>

                    <a
                      href="https://wa.me/5512982627108?text=Olá! Preciso de ajuda com a minha conta Maison Noor."
                      target="_blank"
                      rel="noreferrer"
                      style={styles.quickActionCard}
                    >
                      <span style={styles.quickActionLabel}>Atendimento</span>
                      <strong style={styles.quickActionValue}>Suporte rápido</strong>
                    </a>
                  </div>
                </div>
              </section>

              <div
                style={{
                  ...styles.gridLogged,
                  gridTemplateColumns: isMobile ? "1fr" : "1.12fr 0.88fr",
                }}
              >
                <section id="perfil" style={styles.card}>
                  <div style={styles.cardHeaderRow}>
                    <h3 style={styles.cardTitle}>Meu perfil</h3>
                    <span style={styles.miniLabel}>Dados da conta</span>
                  </div>

                  <form onSubmit={handleSalvarPerfil} style={styles.form}>
                    <div style={styles.field}>
                      <label style={styles.label}>Nome</label>
                      <input
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        style={styles.input}
                      />
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>E-mail</label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={styles.input}
                      />
                    </div>

                    <div style={styles.field}>
                      <label style={styles.label}>Telefone</label>
                      <input
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        style={styles.input}
                      />
                    </div>

                    <button type="submit" disabled={saving} style={styles.primaryButton}>
                      {saving ? "Salvando..." : "Salvar perfil"}
                    </button>
                  </form>
                </section>

                <aside
                  style={{
                    ...styles.statsGrid,
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Status</span>
                    <strong style={styles.statValue}>
                      {cliente?.vip ? "Cliente VIP" : "Cliente"}
                    </strong>
                  </div>

                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Favoritos</span>
                    <strong style={styles.statValue}>
                      {favoritosProdutos.length}
                    </strong>
                  </div>

                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Carrinho salvo</span>
                    <strong style={styles.statValue}>{totalItensSacola}</strong>
                  </div>

                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Perfil</span>
                    <strong style={styles.statValue}>{Math.min(99, percentualPerfil)}%</strong>
                  </div>
                </aside>
              </div>

              <div
                style={{
                  ...styles.gridLogged,
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                }}
              >
                <section style={styles.card}>
                  <div style={styles.cardHeaderRow}>
                    <h3 style={styles.cardTitle}>Meus favoritos</h3>
                    <span style={styles.miniLabel}>
                      {favoritosProdutos.length} item(ns)
                    </span>
                  </div>

                  {favoritosProdutos.length === 0 ? (
                    <div style={styles.emptyBox}>
                      <strong style={styles.emptyBoxTitle}>Você ainda não salvou favoritos.</strong>
                      <span style={styles.emptyBoxText}>Quando encontrar um perfume especial, ele aparecerá aqui para facilitar sua próxima compra.</span>
                      <Link href="/" style={styles.emptyBoxLink}>Explorar fragrâncias</Link>
                    </div>
                  ) : (
                    <div id="favoritos" style={styles.productList}>
                      {favoritosProdutos.slice(0, 4).map((produto) => (
                        <div key={produto.id} style={styles.productRow}>
                          <div style={styles.productThumbWrap}>
                            <img
                              src={getImagemProduto(produto)}
                              alt={produto.nome}
                              style={styles.productThumb}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  "/produtos/hero-perfume.png";
                              }}
                            />
                          </div>

                          <div style={styles.productMeta}>
                            <strong style={styles.productName}>{produto.nome}</strong>
                            <span style={styles.productSub}>
                              {produto.marca || "Maison Noor"}{" "}
                              {produto.volumeMl ? `• ${produto.volumeMl}ml` : ""}
                            </span>
                            <span style={styles.productPrice}>
                              {formatarMoeda(Number(produto.precoVenda ?? 0))}
                            </span>
                          </div>

                          <div style={styles.productActions}>
                            <Link href={`/produto/${produto.id}`} style={styles.productAction}>
                              Ver produto
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleRemoveFavorito(produto.id)}
                              style={styles.removeButton}
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={styles.card}>
                  <div style={styles.cardHeaderRow}>
                    <h3 style={styles.cardTitle}>Minha sacola</h3>
                    <span style={styles.miniLabel}>
                      {totalItensSacola} item(ns)
                    </span>
                  </div>

                  {cartItems.length === 0 ? (
                    <div style={styles.emptyBox}>
                      <strong style={styles.emptyBoxTitle}>Sua sacola está vazia no momento.</strong>
                      <span style={styles.emptyBoxText}>Adicione produtos e continue sua compra daqui, com mais rapidez e organização.</span>
                      <Link href="/" style={styles.emptyBoxLink}>Continuar comprando</Link>
                    </div>
                  ) : (
                    <>
                      <div id="sacola" style={styles.productList}>
                        {cartItems.slice(0, 4).map((item, index) => (
                          <div key={`${item.id}-${index}`} style={styles.productRow}>
                            <div style={styles.productThumbWrap}>
                              <img
                                src={item.imagem || "/produtos/hero-perfume.png"}
                                alt={item.nome}
                                style={styles.productThumb}
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src =
                                    "/produtos/hero-perfume.png";
                                }}
                              />
                            </div>

                            <div style={styles.productMeta}>
                              <strong style={styles.productName}>{item.nome}</strong>
                              <span style={styles.productSub}>
                                {item.tamanho || "Maison Noor"} • Qtd: {Number(item.quantidade ?? 1)}
                              </span>
                              <span style={styles.productPrice}>
                                {formatarMoeda(item.preco * Number(item.quantidade ?? 1))}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveCartItem(index)}
                              style={styles.removeButton}
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={styles.cartFooter}>
                        <div>
                          <span style={styles.cartLabel}>Subtotal</span>
                          <strong style={styles.cartValue}>
                            {formatarMoeda(subtotalSacola)}
                          </strong>
                        </div>

                        <div style={styles.cartActions}>
                          <Link href="/" style={styles.cartButtonSecondary}>
                            Continuar comprando
                          </Link>

                          <button
                            type="button"
                            onClick={handleFinalizarCompra}
                            style={styles.cartButton}
                          >
                            Finalizar compra
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </div>

              <section id="pedidos-suporte" style={styles.card}>
                <div style={styles.cardHeaderRow}>
                  <h3 style={styles.cardTitle}>Pedidos e suporte</h3>
                  <span style={styles.miniLabel}>Histórico real</span>
                </div>

                <div style={styles.ordersHeroCard}>
                  <div style={styles.ordersHeroTopRow}>
                    <div>
                      <span style={styles.quickActionLabel}>Acompanhamento Maison Noor</span>
                      <strong style={styles.ordersHeroTitle}>
                        Seus pedidos ficam organizados aqui com status, valor e suporte rápido.
                      </strong>
                      <p style={styles.ordersHeroText}>
                        A área já busca automaticamente seus pedidos no Firebase e agora ficou mais clara para acompanhar cada etapa da compra.
                      </p>
                    </div>

                    <div style={styles.ordersHeroSupportPill}>
                      Atendimento humano via WhatsApp
                    </div>
                  </div>

                  <div
                    style={{
                      ...styles.ordersMetricsGrid,
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <div style={styles.orderMetricCard}>
                      <span style={styles.orderMetricValue}>{loadingPedidos ? "..." : pedidos.length}</span>
                      <span style={styles.orderMetricLabel}>Pedidos no histórico</span>
                    </div>
                    <div style={styles.orderMetricCard}>
                      <span style={styles.orderMetricValue}>{pedidos.filter((pedido) => getPedidoStatusNormalizado(pedido.status) === "aguardando_pagamento").length}</span>
                      <span style={styles.orderMetricLabel}>Aguardando pagamento</span>
                    </div>
                    <div style={styles.orderMetricCard}>
                      <span style={styles.orderMetricValue}>{pedidos.filter((pedido) => ["pago", "enviado"].includes(getPedidoStatusNormalizado(pedido.status))).length}</span>
                      <span style={styles.orderMetricLabel}>Em andamento</span>
                    </div>
                  </div>
                </div>

                {loadingPedidos ? (
                  <div style={styles.emptyBox}>
                    <strong style={styles.emptyBoxTitle}>Carregando seus pedidos...</strong>
                    <span style={styles.emptyBoxText}>
                      Estamos buscando seu histórico para exibir status, valores e detalhes da compra.
                    </span>
                  </div>
                ) : pedidos.length === 0 ? (
                  <div
                    style={{
                      ...styles.quickActionsGrid,
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                    }}
                  >
                    <div style={styles.orderTimelineCard}>
                      <span style={styles.quickActionLabel}>Fluxo da compra</span>
                      <strong style={styles.softInfoTitle}>Como seus pedidos serão acompanhados</strong>

                      <div style={styles.timelineList}>
                        <div style={styles.timelineItem}>
                          <span style={styles.timelineDot}>1</span>
                          <div>
                            <strong style={styles.timelineTitle}>Pedido recebido</strong>
                            <span style={styles.timelineText}>Assim que a compra for fechada, ela aparecerá nesta área.</span>
                          </div>
                        </div>

                        <div style={styles.timelineItem}>
                          <span style={styles.timelineDot}>2</span>
                          <div>
                            <strong style={styles.timelineTitle}>Pagamento confirmado</strong>
                            <span style={styles.timelineText}>Você poderá acompanhar confirmação, separação e andamento.</span>
                          </div>
                        </div>

                        <div style={styles.timelineItem}>
                          <span style={styles.timelineDot}>3</span>
                          <div>
                            <strong style={styles.timelineTitle}>Envio e entrega</strong>
                            <span style={styles.timelineText}>Status como enviado e entregue aparecerão aqui assim que houver pedidos reais.</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={styles.orderSupportStack}>
                      <div style={styles.softInfoCard}>
                        <span style={styles.quickActionLabel}>Histórico vazio</span>
                        <strong style={styles.softInfoTitle}>Nenhum pedido encontrado ainda</strong>
                        <span style={styles.softInfoText}>Quando sua primeira compra for registrada, ela aparecerá aqui automaticamente.</span>
                      </div>

                      <a
                        href="https://wa.me/5512982627108?text=Olá! Preciso de ajuda com meu pedido na Maison Noor."
                        target="_blank"
                        rel="noreferrer"
                        style={styles.softInfoCardLink}
                      >
                        <span style={styles.quickActionLabel}>Suporte</span>
                        <strong style={styles.softInfoTitle}>Falar no WhatsApp</strong>
                        <span style={styles.softInfoText}>Atendimento rápido para dúvidas sobre conta, sacola, pagamento e entrega.</span>
                      </a>

                      <Link href="/" style={styles.softInfoCardLinkSecondary}>
                        <span style={styles.quickActionLabel}>Continuar comprando</span>
                        <strong style={styles.softInfoTitle}>Voltar para a vitrine</strong>
                        <span style={styles.softInfoText}>Descubra novos perfumes, presentes e seleções especiais da Maison Noor.</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div style={styles.ordersList}>
                    {pedidos.map((pedido) => {
                      const etapaAtual = getPedidoStatusEtapa(pedido.status);

                      return (
                        <article key={`${pedido.id}-${pedido.numero}`} style={styles.orderHistoryCard}>
                          <div style={styles.orderHistoryHeader}>
                            <div style={styles.orderHistoryHeading}>
                              <span style={styles.orderNumberChip}>Pedido #{pedido.numero}</span>
                              <strong style={styles.orderHistoryTitle}>
                                Realizado em {pedido.criadoEmLabel}
                              </strong>
                              <span style={styles.orderHistorySubtitle}>
                                {getPedidoStatusDescricao(pedido.status)}
                              </span>
                            </div>

                            <span
                              style={{
                                ...styles.orderStatusBadge,
                                ...getPedidoStatusBadgeStyle(pedido.status),
                              }}
                            >
                              {pedido.statusLabel}
                            </span>
                          </div>

                          <div style={styles.orderProgressWrap}>
                            {["Recebido", "Pago", "Enviado", "Entregue"].map((etapaLabel, index) => {
                              const etapaNumero = index + 1;
                              const ativa = etapaAtual >= etapaNumero;
                              return (
                                <div key={`${pedido.id}-etapa-${etapaNumero}`} style={styles.orderProgressItem}>
                                  <span
                                    style={{
                                      ...styles.orderProgressDot,
                                      ...(ativa ? styles.orderProgressDotActive : {}),
                                    }}
                                  >
                                    {etapaNumero}
                                  </span>
                                  <span
                                    style={{
                                      ...styles.orderProgressText,
                                      ...(ativa ? styles.orderProgressTextActive : {}),
                                    }}
                                  >
                                    {etapaLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div
                            style={{
                              ...styles.orderHistoryMetaGrid,
                              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                            }}
                          >
                            <div style={styles.orderMetaCard}>
                              <span style={styles.orderMetaLabel}>Valor do pedido</span>
                              <strong style={styles.orderMetaValue}>{formatarMoeda(pedido.valorTotal || 0)}</strong>
                            </div>

                            <div style={styles.orderMetaCard}>
                              <span style={styles.orderMetaLabel}>Status atual</span>
                              <strong style={styles.orderMetaValue}>{pedido.statusLabel}</strong>
                            </div>

                            <div style={styles.orderMetaCard}>
                              <span style={styles.orderMetaLabel}>Rastreio</span>
                              <strong style={styles.orderMetaValue}>
                                {pedido.codigoRastreio || "Aguardando envio"}
                              </strong>
                            </div>
                          </div>

                          {!!pedido.itensResumo.length && (
                            <div style={styles.orderItemsWrap}>
                              <span style={styles.orderMetaLabel}>Itens do pedido</span>
                              <div style={styles.orderItemsList}>
                                {pedido.itensResumo.map((itemResumo, index) => (
                                  <span key={`${pedido.id}-item-${index}`} style={styles.orderItemChip}>
                                    {itemResumo}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ ...styles.orderActionsRow, gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                            <a
                              href={`https://wa.me/5512982627108?text=${encodeURIComponent(`Olá! Preciso de ajuda com o pedido #${pedido.numero} na Maison Noor.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              style={styles.softInfoCardLink}
                            >
                              <span style={styles.quickActionLabel}>Suporte</span>
                              <strong style={styles.softInfoTitle}>Falar sobre este pedido</strong>
                              <span style={styles.softInfoText}>Atendimento rápido para pagamento, envio, rastreio e entrega.</span>
                            </a>

                            <Link href="/" style={styles.softInfoCardLinkSecondary}>
                              <span style={styles.quickActionLabel}>Nova compra</span>
                              <strong style={styles.softInfoTitle}>Voltar para a vitrine</strong>
                              <span style={styles.softInfoText}>Continue comprando e descubra novas seleções Maison Noor.</span>
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}              </section>
            </div>
          )}
        </section>
      </main>
    );
  }

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top, rgba(215,192,160,0.22), transparent 24%), #F5EFE6",
      color: "#2B2B2B",
      fontFamily: "Arial, sans-serif",
    },
    container: {
      maxWidth: "1180px",
      margin: "0 auto",
      padding: "18px 20px 28px",
    },
    heroCard: {
      borderRadius: 24,
      border: "1px solid #E2D2BF",
      background: "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(244,234,220,0.96))",
      boxShadow: "0 14px 30px rgba(62, 44, 24, 0.07)",
      padding: "22px 24px",
      marginBottom: 18,
    },
    heroTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
      flexWrap: "wrap",
    },
    heroActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  heroButtonSecondary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    padding: "0 16px",
    borderRadius: 14,
    border: "1px solid #D8C1A2",
    background: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(243,228,207,0.96))",
    color: "#6E5844",
    fontWeight: 700,
    textDecoration: "none",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  heroBadge: {
      minHeight: 34,
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid #E3D3BF",
      background: "rgba(255,255,255,0.75)",
      color: "#6E5844",
      fontWeight: 700,
      fontSize: 12,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      whiteSpace: "nowrap",
    },
    kicker: {
      margin: 0,
      color: "#B1874E",
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
    },
    heroTitle: {
      margin: "8px 0 8px",
      color: "#3A2F29",
      lineHeight: 1.05,
      fontWeight: 700,
      letterSpacing: "-0.03em",
      fontSize: 30,
    },
    heroText: {
      margin: 0,
      color: "#6D6157",
      fontSize: 14,
      lineHeight: 1.65,
      maxWidth: 760,
    },
    alertError: {
      marginBottom: 14,
      borderRadius: 14,
      border: "1px solid #F0CFCF",
      background: "#FFF1F1",
      color: "#9A3B3B",
      padding: "12px 14px",
      fontSize: 13,
      fontWeight: 600,
    },
    alertSuccess: {
      marginBottom: 14,
      borderRadius: 14,
      border: "1px solid #DCC7AA",
      background: "linear-gradient(180deg, #FFFDF9, #F6EBDD)",
      color: "#3F322A",
      padding: "12px 14px",
      fontSize: 13,
      fontWeight: 600,
    },
    logoutOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(22, 16, 12, 0.32)",
      backdropFilter: "blur(5px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 120,
      padding: 20,
    },
    logoutCard: {
      minWidth: 280,
      borderRadius: 22,
      border: "1px solid #E2D2BF",
      background: "linear-gradient(180deg, rgba(255,252,248,0.98), rgba(244,234,220,0.98))",
      boxShadow: "0 18px 40px rgba(62, 44, 24, 0.14)",
      padding: "26px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
    },
    logoutSpinner: {
      width: 34,
      height: 34,
      borderRadius: "999px",
      border: "3px solid rgba(177, 135, 78, 0.18)",
      borderTop: "3px solid #B1874E",
    },
    logoutTitle: {
      color: "#3A2F29",
      fontSize: 18,
      fontWeight: 700,
    },
    logoutText: {
      color: "#6D6157",
      fontSize: 14,
    },
    gridLogin: {
      display: "grid",
      gap: 18,
    },
    gridLogged: {
      display: "grid",
      gap: 18,
    },
    loggedWrap: {
      display: "grid",
      gap: 18,
    },
    card: {
      background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
      borderRadius: 22,
      boxShadow: "0 12px 26px rgba(48,34,20,0.07)",
      border: "1px solid #EADBC8",
      padding: 22,
    },
    darkCard: {
      borderRadius: 24,
      border: "1px solid #E1CFBB",
      background: "linear-gradient(135deg, rgba(24,19,14,0.96), rgba(41,30,20,0.96))",
      boxShadow: "0 18px 38px rgba(34, 24, 15, 0.14)",
      color: "#F6E9D6",
      padding: 22,
    },
    darkKicker: {
      display: "inline-block",
      color: "#D8BE97",
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      marginBottom: 8,
    },
    darkTitle: {
      margin: "0 0 12px",
      fontSize: 24,
      lineHeight: 1.08,
      color: "#FFF6EB",
    },
    premiumBannerCard: {
      borderRadius: 24,
      border: "1px solid rgba(216,193,162,0.22)",
      background: "linear-gradient(135deg, rgba(24,19,14,0.96), rgba(41,30,20,0.96))",
      boxShadow: "0 18px 38px rgba(34, 24, 15, 0.14)",
      padding: 22,
      color: "#F6E9D6",
    },
    premiumBannerContent: {
      display: "grid",
      gap: 18,
    },
    premiumBannerTitle: {
      margin: "6px 0 8px",
      fontSize: 24,
      lineHeight: 1.08,
      color: "#FFF6EB",
    },
    premiumBannerText: {
      margin: 0,
      color: "#D7C3AD",
      fontSize: 14,
      lineHeight: 1.7,
      maxWidth: 760,
    },
    quickActionsGrid: {
      display: "grid",
      gap: 12,
    },
    quickActionCard: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: "16px 18px",
      borderRadius: 18,
      textDecoration: "none",
      background: "rgba(255,255,255,0.07)",
      border: "1px solid rgba(216,193,162,0.14)",
      color: "#F6E9D6",
    },
    quickActionLabel: {
      color: "#D8BE97",
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
    },
    quickActionValue: {
      color: "#FFF6EB",
      fontSize: 18,
      lineHeight: 1.2,
      fontWeight: 700,
    },
    softInfoCard: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: "18px 18px",
      borderRadius: 18,
      background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(248,239,228,0.92))",
      border: "1px solid #E7D8C8",
      minHeight: 150,
    },
    softInfoCardLink: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: "18px 18px",
      borderRadius: 18,
      background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(248,239,228,0.92))",
      border: "1px solid #E7D8C8",
      minHeight: 150,
      textDecoration: "none",
    },
    softInfoCardLinkSecondary: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: "18px 18px",
      borderRadius: 18,
      background: "linear-gradient(180deg, #FFF9F1, #F2E3CF)",
      border: "1px solid #E7D8C8",
      minHeight: 150,
      textDecoration: "none",
    },
    ordersHeroCard: {
      display: "grid",
      gap: 18,
      padding: "22px 22px",
      borderRadius: 24,
      border: "1px solid #E7D8C8",
      background: "linear-gradient(135deg, #FFF9F2, #F4E7D6)",
      boxShadow: "0 16px 34px rgba(48,34,20,0.06)",
      marginBottom: 18,
    },
    ordersHeroTitle: {
      display: "block",
      color: "#3E3027",
      fontSize: 22,
      lineHeight: 1.2,
      fontWeight: 700,
      marginTop: 6,
    },
    ordersHeroText: {
      margin: "10px 0 0",
      color: "#6F6257",
      fontSize: 14,
      lineHeight: 1.7,
      maxWidth: 760,
    },
    ordersMetricsGrid: {
      display: "grid",
      gap: 12,
    },
    orderMetricCard: {
      padding: "16px 16px",
      borderRadius: 18,
      border: "1px solid #E8D8C5",
      background: "rgba(255,255,255,0.72)",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    },
    orderMetricValue: {
      color: "#9B7441",
      fontSize: 26,
      fontWeight: 700,
      lineHeight: 1,
    },
    orderMetricLabel: {
      color: "#75685C",
      fontSize: 13,
      lineHeight: 1.45,
    },
    orderTimelineCard: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      padding: "20px 20px",
      borderRadius: 22,
      border: "1px solid #E8D8C5",
      background: "linear-gradient(180deg, #FFFDF9, #F9F0E4)",
      boxShadow: "0 12px 28px rgba(48,34,20,0.05)",
    },
    timelineList: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      marginTop: 4,
    },
    timelineItem: {
      display: "grid",
      gridTemplateColumns: "36px 1fr",
      gap: 12,
      alignItems: "flex-start",
    },
    timelineDot: {
      width: 36,
      height: 36,
      borderRadius: 999,
      background: "linear-gradient(135deg, #D4AF77, #BE9155)",
      color: "#241A12",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 700,
      fontSize: 14,
      boxShadow: "0 10px 20px rgba(120, 87, 45, 0.12)",
    },
    timelineTitle: {
      display: "block",
      color: "#3F322A",
      fontSize: 15,
      marginBottom: 4,
    },
    timelineText: {
      display: "block",
      color: "#78695B",
      fontSize: 13,
      lineHeight: 1.55,
    },
    orderSupportStack: {
      display: "grid",
      gap: 12,
      alignContent: "start",
    },
    softInfoTitle: {
      color: "#3E3027",
      fontSize: 18,
      lineHeight: 1.2,
      fontWeight: 700,
    },
    softInfoText: {
      color: "#6D6157",
      fontSize: 13,
      lineHeight: 1.6,
    },
    benefitsList: {
      display: "grid",
      gap: 10,
      marginTop: 12,
    },
    accountRailCard: {
      borderRadius: 22,
      border: "1px solid #E8DAC8",
      background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(248,239,228,0.92))",
      boxShadow: "0 10px 24px rgba(48,34,20,0.05)",
      padding: 18,
    },
    accountRailGrid: {
      display: "grid",
      gap: 16,
      alignItems: "center",
    },
    accountRailKicker: {
      display: "inline-block",
      color: "#A8844C",
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      marginBottom: 10,
    },
    accountAnchorGrid: {
      display: "grid",
      gap: 10,
    },
    accountAnchorCard: {
      minHeight: 46,
      borderRadius: 14,
      border: "1px solid #E4D4C2",
      background: "#FFFDF9",
      color: "#5E4A39",
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 700,
      fontSize: 13,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.82)",
    },
    profileProgressCard: {
      borderRadius: 18,
      background: "linear-gradient(135deg, rgba(24,19,14,0.96), rgba(41,30,20,0.96))",
      color: "#F6E9D6",
      padding: 18,
      border: "1px solid rgba(216,193,162,0.16)",
      display: "grid",
      gap: 10,
    },
    profileProgressLabel: {
      color: "#D8BE97",
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.16em",
    },
    profileProgressTitle: {
      color: "#FFF6EB",
      fontSize: 20,
      lineHeight: 1.1,
    },
    progressTrack: {
      width: "100%",
      height: 10,
      borderRadius: 999,
      background: "rgba(255,255,255,0.12)",
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
      background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    },
    profileProgressHint: {
      color: "#D7C3AD",
      fontSize: 12,
      lineHeight: 1.6,
    },
    benefitItem: {
      borderRadius: 14,
      padding: "12px 14px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(216,193,162,0.14)",
      color: "#F3E8DA",
      fontSize: 13,
      lineHeight: 1.5,
    },
    tabs: {
      display: "flex",
      gap: 6,
      padding: 5,
      borderRadius: 14,
      background: "#F4E8D8",
      marginBottom: 16,
    },
    tabButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      border: "1px solid transparent",
      background: "transparent",
      color: "#6E5844",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 13,
    },
    tabButtonActive: {
      background: "linear-gradient(135deg, #D8BE97, #C79D61)",
      color: "#2B2118",
      boxShadow: "0 8px 16px rgba(120, 87, 45, 0.10)",
    },
    form: {
      display: "grid",
      gap: 12,
    },
    field: {
      display: "grid",
      gap: 6,
    },
    label: {
      color: "#5E4A38",
      fontSize: 12,
      fontWeight: 700,
    },
    input: {
      width: "100%",
      minHeight: 46,
      borderRadius: 13,
      border: "1px solid #D9C6B0",
      background: "rgba(255,255,255,0.88)",
      padding: "0 14px",
      boxSizing: "border-box",
      color: "#342922",
      fontSize: 14,
      outline: "none",
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: 14,
      border: "1px solid rgba(212, 175, 119, 0.34)",
      background: "linear-gradient(135deg, #D4AF77, #BE9155)",
      color: "#241A12",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      marginTop: 4,
      boxShadow: "0 12px 22px rgba(120, 87, 45, 0.11)",
    },
    secondaryButton: {
      minHeight: 40,
      borderRadius: 12,
      border: "1px solid #D8C1A2",
      background: "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(243,228,207,0.92))",
      color: "#6E5844",
      fontWeight: 700,
      cursor: "pointer",
      padding: "0 16px",
      fontSize: 13,
    },
    topLogged: {
      display: "flex",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    },
    sectionTitle: {
      margin: "6px 0 8px",
      color: "#3A2F29",
      lineHeight: 1.1,
      fontWeight: 700,
      letterSpacing: "-0.03em",
      fontSize: 24,
    },
    sectionText: {
      margin: 0,
      color: "#6D6157",
      fontSize: 14,
      lineHeight: 1.6,
    },
    cardHeaderRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 14,
      flexWrap: "wrap",
    },
    miniLabel: {
      color: "#8B7A6A",
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      fontWeight: 700,
    },
    cardTitle: {
      margin: 0,
      color: "#3E3027",
      fontWeight: 700,
      fontSize: 20,
    },
    statsGrid: {
      display: "grid",
      gap: 12,
      alignContent: "start",
    },
    statCard: {
      background: "linear-gradient(180deg, #FFFEFC, #FCF6EE)",
      borderRadius: 18,
      boxShadow: "0 12px 26px rgba(48,34,20,0.07)",
      border: "1px solid #EADBC8",
      padding: "18px 20px",
      minHeight: 88,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    },
    statLabel: {
      display: "block",
      color: "#8B7A6A",
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      marginBottom: 8,
      fontWeight: 700,
    },
    statValue: {
      color: "#9B7441",
      fontSize: 24,
      fontWeight: 700,
      lineHeight: 1.05,
    },
    emptyBox: {
      borderRadius: 16,
      border: "1px solid #E6D7C5",
      background: "rgba(255,255,255,0.55)",
      color: "#75685C",
      fontSize: 14,
      lineHeight: 1.6,
      padding: "18px 16px",
    },
    productList: {
      display: "grid",
      gap: 12,
    },
    productRow: {
      display: "grid",
      gridTemplateColumns: "74px 1fr auto",
      gap: 14,
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid #EEE1D0",
    },
    productThumbWrap: {
      width: 74,
      height: 74,
      borderRadius: 16,
      background: "linear-gradient(180deg, rgba(255,253,249,0.96), rgba(244,234,220,0.72))",
      border: "1px solid #EFE3D4",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    productThumb: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      padding: 8,
      boxSizing: "border-box",
      mixBlendMode: "multiply",
    },
    productMeta: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
    },
    productName: {
      color: "#3E3027",
      fontSize: 15,
      lineHeight: 1.2,
    },
    productSub: {
      color: "#7C6E62",
      fontSize: 12,
      lineHeight: 1.4,
    },
    productPrice: {
      color: "#9B7441",
      fontSize: 14,
      fontWeight: 700,
    },
    productActions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "stretch",
  },
  productAction: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      padding: "0 14px",
      borderRadius: 12,
      border: "1px solid #D8C1A2",
      background: "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(243,228,207,0.92))",
      color: "#6E5844",
      fontWeight: 700,
      textDecoration: "none",
      fontSize: 13,
      whiteSpace: "nowrap",
    },
    removeButton: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      padding: "0 14px",
      borderRadius: 12,
      border: "1px solid #E2C8C3",
      background: "linear-gradient(135deg, #FFF7F6, #F5E2DE)",
      color: "#8A5448",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      whiteSpace: "nowrap",
    },
    cartFooter: {
      marginTop: 16,
      paddingTop: 16,
      borderTop: "1px solid #EEE1D0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    cartLabel: {
      display: "block",
      color: "#8B7A6A",
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      marginBottom: 6,
      fontWeight: 700,
    },
    cartValue: {
      color: "#3E3027",
      fontSize: 22,
      fontWeight: 700,
    },
    cartActions: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
    },
    cartButtonSecondary: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      padding: "0 18px",
      borderRadius: 14,
      border: "1px solid #D8C1A2",
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(243,228,207,0.92))",
      color: "#6E5844",
      fontSize: 13,
      fontWeight: 700,
      textDecoration: "none",
    },

    ordersHeroTopRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
      flexWrap: "wrap",
    },
    ordersHeroSupportPill: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 36,
      padding: "8px 14px",
      borderRadius: 999,
      border: "1px solid #E2D0BA",
      background: "rgba(255,255,255,0.82)",
      color: "#6A5440",
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: "nowrap",
    },
    ordersList: {
      display: "grid",
      gap: 14,
    },
    orderHistoryCard: {
      display: "grid",
      gap: 16,
      padding: "20px 20px",
      borderRadius: 22,
      border: "1px solid #E7D8C8",
      background: "linear-gradient(180deg, #FFFDFC, #F9F0E4)",
      boxShadow: "0 14px 30px rgba(48,34,20,0.05)",
    },
    orderHistoryHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 14,
      flexWrap: "wrap",
    },
    orderHistoryHeading: {
      display: "grid",
      gap: 6,
    },
    orderNumberChip: {
      display: "inline-flex",
      width: "fit-content",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 30,
      padding: "6px 12px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.88)",
      border: "1px solid #E5D6C6",
      color: "#8A6434",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    },
    orderHistoryTitle: {
      color: "#3E3027",
      fontSize: 22,
      lineHeight: 1.2,
      fontWeight: 700,
    },
    orderHistorySubtitle: {
      color: "#6F6257",
      fontSize: 13,
      lineHeight: 1.6,
    },
    orderStatusBadge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 38,
      padding: "8px 14px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      whiteSpace: "nowrap",
    },
    orderProgressWrap: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 10,
    },
    orderProgressItem: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "12px 12px",
      borderRadius: 16,
      border: "1px solid #E9DDCF",
      background: "rgba(255,255,255,0.72)",
    },
    orderProgressDot: {
      width: 28,
      height: 28,
      borderRadius: 999,
      background: "#E8DED1",
      color: "#806C56",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 800,
      fontSize: 12,
      flexShrink: 0,
    },
    orderProgressDotActive: {
      background: "linear-gradient(135deg, #D4AF77, #BE9155)",
      color: "#241A12",
      boxShadow: "0 10px 18px rgba(120, 87, 45, 0.14)",
    },
    orderProgressText: {
      color: "#8A7A6C",
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.3,
    },
    orderProgressTextActive: {
      color: "#3E3027",
    },
    orderHistoryMetaGrid: {
      display: "grid",
      gap: 12,
    },
    orderMetaCard: {
      display: "grid",
      gap: 6,
      padding: "15px 16px",
      borderRadius: 18,
      background: "rgba(255,255,255,0.78)",
      border: "1px solid #E9DDCF",
    },
    orderMetaLabel: {
      color: "#8B7A6A",
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      fontWeight: 700,
    },
    orderMetaValue: {
      color: "#3E3027",
      fontSize: 16,
      lineHeight: 1.35,
      fontWeight: 700,
      wordBreak: "break-word",
    },
    orderItemsWrap: {
      display: "grid",
      gap: 10,
    },
    orderItemsList: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
    },
    orderItemChip: {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 34,
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid #E8DACA",
      background: "rgba(255,255,255,0.9)",
      color: "#624D3A",
      fontSize: 12,
      fontWeight: 700,
    },
    orderActionsRow: {
      display: "grid",
      gap: 12,
    },
    emptyBoxTitle: {
      display: "block",
      color: "#3E3027",
      fontSize: 16,
      lineHeight: 1.3,
      fontWeight: 700,
      marginBottom: 6,
    },
    emptyBoxText: {
      display: "block",
      color: "#75685C",
      fontSize: 13,
      lineHeight: 1.6,
      marginBottom: 12,
    },
    emptyBoxLink: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      padding: "0 14px",
      borderRadius: 12,
      border: "1px solid #D8C1A2",
      background: "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(243,228,207,0.92))",
      color: "#6E5844",
      fontWeight: 700,
      textDecoration: "none",
      fontSize: 13,
      whiteSpace: "nowrap",
      width: "fit-content",
    },

    cartButton: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      padding: "0 18px",
      borderRadius: 14,
      border: "1px solid rgba(212, 175, 119, 0.34)",
      background: "linear-gradient(135deg, #D4AF77, #BE9155)",
      color: "#241A12",
      fontSize: 13,
      fontWeight: 700,
      textDecoration: "none",
      boxShadow: "0 12px 22px rgba(120, 87, 45, 0.11)",
    },
  };
