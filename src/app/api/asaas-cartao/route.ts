import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      erro: true,
      mensagem: "Cartão Asaas ainda não implementado.",
    },
    { status: 501 }
  );
}