"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Nav from "@/components/Nav";
import { AuthGuard } from "@/components/AuthGuard";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="crmShell">
        <aside className="crmNav" aria-label="Navegação CRM">
          <div className="crmNavInner">
            <div className="brand">
              <div className="brandTop">
                <div className="brandLogoWrap">
                  <Image
                    src="/logo-maison-noor.png"
                    alt="Logo Maison Noor"
                    width={40}
                    height={40}
                    className="brandLogo"
                    priority
                  />
                </div>

                <div className="brandText">
                  <div className="kicker">Maison Noor</div>
                  <div className="title">CRM</div>
                </div>
              </div>

              <div className="brandLine" aria-hidden />
              <div className="brandHint">
                Vendas • Leads • Estoque • Financeiro
              </div>
            </div>

            <Nav />

            <div className="navFooter">
              <div className="navFooterLine" aria-hidden />
              <div className="navFooterText">
                <span className="dot" aria-hidden />
                <span className="muted">Ambiente: Produção</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="crmMain">
          <div className="crmMainInner">{children}</div>
        </main>

        <style jsx>{`
          .crmShell {
            min-height: 100vh;
            background:
              radial-gradient(
                1200px 600px at 20% -10%,
                rgba(200, 162, 106, 0.14),
                transparent 60%
              ),
              radial-gradient(
                900px 500px at 90% 10%,
                rgba(200, 162, 106, 0.1),
                transparent 55%
              ),
              #08080c;
            color: #f2f2f2;
            overflow-x: hidden;
          }

          .crmNav {
            position: fixed;
            left: 0;
            top: 0;
            z-index: 50;
            width: 280px;
            height: 100vh;
            border-right: 1px solid rgba(200, 162, 106, 0.16);
            background:
              radial-gradient(
                900px 380px at 20% 0%,
                rgba(200, 162, 106, 0.12),
                transparent 60%
              ),
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.07),
                rgba(255, 255, 255, 0.025)
              ),
              rgba(10, 10, 14, 0.96);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            overflow-y: auto;
            overflow-x: hidden;
            box-shadow: 18px 0 50px rgba(0, 0, 0, 0.28);
          }

          .crmNav::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background: linear-gradient(
              90deg,
              rgba(200, 162, 106, 0.08),
              transparent 40%,
              rgba(255, 255, 255, 0.02)
            );
          }

          .crmNavInner {
            position: relative;
            min-height: 100vh;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 14px;
          }

          .brand {
            padding: 14px;
            border-radius: 20px;
            border: 1px solid rgba(200, 162, 106, 0.2);
            background:
              radial-gradient(
                700px 220px at 10% 0%,
                rgba(200, 162, 106, 0.16),
                transparent 55%
              ),
              rgba(0, 0, 0, 0.24);
            box-shadow:
              0 14px 34px rgba(0, 0, 0, 0.36),
              inset 0 1px 0 rgba(255, 255, 255, 0.05);
          }

          .brandTop {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .brandLogoWrap {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            padding: 3px;
            background: radial-gradient(
              circle at 30% 0,
              rgba(255, 255, 255, 0.22),
              rgba(200, 162, 106, 0.08)
            );
            border: 1px solid rgba(200, 162, 106, 0.52);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            overflow: hidden;
          }

          .brandLogo {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
            display: block;
          }

          .brandText {
            display: grid;
            gap: 3px;
          }

          .kicker {
            font-size: 10px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: rgba(200, 162, 106, 0.95);
            font-weight: 950;
          }

          .title {
            font-size: 20px;
            font-weight: 950;
            letter-spacing: 0.02em;
            line-height: 1.05;
            background: linear-gradient(
              180deg,
              #ffffff,
              rgba(200, 162, 106, 0.95)
            );
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
          }

          .brandLine {
            margin-top: 11px;
            height: 1px;
            background: linear-gradient(
              90deg,
              rgba(200, 162, 106, 0.36),
              rgba(255, 255, 255, 0.06),
              rgba(200, 162, 106, 0.2)
            );
          }

          .brandHint {
            margin-top: 9px;
            font-size: 11px;
            opacity: 0.76;
            letter-spacing: 0.02em;
            line-height: 1.35;
          }

          .navFooter {
            margin-top: auto;
            padding: 10px 4px 2px;
          }

          .navFooterLine {
            height: 1px;
            margin-bottom: 10px;
            background: linear-gradient(
              90deg,
              transparent,
              rgba(200, 162, 106, 0.25),
              transparent
            );
          }

          .navFooterText {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-radius: 14px;
            border: 1px solid rgba(200, 162, 106, 0.14);
            background: rgba(0, 0, 0, 0.22);
          }

          .dot {
            width: 9px;
            height: 9px;
            border-radius: 999px;
            background: #d6b16f;
            box-shadow: 0 0 16px rgba(214, 177, 111, 0.7);
            flex-shrink: 0;
          }

          .muted {
            font-size: 12px;
            color: rgba(242, 242, 242, 0.72);
            font-weight: 800;
          }

          .crmMain {
            min-height: 100vh;
            margin-left: 280px;
          }

          .crmMainInner {
            min-height: 100vh;
            width: 100%;
          }

          @media (max-width: 900px) {
            .crmNav {
              position: relative;
              width: 100%;
              height: auto;
              min-height: auto;
              border-right: 0;
              border-bottom: 1px solid rgba(200, 162, 106, 0.16);
            }

            .crmNavInner {
              min-height: auto;
            }

            .crmMain {
              margin-left: 0;
            }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}