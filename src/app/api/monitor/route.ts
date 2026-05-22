import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const SITE_URL = "https://www.maisonnoor.com.br";
const SLOW_LIMIT_MS = 5000;

type CheckType = "page" | "api" | "seo" | "env";

type CheckResult = {
  name: string;
  type: CheckType;
  url?: string;
  ok: boolean;
  status?: number;
  timeMs?: number;
  message?: string;
};

const PAGES_TO_CHECK = [
  { name: "Home", path: "/" },
  { name: "Blog", path: "/blog" },
  { name: "Sitemap", path: "/sitemap.xml" },
  { name: "Robots", path: "/robots.txt" },
  { name: "Checkout", path: "/checkout" },
  { name: "Produto Yara Moi", path: "/produto/yara-moi" },
  { name: "Artigo Yara vs Fakhar", path: "/blog/yara-rosa-vs-fakhar-rose" },
];

const API_TO_CHECK = [
  { name: "Google Shopping Feed", path: "/api/google-shopping-feed" },
];

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

async function fetchWithTimeout(url: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkPage(name: string, path: string): Promise<CheckResult> {
  const url = `${SITE_URL}${path}`;
  const start = Date.now();

  try {
    const response = await fetchWithTimeout(url);
    const timeMs = Date.now() - start;
    const isSlow = timeMs > SLOW_LIMIT_MS;

    return {
      name,
      type: "page",
      url,
      ok: response.ok && !isSlow,
      status: response.status,
      timeMs,
      message: !response.ok
        ? `Status inválido: ${response.status}`
        : isSlow
          ? `Página lenta: ${timeMs}ms`
          : "OK",
    };
  } catch (error) {
    return {
      name,
      type: "page",
      url,
      ok: false,
      status: 0,
      timeMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

async function checkApi(name: string, path: string): Promise<CheckResult> {
  const url = `${SITE_URL}${path}`;
  const start = Date.now();

  try {
    const response = await fetchWithTimeout(url);
    const timeMs = Date.now() - start;
    const isSlow = timeMs > SLOW_LIMIT_MS;

    return {
      name,
      type: "api",
      url,
      ok: response.ok && !isSlow,
      status: response.status,
      timeMs,
      message: !response.ok
        ? `API respondeu com status ${response.status}`
        : isSlow
          ? `API lenta: ${timeMs}ms`
          : "OK",
    };
  } catch (error) {
    return {
      name,
      type: "api",
      url,
      ok: false,
      status: 0,
      timeMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

async function checkSeo(): Promise<CheckResult[]> {
  const url = `${SITE_URL}/produto/yara-moi`;
  const start = Date.now();

  try {
    const response = await fetchWithTimeout(url);
    const html = await response.text();
    const timeMs = Date.now() - start;

    return [
      {
        name: "SEO Title",
        type: "seo",
        url,
        ok: html.includes("<title") || html.includes("Maison Noor"),
        status: response.status,
        timeMs,
        message: "Verificação de title/meta",
      },
      {
        name: "Schema Product",
        type: "seo",
        url,
        ok:
          html.includes('"@type":"Product"') ||
          html.includes('"@type": "Product"'),
        status: response.status,
        timeMs,
        message: "Verificação de Product Schema",
      },
      {
        name: "Schema Breadcrumb",
        type: "seo",
        url,
        ok:
          html.includes('"@type":"BreadcrumbList"') ||
          html.includes('"@type": "BreadcrumbList"'),
        status: response.status,
        timeMs,
        message: "Verificação de BreadcrumbList Schema",
      },
    ];
  } catch (error) {
    return [
      {
        name: "SEO Produto",
        type: "seo",
        url,
        ok: false,
        status: 0,
        timeMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Erro desconhecido",
      },
    ];
  }
}

function checkEnv(): CheckResult[] {
  return [
    {
      name: "RESEND_API_KEY",
      type: "env",
      ok: Boolean(process.env.RESEND_API_KEY),
      message: process.env.RESEND_API_KEY ? "Configurado" : "Não configurado",
    },
    {
      name: "MONITOR_ALERT_EMAIL",
      type: "env",
      ok: Boolean(process.env.MONITOR_ALERT_EMAIL),
      message: process.env.MONITOR_ALERT_EMAIL || "Usando e-mail fallback",
    },
    {
      name: "ASAAS_ENV",
      type: "env",
      ok: Boolean(process.env.ASAAS_ENV),
      message: process.env.ASAAS_ENV || "Não configurado",
    },
  ];
}

function montarHtml(results: CheckResult[], failures: CheckResult[]) {
  return `
    <div style="font-family:Arial,sans-serif;color:#2b2118">
      <h2>🚨 Alerta Maison Noor</h2>
      <p>O robô encontrou problema em uma ou mais verificações do site.</p>

      <h3>Problemas encontrados:</h3>
      <ul>
        ${failures
          .map(
            (item) => `
              <li>
                <strong>${item.name}</strong><br/>
                Tipo: ${item.type}<br/>
                ${item.url ? `URL: ${item.url}<br/>` : ""}
                ${item.status !== undefined ? `Status: ${item.status}<br/>` : ""}
                ${item.timeMs !== undefined ? `Tempo: ${item.timeMs}ms<br/>` : ""}
                Mensagem: ${item.message || "Falha detectada"}
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
                <strong>${item.name}</strong>
                — ${item.type}
                ${item.status !== undefined ? ` — Status ${item.status}` : ""}
                ${item.timeMs !== undefined ? ` — ${item.timeMs}ms` : ""}
                ${item.message ? ` — ${item.message}` : ""}
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

export async function GET() {
  const pageResults = await Promise.all(
    PAGES_TO_CHECK.map((item) => checkPage(item.name, item.path))
  );

  const apiResults = await Promise.all(
    API_TO_CHECK.map((item) => checkApi(item.name, item.path))
  );

  const seoResults = await checkSeo();
  const envResults = checkEnv();

  const results = [...pageResults, ...apiResults, ...seoResults, ...envResults];
  const failures = results.filter((item) => !item.ok);

  if (failures.length > 0) {
    await getResend().emails.send({
      from: "Maison Noor Monitor <onboarding@resend.dev>",
      to: process.env.MONITOR_ALERT_EMAIL || "andrejscampos@gmail.com",
      subject: "🚨 Alerta: problema detectado no monitor Maison Noor",
      html: montarHtml(results, failures),
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
