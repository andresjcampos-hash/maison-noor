"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

type NavLink = {
  href: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
};

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v5h-7V4zM4 13h7v7H4v-7zm9 7v-9h7v9h-7z" />
    </svg>
  );
}

function IconVip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2l2.45 4.96l5.47.79l-3.96 3.86l.94 5.45L12 14.8l-4.9 2.58l.94-5.45L4.08 7.75l5.47-.79L12 2Z" />
    </svg>
  );
}

function IconKanban() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 5h6v14H4V5Zm10 0h6v8h-6V5Zm0 10h6v4h-6v-4Z" />
    </svg>
  );
}

function IconPedidos() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 7V6a5 5 0 0 1 10 0v1h3v14H4V7h3Zm2 0h6V6a3 3 0 0 0-6 0v1Z" />
    </svg>
  );
}

function IconFinanceiro() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 4h14v2H5zm0 4h14v2H5zm0 4h8v2H5zm0 4h8v2H5zm10 0l2.5-2.5l1.4 1.4L16.4 19l2.5 2.5l-1.4 1.4L15 20.4l-2.5 2.5l-1.4-1.4L13.6 19l-2.5-2.5l1.4-1.4z" />
    </svg>
  );
}

function IconProdutos() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 3h6v2h-1v2l2 2v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V9l2-2V5H9V3Zm2 7h2V8.8L12 8l-1 0.8V10Z" />
    </svg>
  );
}

