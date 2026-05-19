// app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const SITE_URL = "https://www.maisonnoor.com.br";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1F1A14",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Maison Noor Parfums | Perfumes Árabes Premium",
    template: "%s | Maison Noor Parfums",
  },
  description:
    "Perfumes árabes originais com curadoria premium, fragrâncias marcantes, atendimento consultivo e envio para todo o Brasil.",
  applicationName: "Maison Noor Parfums",
  keywords: [
    "Maison Noor",
    "Maison Noor Parfums",
    "perfumes árabes",
    "perfumes árabes premium",
    "perfume árabe feminino",
    "perfume árabe masculino",
    "perfume importado",
    "perfumaria árabe",
    "fragrâncias árabes",
    "perfumes em São José dos Campos",
  ],
  authors: [{ name: "Maison Noor Parfums" }],
  creator: "Maison Noor Parfums",
  publisher: "Maison Noor Parfums",
  category: "E-commerce de perfumes",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "Maison Noor Parfums",
    title: "Maison Noor Parfums | Perfumes Árabes Premium",
    description:
      "Descubra perfumes árabes originais com curadoria premium Maison Noor, atendimento consultivo e fragrâncias inesquecíveis.",
    images: [
      {
        url: "/icon.png",
        width: 1200,
        height: 630,
        alt: "Maison Noor Parfums - Perfumes Árabes Premium",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Maison Noor Parfums | Perfumes Árabes Premium",
    description:
      "Perfumes árabes originais com curadoria premium e atendimento consultivo Maison Noor.",
    images: ["/icon.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Maison Noor Parfums",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    sameAs: [],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+55-12-98262-7108",
        contactType: "customer service",
        areaServed: "BR",
        availableLanguage: ["Portuguese"],
      },
    ],
  };

  const storeJsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: "Maison Noor Parfums",
    image: `${SITE_URL}/icon.png`,
    url: SITE_URL,
    telephone: "+55-12-98262-7108",
    priceRange: "R$",
    address: {
      "@type": "PostalAddress",
      addressLocality: "São José dos Campos",
      addressRegion: "SP",
      addressCountry: "BR",
    },
  };

  return (
    <html lang="pt-BR">
      <body
        className="
          min-h-screen
          bg-black
          text-zinc-200
          antialiased
          selection:bg-amber-500
          selection:text-black
        "
      >
        <Script
          id="maison-noor-organization-jsonld"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify(organizationJsonLd)}
        </Script>

        <Script
          id="maison-noor-store-jsonld"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify(storeJsonLd)}
        </Script>

        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}

        {META_PIXEL_ID && (
          <>
            <Script id="meta-pixel" strategy="afterInteractive">
              {`
                !function(f,b,e,v,n,t,s)
                {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)}(window, document,'script',
                'https://connect.facebook.net/en_US/fbevents.js');

                fbq('init', '${META_PIXEL_ID}');
                fbq('track', 'PageView');
              `}
            </Script>

            <noscript>
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        )}

        {children}
      </body>
    </html>
  );
}
