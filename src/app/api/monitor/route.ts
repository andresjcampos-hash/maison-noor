import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const SITE_URL = "https://www.maisonnoor.com.br";

const PAGES_TO_CHECK = [
  "/",
  "/blog",
  "/sitemap.xml",
  "/robots.txt",
  "/checkout",
  "/produto/yara-moi",
  "/blog/yara-rosa-vs-fakhar-rose",
];

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

async function checkUrl(path: string) {
  const url = `${SITE_URL}${path}`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    return {
      url,
      ok: response.ok,
      status: response.status,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function GET() {
  const results = await Promise.all(PAGES_TO_CHECK.map(checkUrl));

  const failures = results.filter((item) => !item.ok);

  if (failures.length > 0) {
    const html = `
      <h2>🚨 Alerta Maison Noor</h2>

      <p>
        O robô encontrou problema em uma ou mais páginas do site.
      </p>

      <h3>Páginas com erro:</h3>

      <ul>
        ${failures
          .map(
            (item) => `
              <li>
                <strong>${item.url}</strong><br/>
                Status: ${item.status}<br/>
                Tempo: ${item.timeMs}ms
              </li>
            `
          )
          .join("")}
      </ul>

      <h3>Resumo completo:</h3>

      <ul>
        ${results
          .map(
            (item) => `
              <li>
                ${item.ok ? "✅" : "❌"}
                ${item.url}
                —
                Status ${item.status}
                —
                ${item.timeMs}ms
              </li>
            `
          )
          .join("")}
      </ul>
    `;

    await getResend().emails.send({
      from: "Maison Noor Monitor <onboarding@resend.dev>",
      to:
        process.env.MONITOR_ALERT_EMAIL ||
        "andrejscampos@gmail.com",
      subject:
        "🚨 Alerta: problema detectado no site Maison Noor",
      html,
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    total: results.length,
    failures: failures.length,
    results,
  });
}