function IconRelatorios() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v16H3V5a2 2 0 0 1 2-2Zm2 4v2h10V7H7Zm0 4v2h10v-2H7Zm0 4v2h6v-2H7Z" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const links: NavLink[] = useMemo(
    () => [
      { href: "/crm", label: "Dashboard", icon: <IconDashboard /> },
      { href: "/crm/clientes-vip", label: "Clientes VIP", icon: <IconVip /> },
      { href: "/crm/kanban", label: "Kanban", icon: <IconKanban /> },
      { href: "/crm/pedidos", label: "Pedidos", icon: <IconPedidos /> },
      { href: "/crm/financeiro", label: "Financeiro", icon: <IconFinanceiro /> },
      { href: "/crm/bi", label: "BI Executivo", icon: "📊" },
      { href: "/crm/ia", label: "IA Empresarial", icon: "🧠" },
      { href: "/crm/fiscal", label: "Fiscal", icon: "🧾" },
      { href: "/crm/fornecedores", label: "Fornecedores", icon: "🏢" },
      { href: "/crm/produtos", label: "Produtos", icon: <IconProdutos /> },
      { href: "/crm/estoque-inteligente", label: "Estoque Inteligente", icon: "📦" },
      { href: "/crm/relatorios", label: "Relatórios", icon: <IconRelatorios /> },
    ],
    []
  );

  function isActive(href: string) {
    if (!pathname) return false;
    if (href === "/crm") return pathname === "/crm" || pathname === "/crm/";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Erro ao sair:", e);
    } finally {
      router.replace("/login");
      setLoggingOut(false);
    }
  }

  return (
    <nav className="crmNavRoot" aria-label="Menu do CRM">
      <div className="crmNav">
        <div className="crmNavSectionTitle">
          <span>Menu</span>
        </div>

        <div className="crmNavList">
          {links.map((l, index) => {
            const active = isActive(l.href);
            const hovered = hoveredHref === l.href;

            return (
              <Link
                key={l.href}
                href={l.href}
                className={`crmNavItem ${active ? "crmNavItemActive" : ""} ${hovered ? "crmNavItemHovered" : ""}`}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => setHoveredHref(l.href)}
                onMouseLeave={() => setHoveredHref(null)}
                style={{
                  animationDelay: `${index * 22}ms`,
                  transform: hovered
                    ? "translateX(8px) translateY(-1px) scale(1.018)"
                    : active
                      ? "translateX(2px) scale(1.006)"
                      : "translateX(0) scale(1)",
                }}
              >
                <span className="crmNavRail" aria-hidden />
                <span className="crmNavSweep" aria-hidden />
                <span className="crmNavLight" aria-hidden />

                <span className="crmNavItemInner">
                  <span className="crmNavIcon" aria-hidden>
                    {l.icon}
                  </span>
                  <span className="crmNavLabel">{l.label}</span>
                  <span className="crmNavArrow" aria-hidden>
                    ›
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          className="crmNavLogoutButton"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <span>{loggingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>

      <style jsx>{`
        .crmNavRoot {
          height: 100%;
          overflow-y: auto;
          overflow-x: visible;
          padding-right: 8px;
        }

        .crmNav {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: visible;
          animation: crmNavEnter 0.35s ease both;
        }

        .crmNavSectionTitle {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 6px 2px 0;
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(244, 241, 235, 0.64);
          font-weight: 760;
        }

        .crmNavSectionTitle::after {
          content: "";
          height: 1px;
          flex: 1;
          background: linear-gradient(90deg, rgba(200, 162, 106, 0.48), transparent);
          animation: crmLineBreath 3.6s ease-in-out infinite;
        }

        .crmNavList {
          display: grid;
          gap: 7px;
          overflow: visible;
        }

        .crmNavItem {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          min-height: 42px;
          border-radius: 15px;
          text-decoration: none;
          color: rgba(244, 241, 235, 0.90);
          border: 1px solid rgba(255, 255, 255, 0.06);
          background:
            radial-gradient(circle at 12% 50%, rgba(200, 162, 106, 0.07), transparent 36%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(0, 0, 0, 0.18));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
          padding: 6px 10px;
          will-change: transform, box-shadow, background, border-color;
          transition:
            transform 0.22s cubic-bezier(.16,1,.3,1),
            box-shadow 0.22s cubic-bezier(.16,1,.3,1),
            border-color 0.18s ease,
            background 0.18s ease,
            filter 0.18s ease;
          animation: crmNavItemEnter 0.38s cubic-bezier(.16,1,.3,1) both;
        }

        .crmNavItem::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          border-radius: inherit;
          background:
            radial-gradient(circle at 8% 50%, rgba(200, 162, 106, 0.22), transparent 37%),
            linear-gradient(90deg, rgba(200, 162, 106, 0.14), rgba(255,255,255,0.028), transparent);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .crmNavRail {
          position: absolute;
          left: 4px;
          top: 50%;
          width: 3px;
          height: 0;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255, 235, 196, 0.98), rgba(200, 162, 106, 0.35));
          box-shadow: 0 0 16px rgba(200, 162, 106, 0.50);
          transform: translateY(-50%);
          opacity: 0;
          transition: height 0.22s ease, opacity 0.18s ease;
        }

        .crmNavSweep {
          position: absolute;
          inset: 2px auto 2px -70%;
          width: 46%;
          border-radius: inherit;
          background: linear-gradient(90deg, transparent, rgba(255, 237, 204, 0.18), transparent);
          transform: skewX(-18deg);
          opacity: 0;
          pointer-events: none;
        }

        .crmNavLight {
          position: absolute;
          right: 12px;
          top: 50%;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: rgba(255, 227, 183, 0.88);
          box-shadow: 0 0 16px rgba(200, 162, 106, 0.75);
          opacity: 0;
          transform: translateY(-50%) scale(0.4);
          pointer-events: none;
        }

        .crmNavItemInner {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          column-gap: 10px;
          min-width: 0;
        }

        .crmNavIcon {
          width: 29px;
          height: 29px;
          min-width: 29px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(200, 162, 106, 0.18);
          background: rgba(255, 255, 255, 0.035);
          color: rgba(255, 235, 198, 0.88);
          font-size: 14px;
          transition:
            transform 0.22s cubic-bezier(.16,1,.3,1),
            border-color 0.18s ease,
            background 0.18s ease,
            box-shadow 0.18s ease,
            color 0.18s ease;
        }

        .crmNavIcon :global(svg) {
          transition: transform 0.18s ease;
        }

        .crmNavLabel {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 13.25px;
          line-height: 1;
          letter-spacing: 0.003em;
          font-weight: 590;
          color: rgba(244, 241, 235, 0.86);
          text-shadow: none;
          transition:
            color 0.18s ease,
            transform 0.18s ease,
            font-weight 0.18s ease,
            letter-spacing 0.18s ease;
        }

        .crmNavArrow {
          color: rgba(200, 162, 106, 0.52);
          font-size: 17px;
          line-height: 1;
          opacity: 0;
          transform: translateX(-5px);
          transition: opacity 0.18s ease, transform 0.18s ease, color 0.18s ease;
        }

        .crmNavItem:hover,
        .crmNavItemHovered {
          z-index: 5;
          border-color: rgba(200, 162, 106, 0.48);
          background:
            radial-gradient(circle at 10% 50%, rgba(200, 162, 106, 0.22), transparent 42%),
            linear-gradient(90deg, rgba(200, 162, 106, 0.16), rgba(255,255,255,0.045), rgba(0,0,0,0.12));
          box-shadow:
            0 13px 30px rgba(0, 0, 0, 0.34),
            0 0 24px rgba(200, 162, 106, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.075);
          filter: saturate(1.08);
        }

        .crmNavItem:hover::before,
        .crmNavItemHovered::before {
          opacity: 1;
        }

        .crmNavItem:hover .crmNavSweep,
        .crmNavItemHovered .crmNavSweep {
          opacity: 1;
          animation: crmSweepMove 0.68s ease both;
        }

        .crmNavItem:hover .crmNavLight,
        .crmNavItemHovered .crmNavLight {
          animation: crmLightPop 0.5s ease both;
        }

        .crmNavItem:hover .crmNavIcon,
        .crmNavItemHovered .crmNavIcon {
          transform: translateY(-1px) scale(1.06);
          border-color: rgba(200, 162, 106, 0.54);
          background: rgba(200, 162, 106, 0.16);
          color: rgba(255, 238, 205, 0.98);
          box-shadow: 0 0 18px rgba(200, 162, 106, 0.20);
        }

        .crmNavItem:hover .crmNavIcon :global(svg),
        .crmNavItemHovered .crmNavIcon :global(svg) {
          transform: scale(1.04);
        }

        .crmNavItem:hover .crmNavLabel,
        .crmNavItemHovered .crmNavLabel {
          color: rgba(255, 239, 210, 0.98);
          font-weight: 620;
          letter-spacing: 0.006em;
          transform: translateX(1px);
        }

        .crmNavItem:hover .crmNavArrow,
        .crmNavItemHovered .crmNavArrow {
          opacity: 1;
          transform: translateX(0);
          color: rgba(255, 232, 188, 0.88);
        }

        .crmNavItem:active {
          transform: translateX(5px) translateY(0) scale(0.997) !important;
        }

        .crmNavItem:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px rgba(200, 162, 106, 0.16), 0 13px 30px rgba(0, 0, 0, 0.34);
          border-color: rgba(200, 162, 106, 0.56);
        }

        .crmNavItemActive {
          border-color: rgba(200, 162, 106, 0.58);
          background:
            radial-gradient(circle at 12% 50%, rgba(200, 162, 106, 0.24), transparent 42%),
            linear-gradient(90deg, rgba(200, 162, 106, 0.18), rgba(200, 162, 106, 0.055));
          box-shadow:
            0 0 0 3px rgba(200, 162, 106, 0.085),
            0 10px 26px rgba(0, 0, 0, 0.28),
            0 0 20px rgba(200, 162, 106, 0.09),
            inset 0 1px 0 rgba(255, 255, 255, 0.075);
          animation:
            crmNavItemEnter 0.38s cubic-bezier(.16,1,.3,1) both,
            crmActiveBreath 3.6s ease-in-out infinite;
        }

        .crmNavItemActive::before {
          opacity: 0.92;
        }

        .crmNavItemActive .crmNavRail {
          height: 62%;
          opacity: 1;
        }

        .crmNavItemActive .crmNavIcon {
          border-color: rgba(200, 162, 106, 0.48);
          background: rgba(200, 162, 106, 0.17);
          color: rgba(255, 234, 198, 0.98);
        }

        .crmNavItemActive .crmNavLabel {
          color: rgba(255, 235, 201, 0.96);
          font-weight: 690;
          letter-spacing: 0.004em;
        }

        .crmNavItemActive .crmNavArrow {
          opacity: 0.92;
          transform: translateX(0);
          color: rgba(255, 232, 188, 0.78);
        }

        .crmNavLogoutButton {
          position: relative;
          overflow: hidden;
          margin-top: 10px;
          min-height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(200, 162, 106, 0.34);
          background:
            radial-gradient(circle at 14% 50%, rgba(200, 162, 106, 0.22), transparent 42%),
            linear-gradient(90deg, rgba(200, 162, 106, 0.24), rgba(200, 162, 106, 0.10));
          color: rgba(255, 235, 204, 0.96);
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 760;
          cursor: pointer;
          transition:
            transform 0.2s cubic-bezier(.16,1,.3,1),
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        .crmNavLogoutButton::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 239, 210, 0.18), transparent);
          transform: translateX(-110%);
          opacity: 0;
        }

        .crmNavLogoutButton:hover {
          transform: translateY(-1px) scale(1.01);
          border-color: rgba(255, 222, 166, 0.62);
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32), 0 0 22px rgba(200, 162, 106, 0.14);
        }

        .crmNavLogoutButton:hover::before {
          opacity: 1;
          animation: crmSweepMove 0.7s ease both;
        }

        .crmNavLogoutButton:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes crmNavEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes crmNavItemEnter {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes crmLineBreath {
          0%, 100% { opacity: .44; }
          50% { opacity: .9; }
        }

        @keyframes crmActiveBreath {
          0%, 100% { box-shadow: 0 0 0 3px rgba(200, 162, 106, 0.08), 0 10px 26px rgba(0, 0, 0, 0.28), 0 0 18px rgba(200, 162, 106, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.075); }
          50% { box-shadow: 0 0 0 3px rgba(200, 162, 106, 0.12), 0 12px 30px rgba(0, 0, 0, 0.30), 0 0 28px rgba(200, 162, 106, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.09); }
        }

        @keyframes crmSweepMove {
          0% { transform: translateX(-120%) skewX(-18deg); }
          100% { transform: translateX(340%) skewX(-18deg); }
        }

        @keyframes crmLightPop {
          0% { opacity: 0; transform: translateY(-50%) scale(.4); }
          38% { opacity: 1; transform: translateY(-50%) scale(1); }
          100% { opacity: .25; transform: translateY(-50%) scale(.75); }
        }

        @media (prefers-reduced-motion: reduce) {
          .crmNav,
          .crmNavItem,
          .crmNavItemActive,
          .crmNavSectionTitle::after,
          .crmNavSweep,
          .crmNavLight,
          .crmNavLogoutButton::before {
            animation: none !important;
          }

          .crmNavItem,
          .crmNavItem:hover,
          .crmNavLogoutButton:hover {
            transform: none !important;
          }
        }

        @media (max-width: 900px) {
          .crmNavList { gap: 8px; }
          .crmNavLabel { font-size: 13px; }
          .crmNavIcon { width: 27px; height: 27px; min-width: 27px; }
        }
      `}</style>
    </nav>
  );
}
