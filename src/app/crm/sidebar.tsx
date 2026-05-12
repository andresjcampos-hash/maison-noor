"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Nav from "@/components/Nav";
import { AuthGuard } from "@/components/AuthGuard";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="crmShell">
        <aside className="crmNav" aria-label="Navegação ERP Maison Noor">
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
                  <div className="title">ERP</div>
                </div>
              </div>

              <div className="brandLine" aria-hidden />
              <div className="brandHint">
                BI • Fiscal • Financeiro • Estoque • IA
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

          .crmNav::after {
            content: "";
            position: absolute;
            top: 0;
            right: 0;
            width: 1px;
            height: 100%;
            background: linear-gradient(
              180deg,
              transparent,
              rgba(200, 162, 106, 0.62),
              transparent
            );
            opacity: 0.42;
            pointer-events: none;
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
            position: relative;
            overflow: hidden;
            padding: 14px;
            border-radius: 20px;
            border: 1px solid rgba(200, 162, 106, 0.22);
            background:
              radial-gradient(
                700px 220px at 10% 0%,
                rgba(200, 162, 106, 0.18),
                transparent 55%
              ),
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.035),
                rgba(255, 255, 255, 0.008)
              ),
              rgba(0, 0, 0, 0.24);
            box-shadow:
              0 14px 34px rgba(0, 0, 0, 0.36),
              inset 0 1px 0 rgba(255, 255, 255, 0.05);
          }

          .brand::before {
            content: "";
            position: absolute;
            inset: -80px auto auto -80px;
            width: 180px;
            height: 180px;
            border-radius: 999px;
            background: radial-gradient(
              circle,
              rgba(200, 162, 106, 0.16),
              transparent 64%
            );
            pointer-events: none;
          }

          .brandTop {
            position: relative;
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
            box-shadow: 0 0 24px rgba(200, 162, 106, 0.1);
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
            font-size: 23px;
            font-weight: 900;
            letter-spacing: 0.04em;
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
            position: relative;
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
            opacity: 0.78;
            letter-spacing: 0.02em;
            line-height: 1.35;
          }

          .navFooter {
            margin-top: auto;
            padding: 10px 4px 2px;
          }

          .navFooterLine {
            height: 1px;
            background: linear-gradient(
              90deg,
              transparent,
              rgba(200, 162, 106, 0.24),
              transparent
            );
          }

          .navFooterText {
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 11px;
            opacity: 0.7;
          }

          .dot {
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: #4dff9a;
            box-shadow: 0 0 14px rgba(77, 255, 154, 0.75);
          }

          .muted {
            color: rgba(242, 242, 242, 0.72);
          }

          .crmMain {
            min-height: 100vh;
            padding-left: 280px;
          }

          .crmMainInner {
            min-height: 100vh;
            padding: 24px;
          }

          @media (max-width: 980px) {
            .crmNav {
              position: relative;
              width: 100%;
              height: auto;
              border-right: 0;
              border-bottom: 1px solid rgba(200, 162, 106, 0.16);
            }

            .crmNavInner {
              min-height: auto;
            }

            .crmMain {
              padding-left: 0;
            }

            .crmMainInner {
              padding: 14px;
            }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
