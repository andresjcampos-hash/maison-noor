"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type Produto = {
  id: string;
  nome: string;
  marca?: string;
  volumeMl?: number;
  categoria?: string;
  precoCompra?: number;
  precoVenda?: number;
  estoque?: number;
  reservado?: number;
  ativo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  observacoes?: string;
};

type StatusFiltro = "todos" | "ativo" | "baixo" | "parado" | "margem-baixa";

const productsCollection = collection(db, "products");

function nowISO(): string {
  return new Date().toISOString();
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function toNumber(v: unknown): number {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function categoriaLabel(value?: string): string {
  const map: Record<string, string> = {
    masculino: "Masculino",
    feminino: "Feminino",
    unissex: "Unissex",
    "kits-presente": "Kits Presente",
    "sem-categoria": "Sem categoria",
  };
  return map[String(value || "sem-categoria")] || String(value || "Sem categoria");
}

function normalizar(value?: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function diasDesde(iso?: string): number {
  if (!iso) return 999;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function disponivel(p: Produto): number {
  return Math.max(0, toNumber(p.estoque) - toNumber(p.reservado));
}

function margemVenda(p: Produto): number {
  const venda = toNumber(p.precoVenda);
  const compra = toNumber(p.precoCompra);
  if (venda <= 0) return 0;
  return ((venda - compra) / venda) * 100;
}

function markup(p: Produto): number {
  const venda = toNumber(p.precoVenda);
  const compra = toNumber(p.precoCompra);
  if (compra <= 0) return 0;
  return ((venda - compra) / compra) * 100;
}

function custoTotal(p: Produto): number {
  return toNumber(p.precoCompra) * toNumber(p.estoque);
}

function vendaTotal(p: Produto): number {
  return toNumber(p.precoVenda) * toNumber(p.estoque);
}

function lucroTotal(p: Produto): number {
  return (toNumber(p.precoVenda) - toNumber(p.precoCompra)) * toNumber(p.estoque);
}

function acaoProduto(p: Produto): { label: string; tone: "green" | "red" | "gold" | "blue"; motivo: string } {
  const disp = disponivel(p);
  const est = toNumber(p.estoque);
  const margem = margemVenda(p);
  const dias = diasDesde(p.updatedAt);

  if (p.ativo !== false && disp <= 0) {
    return { label: "Comprar", tone: "red", motivo: "Produto ativo sem estoque disponível." };
  }

  if (p.ativo !== false && disp <= 2) {
    return { label: "Repor", tone: "gold", motivo: "Estoque disponível baixo." };
  }

  if (est >= 10 && dias >= 75) {
    return { label: "Liquidar", tone: "red", motivo: "Capital parado por longo período." };
  }

  if (est >= 6 && dias >= 45) {
    return { label: "Promover", tone: "gold", motivo: "Produto com pouca movimentação recente." };
  }

  if (margem > 0 && margem < 25) {
    return { label: "Revisar margem", tone: "blue", motivo: "Margem abaixo do ideal." };
  }

  return { label: "Manter", tone: "green", motivo: "Sem alerta crítico no momento." };
}

export default function EstoqueInteligentePage() {
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [status, setStatus] = useState<StatusFiltro>("todos");

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1800);
  }

  async function carregarProdutos(showMsg = false) {
    try {
      setLoading(true);
      const snap = await getDocs(query(productsCollection, orderBy("updatedAt", "desc")));
      const arr: Produto[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          nome: String(data.nome || ""),
          marca: data.marca ? String(data.marca) : undefined,
          volumeMl: Number(data.volumeMl) || undefined,
          categoria: data.categoria ? String(data.categoria) : undefined,
          precoCompra: Number(data.precoCompra) || 0,
          precoVenda: Number(data.precoVenda) || 0,
          estoque: Number(data.estoque) || 0,
          reservado: Number(data.reservado) || 0,
          ativo: data.ativo !== false,
          createdAt: data.createdAt || nowISO(),
          updatedAt: data.updatedAt || nowISO(),
          observacoes: data.observacoes ? String(data.observacoes) : undefined,
        };
      });
      setItems(arr);
      if (showMsg) showToast("🔄 Estoque atualizado!");
    } catch (err) {
      console.error(err);
      showToast("⚠️ Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregarProdutos(false);
  }, []);

  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) set.add(String(p.categoria || "sem-categoria"));
    return Array.from(set).sort((a, b) => categoriaLabel(a).localeCompare(categoriaLabel(b)));
  }, [items]);

  const produtos = useMemo(() => {
    const q = normalizar(busca);

    return items
      .filter((p) => {
        if (categoria !== "todas" && String(p.categoria || "sem-categoria") !== categoria) return false;

        const disp = disponivel(p);
        const parado = diasDesde(p.updatedAt) >= 45 && toNumber(p.estoque) > 0;
        const margem = margemVenda(p);

        if (status === "ativo" && p.ativo === false) return false;
        if (status === "baixo" && disp > 2) return false;
        if (status === "parado" && !parado) return false;
        if (status === "margem-baixa" && margem >= 25) return false;

        if (!q) return true;
        return normalizar(`${p.nome} ${p.marca || ""} ${p.categoria || ""}`).includes(q);
      })
      .map((p) => {
        const est = toNumber(p.estoque);
        const res = toNumber(p.reservado);

        return {
          ...p,
          est,
          res,
          disp: Math.max(0, est - res),
          dias: diasDesde(p.updatedAt),
          margem: margemVenda(p),
          markup: markup(p),
          custoTotal: custoTotal(p),
          vendaTotal: vendaTotal(p),
          lucroTotal: lucroTotal(p),
          acao: acaoProduto(p),
        };
      });
  }, [items, busca, categoria, status]);

  const analytics = useMemo(() => {
    let ativos = 0;
    let estoqueFisico = 0;
    let estoqueDisponivel = 0;
    let reservado = 0;
    let custo = 0;
    let venda = 0;
    let lucro = 0;
    let baixo = 0;
    let semEstoque = 0;
    let parados = 0;
    let valorParado = 0;
    let margemBaixa = 0;

    for (const p of produtos) {
      if (p.ativo !== false) ativos += 1;
      estoqueFisico += toNumber(p.estoque);
      estoqueDisponivel += p.disp;
      reservado += toNumber(p.reservado);
      custo += p.custoTotal;
      venda += p.vendaTotal;
      lucro += p.lucroTotal;

      if (p.ativo !== false && p.disp <= 2) baixo += 1;
      if (p.ativo !== false && p.disp <= 0) semEstoque += 1;
      if (toNumber(p.estoque) > 0 && p.dias >= 45) {
        parados += 1;
        valorParado += p.custoTotal;
      }
      if (p.margem > 0 && p.margem < 25) margemBaixa += 1;
    }

    const margemMedia = venda > 0 ? (lucro / venda) * 100 : 0;
    const giroSaudavel = produtos.length ? ((produtos.length - parados) / produtos.length) * 100 : 0;

    return {
      produtos: produtos.length,
      ativos,
      estoqueFisico,
      estoqueDisponivel,
      reservado,
      custo,
      venda,
      lucro,
      baixo,
      semEstoque,
      parados,
      valorParado,
      margemBaixa,
      margemMedia,
      giroSaudavel,
    };
  }, [produtos]);

  const rankings = useMemo(() => {
    const categorias = new Map<string, { label: string; qtd: number; custo: number; venda: number; lucro: number; estoque: number }>();

    for (const p of produtos) {
      const key = String(p.categoria || "sem-categoria");
      const row = categorias.get(key) || { label: categoriaLabel(key), qtd: 0, custo: 0, venda: 0, lucro: 0, estoque: 0 };
      row.qtd += 1;
      row.custo += p.custoTotal;
      row.venda += p.vendaTotal;
      row.lucro += p.lucroTotal;
      row.estoque += toNumber(p.estoque);
      categorias.set(key, row);
    }

    return {
      maiorValor: [...produtos].sort((a, b) => b.custoTotal - a.custoTotal).slice(0, 8),
      maiorLucro: [...produtos].sort((a, b) => b.lucroTotal - a.lucroTotal).slice(0, 8),
      ruptura: [...produtos].filter((p) => p.ativo !== false && p.disp <= 2).sort((a, b) => a.disp - b.disp).slice(0, 8),
      parados: [...produtos].filter((p) => toNumber(p.estoque) > 0 && p.dias >= 45).sort((a, b) => b.dias - a.dias).slice(0, 8),
      margemBaixa: [...produtos].filter((p) => p.margem > 0 && p.margem < 25).sort((a, b) => a.margem - b.margem).slice(0, 8),
      categorias: Array.from(categorias.values()).sort((a, b) => b.custo - a.custo),
    };
  }, [produtos]);

  const alertas = useMemo(() => {
    const list: Array<{ tipo: "critico" | "alerta" | "sucesso" | "info"; titulo: string; texto: string }> = [];

    if (analytics.semEstoque > 0) {
      list.push({
        tipo: "critico",
        titulo: "Risco de ruptura",
        texto: `${analytics.semEstoque} produto(s) ativo(s) estão sem estoque disponível.`,
      });
    }

    if (analytics.valorParado > 0) {
      list.push({
        tipo: "alerta",
        titulo: "Capital parado em estoque",
        texto: `${formatBRL(analytics.valorParado)} em produtos sem atualização recente.`,
      });
    }

    if (analytics.margemBaixa > 0) {
      list.push({
        tipo: "alerta",
        titulo: "Margem baixa",
        texto: `${analytics.margemBaixa} produto(s) abaixo de 25% de margem sobre venda.`,
      });
    }

    if (analytics.giroSaudavel >= 75 && analytics.baixo === 0) {
      list.push({
        tipo: "sucesso",
        titulo: "Estoque saudável",
        texto: "A maioria dos produtos está sem alerta de parada ou ruptura.",
      });
    }

    if (!list.length) {
      list.push({
        tipo: "info",
        titulo: "Sem alerta crítico",
        texto: "Nenhum ponto crítico encontrado nos filtros atuais.",
      });
    }

    return list.slice(0, 4);
  }, [analytics]);

  return (
    <main className="stockPage">
      <header className="hero">
        <div>
          <div className="kicker">MAISON NOOR ERP</div>
          <h1>CRM • Estoque Inteligente</h1>
          <p>
            Gestão executiva do estoque com valor investido, lucro potencial,
            produtos parados, risco de ruptura, margem e recomendações automáticas.
          </p>
        </div>

        <div className="heroActions">
          <Link className="btn" href="/crm/produtos">Voltar para Produtos</Link>
          <button className="btn primary" type="button" onClick={() => void carregarProdutos(true)}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}

      <section className="filtersPanel">
        <div className="field search">
          <label>Busca</label>
          <input
            className="input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Produto, marca ou categoria..."
          />
        </div>

        <div className="field">
          <label>Categoria</label>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="todas">Todas</option>
            {categoriasDisponiveis.map((c) => (
              <option key={c} value={c}>{categoriaLabel(c)}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Inteligência</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)}>
            <option value="todos">Todos</option>
            <option value="ativo">Somente ativos</option>
            <option value="baixo">Estoque baixo</option>
            <option value="parado">Produtos parados</option>
            <option value="margem-baixa">Margem baixa</option>
          </select>
        </div>
      </section>

      <section className="executivePanel">
        <div className="panelHeader">
          <div>
            <div className="sectionKicker">Dashboard de estoque</div>
            <h2>Resultado executivo do estoque</h2>
            <p>Leitura consolidada de capital investido, giro, margem, ruptura e lucro potencial.</p>
          </div>

          <div className={analytics.lucro >= 0 ? "bigResult positive" : "bigResult negative"}>
            <span>Lucro potencial</span>
            <strong>{formatBRL(analytics.lucro)}</strong>
            <small>Margem média {analytics.margemMedia.toFixed(1)}%</small>
          </div>
        </div>

        <div className="kpiGrid">
          <Kpi title="Valor investido" value={formatBRL(analytics.custo)} hint="Custo total do estoque" tone="gold" />
          <Kpi title="Valor em venda" value={formatBRL(analytics.venda)} hint="Potencial bruto" tone="green" />
          <Kpi title="Disponível" value={String(analytics.estoqueDisponivel)} hint={`${analytics.estoqueFisico} físico • ${analytics.reservado} reservado`} />
          <Kpi title="Estoque baixo" value={String(analytics.baixo)} hint="Produtos com até 2 unidades" tone={analytics.baixo > 0 ? "red" : "green"} />
          <Kpi title="Produtos parados" value={String(analytics.parados)} hint="45+ dias sem atualização" tone={analytics.parados > 0 ? "gold" : "green"} />
          <Kpi title="Valor parado" value={formatBRL(analytics.valorParado)} hint="Capital parado estimado" tone={analytics.valorParado > 0 ? "red" : "green"} />
          <Kpi title="Giro saudável" value={`${analytics.giroSaudavel.toFixed(0)}%`} hint="Produtos sem alerta de parada" tone={analytics.giroSaudavel >= 70 ? "green" : "gold"} />
          <Kpi title="Produtos analisados" value={String(analytics.produtos)} hint={`${analytics.ativos} ativos`} />
        </div>
      </section>

      <section className="topGrid">
        <div className="panel">
          <div className="sectionKicker">IA de Estoque</div>
          <h2>Alertas executivos</h2>
          <div className="alerts">
            {alertas.map((a, index) => (
              <article className={`alert ${a.tipo}`} key={`${a.titulo}_${index}`}>
                <span>{a.tipo === "critico" ? "⚠️" : a.tipo === "alerta" ? "🔔" : a.tipo === "sucesso" ? "✅" : "💡"}</span>
                <div>
                  <strong>{a.titulo}</strong>
                  <small>{a.texto}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="sectionKicker">Categorias</div>
          <h2>Distribuição do estoque</h2>
          <div className="categoryRows">
            {rankings.categorias.length ? rankings.categorias.map((c) => {
              const perc = analytics.custo > 0 ? (c.custo / analytics.custo) * 100 : 0;
              return (
                <div className="categoryRow" key={c.label}>
                  <div>
                    <strong>{c.label}</strong>
                    <small>{c.qtd} produto(s) • {c.estoque} un.</small>
                  </div>
                  <div className="rowValue">
                    <b>{formatBRL(c.custo)}</b>
                    <i><em style={{ width: `${Math.max(4, perc)}%` }} /></i>
                  </div>
                </div>
              );
            }) : <div className="emptyMini">Nenhuma categoria encontrada.</div>}
          </div>
        </div>
      </section>

      <section className="rankingGrid">
        <RankingPanel
          title="Maior valor em estoque"
          subtitle="Onde está o maior capital investido"
          items={rankings.maiorValor}
          value={(p) => formatBRL(p.custoTotal)}
          detail={(p) => `${p.marca || "Sem marca"} • ${categoriaLabel(p.categoria)} • ${p.est} un.`}
        />

        <RankingPanel
          title="Maior lucro potencial"
          subtitle="Produtos com melhor retorno estimado"
          items={rankings.maiorLucro}
          value={(p) => formatBRL(p.lucroTotal)}
          detail={(p) => `${p.marca || "Sem marca"} • margem ${p.margem.toFixed(1)}% • ${p.est} un.`}
        />

        <RankingPanel
          title="Risco de ruptura"
          subtitle="Produtos próximos de acabar"
          items={rankings.ruptura}
          value={(p) => `${p.disp} disp.`}
          detail={(p) => `${p.marca || "Sem marca"} • estoque ${p.est} • reservado ${p.res}`}
          empty="Nenhum produto em risco de ruptura."
        />

        <RankingPanel
          title="Produtos parados"
          subtitle="Sem atualização há 45+ dias"
          items={rankings.parados}
          value={(p) => `${p.dias} dias`}
          detail={(p) => `${p.marca || "Sem marca"} • custo ${formatBRL(p.custoTotal)} • ${p.est} un.`}
          empty="Nenhum produto parado detectado."
        />
      </section>

      <section className="productsPanel">
        <div className="panelHeader">
          <div>
            <div className="sectionKicker">Diagnóstico operacional</div>
            <h2>Produtos analisados</h2>
            <p>{produtos.length} produto(s) no filtro atual, com ação recomendada por item.</p>
          </div>
        </div>

        <div className="productList">
          {produtos.map((p) => (
            <article className="productCard" key={p.id}>
              <div className="avatar">{String(p.nome || "P").slice(0, 1).toUpperCase()}</div>

              <div className="productMain">
                <div className="productTitle">
                  <strong>{p.nome || "Produto sem nome"}</strong>
                  <span className={p.ativo === false ? "badge off" : "badge on"}>{p.ativo === false ? "Inativo" : "Ativo"}</span>
                  <span className="badge">{categoriaLabel(p.categoria)}</span>
                </div>

                <small>{p.marca || "Sem marca"} • atualizado há {p.dias} dia(s)</small>

                <div className="chips">
                  <span>Estoque {p.est}</span>
                  <span>Disponível {p.disp}</span>
                  <span>Reservado {p.res}</span>
                  <span>Margem {p.margem.toFixed(1)}%</span>
                  <span>Markup {p.markup.toFixed(0)}%</span>
                </div>
              </div>

              <div className="moneyBlock">
                <small>Custo</small>
                <strong>{formatBRL(p.custoTotal)}</strong>
                <small>Lucro pot.</small>
                <b>{formatBRL(p.lucroTotal)}</b>
              </div>

              <div className={`actionBox ${p.acao.tone}`}>
                <strong>{p.acao.label}</strong>
                <small>{p.acao.motivo}</small>
              </div>
            </article>
          ))}

          {!produtos.length ? (
            <div className="emptyLarge">Nenhum produto encontrado para o filtro atual.</div>
          ) : null}
        </div>
      </section>

      <style jsx global>{`
        .stockPage { max-width: 1240px; margin: 0 auto; padding: 14px 16px 28px; color: #f5f2ec; }
        .hero, .filtersPanel, .executivePanel, .panel, .productsPanel {
          border: 1px solid rgba(200,162,106,.18);
          background: radial-gradient(circle at top left, rgba(200,162,106,.12), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012));
          border-radius: 20px;
          box-shadow: 0 16px 42px rgba(0,0,0,.16);
        }
        .hero { padding: 16px; display:flex; justify-content:space-between; align-items:flex-end; gap:14px; flex-wrap:wrap; }
        .kicker, .sectionKicker { color: rgba(200,162,106,.95); font-size: 10px; letter-spacing:.16em; text-transform:uppercase; font-weight:950; }
        h1 { margin: 5px 0 0; font-size: 28px; line-height:1.05; letter-spacing:-.03em; }
        h2 { margin: 4px 0 0; font-size: 21px; line-height:1.12; letter-spacing:-.02em; }
        p { margin: 7px 0 0; opacity:.72; line-height:1.38; font-size:13px; }
        .heroActions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .btn { min-height:34px; display:inline-flex; align-items:center; justify-content:center; border-radius:12px; border:1px solid rgba(200,162,106,.25); background:rgba(200,162,106,.08); color:#f5f2ec; padding:0 12px; font-weight:900; text-decoration:none; cursor:pointer; }
        .btn.primary { background:linear-gradient(180deg, rgba(200,162,106,.18), rgba(200,162,106,.07)); border-color:rgba(200,162,106,.42); }
        .toast { position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:99; padding:10px 13px; border-radius:14px; border:1px solid rgba(200,162,106,.25); background:rgba(25,20,16,.96); font-weight:900; }
        .filtersPanel { margin-top:12px; padding:13px; display:grid; grid-template-columns: minmax(260px,1.4fr) minmax(170px,.7fr) minmax(170px,.7fr); gap:10px; }
        .field { display:grid; gap:5px; min-width:0; }
        .field label { font-size:9px; letter-spacing:.13em; text-transform:uppercase; opacity:.72; font-weight:950; }
        .input { height:38px; border-radius:12px; border:1px solid rgba(255,255,255,.1); background:rgba(15,15,22,.92); color:#f5f2ec; padding:0 11px; outline:none; }
        .executivePanel, .productsPanel { margin-top:12px; padding:14px; }
        .panelHeader { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
        .bigResult { min-width:210px; border:1px solid rgba(200,162,106,.2); background:rgba(0,0,0,.22); border-radius:16px; padding:11px 12px; text-align:right; display:grid; gap:3px; }
        .bigResult span, .bigResult small { font-size:10px; opacity:.68; text-transform:uppercase; letter-spacing:.1em; font-weight:950; }
        .bigResult strong { font-size:22px; line-height:1.05; }
        .positive strong, .green { color:#4dff9a !important; }
        .negative strong, .red { color:#ff8585 !important; }
        .gold { color:#f3c979 !important; }
        .kpiGrid { display:grid; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); gap:9px; }
        .kpi { min-height:78px; padding:10px; border-radius:15px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.18); display:grid; align-content:center; }
        .kpi span { font-size:9px; opacity:.72; text-transform:uppercase; letter-spacing:.1em; font-weight:950; }
        .kpi strong { margin-top:5px; font-size:17px; color:rgba(200,162,106,.98); overflow-wrap:anywhere; }
        .kpi small { margin-top:4px; opacity:.62; font-size:10px; }
        .kpi.green strong { color:#4dff9a; } .kpi.red strong { color:#ff8585; } .kpi.gold strong { color:#f3c979; }
        .topGrid { margin-top:12px; display:grid; grid-template-columns: .85fr 1.15fr; gap:10px; }
        .panel { padding:13px; min-width:0; }
        .alerts, .categoryRows, .rankingRows { margin-top:10px; display:grid; gap:8px; }
        .alert { display:grid; grid-template-columns:34px minmax(0,1fr); gap:8px; padding:9px; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.18); }
        .alert > span { width:32px; height:32px; display:grid; place-items:center; border-radius:12px; border:1px solid rgba(200,162,106,.18); background:rgba(200,162,106,.07); }
        .alert strong, .categoryRow strong, .rankingRow strong, .productTitle strong { display:block; font-size:12px; }
        .alert small, .categoryRow small, .rankingRow small, .productMain small { display:block; margin-top:3px; opacity:.66; font-size:10.5px; line-height:1.28; }
        .alert.critico { border-color:rgba(255,120,120,.3); } .alert.alerta { border-color:rgba(255,201,98,.3); } .alert.sucesso { border-color:rgba(117,255,171,.24); }
        .categoryRow, .rankingRow { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:9px; border-radius:13px; border:1px solid rgba(255,255,255,.075); background:rgba(255,255,255,.025); }
        .rowValue { min-width:120px; text-align:right; display:grid; gap:5px; }
        .rowValue b, .rankingRow b { color:rgba(200,162,106,.98); font-size:12px; white-space:nowrap; }
        .rowValue i { height:3px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; display:block; }
        .rowValue em { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#f3c979,rgba(200,162,106,.2)); }
        .rankingGrid { margin-top:12px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .emptyMini, .emptyLarge { min-height:70px; display:grid; place-items:center; border-radius:14px; border:1px dashed rgba(255,255,255,.14); opacity:.7; font-size:12px; text-align:center; }
        .emptyLarge { min-height:130px; }
        .productList { display:grid; gap:8px; }
        .productCard { display:grid; grid-template-columns:42px minmax(0,1fr) 120px 150px; gap:10px; align-items:center; padding:10px; border-radius:16px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.18); }
        .avatar { width:38px; height:38px; display:grid; place-items:center; border-radius:14px; border:1px solid rgba(200,162,106,.25); background:rgba(200,162,106,.09); color:rgba(200,162,106,.98); font-weight:1000; }
        .productTitle { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .badge { min-height:21px; display:inline-flex; align-items:center; padding:0 7px; border-radius:999px; border:1px solid rgba(200,162,106,.18); background:rgba(200,162,106,.07); font-size:9px; font-weight:950; text-transform:uppercase; }
        .badge.on { color:#bfffd5; border-color:rgba(117,255,171,.28); background:rgba(117,255,171,.08); }
        .badge.off { color:#ffd1d1; border-color:rgba(255,120,120,.28); background:rgba(255,120,120,.08); }
        .chips { margin-top:7px; display:flex; gap:5px; flex-wrap:wrap; }
        .chips span { min-height:22px; display:inline-flex; align-items:center; padding:0 7px; border-radius:999px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); font-size:10px; font-weight:850; }
        .moneyBlock { text-align:right; display:grid; gap:2px; }
        .moneyBlock small { opacity:.58; font-size:9px; text-transform:uppercase; font-weight:950; }
        .moneyBlock strong { color:#f3c979; font-size:13px; }
        .moneyBlock b { color:#4dff9a; font-size:13px; }
        .actionBox { min-height:58px; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.2); padding:9px; display:grid; align-content:center; gap:3px; }
        .actionBox strong { font-size:12px; }
        .actionBox small { opacity:.62; font-size:10px; line-height:1.25; }
        .actionBox.green { border-color:rgba(117,255,171,.24); } .actionBox.red { border-color:rgba(255,120,120,.28); } .actionBox.gold { border-color:rgba(255,201,98,.28); } .actionBox.blue { border-color:rgba(115,171,255,.26); }
        @media (max-width:1100px) {
          .filtersPanel, .topGrid, .rankingGrid { grid-template-columns:1fr; }
          .productCard { grid-template-columns:42px minmax(0,1fr); }
          .moneyBlock, .actionBox { grid-column:2 / -1; text-align:left; }
          .bigResult { text-align:left; }
        }
        @media (max-width:680px) {
          .stockPage { padding:10px; }
          h1 { font-size:24px; }
          .hero { align-items:flex-start; }
          .heroActions { width:100%; justify-content:flex-start; }
          .btn { flex:1 1 auto; }
          .kpiGrid { grid-template-columns:1fr; }
        }
      `}</style>
    </main>
  );
}

function Kpi({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  tone?: "green" | "red" | "gold";
}) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function RankingPanel({
  title,
  subtitle,
  items,
  value,
  detail,
  empty = "Nenhum produto encontrado.",
}: {
  title: string;
  subtitle: string;
  items: Array<Produto & {
    est: number;
    res: number;
    disp: number;
    margem: number;
    markup: number;
    custoTotal: number;
    vendaTotal: number;
    lucroTotal: number;
    dias: number;
    acao: { label: string; tone: "green" | "red" | "gold" | "blue"; motivo: string };
  }>;
  value: (p: any) => string;
  detail: (p: any) => string;
  empty?: string;
}) {
  return (
    <div className="panel">
      <div className="sectionKicker">Ranking</div>
      <h2>{title}</h2>
      <p>{subtitle}</p>

      <div className="rankingRows">
        {items.length ? items.map((p) => (
          <div className="rankingRow" key={p.id}>
            <div>
              <strong>{p.nome || "Produto sem nome"}</strong>
              <small>{detail(p)}</small>
            </div>
            <b>{value(p)}</b>
          </div>
        )) : <div className="emptyMini">{empty}</div>}
      </div>
    </div>
  );
}
