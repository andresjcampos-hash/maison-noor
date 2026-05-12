"use client";

import Link from "next/link";

export default function NovaFiscalPage() {
  return (
    <main style={{ padding: 24, color: "#fff" }}>
      <h1>Nova Nota Fiscal</h1>
      <p>Módulo em preparação.</p>

      <Link href="/crm/fiscal">
        Voltar para Fiscal
      </Link>
    </main>
  );
}