# Maison Noor - Correção automática da ordem da vitrine
# Execute este arquivo na raiz do projeto C:\Maison Noor

$ErrorActionPreference = "Stop"

$path = "src/app/page.tsx"

if (!(Test-Path $path)) {
  Write-Host "ERRO: arquivo não encontrado: $path" -ForegroundColor Red
  Write-Host "Execute este script dentro da pasta raiz do projeto Maison Noor." -ForegroundColor Yellow
  exit 1
}

$backup = "src/app/page.backup-ordem-vitrine-$(Get-Date -Format 'yyyyMMdd-HHmmss').tsx"
Copy-Item $path $backup
Write-Host "Backup criado em: $backup" -ForegroundColor Green

$content = Get-Content $path -Raw

# 1) Remove orderBy do import do firestore
$content = $content -replace "\r?\n\s*orderBy,", ""

# 2) Adiciona campos opcionais no type ProdutoFirebase
$oldTypePart = @'
  ativo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  observacoes?: string;
  imagem?: string;
  imageUrl?: string;
'@

$newTypePart = @'
  ativo?: boolean;
  createdAt?: any;
  updatedAt?: any;
  observacoes?: string;
  imagem?: string;
  imageUrl?: string;
  ordemVitrine?: number;
  ordem?: number;
  posicao?: number;
  destaque?: boolean;
  tipo?: string;
'@

if ($content.Contains($oldTypePart)) {
  $content = $content.Replace($oldTypePart, $newTypePart)
} elseif ($content -notmatch "ordemVitrine\?: number;") {
  $content = $content -replace "(\s*imageUrl\?: string;\s*\r?\n)", "`$1  ordemVitrine?: number;`r`n  ordem?: number;`r`n  posicao?: number;`r`n  destaque?: boolean;`r`n  tipo?: string;`r`n"
}

# 3) Adiciona helpers de ordenação após categoriaDescricao
$helpers = @'

function getProdutoTime(valor: any) {
  if (!valor) return 0;
  if (typeof valor?.toDate === "function") return valor.toDate().getTime();

  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? data.getTime() : 0;
}

function getProdutoOrdem(produto: any) {
  const ordem = Number(
    produto.ordemVitrine ??
      produto.ordem ??
      produto.posicao ??
      produto.position ??
      9999
  );

  return Number.isFinite(ordem) ? ordem : 9999;
}
'@

if ($content -notmatch "function getProdutoTime") {
  $patternCategoria = "function categoriaDescricao\(categoria: string\) \{[\s\S]*?\n\}"
  $matchCategoria = [regex]::Match($content, $patternCategoria)
  if (!$matchCategoria.Success) {
    throw "Não encontrei a função categoriaDescricao para inserir os helpers."
  }
  $content = $content.Substring(0, $matchCategoria.Index + $matchCategoria.Length) + $helpers + $content.Substring($matchCategoria.Index + $matchCategoria.Length)
}

# 4) Troca query com updatedAt por query simples
$content = $content.Replace('const q = query(productsCollection, orderBy("updatedAt", "desc"));', 'const q = query(productsCollection);')
$content = $content.Replace("const q = query(productsCollection, orderBy('updatedAt', 'desc'));", "const q = query(productsCollection);")

# 5) Adiciona campos extras no arr.push, se ainda não existirem
$oldPushPart = @'
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            observacoes: data.observacoes,
            imagem: data.imagem,
            imageUrl: data.imageUrl,
'@

$newPushPart = @'
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            observacoes: data.observacoes,
            imagem: data.imagem,
            imageUrl: data.imageUrl,
            ordemVitrine: data.ordemVitrine,
            ordem: data.ordem,
            posicao: data.posicao,
            destaque: data.destaque,
            tipo: data.tipo,
'@

if ($content.Contains($oldPushPart) -and $content -notmatch "ordemVitrine: data\.ordemVitrine") {
  $content = $content.Replace($oldPushPart, $newPushPart)
}

# 6) Substitui o bloco produtosProntos por versão com ordenação correta
$newProdutosProntos = @'
  const produtosProntos = useMemo(() => {
    return produtos
      .map((produto) => {
        const estoque = Number(produto.estoque) || 0;
        const reservado = Number(produto.reservado) || 0;
        const disponivel = Math.max(0, estoque - reservado);
        const preco = Number(produto.precoVenda) || 0;

        return {
          ...produto,
          disponivel,
          precoFinal: preco,
          categoriaSite: categoriaSite(produto.categoria),
          imagemFinal: getImagemProduto(produto),
          tamanho: produto.volumeMl ? `${produto.volumeMl}ml` : "—",
          indisponivel: disponivel <= 0,
          isKit: ehKit(produto),
          isPromocao: ehPromocao(produto),
        };
      })
      .filter((produto) => produto.ativo !== false)
      .filter((produto) => produto.precoFinal > 0)
      .sort((a: any, b: any) => {
        // 1) Produtos disponíveis sempre aparecem primeiro.
        // Produto sem estoque/reservado fica no final da vitrine.
        if (a.indisponivel !== b.indisponivel) {
          return a.indisponivel ? 1 : -1;
        }

        // 2) Destaques primeiro, caso você use o campo destaque no CRM.
        const destaqueA = a.destaque === true ? 1 : 0;
        const destaqueB = b.destaque === true ? 1 : 0;
        if (destaqueA !== destaqueB) return destaqueB - destaqueA;

        // 3) Ordem manual da vitrine, se existir no produto.
        // Menor número aparece primeiro: 1, 2, 3...
        const ordemA = getProdutoOrdem(a);
        const ordemB = getProdutoOrdem(b);
        if (ordemA !== ordemB) return ordemA - ordemB;

        // 4) Produtos mais novos primeiro, mas usando createdAt, não updatedAt.
        // Assim editar estoque/preço no CRM não joga o item para o topo.
        const criadoA = getProdutoTime(a.createdAt);
        const criadoB = getProdutoTime(b.createdAt);
        if (criadoA !== criadoB) return criadoB - criadoA;

        // 5) Fallback alfabético.
        return String(a.nome || "").localeCompare(String(b.nome || ""));
      });
  }, [produtos]);
'@

$patternProdutosProntos = "  const produtosProntos = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[produtos\]\);"
$matchProdutosProntos = [regex]::Match($content, $patternProdutosProntos)
if (!$matchProdutosProntos.Success) {
  throw "Não encontrei o bloco produtosProntos para substituir."
}
$content = $content.Substring(0, $matchProdutosProntos.Index) + $newProdutosProntos + $content.Substring($matchProdutosProntos.Index + $matchProdutosProntos.Length)

# 7) Grava arquivo final
Set-Content -Path $path -Value $content -Encoding UTF8

Write-Host "Correção aplicada com sucesso em $path" -ForegroundColor Green
Write-Host "Agora rode: npm run build" -ForegroundColor Cyan
Write-Host "Se buildar certo: git add src/app/page.tsx && git commit -m 'Corrige ordem da vitrine' && git push" -ForegroundColor Cyan
