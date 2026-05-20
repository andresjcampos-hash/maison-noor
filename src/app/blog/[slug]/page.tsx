import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { blogPosts, getBlogPost, SITE_URL } from "@/data/blog-posts";

type PageProps = {
  params: {
    slug: string;
  };
};

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const post = getBlogPost(params.slug);

  if (!post) {
    return {
      title: "Artigo não encontrado",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      siteName: "Maison Noor Parfums",
      locale: "pt_BR",
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: ["Maison Noor Parfums"],
      images: [
        {
          url: `${SITE_URL}/logo.png`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
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
}

export default function BlogPostPage({ params }: PageProps) {
  const post = getBlogPost(params.slug);

  if (!post) notFound();

  const articleUrl = `${SITE_URL}/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: [`${SITE_URL}/logo.png`],
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      "@type": "Organization",
      name: "Maison Noor Parfums",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Maison Noor Parfums",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Início",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${SITE_URL}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: articleUrl,
      },
    ],
  };

  return (
    <main style={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <header style={styles.header}>
        <Link href="/" style={styles.brandWrap}>
          <img src="/logo-maison-noor.png" alt="Maison Noor" style={styles.logo} />
          <div>
            <span style={styles.brandKicker}>Maison Noor</span>
            <strong style={styles.brandTitle}>Blog</strong>
          </div>
        </Link>

        <nav style={styles.nav}>
          <Link href="/blog" style={styles.navLink}>Blog</Link>
          <Link href="/" style={styles.navLink}>Catálogo</Link>
          <a href="https://wa.me/5512982389658" target="_blank" rel="noreferrer" style={styles.whatsappButton}>WhatsApp</a>
        </nav>
      </header>

      <article style={styles.articleShell}>
        <div style={styles.breadcrumb}>
          <Link href="/" style={styles.breadcrumbLink}>Início</Link>
          <span>/</span>
          <Link href="/blog" style={styles.breadcrumbLink}>Blog</Link>
          <span>/</span>
          <span>{post.category}</span>
        </div>

        <section style={styles.hero}>
          <span style={styles.badge}>{post.heroLabel}</span>
          <h1 style={styles.title}>{post.title}</h1>
          <p style={styles.subtitle}>{post.excerpt}</p>

          <div style={styles.metaRow}>
            <span>{post.category}</span>
            <span>{post.readTime}</span>
            <span>Atualizado em {new Date(post.updatedAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </section>

        <div style={styles.contentGrid}>
          <div style={styles.contentCard}>
            {post.sections.map((section) => (
              <section key={section.heading} style={styles.sectionBlock}>
                <h2 style={styles.sectionTitle}>{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} style={styles.paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}

            <section style={styles.faqSection}>
              <p style={styles.kicker}>Perguntas frequentes</p>
              <h2 style={styles.sectionTitle}>Dúvidas comuns sobre o tema</h2>

              <div style={styles.faqList}>
                {post.faqs.map((faq, index) => (
                  <details key={faq.question} style={styles.faqItem} open={index === 0}>
                    <summary style={styles.faqQuestion}>{faq.question}</summary>
                    <p style={styles.faqAnswer}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <aside style={styles.sidebar}>
            <div style={styles.sidebarCard}>
              <span style={styles.sidebarKicker}>Compra assistida</span>
              <strong style={styles.sidebarTitle}>Gostou do guia?</strong>
              <p style={styles.sidebarText}>
                Fale com a Maison Noor para receber uma indicação de fragrância conforme seu estilo, ocasião e intensidade desejada.
              </p>
              <a href="https://wa.me/5512982389658" target="_blank" rel="noreferrer" style={styles.sidebarButton}>
                Falar no WhatsApp
              </a>
            </div>

            <div style={styles.sidebarCardLight}>
              <span style={styles.sidebarKickerDark}>Explore a loja</span>
              <Link href="/perfumes-arabes-femininos" style={styles.sideLink}>Perfumes femininos</Link>
              <Link href="/perfumes-arabes-masculinos" style={styles.sideLink}>Perfumes masculinos</Link>
              <Link href="/perfumes-arabes-unissex" style={styles.sideLink}>Perfumes unissex</Link>
              <Link href="/body-splash" style={styles.sideLink}>Body splash</Link>
            </div>
          </aside>
        </div>

        <section style={styles.relatedSection}>
          <p style={styles.kicker}>Continue lendo</p>
          <h2 style={styles.relatedTitle}>Mais guias Maison Noor</h2>

          <div style={styles.relatedGrid}>
            {blogPosts
              .filter((item) => item.slug !== post.slug)
              .slice(0, 3)
              .map((item) => (
                <Link key={item.slug} href={`/blog/${item.slug}`} style={styles.relatedCard}>
                  <span style={styles.cardCategory}>{item.category}</span>
                  <strong style={styles.relatedCardTitle}>{item.title}</strong>
                  <span style={styles.readMore}>Ler artigo →</span>
                </Link>
              ))}
          </div>
        </section>
      </article>
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
  articleShell: {
    maxWidth: "1360px",
    margin: "0 auto",
  },
  breadcrumb: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    color: "#7B6958",
    fontSize: "14px",
    marginBottom: "14px",
  },
  breadcrumbLink: {
    color: "#A8844C",
    textDecoration: "none",
    fontWeight: 800,
  },
  hero: {
    borderRadius: "34px",
    padding: "44px",
    background:
      "radial-gradient(circle at top right, rgba(212,175,119,0.22), transparent 32%), linear-gradient(135deg, #17110C, #2B2118)",
    boxShadow: "0 28px 60px rgba(30, 21, 12, 0.18)",
    color: "#F6E9D6",
    marginBottom: "24px",
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
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    color: "#FFF6EB",
    fontSize: "clamp(36px, 5vw, 68px)",
    lineHeight: 0.98,
    fontFamily: "Georgia, 'Times New Roman', serif",
    letterSpacing: "-0.055em",
    maxWidth: "980px",
  },
  subtitle: {
    color: "rgba(246, 233, 214, 0.78)",
    fontSize: "17px",
    lineHeight: 1.75,
    maxWidth: "840px",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    gap: "22px",
    alignItems: "start",
  },
  contentCard: {
    borderRadius: "30px",
    padding: "32px",
    background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)",
    border: "1px solid #EADBC8",
    boxShadow: "0 18px 38px rgba(48,34,20,0.06)",
  },
  sectionBlock: {
    marginBottom: "28px",
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
    margin: "0 0 12px",
    color: "#3A2F29",
    fontSize: "32px",
    lineHeight: 1.12,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  paragraph: {
    color: "#5F5147",
    fontSize: "17px",
    lineHeight: 1.85,
    margin: "0 0 16px",
  },
  faqSection: {
    marginTop: "30px",
    paddingTop: "26px",
    borderTop: "1px solid #EADBC8",
  },
  faqList: {
    display: "grid",
    gap: "12px",
    marginTop: "16px",
  },
  faqItem: {
    borderRadius: "18px",
    border: "1px solid #E7D7C1",
    background: "linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    overflow: "hidden",
  },
  faqQuestion: {
    cursor: "pointer",
    padding: "16px",
    color: "#3A2F29",
    fontSize: "15px",
    fontWeight: 900,
  },
  faqAnswer: {
    margin: 0,
    padding: "0 16px 16px",
    color: "#6F6258",
    fontSize: "14px",
    lineHeight: 1.7,
  },
  sidebar: {
    display: "grid",
    gap: "16px",
    position: "sticky",
    top: "20px",
  },
  sidebarCard: {
    borderRadius: "26px",
    padding: "24px",
    background: "linear-gradient(135deg, #1F1A14, #3A2A1E)",
    color: "#FFF7EE",
    boxShadow: "0 18px 34px rgba(48,34,20,0.12)",
  },
  sidebarKicker: {
    display: "block",
    color: "#D8B178",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginBottom: "10px",
  },
  sidebarTitle: {
    display: "block",
    fontSize: "26px",
    lineHeight: 1.1,
  },
  sidebarText: {
    color: "rgba(255,247,238,0.75)",
    fontSize: "14px",
    lineHeight: 1.7,
  },
  sidebarButton: {
    minHeight: "48px",
    borderRadius: "16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    textDecoration: "none",
    color: "#241A12",
    fontWeight: 900,
    background: "linear-gradient(135deg, #D4AF77, #BE9155)",
  },
  sidebarCardLight: {
    borderRadius: "24px",
    padding: "20px",
    background: "linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    border: "1px solid #E7D7C1",
    display: "grid",
    gap: "10px",
  },
  sidebarKickerDark: {
    color: "#A8844C",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  sideLink: {
    color: "#5E4A38",
    textDecoration: "none",
    fontWeight: 800,
    borderBottom: "1px solid #EADBC8",
    paddingBottom: "9px",
  },
  relatedSection: {
    marginTop: "24px",
    borderRadius: "30px",
    padding: "28px",
    background: "linear-gradient(180deg, #FFFEFC, #FCF7EF)",
    border: "1px solid #EADBC8",
  },
  relatedTitle: {
    margin: "8px 0 18px",
    color: "#3A2F29",
    fontSize: "32px",
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  relatedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
  },
  relatedCard: {
    borderRadius: "22px",
    padding: "20px",
    background: "linear-gradient(180deg, #FFFDF9, #F7EBDD)",
    border: "1px solid #E7D7C1",
    textDecoration: "none",
    display: "grid",
    gap: "10px",
  },
  cardCategory: {
    color: "#A8844C",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  relatedCardTitle: {
    color: "#2F2721",
    fontSize: "20px",
    lineHeight: 1.2,
  },
  readMore: {
    color: "#8E6431",
    fontWeight: 900,
  },
};
