export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  heroLabel: string;
  cover?: string;
  sections: Array<{
    heading: string;
    body: string[];
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  relatedProductsText: string;
};

export const SITE_URL = "https://www.maisonnoor.com.br";

export const blogPosts: BlogPost[] = [
  {
    slug: "melhores-perfumes-arabes-femininos",
    title: "Melhores perfumes árabes femininos: como escolher uma fragrância marcante",
    excerpt:
      "Entenda como escolher perfumes árabes femininos doces, florais, intensos e sofisticados para diferentes ocasiões.",
    category: "Perfumes femininos",
    readTime: "5 min de leitura",
    publishedAt: "2026-05-20",
    updatedAt: "2026-05-20",
    keywords: [
      "melhores perfumes árabes femininos",
      "perfume árabe feminino",
      "perfume feminino importado",
      "Maison Noor",
    ],
    heroLabel: "Guia Maison Noor",
    sections: [
      {
        heading: "Por que os perfumes árabes femininos chamam tanta atenção?",
        body: [
          "Os perfumes árabes femininos costumam ser conhecidos por presença, intensidade e construção olfativa envolvente. Muitos combinam notas doces, florais, ambaradas, cremosas e orientais, criando uma assinatura mais marcante do que fragrâncias muito leves.",
          "Para quem busca ser lembrada pelo perfume, esse estilo pode funcionar muito bem, principalmente em encontros, eventos, ocasiões especiais e momentos em que a presença olfativa faz parte da imagem pessoal.",
        ],
      },
      {
        heading: "Como escolher o perfume feminino ideal?",
        body: [
          "Para uma escolha mais segura, observe três pontos: ocasião de uso, intensidade desejada e perfil olfativo. Perfumes doces e cremosos passam uma sensação mais acolhedora. Florais transmitem delicadeza e feminilidade. Ambarados e orientais costumam ser mais marcantes e sofisticados.",
          "Se a ideia é presentear, vale escolher fragrâncias equilibradas, com boa aceitação e personalidade elegante. Para assinatura pessoal, a melhor escolha é aquela que combina com seu estilo e com a imagem que você quer transmitir.",
        ],
      },
      {
        heading: "Quando usar perfumes árabes femininos?",
        body: [
          "Perfumes femininos mais intensos combinam muito com noite, encontros, festas e ocasiões especiais. Já opções mais florais, doces leves ou cremosas podem funcionar bem no dia a dia, principalmente quando usadas com moderação.",
          "A Maison Noor trabalha com curadoria para ajudar nessa escolha, considerando fixação, projeção, estilo e momento de uso.",
        ],
      },
    ],
    faqs: [
      {
        question: "Perfume árabe feminino costuma fixar bem?",
        answer:
          "Muitos perfumes árabes femininos possuem boa fixação, mas a duração varia conforme pele, clima, quantidade aplicada e concentração da fragrância.",
      },
      {
        question: "Perfume árabe feminino é bom para presente?",
        answer:
          "Sim. Perfumes árabes femininos podem ser excelentes presentes quando escolhidos com orientação, principalmente fragrâncias equilibradas, elegantes e com boa aceitação.",
      },
      {
        question: "Qual perfume árabe feminino escolher para noite?",
        answer:
          "Para noite, procure fragrâncias mais intensas, doces, ambaradas, orientais ou florais marcantes, pois costumam ter mais presença.",
      },
    ],
    relatedProductsText: "Ver perfumes árabes femininos",
  },
  {
    slug: "melhor-perfume-arabe-masculino",
    title: "Melhor perfume árabe masculino: presença, fixação e elegância",
    excerpt:
      "Veja como escolher um perfume árabe masculino com presença sofisticada para rotina, noite, trabalho ou ocasiões especiais.",
    category: "Perfumes masculinos",
    readTime: "5 min de leitura",
    publishedAt: "2026-05-20",
    updatedAt: "2026-05-20",
    keywords: [
      "melhor perfume árabe masculino",
      "perfume árabe masculino",
      "perfume masculino importado",
      "perfume masculino alta fixação",
    ],
    heroLabel: "Guia masculino",
    sections: [
      {
        heading: "O que faz um perfume árabe masculino se destacar?",
        body: [
          "Um bom perfume árabe masculino costuma unir presença, elegância e personalidade. Notas amadeiradas, aromáticas, cítricas, especiadas, ambaradas e de oud são comuns em fragrâncias masculinas marcantes.",
          "A escolha ideal depende do ambiente. Para trabalho, fragrâncias mais equilibradas e limpas funcionam melhor. Para noite e eventos, opções intensas e amadeiradas podem criar uma assinatura mais imponente.",
        ],
      },
      {
        heading: "Fixação é tudo?",
        body: [
          "Fixação é importante, mas não é o único critério. Um perfume também precisa combinar com sua pele, estilo e ocasião. Projeção muito forte pode ser ótima para eventos, mas exagerada para ambientes fechados.",
          "O ideal é encontrar equilíbrio entre desempenho, elegância e conforto olfativo.",
        ],
      },
      {
        heading: "Perfume masculino para ser lembrado",
        body: [
          "Fragrâncias masculinas marcantes ajudam a construir presença. Quando bem escolhidas, transmitem cuidado, segurança e sofisticação sem precisar exagerar.",
          "Na Maison Noor, a curadoria busca opções para diferentes estilos: frescos, intensos, sedutores, clássicos e modernos.",
        ],
      },
    ],
    faqs: [
      {
        question: "Perfume árabe masculino é muito forte?",
        answer:
          "Alguns são intensos, mas existem opções frescas, versáteis e moderadas. A escolha depende do perfil da fragrância.",
      },
      {
        question: "Qual perfume masculino combina com trabalho?",
        answer:
          "Para trabalho, prefira fragrâncias elegantes, limpas, frescas ou amadeiradas moderadas, evitando excesso de aplicação.",
      },
      {
        question: "Perfume árabe masculino serve para presente?",
        answer:
          "Sim. É uma ótima opção quando a escolha considera estilo, idade, ocasião e intensidade preferida da pessoa presenteada.",
      },
    ],
    relatedProductsText: "Ver perfumes árabes masculinos",
  },
  {
    slug: "o-que-e-body-splash",
    title: "O que é body splash e quando usar?",
    excerpt:
      "Entenda a diferença entre body splash e perfume, quando usar e como aproveitar melhor essa opção leve e perfumada.",
    category: "Body splash",
    readTime: "4 min de leitura",
    publishedAt: "2026-05-20",
    updatedAt: "2026-05-20",
    keywords: ["o que é body splash", "body splash", "body splash perfumado", "cuidados perfumados"],
    heroLabel: "Guia body splash",
    sections: [
      {
        heading: "Body splash é perfume?",
        body: [
          "Body splash é uma fragrância corporal mais leve, geralmente usada para deixar sensação de frescor, conforto e banho tomado. Ele costuma ser menos intenso que um perfume tradicional, o que o torna ideal para reaplicação e uso diário.",
          "É uma excelente escolha para pós-banho, rotina, academia, dias quentes ou momentos em que você quer ficar perfumado sem usar algo muito marcante.",
        ],
      },
      {
        heading: "Quando usar body splash?",
        body: [
          "O body splash combina com manhã, rotina de cuidados, momentos em casa, trabalho informal, pós-banho e dias quentes. Ele também pode ser usado antes de dormir, quando a proposta é uma sensação mais confortável e suave.",
          "Para aumentar a duração, aplique na pele hidratada e reaplique ao longo do dia quando desejar reforçar a sensação perfumada.",
        ],
      },
      {
        heading: "Body splash substitui perfume?",
        body: [
          "Depende da ocasião. Para momentos leves e rotina, pode substituir. Para eventos, encontros ou ocasiões em que você deseja mais presença, o perfume tradicional pode ser mais indicado.",
          "Muitas pessoas usam os dois: body splash para conforto diário e perfume para momentos especiais.",
        ],
      },
    ],
    faqs: [
      {
        question: "Body splash dura quanto tempo?",
        answer:
          "A duração varia, mas geralmente é mais leve que perfume. Pode ser reaplicado ao longo do dia para manter a sensação perfumada.",
      },
      {
        question: "Body splash pode usar todo dia?",
        answer:
          "Sim. Ele é pensado para rotina, pós-banho e momentos de cuidado diário.",
      },
      {
        question: "Body splash é bom para presente?",
        answer:
          "Sim. É uma opção leve, agradável e versátil, principalmente para quem gosta de cuidados perfumados.",
      },
    ],
    relatedProductsText: "Ver body splash",
  },
  {
    slug: "perfume-arabe-com-maior-fixacao",
    title: "Perfume árabe com maior fixação: como escolher sem errar",
    excerpt:
      "Saiba o que influencia a fixação de um perfume árabe e como escolher uma fragrância com melhor desempenho.",
    category: "Fixação",
    readTime: "5 min de leitura",
    publishedAt: "2026-05-20",
    updatedAt: "2026-05-20",
    keywords: ["perfume árabe com maior fixação", "perfume alta fixação", "perfume árabe fixa bem"],
    heroLabel: "Alta fixação",
    sections: [
      {
        heading: "O que faz um perfume fixar mais?",
        body: [
          "A fixação depende da composição da fragrância, concentração, tipo de pele, clima e forma de aplicação. Notas mais densas, como âmbar, baunilha, madeiras, oud, musk e especiarias, costumam permanecer mais tempo na pele.",
          "Peles mais hidratadas tendem a segurar melhor o perfume. Por isso, hidratar a pele antes da aplicação pode ajudar bastante.",
        ],
      },
      {
        heading: "Perfume forte nem sempre é perfume melhor",
        body: [
          "Um perfume de alta fixação precisa ser agradável durante toda a evolução, não apenas forte na saída. O ideal é buscar uma fragrância que tenha desempenho, mas também conforto, elegância e harmonia.",
          "Em ambientes fechados, aplicar menos pode ser mais sofisticado. Em eventos e noites especiais, fragrâncias mais intensas podem funcionar melhor.",
        ],
      },
      {
        heading: "Como aplicar para durar mais?",
        body: [
          "Aplique em pontos de pulsação, como pescoço, atrás das orelhas e punhos, sem esfregar. Também vale aplicar em pele hidratada e em roupas com cuidado, respeitando tecidos delicados.",
          "Guardar o perfume longe do calor e da luz também ajuda a preservar a qualidade da fragrância.",
        ],
      },
    ],
    faqs: [
      {
        question: "Perfume árabe fixa mais que perfume comum?",
        answer:
          "Muitos perfumes árabes têm boa fixação, mas isso varia conforme fórmula, pele, clima e concentração.",
      },
      {
        question: "Quais notas ajudam na fixação?",
        answer:
          "Notas como âmbar, oud, baunilha, musk, madeiras e especiarias costumam contribuir para maior duração.",
      },
      {
        question: "Onde aplicar perfume para durar mais?",
        answer:
          "Aplique em pontos de pulsação e na pele hidratada, evitando esfregar após a aplicação.",
      },
    ],
    relatedProductsText: "Ver perfumes de alta fixação",
  },
  {
    slug: "lattafa-vale-a-pena",
    title: "Lattafa vale a pena? Entenda por que a marca ficou tão famosa",
    excerpt:
      "Conheça os motivos que tornaram a Lattafa uma das marcas árabes mais procuradas por quem busca fragrâncias marcantes.",
    category: "Marcas árabes",
    readTime: "5 min de leitura",
    publishedAt: "2026-05-20",
    updatedAt: "2026-05-20",
    keywords: ["Lattafa vale a pena", "perfume Lattafa", "Lattafa é bom", "perfume árabe Lattafa"],
    heroLabel: "Marca em destaque",
    sections: [
      {
        heading: "Por que a Lattafa ficou tão conhecida?",
        body: [
          "A Lattafa ganhou destaque por oferecer fragrâncias árabes com identidade marcante, apresentações chamativas e perfis olfativos variados. A marca se tornou muito procurada por quem deseja conhecer o universo da perfumaria árabe.",
          "Entre os atrativos estão opções doces, amadeiradas, orientais, frescas e intensas, atendendo diferentes estilos e ocasiões.",
        ],
      },
      {
        heading: "Lattafa é para quem gosta de perfume forte?",
        body: [
          "A marca possui fragrâncias intensas, mas também tem opções mais versáteis e confortáveis. Por isso, a melhor escolha depende do perfil desejado: doce, fresco, oriental, amadeirado, floral ou especiado.",
          "A curadoria ajuda a evitar compra por impulso e direciona para o perfume que combina melhor com o cliente.",
        ],
      },
      {
        heading: "Como comprar Lattafa com segurança?",
        body: [
          "Procure lojas que apresentem informações claras, fotos, atendimento consultivo e orientação sobre o perfil do perfume. Isso ajuda a escolher melhor e reduz chance de frustração.",
          "Na Maison Noor, a proposta é apresentar perfumes árabes com curadoria premium e suporte na escolha.",
        ],
      },
    ],
    faqs: [
      {
        question: "Lattafa vale a pena?",
        answer:
          "Para quem gosta de perfumes árabes marcantes e variados, a Lattafa pode valer muito a pena, desde que a escolha combine com o estilo da pessoa.",
      },
      {
        question: "Lattafa tem boa fixação?",
        answer:
          "Muitas fragrâncias da marca têm boa fixação, mas o desempenho varia conforme o perfume, pele e clima.",
      },
      {
        question: "Lattafa é boa para presente?",
        answer:
          "Sim, principalmente quando a fragrância é escolhida com orientação sobre gosto, intensidade e ocasião de uso.",
      },
    ],
    relatedProductsText: "Ver perfumes Lattafa",
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug) || null;
}
