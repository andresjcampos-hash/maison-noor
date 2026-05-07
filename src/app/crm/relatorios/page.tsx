'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Produto = {
  id: string;
  [key: string]: any;
};

type StatusFiltro = 'todos' | 'em_estoque' | 'sem_estoque' | 'baixo_estoque';

function numero(valor: unknown) {
  if (typeof valor === 'number') return valor;
  if (!valor) return 0;

  const texto = String(valor)
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  return Number(texto) || 0;
}

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function pegarCampo(produto: Produto, campos: string[]) {
  for (const campo of campos) {
    if (produto[campo] !== undefined && produto[campo] !== null && produto[campo] !== '') {
      return produto[campo];
    }
  }

  return '';
}

function nomeProduto(produto: Produto) {
  return String(
    pegarCampo(produto, ['name', 'nome', 'titulo', 'title', 'produto']) ||
      'Produto sem nome'
  );
}

function marcaProduto(produto: Produto) {
  return String(pegarCampo(produto, ['brand', 'marca', 'fabricante']) || '-');
}

function categoriaProduto(produto: Produto) {
  return String(pegarCampo(produto, ['category', 'categoria', 'tipo']) || '-');
}

function estoqueProduto(produto: Produto) {
  return numero(
    pegarCampo(produto, [
      'stock',
      'estoque',
      'quantidade',
      'quantity',
      'estoqueAtual',
      'estoqueTotal',
      'quantidadeEstoque',
      'saldo',
      'saldoEstoque',
      'qtd',
    ])
  );
}

function precoProduto(produto: Produto) {
  return numero(
    pegarCampo(produto, [
      'price',
      'preco',
      'salePrice',
      'precoVenda',
      'valorVenda',
      'valor',
      'venda',
      'priceSale',
      'sale_price',
    ])
  );
}

function custoProduto(produto: Produto) {
  return numero(
    pegarCampo(produto, [
      'cost',
      'custo',
      'precoCusto',
      'valorCusto',
      'custoEstoque',
      'purchasePrice',
      'costPrice',
      'precoCompra',
      'valorCompra',
    ])
  );
}

