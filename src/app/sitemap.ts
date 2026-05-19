import type { MetadataRoute } from "next";
import { adminDb } from "@/lib/firebase-admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.maisonnoor.com.br";

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/novidades`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  try {
    const snapshot = await adminDb.collection("products").get();

    const productPages: MetadataRoute.Sitemap = snapshot.docs.map((doc) => {
      const data = doc.data();

      const slug =
        data.slug ||
        data.nomeSlug ||
        data.slugUrl ||
        doc.id;

      return {
        url: `${baseUrl}/produto/${slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      };
    });

    return [...staticPages, ...productPages];
  } catch (error) {
    console.error("Erro ao gerar sitemap:", error);

    return staticPages;
  }
}