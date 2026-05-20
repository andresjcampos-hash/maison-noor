import Link from "next/link";
import type { Metadata } from "next";
import { blogPosts, SITE_URL } from "@/data/blog-posts";

export const metadata: Metadata = {
  title: "Blog Maison Noor | Guias de Perfumes Árabes",
  description:
    "Guias da Maison Noor sobre perfumes árabes, body splash, fixação, marcas árabes e como escolher fragrâncias marcantes.",
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
  openGraph: {
    title: "Blog Maison Noor | Guias de Perfumes Árabes",
    description:
      "Conteúdos para escolher perfumes árabes, fragrâncias femininas, masculinas, body splash e perfumes de alta fixação.",
    url: `${SITE_URL}/blog`,
    siteName: "Maison Noor Parfums",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: `${SITE_URL}/logo.png`,
        width: 1200,
        height: 630,
        alt: "Maison Noor Parfums",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog Maison Noor | Guias de Perfumes Árabes",
    description: "Guias de perfumes árabes, fixação, body splash e marcas da perfumaria árabe.",
    images: [`${SITE_URL}/logo.png`],
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
};

export default function BlogPage() {
  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog Maison Noor",
    url: `${SITE_URL}/blog`,
    description:
      "Guias de perfumes árabes, body splash, fixação e curadoria de fragrâncias premium.",
    publisher: {
      "@type": "Organization",
      name: "Maison Noor Parfums",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    blogPost: blogPosts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_URL}/blog/${post.slug}`,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
    })),
  };

  return (
    <main style={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />

      <header style={styles.header}>
        <Link href="/" style={styles.brandWrap}>
          <img src="/logo-maison-noor.png" alt="Maison Noor" style={styles.logo} />
          <div>
            <span style={styles.brandKicker}>Maison Noor</span>
            <strong style={styles.brandTitle}>Blog de Perfumes</strong>
          </div>
        </Link>

        <nav style={styles.nav}>
          <Link href="/" style={styles.navLink}>Início</Link>
          <Link href="/novidades" style={styles.navLink}>Novidades</Link>
          <a href="https://wa.me/5512982389658" target="_blank" rel="noreferrer" style={styles.whatsappButton}>WhatsApp</a>
        </nav>
      </header>

      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <span style={styles.badge}>Conteúdo SEO Maison Noor</span>
          <h1 style={styles.title}>Guias para escolher perfumes árabes com mais segurança.</h1>
          <p style={styles.subtitle}>
            Conteúdos criados para ajudar você a entender fixação, projeção, estilos olfativos,
            body splash, marcas árabes e escolhas ideais para presente ou assinatura pessoal.
          </p>
          <div style={styles.heroActions}>
            <a href="#artigos" style={styles.primaryButton}>Ver artigos</a>
            <Link href="/" style={styles.secondaryButton}>Voltar ao catálogo</Link>
          </div>
        </div>

        <aside style={styles.heroCard}>
          <span style={styles.heroCardKicker}>Autoridade orgânica</span>
          <strong style={styles.heroCardTitle}>Perfumes árabes, fixação e curadoria premium</strong>
          <p style={styles.heroCardText}>
            Um hub de conteúdo para fortalecer a Maison Noor no Google e orientar clientes antes da compra.
          </p>
        </aside>
      </section>

      <section id="artigos" style={styles.postsSection}>
        <div style={styles.sectionHeader}>
          <p style={styles.kicker}>Artigos em destaque</p>
          <h2 style={styles.sectionTitle}>Conteúdos para descobrir sua próxima fragrância</h2>
        </div>

        <div style={styles.grid}>
          {blogPosts.map((post) => (
            <article key={post.slug} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardCategory}>{post.category}</span>
                <span style={styles.readTime}>{post.readTime}</span>
              </div>

              <Link href={`/blog/${post.slug}`} style={styles.cardTitleLink}>
                <h3 style={styles.cardTitle}>{post.title}</h3>
              </Link>

              <p style={styles.cardExcerpt}>{post.excerpt}</p>

              <div style={styles.keywordRow}>
                {post.keywords.slice(0, 3).map((keyword) => (
                  <span key={keyword} style={styles.keyword}>{keyword}</span>
                ))}
              </div>

              <Link href={`/blog/${post.slug}`} style={styles.readButton}>
                Ler artigo
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 0%, rgba(215,192,160,0.26), transparent 26%), radial-gradient(circle at 88% 8%, rgba(191,148,88,0.14), transparent 24%), #F5EFE6",
    color: "#2B2B2B",
    fontFamily: "Inter, Arial, sans-serif",
    padding: "22px",
  },
  header: {
    maxWidth: "1360px",
    margin: "0 auto 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap",
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    textDecoration: "none",
  },
  logo: {
    width: "68px",
    height: "68px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid rgba(215, 192, 160, 0.95)",
    boxShadow: "0 14px 32px rgba(60, 42, 23, 0.12)",
  },
  brandKicker: {
    display: "block",
    color: "#A8844C",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  brandTitle: {
    display: "block",
    color: "#3D312B",
    fontSize: "26px",
    lineHeight: 1.05,
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  navLink: {
    minHeight: "44px",
    borderRadius: "999px",
    padding: "0 18px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "#6E5844",
    fontWeight: 800,
    background: "rgba(255,255,255,0.55)",
    border: "1px solid #E3D3BF",
  },
  whatsappButton: {
    minHeight: "44px",
    borderRadius: "999px",
    padding: "0 20px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "#241A12",
    fontWeight: 900,
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    border: "1px solid rgba(255, 232, 184, 0.36)",
  },
  hero: {
    maxWidth: "1360px",
    margin: "0 auto",
    borderRadius: "34px",
    padding: "44px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
    gap: "30px",
    alignItems: "center",
    background:
      "radial-gradient(circle at top right, rgba(212,175,119,0.22), transparent 32%), linear-gradient(135deg, #17110C, #2B2118)",
    boxShadow: "0 28px 60px rgba(30, 21, 12, 0.18)",
    color: "#F6E9D6",
  },
  heroContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "14px",
  },
  badge: {
    display: "inline-flex",
    borderRadius: "999px",
    padding: "10px 15px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(216,193,162,0.18)",
    color: "#D8BE97",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    color: "#FFF6EB",
    fontSize: "clamp(36px, 5vw, 72px)",
    lineHeight: 0.95,
    fontFamily: "Georgia, 'Times New Roman', serif",
    letterSpacing: "-0.055em",
    maxWidth: "920px",
  },
  subtitle: {
    margin: 0,
    color: "rgba(246, 233, 214, 0.78)",
    fontSize: "17px",
    lineHeight: 1.75,
    maxWidth: "760px",
  },
  heroActions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "8px",
  },
  primaryButton: {
    minHeight: "52px",
    borderRadius: "16px",
    padding: "0 24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "#241A12",
    fontWeight: 900,
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
    boxShadow: "0 16px 30px rgba(120, 87, 45, 0.22)",
  },
  secondaryButton: {
    minHeight: "52px",
    borderRadius: "16px",
    padding: "0 24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "#F6E9D6",
    fontWeight: 900,
    background: "rgba(255,255,255,0.075)",
    border: "1px solid rgba(216,193,162,0.18)",
  },
  heroCard: {
    borderRadius: "28px",
    padding: "30px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))",
    border: "1px solid rgba(216,193,162,0.18)",
  },
  heroCardKicker: {
    display: "block",
    color: "#D8BE97",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginBottom: "12px",
  },
  heroCardTitle: {
    display: "block",
    color: "#FFF6EB",
    fontSize: "28px",
    lineHeight: 1.12,
  },
  heroCardText: {
    color: "rgba(246, 233, 214, 0.72)",
    fontSize: "15px",
    lineHeight: 1.7,
  },
  postsSection: {
    maxWidth: "1360px",
    margin: "28px auto 0",
    borderRadius: "30px",
    padding: "30px",
    background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)",
    border: "1px solid #EADBC8",
    boxShadow: "0 18px 38px rgba(48,34,20,0.06)",
  },
  sectionHeader: {
    marginBottom: "22px",
  },
  kicker: {
    margin: 0,
    color: "#A8844C",
    fontSize: "12px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  },
  sectionTitle: {
    margin: "8px 0 0",
    color: "#3A2F29",
    fontSize: "34px",
    lineHeight: 1.1,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "18px",
  },
  card: {
    borderRadius: "24px",
    padding: "20px",
    background: "linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    border: "1px solid #E7D7C1",
    boxShadow: "0 12px 28px rgba(48,34,20,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  cardCategory: {
    color: "#A8844C",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  readTime: {
    color: "#7B6958",
    fontSize: "12px",
    fontWeight: 800,
  },
  cardTitleLink: {
    textDecoration: "none",
  },
  cardTitle: {
    margin: 0,
    color: "#2F2721",
    fontSize: "24px",
    lineHeight: 1.12,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  cardExcerpt: {
    margin: 0,
    color: "#6F6258",
    fontSize: "14px",
    lineHeight: 1.65,
  },
  keywordRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  keyword: {
    borderRadius: "999px",
    padding: "7px 10px",
    background: "#F1E2CA",
    color: "#805B2F",
    fontSize: "11px",
    fontWeight: 900,
  },
  readButton: {
    marginTop: "auto",
    minHeight: "44px",
    borderRadius: "14px",
    padding: "0 16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "#2A2018",
    fontWeight: 900,
    background: "linear-gradient(135deg, #D8B178, #BD9055)",
  },
};