export default function RelatoriosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusFiltro>('todos');
  const [categoria, setCategoria] = useState('todas');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState('');

  async function carregarProdutos() {
    try {
      setCarregando(true);

      const snap = await getDocs(collection(db, 'products'));

      const lista = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Produto, 'id'>),
      }));

      setProdutos(lista);

      setUltimaAtualizacao(
        new Date().toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      );
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar relatório.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  const categorias = useMemo(() => {
    const lista = produtos
      .map((p) => categoriaProduto(p))
      .filter((c) => c && c !== '-');

    return Array.from(new Set(lista)).sort();
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    return produtos.filter((produto) => {
      const nome = nomeProduto(produto).toLowerCase();
      const marca = marcaProduto(produto).toLowerCase();
      const cat = categoriaProduto(produto);
      const estoque = estoqueProduto(produto);

      const termo = busca.toLowerCase();

      const bateBusca = nome.includes(termo) || marca.includes(termo);

      const bateCategoria = categoria === 'todas' || cat === categoria;

      const bateStatus =
        status === 'todos' ||
        (status === 'em_estoque' && estoque > 3) ||
        (status === 'baixo_estoque' && estoque > 0 && estoque <= 3) ||
        (status === 'sem_estoque' && estoque <= 0);

      return bateBusca && bateCategoria && bateStatus;
    });
  }, [produtos, busca, status, categoria]);

  const totalProdutos = produtos.length;

  const emEstoque = produtos.filter((p) => estoqueProduto(p) > 3).length;

  const baixoEstoque = produtos.filter((p) => {
    const qtd = estoqueProduto(p);
    return qtd > 0 && qtd <= 3;
  }).length;

  const semEstoque = produtos.filter((p) => estoqueProduto(p) <= 0).length;

  const valorVendaEstoque = produtos.reduce(
    (total, produto) => total + estoqueProduto(produto) * precoProduto(produto),
    0
  );

  const valorTotalEstoque = produtos.reduce(
    (total, produto) => total + estoqueProduto(produto) * custoProduto(produto),
    0
  );

  const listaSemEstoque = produtos
    .filter((p) => estoqueProduto(p) <= 0)
    .slice(0, 20);

  const listaBaixoEstoque = produtos
    .filter((p) => {
      const qtd = estoqueProduto(p);
      return qtd > 0 && qtd <= 3;
    })
    .slice(0, 20);

  function exportarExcel() {
    const linhas = produtosFiltrados.map((produto) => {
      const estoque = estoqueProduto(produto);
      const custo = custoProduto(produto);
      const venda = precoProduto(produto);

      return {
        Produto: nomeProduto(produto),
        Marca: marcaProduto(produto),
        Categoria: categoriaProduto(produto),
        Estoque: estoque,
        Venda: moeda(venda),
        Custo: moeda(custo),
        Status:
          estoque <= 0
            ? 'Sem estoque'
            : estoque <= 3
            ? 'Estoque baixo'
            : 'Em estoque',
      };
    });

    const cabecalho = Object.keys(linhas[0] || {});

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
        </head>

        <body>
          <table border="1">
            <thead>
              <tr>
                ${cabecalho.map((c) => `<th>${c}</th>`).join('')}
              </tr>
            </thead>

            <tbody>
              ${linhas
                .map(
                  (linha) => `
                    <tr>
                      ${cabecalho
                        .map(
                          (coluna) =>
                            `<td>${String((linha as any)[coluna] ?? '')}</td>`
                        )
                        .join('')}
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;
    link.download = `relatorio-maison-noor.xls`;

    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="relatoriosPage">
      <section className="hero">
        <div>
          <div className="eyebrow">Maison Noor CRM</div>

          <h1>Relatórios de Estoque</h1>

          <p>Resumo inteligente de produtos, estoque crítico e reposição.</p>

          <div className="syncInfo">
            <span className="syncDot" />
            Última atualização: {ultimaAtualizacao || 'carregando...'}
          </div>
        </div>

        <div className="heroActions">
          <button onClick={exportarExcel} className="primaryBtn">
            Exportar Excel
          </button>

          <button onClick={carregarProdutos} className="secondaryBtn">
            Atualizar
          </button>
        </div>
      </section>

      <section className="metricsGrid">
        <div className="metricCard">
          <span>📦</span>
          <p>Total</p>
          <h2>{totalProdutos}</h2>
        </div>

        <div className="metricCard">
          <span>🟢</span>
          <p>Em estoque</p>
          <h2>{emEstoque}</h2>
        </div>

        <div className="metricCard">
          <span>🟡</span>
          <p>Estoque baixo</p>
          <h2>{baixoEstoque}</h2>
        </div>

        <div className="metricCard">
          <span>🔴</span>
          <p>Sem estoque</p>
          <h2>{semEstoque}</h2>
        </div>

        <div className="metricCard money">
          <span>💰</span>
          <p>Venda potencial</p>
          <h2>{moeda(valorVendaEstoque)}</h2>
        </div>

        <div className="metricCard money">
          <span>📈</span>
          <p>Custo estoque</p>
          <h2>{moeda(valorTotalEstoque)}</h2>
        </div>
      </section>

      <section className="filtersPanel">
        <div className="searchBox">
          <span>🔎</span>

          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto ou marca..."
          />
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)}>
          <option value="todos">Todos os status</option>
          <option value="em_estoque">Em estoque</option>
          <option value="baixo_estoque">Estoque baixo</option>
          <option value="sem_estoque">Sem estoque</option>
        </select>

        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="todas">Todas categorias</option>

          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </section>

      <section className="summaryGrid">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h3>Produtos sem estoque</h3>
              <p>Itens que precisam de reposição imediata.</p>
            </div>

            <strong>{semEstoque}</strong>
          </div>

          <div className="miniList">
            {carregando ? (
              <div className="empty">Carregando...</div>
            ) : listaSemEstoque.length === 0 ? (
              <div className="empty">Nenhum produto zerado.</div>
            ) : (
              listaSemEstoque.map((produto) => (
                <div className="miniItem" key={produto.id}>
                  <div>
                    <strong>{nomeProduto(produto)}</strong>
                    <span>{marcaProduto(produto)}</span>
                  </div>

                  <b className="danger">0</b>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <h3>Estoque baixo</h3>
              <p>Produtos próximos de acabar.</p>
            </div>

            <strong>{baixoEstoque}</strong>
          </div>

          <div className="miniList">
            {carregando ? (
              <div className="empty">Carregando...</div>
            ) : listaBaixoEstoque.length === 0 ? (
              <div className="empty">Nenhum produto crítico.</div>
            ) : (
              listaBaixoEstoque.map((produto) => (
                <div className="miniItem" key={produto.id}>
                  <div>
                    <strong>{nomeProduto(produto)}</strong>
                    <span>{marcaProduto(produto)}</span>
                  </div>

                  <b className="warning">{estoqueProduto(produto)}</b>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="resultBox">
        <div>
          <h3>Resultado filtrado</h3>

          <p>
            {produtosFiltrados.length} produto(s) encontrado(s). Para visualizar
            detalhes completos utilize o botão Exportar Excel.
          </p>
        </div>
      </section>

      <style jsx>{`
        .relatoriosPage {
          min-height: 100vh;
          padding: 20px 26px;
          color: #f8f5ef;
        }

        .hero {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 16px 22px;
          border-radius: 24px;
          border: 1px solid rgba(200, 162, 106, 0.22);
          background:
            radial-gradient(circle at top left, rgba(200, 162, 106, 0.18), transparent 34%),
            linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025));

          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.3);
        }

        .eyebrow {
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #d7b06d;
          font-weight: 900;
          margin-bottom: 6px;
        }

        .hero h1 {
          margin: 0;
          font-size: 24px;
          line-height: 1.05;
          font-weight: 950;
        }

        .hero p {
          margin: 5px 0 0;
          color: rgba(248,245,239,0.68);
          font-size: 13px;
        }

        .syncInfo {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(200,162,106,0.16);
          font-size: 11px;
          color: rgba(248,245,239,0.76);
        }

        .syncDot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #d7b06d;
          box-shadow: 0 0 14px rgba(215,176,109,0.7);
        }

        .heroActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .primaryBtn,
        .secondaryBtn {
          border-radius: 999px;
          padding: 10px 16px;
          border: 0;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .primaryBtn {
          background: linear-gradient(135deg, #d7b06d, #9d7336);
          color: #140f08;
        }

        .secondaryBtn {
          background: rgba(255,255,255,0.06);
          color: #fff;
          border: 1px solid rgba(200,162,106,0.18);
        }

        .metricsGrid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .metricCard {
          min-height: 86px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(200,162,106,0.14);
          background:
            radial-gradient(circle at top right, rgba(200,162,106,0.11), transparent 36%),
            rgba(255,255,255,0.035);

          overflow: hidden;
        }

        .metricCard span {
          display: inline-flex;
          width: 26px;
          height: 26px;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: rgba(200,162,106,0.12);
          margin-bottom: 7px;
          font-size: 13px;
        }

        .metricCard p {
          margin: 0;
          font-size: 11px;
          color: rgba(248,245,239,0.62);
        }

        .metricCard h2 {
          margin: 4px 0 0;
          font-size: 20px;
          font-weight: 950;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .metricCard.money h2 {
          font-size: 15px;
          line-height: 1.15;
          white-space: normal;
          word-break: break-word;
        }

        .filtersPanel {
          margin-top: 14px;
          padding: 12px;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 10px;
          border-radius: 20px;
          border: 1px solid rgba(200,162,106,0.14);
          background: rgba(255,255,255,0.035);
        }

        .searchBox {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 12px;
          height: 40px;
          border-radius: 14px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .searchBox input,
        .filtersPanel select {
          width: 100%;
          height: 40px;
          border: 0;
          outline: none;
          background: transparent;
          color: #fff;
          font-weight: 700;
          font-size: 12px;
        }

        .filtersPanel select {
          border-radius: 14px;
          padding: 0 12px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .filtersPanel option {
          background: #111116;
          color: #fff;
        }

        .summaryGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
        }

        .panel,
        .resultBox {
          border-radius: 22px;
          border: 1px solid rgba(200,162,106,0.14);
          background:
            radial-gradient(circle at top right, rgba(200,162,106,0.08), transparent 34%),
            rgba(255,255,255,0.035);

          padding: 14px;
        }

        .panelHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .panelHeader h3,
        .resultBox h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 950;
        }

        .panelHeader p,
        .resultBox p {
          margin: 4px 0 0;
          color: rgba(248,245,239,0.58);
          font-size: 12px;
        }

        .panelHeader > strong {
          font-size: 22px;
          color: #d7b06d;
        }

        .miniList {
          display: grid;
          gap: 8px;
          max-height: 340px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .miniList::-webkit-scrollbar {
          width: 6px;
        }

        .miniList::-webkit-scrollbar-track {
          background: transparent;
        }

        .miniList::-webkit-scrollbar-thumb {
          background: rgba(215, 176, 109, 0.35);
          border-radius: 999px;
        }

        .miniItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 11px;
          border-radius: 15px;
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.055);
        }

        .miniItem strong {
          display: block;
          font-size: 12px;
          color: #fff;
        }

        .miniItem span {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: rgba(248,245,239,0.48);
        }

        .miniItem b {
          min-width: 32px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 12px;
        }

        .danger {
          color: #ff7b7b;
          background: rgba(248,113,113,0.12);
        }

        .warning {
          color: #facc15;
          background: rgba(250,204,21,0.12);
        }

        .empty {
          padding: 16px;
          text-align: center;
          color: rgba(248,245,239,0.5);
          font-size: 12px;
        }

        .resultBox {
          margin-top: 14px;
        }

        @media (max-width: 1200px) {
          .metricsGrid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .summaryGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .relatoriosPage {
            padding: 18px;
          }

          .hero {
            flex-direction: column;
            align-items: flex-start;
          }

          .metricsGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .filtersPanel {
            grid-template-columns: 1fr;
          }

          .hero h1 {
            font-size: 22px;
          }
        }
      `}</style>
    </div>
  );
}