import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatBRL(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type ProdutoEtiqueta = {
  id: string;
  nome: string;
  marca: string;
  volume: string;
  preco: string;
  qrImage: string;
};

async function montarProdutoEtiqueta(id: string): Promise<ProdutoEtiqueta | null> {
  const snap = await adminDb.collection("products").doc(id).get();

  if (!snap.exists) return null;

  const produto = snap.data() as any;

  const nome = String(produto.nome || "Produto Maison Noor");
  const marca = String(produto.marca || "");
  const volume = produto.volumeMl ? `${produto.volumeMl}ml` : "";
  const preco = formatBRL(Number(produto.precoVenda || 0));

  const linkProduto = `https://www.maisonnoor.com.br/produto/${id}`;

  const qrImage = await QRCode.toDataURL(linkProduto, {
    margin: 0,
    width: 100,
  });

  return {
    id,
    nome,
    marca,
    volume,
    preco,
    qrImage,
  };
}

function desenharEtiqueta({
  pdf,
  item,
  x,
  y,
  etiquetaW,
  etiquetaH,
  logoPath,
  hasLogo,
}: {
  pdf: PDFKit.PDFDocument;
  item: ProdutoEtiqueta;
  x: number;
  y: number;
  etiquetaW: number;
  etiquetaH: number;
  logoPath: string;
  hasLogo: boolean;
}) {
  pdf
    .roundedRect(x, y, etiquetaW, etiquetaH, 6)
    .fillColor("#fcf2e5")
    .fill();

  pdf
    .roundedRect(x, y, etiquetaW, etiquetaH, 6)
    .lineWidth(0.5)
    .strokeColor("#d6b16f")
    .strokeOpacity(0.25)
    .stroke();

  if (hasLogo) {
    const logoSize = 22;
    const logoX = x + 6;
    const logoY = y + 6;
    const centerX = logoX + logoSize / 2;
    const centerY = logoY + logoSize / 2;

    pdf.save();
    pdf.circle(centerX, centerY, logoSize / 2).clip();

    pdf.image(logoPath, logoX, logoY, {
      width: logoSize,
      height: logoSize,
    });

    pdf.restore();

    pdf
      .circle(centerX, centerY, logoSize / 2)
      .lineWidth(0.6)
      .strokeColor("#d6b16f")
      .strokeOpacity(0.7)
      .stroke();

    pdf
      .fillColor("#111111")
      .fontSize(7)
      .font("Helvetica-Bold")
      .text("MAISON NOOR", x + 31, y + 8, {
        width: etiquetaW - 38,
        align: "left",
      });
  } else {
    pdf
      .fillColor("#111111")
      .fontSize(7)
      .font("Helvetica-Bold")
      .text("MAISON NOOR", x + 6, y + 8, {
        width: etiquetaW - 12,
        align: "center",
      });
  }

  pdf
    .fillColor("#111111")
    .fontSize(7.3)
    .font("Helvetica-Bold")
    .text(item.nome, x + 6, y + 26, {
      width: etiquetaW - 12,
      align: "center",
      lineGap: -1,
      height: 14,
      ellipsis: true,
    });

  pdf
    .fillColor("#666666")
    .fontSize(6)
    .font("Helvetica")
    .text([item.marca, item.volume].filter(Boolean).join(" • "), x + 6, y + 38, {
      width: etiquetaW - 12,
      align: "center",
      ellipsis: true,
    });

  pdf
    .moveTo(x + 10, y + 44)
    .lineTo(x + etiquetaW - 10, y + 44)
    .lineWidth(0.4)
    .strokeColor("#d6b16f")
    .strokeOpacity(0.22)
    .stroke();

  pdf
    .fillColor("#111111")
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(item.preco, x + 6, y + 45, {
      width: etiquetaW - 40,
      align: "center",
    });

  pdf.image(item.qrImage, x + etiquetaW - 30, y + etiquetaH - 30, {
    width: 22,
    height: 22,
  });
}

export async function GET(req: Request) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin não configurado" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");
    const copias = Math.max(1, Number(searchParams.get("copias") || 1));

    const ids = idsParam
      ? idsParam
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : id
      ? [id]
      : [];

    if (!ids.length) {
      return NextResponse.json(
        { error: "Informe id ou ids. Ex: ?id=abc ou ?ids=abc,def" },
        { status: 400 }
      );
    }

    const produtosBase = await Promise.all(ids.map((produtoId) => montarProdutoEtiqueta(produtoId)));
    const produtosValidos = produtosBase.filter(Boolean) as ProdutoEtiqueta[];

    if (!produtosValidos.length) {
      return NextResponse.json(
        { error: "Nenhum produto encontrado" },
        { status: 404 }
      );
    }

    const etiquetas: ProdutoEtiqueta[] = [];

    if (idsParam) {
      for (const produto of produtosValidos) {
        for (let i = 0; i < copias; i++) {
          etiquetas.push(produto);
        }
      }
    } else {
      for (let i = 0; i < 40; i++) {
        etiquetas.push(produtosValidos[0]);
      }
    }

    const logoPath = path.join(process.cwd(), "public", "logo-maison-noor.png");
    const hasLogo = fs.existsSync(logoPath);

    const pdf = new PDFDocument({ size: "A4", margin: 24 });

    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(Buffer.from(c)));

    const pdfBufferPromise = new Promise<Buffer>((resolve) => {
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const etiquetaW = 113.4;
    const etiquetaH = 56.7;
    const gapX = 8;
    const gapY = 8;
    const startX = 24;
    const startY = 24;
    const cols = 4;
    const rows = 10;
    const etiquetasPorPagina = cols * rows;

    etiquetas.forEach((item, index) => {
      if (index > 0 && index % etiquetasPorPagina === 0) {
        pdf.addPage();
      }

      const indexNaPagina = index % etiquetasPorPagina;
      const col = indexNaPagina % cols;
      const row = Math.floor(indexNaPagina / cols);

      const x = startX + col * (etiquetaW + gapX);
      const y = startY + row * (etiquetaH + gapY);

      desenharEtiqueta({
        pdf,
        item,
        x,
        y,
        etiquetaW,
        etiquetaH,
        logoPath,
        hasLogo,
      });
    });

    pdf.end();

    const buffer = await pdfBufferPromise;

    const filename = idsParam
      ? `etiquetas-lote-maison-noor.pdf`
      : `etiqueta-premium-${id}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar etiqueta:", error);

    return NextResponse.json(
      {
        error: "Erro ao gerar etiqueta",
        detalhe: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}