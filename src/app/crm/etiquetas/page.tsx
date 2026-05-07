'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Produto = {
  id: string;
  [key: string]: any;
};

type ModeloEtiqueta = 'caixa' | 'fita';

type Etiqueta = {
  produto: Produto;
  qrCode: string;
};

function pegarCampo(produto: Produto, campos: string[]) {
  for (const campo of campos) {
    if (produto[campo] !== undefined && produto[campo] !== null && produto[campo] !== '') {
      return produto[campo];
    }
  }

  return '';
}

function nomeProduto(produto: Produto) {
  return String(pegarCampo(produto, ['name', 'nome', 'titulo', 'title', 'produto']) || 'Produto sem nome');
}

function marcaProduto(produto: Produto) {
  return String(pegarCampo(produto, ['brand', 'marca', 'fabricante']) || 'Maison Noor');
}

function categoriaProduto(produto: Produto) {
  return String(pegarCampo(produto, ['category', 'categoria', 'tipo']) || '-');
}

function precoProduto(produto: Produto) {
  const valor = pegarCampo(produto, [
    'price',
    'preco',
    'salePrice',
    'precoVenda',
    'valorVenda',
    'valor',
    'venda',
  ]);

  if (typeof valor === 'number') return valor;

  const texto = String(valor || '')
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

function slugProduto(produto: Produto) {
  const slugExistente = pegarCampo(produto, ['slug', 'urlSlug', 'handle']);

  if (slugExistente) return String(slugExistente);

  return nomeProduto(produto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function urlProduto(produto: Produto) {
  const urlManual = pegarCampo(produto, ['url', 'productUrl', 'link', 'linkProduto']);

  if (urlManual && String(urlManual).startsWith('http')) {
    return String(urlManual);
  }

  // IMPORTANTE: usa sempre o domínio oficial e o ID real do documento no Firestore.
  // Isso evita QR Code apontando para localhost ou para slug diferente da rota do site.
  return `https://www.maisonnoor.com.br/produto/${encodeURIComponent(String(produto.id))}`;
}

export default function EtiquetasPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [quantidade, setQuantidade] = useState(1);
  const [modelo, setModelo] = useState<ModeloEtiqueta>('caixa');
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);

  async function carregarProdutos() {
    try {
      setCarregando(true);

      const snap = await getDocs(collection(db, 'products'));

      const lista = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Produto, 'id'>),
      }));

      setProdutos(lista);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar produtos.');
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
      const termo = busca.toLowerCase();

      const bateBusca =
        nomeProduto(produto).toLowerCase().includes(termo) ||
        marcaProduto(produto).toLowerCase().includes(termo);

      const bateCategoria =
        categoria === 'todas' || categoriaProduto(produto) === categoria;

      return bateBusca && bateCategoria;
    });
  }, [produtos, busca, categoria]);

  const produtosSelecionados = produtos.filter((p) => selecionados.includes(p.id));

  function alternarProduto(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    );
  }

  function selecionarTodosFiltrados() {
    setSelecionados(produtosFiltrados.map((p) => p.id));
  }

  function limparSelecao() {
    setSelecionados([]);
  }

  async function montarEtiquetas() {
    const listaExpandida: Produto[] = [];

    produtosSelecionados.forEach((produto) => {
      for (let i = 0; i < quantidade; i++) {
        listaExpandida.push(produto);
      }
    });

    const etiquetas: Etiqueta[] = [];

    for (const produto of listaExpandida) {
      const qrCode = await QRCode.toDataURL(urlProduto(produto), {
        margin: 1,
        width: modelo === 'caixa' ? 92 : 116,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      etiquetas.push({
        produto,
        qrCode,
      });
    }

    return etiquetas;
  }

  async function imprimirEtiquetas() {
    if (selecionados.length === 0) {
      alert('Selecione pelo menos um produto.');
      return;
    }

    try {
      setGerando(true);

      const etiquetas = await montarEtiquetas();

      const htmlEtiquetas = etiquetas
        .map((item) => {
          const produto = item.produto;

          if (modelo === 'caixa') {
            return `
              <div class="label caixa">
                <div class="caixaLeft">
                  <div class="caixaBrand">MAISON NOOR</div>
                  <div class="caixaName">${nomeProduto(produto)}</div>
                  <div class="caixaPrice">${moeda(precoProduto(produto))}</div>
                </div>

                <div class="caixaQrWrap">
                  <img class="caixaQr" src="${item.qrCode}" />
                </div>
              </div>
            `;
          }

          return `
            <div class="label fita">
              <div class="fitaLeft">
                <div class="brandRow">
                  <img src="/logo-maison-noor.png" />
                  <div>
                    <strong>MAISON NOOR</strong>
                    <span>Perfumes Árabes Premium</span>
                  </div>
                </div>

                <div class="fitaDivider"><span></span></div>

                <div>
                  <div class="fitaName">${nomeProduto(produto)}</div>
                  <div class="fitaMeta">${marcaProduto(produto)}</div>
                </div>

                <div class="fitaPrice">${moeda(precoProduto(produto))}</div>
              </div>

              <div class="fitaRight">
                <div class="fitaQrBox">
                  <img class="fitaQr" src="${item.qrCode}" />
                </div>
                <div class="fitaCta">
                  <div class="ctaIcon">▣</div>
                  <div class="ctaText">
                    <strong>ESCANEIE</strong>
                    <span>E COMPRE</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      const printWindow = window.open('', '_blank', 'width=1200,height=800');

      if (!printWindow) {
        alert('O navegador bloqueou a janela de impressão.');
        return;
      }

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Etiquetas Maison Noor</title>

            <style>
              @page {
                size: A4;
                margin: 4mm;
              }

              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                background: #ffffff;
                color: #111111;
              }

              .sheet {
                display: grid;
                align-items: start;
              }

              .sheet.caixa {
                grid-template-columns: repeat(4, 40mm);
                gap: 3mm;
              }

              .sheet.fita {
                grid-template-columns: repeat(2, 100mm);
                gap: 2mm;
              }

              .label {
                page-break-inside: avoid;
                overflow: hidden;
                background: #fff7ea;
                border: 1px solid #d7b06d;
              }

              .label.caixa {
                width: 40mm;
                height: 20mm;
                border-radius: 2mm;
                padding: 1.7mm;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1.4mm;
              }

              .caixaLeft {
                flex: 1;
                min-width: 0;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: center;
              }

              .caixaBrand {
                font-size: 5.6px;
                font-weight: 900;
                letter-spacing: 0.12em;
                color: #9d7336;
                line-height: 1;
                margin-bottom: 1mm;
              }

              .caixaName {
                font-size: 7.4px;
                font-weight: 950;
                color: #111111;
                line-height: 1.05;
                max-height: 8mm;
                overflow: hidden;
              }

              .caixaPrice {
                margin-top: 1mm;
                font-size: 8.6px;
                font-weight: 950;
                color: #111111;
                line-height: 1;
              }

              .caixaQrWrap {
                width: 13.5mm;
                height: 13.5mm;
                border-radius: 1.5mm;
                background: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                border: 1px solid rgba(0,0,0,0.08);
              }

              .caixaQr {
                width: 12mm;
                height: 12mm;
                display: block;
              }

              .label.fita {
                width: 100mm;
                height: 20mm;
                border-radius: 2mm;
                padding: 2mm;
                display: flex;
                justify-content: space-between;
                gap: 2mm;
                background:
                  radial-gradient(circle at 10% 0%, rgba(215, 176, 109, 0.16), transparent 34%),
                  #fff7ea;
              }

              .fitaLeft {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
              }

              .brandRow {
                display: flex;
                align-items: center;
                gap: 1.5mm;
              }

              .brandRow img {
                width: 7mm;
                height: 7mm;
                border-radius: 999px;
                object-fit: cover;
              }

              .brandRow strong {
                display: block;
                font-size: 6.4px;
                letter-spacing: 0.12em;
                color: #111111;
              }

              .brandRow span {
                display: block;
                font-size: 5.4px;
                color: #6b5b42;
                margin-top: 0.5px;
              }

              .fitaDivider {
                height: 1px;
                width: 100%;
                margin: 0.45mm 0;
                background: linear-gradient(90deg, rgba(157, 115, 54, 0.72), rgba(157, 115, 54, 0.2), transparent);
                position: relative;
              }

              .fitaDivider span {
                position: absolute;
                left: 40%;
                top: -0.9mm;
                width: 1.8mm;
                height: 1.8mm;
                transform: rotate(45deg);
                background: #b38b48;
              }

              .fitaName {
                font-size: 9.2px;
                font-weight: 950;
                line-height: 1.02;
                color: #111111;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .fitaMeta {
                margin-top: 0.4mm;
                font-size: 5.8px;
                color: #6b5b42;
              }

              .fitaPrice {
                font-size: 11px;
                font-weight: 950;
                color: #111111;
                line-height: 1;
              }

              .fitaRight {
                width: 38mm;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: flex-end;
                gap: 1.2mm;
                flex-shrink: 0;
              }

              .fitaQrBox {
                width: 14mm;
                height: 14mm;
                border-radius: 1.4mm;
                background: #ffffff;
                border: 1px solid rgba(157, 115, 54, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              }

              .fitaQr {
                width: 12.7mm;
                height: 12.7mm;
                display: block;
              }

              .fitaCta {
                width: 21mm;
                min-height: 13mm;
                border-radius: 1.8mm;
                background: #080808;
                border: 1px solid #d7b06d;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
                gap: 1.15mm;
                text-align: left;
                line-height: 1;
                padding: 0.8mm 1mm;
              }

              .ctaIcon {
                width: 5.2mm;
                height: 7.2mm;
                border-radius: 0.8mm;
                border: 0.45mm solid #d7b06d;
                color: #d7b06d;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 4.2px;
                font-weight: 950;
                flex-shrink: 0;
              }

              .ctaText {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: center;
              }

              .fitaCta strong {
                display: block;
                font-size: 6.2px;
                font-weight: 950;
                color: #ffffff;
                letter-spacing: 0.045em;
                white-space: nowrap;
              }

              .fitaCta span {
                display: block;
                margin-top: 0.65mm;
                font-size: 6.3px;
                font-weight: 950;
                color: #d7b06d;
                letter-spacing: 0.035em;
                white-space: nowrap;
              }

              @media print {
                body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
              }
            </style>
          </head>

          <body>
            <main class="sheet ${modelo}">
              ${htmlEtiquetas}
            </main>

            <script>
              window.onload = function () {
                setTimeout(function () {
                  window.print();
                }, 400);
              };
            </script>
          </body>
        </html>
      `);

      printWindow.document.close();
    } catch (error) {
      console.error(error);
      alert('Erro ao gerar etiquetas.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="etiquetasPage">
      <section className="hero">
        <div>
          <div className="eyebrow">Maison Noor CRM</div>
          <h1>Etiquetas com QR Code</h1>
          <p>
            Gere etiquetas para caixa 4x2cm ou fita olfativa 10x2cm com QR Code
            direto para a página do produto.
          </p>
        </div>

        <div className="heroActions">
          <button className="secondaryBtn" onClick={carregarProdutos}>
            Atualizar
          </button>

          <button className="primaryBtn" onClick={imprimirEtiquetas} disabled={gerando}>
            {gerando ? 'Gerando...' : 'Imprimir etiquetas'}
          </button>
        </div>
      </section>

      <section className="modeloBox">
        <button
          type="button"
          className={`modeloBtn ${modelo === 'caixa' ? 'active' : ''}`}
          onClick={() => setModelo('caixa')}
        >
          <strong>Caixa do produto</strong>
          <span>4cm x 2cm • compacta para embalagem</span>
        </button>

        <button
          type="button"
          className={`modeloBtn ${modelo === 'fita' ? 'active' : ''}`}
          onClick={() => setModelo('fita')}
        >
          <strong>Fita olfativa</strong>
          <span>10cm x 2cm • experiência olfativa e eventos</span>
        </button>
      </section>

      <section className="controls">
        <div className="searchBox">
          <span>🔎</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto ou marca..."
          />
        </div>

        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="todas">Todas categorias</option>
          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))}>
          <option value={1}>1 etiqueta por produto</option>
          <option value={2}>2 etiquetas por produto</option>
          <option value={4}>4 etiquetas por produto</option>
          <option value={6}>6 etiquetas por produto</option>
          <option value={8}>8 etiquetas por produto</option>
        </select>
      </section>

      <section className="actionsRow">
        <button onClick={selecionarTodosFiltrados}>Selecionar filtrados</button>
        <button onClick={limparSelecao}>Limpar seleção</button>
        <span>
          {selecionados.length} produto(s) selecionado(s) •{' '}
          {selecionados.length * quantidade} etiqueta(s)
        </span>
      </section>

      <section className="contentGrid">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Produtos</h2>
              <p>Selecione os itens para gerar as etiquetas.</p>
            </div>
          </div>

          <div className="productList">
            {carregando ? (
              <div className="empty">Carregando produtos...</div>
            ) : produtosFiltrados.length === 0 ? (
              <div className="empty">Nenhum produto encontrado.</div>
            ) : (
              produtosFiltrados.map((produto) => {
                const ativo = selecionados.includes(produto.id);

                return (
                  <button
                    key={produto.id}
                    type="button"
                    className={`productItem ${ativo ? 'active' : ''}`}
                    onClick={() => alternarProduto(produto.id)}
                  >
                    <div>
                      <strong>{nomeProduto(produto)}</strong>
                      <span>
                        {marcaProduto(produto)} • {moeda(precoProduto(produto))}
                      </span>
                    </div>

                    <b>{ativo ? '✓' : '+'}</b>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Prévia</h2>
              <p>
                Modelo selecionado:{' '}
                {modelo === 'caixa' ? 'Caixa 4x2cm' : 'Fita olfativa 10x2cm'}.
              </p>
            </div>
          </div>

          <div className="previewArea">
            {produtosSelecionados.length === 0 ? (
              <div className="empty">Selecione um produto para visualizar.</div>
            ) : (
              produtosSelecionados.slice(0, 4).map((produto) => (
                <div
                  className={`previewLabel ${modelo === 'caixa' ? 'previewCaixa' : 'previewFita'}`}
                  key={produto.id}
                >
                  {modelo === 'caixa' ? (
                    <>
                      <div className="previewCaixaLeft">
                        <div className="previewCaixaBrand">MAISON NOOR</div>
                        <div className="previewCaixaName">{nomeProduto(produto)}</div>
                        <div className="previewCaixaPrice">{moeda(precoProduto(produto))}</div>
                      </div>

                      <div className="previewCaixaQr">QR</div>
                    </>
                  ) : (
                    <>
                      <div className="previewLeft">
                        <div className="previewBrand">
                          <img src="/logo-maison-noor.png" alt="Maison Noor" />
                          <div>
                            <strong>MAISON NOOR</strong>
                            <span>Perfumes Árabes Premium</span>
                          </div>
                        </div>

                        <div className="previewDivider"><span /></div>

                        <div>
                          <div className="previewName">{nomeProduto(produto)}</div>
                          <div className="previewMeta">{marcaProduto(produto)}</div>
                        </div>

                        <div className="previewPrice">{moeda(precoProduto(produto))}</div>
                      </div>

                      <div className="previewFitaRight">
                        <div className="previewQr">QR</div>
                        <div className="previewCta">
                          <div className="previewCtaIcon">▣</div>
                          <div className="previewCtaText">
                            <strong>ESCANEIE</strong>
                            <span>E COMPRE</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <style jsx>{`
        .etiquetasPage {
          min-height: 100vh;
          padding: 22px 28px;
          color: #f8f5ef;
        }

        .hero,
        .controls,
        .panel,
        .actionsRow,
        .modeloBox {
          border: 1px solid rgba(200, 162, 106, 0.16);
          background:
            radial-gradient(circle at top right, rgba(200, 162, 106, 0.1), transparent 34%),
            rgba(255, 255, 255, 0.035);
          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.26);
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 24px;
          border-radius: 26px;
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
          font-size: 28px;
          font-weight: 950;
        }

        .hero p {
          margin: 7px 0 0;
          font-size: 13px;
          color: rgba(248, 245, 239, 0.68);
        }

        .heroActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .primaryBtn,
        .secondaryBtn {
          border-radius: 999px;
          padding: 11px 17px;
          font-size: 12px;
          font-weight: 900;
          border: 0;
          cursor: pointer;
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

        .primaryBtn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .modeloBox {
          margin-top: 14px;
          padding: 12px;
          border-radius: 22px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .modeloBtn {
          text-align: left;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.2);
          color: #fff;
          cursor: pointer;
        }

        .modeloBtn.active {
          border-color: rgba(215,176,109,0.6);
          background: rgba(215,176,109,0.12);
          box-shadow: inset 0 0 0 1px rgba(215,176,109,0.2);
        }

        .modeloBtn strong {
          display: block;
          font-size: 14px;
          font-weight: 950;
        }

        .modeloBtn span {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: rgba(248,245,239,0.58);
        }

        .controls {
          margin-top: 14px;
          padding: 12px;
          border-radius: 22px;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 10px;
        }

        .searchBox {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 12px;
          height: 42px;
          border-radius: 15px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .searchBox input,
        .controls select {
          width: 100%;
          height: 42px;
          border: 0;
          outline: none;
          background: transparent;
          color: #fff;
          font-weight: 700;
          font-size: 12px;
        }

        .controls select {
          padding: 0 12px;
          border-radius: 15px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .controls option {
          background: #111116;
          color: #fff;
        }

        .actionsRow {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .actionsRow button {
          border: 1px solid rgba(200,162,106,0.18);
          background: rgba(255,255,255,0.06);
          color: #fff;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .actionsRow span {
          color: rgba(248,245,239,0.62);
          font-size: 12px;
          font-weight: 700;
        }

        .contentGrid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .panel {
          border-radius: 24px;
          padding: 16px;
          min-height: 420px;
        }

        .panelHeader h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 950;
        }

        .panelHeader p {
          margin: 5px 0 0;
          color: rgba(248,245,239,0.58);
          font-size: 12px;
        }

        .productList {
          margin-top: 14px;
          display: grid;
          gap: 8px;
          max-height: 520px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .productList::-webkit-scrollbar {
          width: 6px;
        }

        .productList::-webkit-scrollbar-thumb {
          background: rgba(215,176,109,0.35);
          border-radius: 999px;
        }

        .productItem {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          text-align: left;
          padding: 11px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.055);
          background: rgba(0,0,0,0.2);
          color: #fff;
          cursor: pointer;
        }

        .productItem.active {
          border-color: rgba(215,176,109,0.55);
          background: rgba(215,176,109,0.1);
        }

        .productItem strong {
          display: block;
          font-size: 13px;
        }

        .productItem span {
          display: block;
          margin-top: 3px;
          color: rgba(248,245,239,0.5);
          font-size: 12px;
        }

        .productItem b {
          min-width: 30px;
          height: 30px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(215,176,109,0.14);
          color: #d7b06d;
        }

        .previewArea {
          margin-top: 16px;
          display: grid;
          gap: 12px;
        }

        .previewLabel {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid #d7b06d;
          background: #fff7ea;
          color: #111;
        }

        .previewCaixa {
          width: 280px;
          aspect-ratio: 4 / 2;
          align-items: center;
        }

        .previewFita {
          width: 100%;
          max-width: 440px;
          aspect-ratio: 10 / 2;
          background:
            radial-gradient(circle at 10% 0%, rgba(215, 176, 109, 0.16), transparent 34%),
            #fff7ea;
        }

        .previewCaixaLeft {
          min-width: 0;
        }

        .previewCaixaBrand {
          font-size: 8px;
          font-weight: 950;
          color: #9d7336;
          letter-spacing: 0.12em;
        }

        .previewCaixaName {
          margin-top: 6px;
          font-size: 13px;
          font-weight: 950;
          line-height: 1.05;
        }

        .previewCaixaPrice {
          margin-top: 5px;
          font-size: 14px;
          font-weight: 950;
        }

        .previewCaixaQr {
          width: 62px;
          height: 62px;
          border-radius: 8px;
          background: #fff;
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 950;
          border: 1px solid #ddd;
          flex-shrink: 0;
        }

        .previewLeft {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .previewBrand {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .previewBrand img {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          object-fit: cover;
        }

        .previewBrand strong {
          display: block;
          font-size: 10px;
          letter-spacing: 0.12em;
        }

        .previewBrand span {
          display: block;
          font-size: 8px;
          color: #6b5b42;
        }

        .previewDivider {
          height: 1px;
          width: 100%;
          margin: 5px 0;
          background: linear-gradient(90deg, rgba(157, 115, 54, 0.72), rgba(157, 115, 54, 0.2), transparent);
          position: relative;
        }

        .previewDivider span {
          position: absolute;
          left: 40%;
          top: -4px;
          width: 8px;
          height: 8px;
          transform: rotate(45deg);
          background: #b38b48;
        }

        .previewName {
          font-size: 15px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .previewMeta {
          font-size: 10px;
          color: #6b5b42;
        }

        .previewPrice {
          font-size: 20px;
          font-weight: 950;
          line-height: 1;
        }

        .previewFitaRight {
          width: 150px;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex-shrink: 0;
        }

        .previewQr {
          width: 58px;
          height: 58px;
          border-radius: 8px;
          background: #fff;
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 950;
          border: 1px solid #b38b48;
          align-self: center;
        }

        .previewCta {
          width: 84px;
          min-height: 50px;
          border-radius: 10px;
          background: #080808;
          border: 1px solid #d7b06d;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-align: left;
          line-height: 1;
          padding: 5px 6px;
        }

        .previewCtaIcon {
          width: 20px;
          height: 28px;
          border-radius: 4px;
          border: 2px solid #d7b06d;
          color: #d7b06d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 7px;
          font-weight: 950;
          flex-shrink: 0;
        }

        .previewCtaText {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
        }

        .previewCta strong {
          font-size: 11px;
          font-weight: 950;
          color: #ffffff;
          letter-spacing: 0.035em;
          white-space: nowrap;
        }

        .previewCta span {
          margin-top: 3px;
          font-size: 11px;
          font-weight: 950;
          color: #d7b06d;
          letter-spacing: 0.025em;
          white-space: nowrap;
        }

        .empty {
          padding: 28px;
          text-align: center;
          color: rgba(248,245,239,0.5);
          font-size: 13px;
        }

        @media (max-width: 1100px) {
          .contentGrid,
          .controls,
          .modeloBox {
            grid-template-columns: 1fr;
          }

          .hero {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
