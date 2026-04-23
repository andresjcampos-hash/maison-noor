import { Suspense } from "react";
import CheckoutSucessoClient from "./sucesso-client";

function SucessoFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(215,192,160,0.20), transparent 24%), #F5EFE6",
        color: "#2B2B2B",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
          padding: "24px 18px 40px",
        }}
      >
        <div
          style={{
            borderRadius: 24,
            border: "1px solid #E2D2BF",
            background:
              "linear-gradient(180deg, rgba(255,252,248,0.96), rgba(244,234,220,0.96))",
            boxShadow: "0 14px 30px rgba(62, 44, 24, 0.07)",
            padding: "24px 24px",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#B1874E",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
            }}
          >
            Maison Noor
          </p>

          <h1
            style={{
              margin: "8px 0 10px",
              color: "#3A2F29",
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              fontSize: 30,
            }}
          >
            Carregando seu pedido...
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6D6157",
              fontSize: 14,
              lineHeight: 1.65,
            }}
          >
            Estamos preparando a confirmação da sua compra.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function CheckoutSucessoPage() {
  return (
    <Suspense fallback={<SucessoFallback />}>
      <CheckoutSucessoClient />
    </Suspense>
  );
}