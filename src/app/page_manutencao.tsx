"use client";

import Image from "next/image";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(212,175,119,0.18), transparent 34%), linear-gradient(180deg, #f8f1e8, #efe3d4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Inter, Arial, sans-serif",
        color: "#2b2118",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "760px",
          background: "rgba(255, 250, 244, 0.92)",
          border: "1px solid rgba(216, 193, 162, 0.9)",
          borderRadius: "32px",
          padding: "42px 28px",
          textAlign: "center",
          boxShadow: "0 28px 70px rgba(55, 38, 22, 0.14)",
        }}
      >
        <Image
          src="/logo-maison-noor.png"
          alt="Maison Noor Parfums"
          width={118}
          height={118}
          priority
          style={{
            borderRadius: "50%",
            marginBottom: "24px",
            border: "2px solid rgba(212,175,119,0.45)",
            boxShadow: "0 14px 34px rgba(80, 52, 25, 0.14)",
          }}
        />

        <p
          style={{
            margin: "0 0 10px",
            color: "#a8844c",
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Maison Noor Parfums
        </p>

        <h1
          style={{
            margin: "0 0 14px",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(34px, 6vw, 58px)",
            lineHeight: 1.05,
            color: "#2b2118",
            letterSpacing: "-0.05em",
          }}
        >
          Estamos preparando uma experiência ainda mais especial.
        </h1>

        <p
          style={{
            margin: "0 auto 28px",
            maxWidth: "560px",
            color: "#6e5a49",
            fontSize: "17px",
            lineHeight: 1.7,
          }}
        >
          Nosso site está passando por ajustes para deixar sua experiência de compra
          mais elegante, rápida e segura.
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: "26px",
          }}
        >
          <a
            href="https://wa.me/5512982389658?text=Olá! Vim pelo site da Maison Noor e gostaria de atendimento."
            target="_blank"
            rel="noreferrer"
            style={{
              minHeight: "52px",
              padding: "0 24px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, #d4af77, #be9155)",
              color: "#241a12",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              fontWeight: 900,
              boxShadow: "0 16px 30px rgba(120, 87, 45, 0.18)",
            }}
          >
            Comprar pelo WhatsApp
          </a>

          <a
            href="https://instagram.com/maison.noor.parfums"
            target="_blank"
            rel="noreferrer"
            style={{
              minHeight: "52px",
              padding: "0 24px",
              borderRadius: "999px",
              background: "#fffaf4",
              color: "#6e5844",
              border: "1px solid #dcc7aa",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Ver Instagram
          </a>
        </div>

        <p
          style={{
            margin: 0,
            color: "#8b7a6a",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          Atendimento Maison Noor: WhatsApp (12) 98238-9658
        </p>
      </section>
    </main>
  );
}