import { NextResponse } from "next/server";

export async function GET() {
  try {
    const token = process.env.PAGBANK_TOKEN;

    const res = await fetch("https://sandbox.api.pagseguro.com/customers", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    return NextResponse.json({
      ok: true,
      status: res.status,
      statusText: res.statusText,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "Erro ao conectar",
    });
  }
}