export type SeoProgramaticoPageConfig = {
  slug: string;
  titulo: string;
  descricao: string;
  h1: string;
  subtitulo: string;
};

export const seoProgramaticoPages: SeoProgramaticoPageConfig[] = [
  {
    slug: "perfume-arabe-doce",
    titulo: "Perfume Árabe Doce | Maison Noor Parfums",
    descricao:
      "Conheça perfumes árabes doces com alta fixação, ótima projeção e fragrâncias marcantes na curadoria premium da Maison Noor.",
    h1: "Perfume árabe doce",
    subtitulo:
      "Fragrâncias doces, envolventes e sofisticadas para quem busca presença marcante.",
  },
  {
    slug: "perfume-arabe-amadeirado",
    titulo: "Perfume Árabe Amadeirado | Maison Noor Parfums",
    descricao:
      "Perfumes árabes amadeirados sofisticados, elegantes e marcantes para diferentes ocasiões.",
    h1: "Perfume árabe amadeirado",
    subtitulo:
      "Seleção elegante com perfil amadeirado, refinado e de presença premium.",
  },
  {
    slug: "perfume-arabe-baunilha",
    titulo: "Perfume Árabe com Baunilha | Maison Noor Parfums",
    descricao:
      "Fragrâncias árabes com notas de baunilha intensas, cremosas e envolventes.",
    h1: "Perfume árabe com baunilha",
    subtitulo:
      "Perfumes com toque cremoso, doce e confortável para uma assinatura inesquecível.",
  },
  {
    slug: "perfume-arabe-ambar",
    titulo: "Perfume Árabe Âmbar | Maison Noor Parfums",
    descricao:
      "Perfumes árabes com notas de âmbar sofisticadas, quentes, luxuosas e marcantes.",
    h1: "Perfume árabe âmbar",
    subtitulo:
      "Fragrâncias âmbar com elegância, intensidade e assinatura olfativa sofisticada.",
  },
  {
    slug: "perfume-arabe-feminino-doce",
    titulo: "Perfume Árabe Feminino Doce | Maison Noor Parfums",
    descricao:
      "Perfumes árabes femininos doces, elegantes e marcantes para mulheres que buscam sofisticação.",
    h1: "Perfume árabe feminino doce",
    subtitulo:
      "Opções femininas doces e envolventes com curadoria premium Maison Noor.",
  },
  {
    slug: "perfume-arabe-masculino-noite",
    titulo: "Perfume Árabe Masculino para Noite | Maison Noor Parfums",
    descricao:
      "Fragrâncias masculinas árabes ideais para noite, encontros e ocasiões especiais.",
    h1: "Perfume árabe masculino para noite",
    subtitulo:
      "Perfumes masculinos intensos, elegantes e ideais para momentos de presença.",
  },
  {
    slug: "perfume-arabe-alta-fixacao",
    titulo: "Perfume Árabe Alta Fixação | Maison Noor Parfums",
    descricao:
      "Perfumes árabes conhecidos pela alta fixação, boa projeção e presença intensa.",
    h1: "Perfume árabe de alta fixação",
    subtitulo:
      "Fragrâncias selecionadas para quem busca duração, projeção e impacto.",
  },
  {
    slug: "perfume-arabe-para-presentear",
    titulo: "Perfume Árabe para Presentear | Maison Noor Parfums",
    descricao:
      "Os melhores perfumes árabes para presentear com sofisticação, elegância e bom gosto.",
    h1: "Perfume árabe para presentear",
    subtitulo:
      "Escolhas elegantes para transformar presente em experiência memorável.",
  },
];

export const seoProgramatico = seoProgramaticoPages;

export function getSeoProgramaticoBySlug(slug: string) {
  return seoProgramaticoPages.find((item) => item.slug === slug);
}
