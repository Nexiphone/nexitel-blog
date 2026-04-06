export const locales = ['en', 'zh', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export interface Translations {
  nav: {
    allPosts: string;
    backToNexitel: string;
    viewPlans: string;
    nexitelBlog: string;
  };
  blog: {
    latestArticles: string;
    readMore: string;
    minRead: string;
    backToBlog: string;
    relatedArticles: string;
    tableOfContents: string;
    heroSubtitle: string;
    explorePlans: string;
    readArticles: string;
    stayInformed: string;
  };
  cta: {
    title: string;
    description: string;
    browseAllPlans: string;
    readyToSave: string;
    checkOutPlans: string;
  };
  contact: {
    title: string;
    subtitle: string;
    whatsapp: string;
    telegram: string;
    wechat: string;
  };
  footer: {
    quickLinks: string;
    support: string;
    plans: string;
    home: string;
    purplePlans: string;
    dataPlans: string;
    blog: string;
    helpCenter: string;
    contactUs: string;
    wholesale: string;
    comparePlans: string;
    allRightsReserved: string;
    tagline: string;
    brandDescription: string;
  };
  meta: {
    defaultTitle: string;
    defaultDescription: string;
    titleTemplate: string;
  };
  language: {
    name: string;
    code: string;
  };
}

const translations: Record<Locale, Translations> = {
  en: {
    nav: {
      allPosts: 'All Posts',
      backToNexitel: 'Back to Nexitel',
      viewPlans: 'View Plans',
      nexitelBlog: 'Nexitel Blog',
    },
    blog: {
      latestArticles: 'Latest Articles',
      readMore: 'Read more',
      minRead: 'min read',
      backToBlog: 'Back to Blog',
      relatedArticles: 'Related Articles',
      tableOfContents: 'Table of Contents',
      heroSubtitle:
        'Your guide to prepaid wireless plans, eSIM technology, international roaming, and staying connected for less.',
      explorePlans: 'Explore Plans',
      readArticles: 'Read Articles',
      stayInformed:
        'Stay informed with our latest guides and insights on prepaid wireless.',
    },
    cta: {
      title: 'Ready to Switch to Nexitel?',
      description:
        'Get affordable prepaid wireless with no contracts and nationwide coverage. Plans start at just $15/month.',
      browseAllPlans: 'Browse All Plans',
      readyToSave: 'Ready to save on wireless?',
      checkOutPlans: 'Check out Nexitel prepaid plans starting at $15/mo.',
    },
    contact: {
      title: 'Contact Us',
      subtitle: 'Have questions? Reach out to us on your favorite platform.',
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      wechat: 'WeChat',
    },
    footer: {
      quickLinks: 'Quick Links',
      support: 'Support',
      plans: 'Plans',
      home: 'Home',
      purplePlans: 'Purple Plans',
      dataPlans: 'Data Plans',
      blog: 'Blog',
      helpCenter: 'Help Center',
      contactUs: 'Contact Us',
      wholesale: 'Wholesale',
      comparePlans: 'Compare Plans',
      allRightsReserved: 'All rights reserved.',
      tagline: 'Prepaid wireless made simple.',
      brandDescription:
        'Affordable prepaid wireless plans with nationwide coverage. No contracts, no surprises. Stay connected with Nexitel.',
    },
    meta: {
      defaultTitle: 'Nexitel Blog - Prepaid Wireless Insights & Guides',
      defaultDescription:
        'Expert guides on prepaid wireless plans, eSIM technology, international roaming, 5G coverage, and no-contract phone plans from Nexitel.',
      titleTemplate: '%s | Nexitel Blog',
    },
    language: {
      name: 'English',
      code: 'EN',
    },
  },
  zh: {
    nav: {
      allPosts: '所有文章',
      backToNexitel: '返回 Nexitel',
      viewPlans: '查看套餐',
      nexitelBlog: 'Nexitel 博客',
    },
    blog: {
      latestArticles: '最新文章',
      readMore: '阅读更多',
      minRead: '分钟阅读',
      backToBlog: '返回博客',
      relatedArticles: '相关文章',
      tableOfContents: '目录',
      heroSubtitle:
        '您的预付费无线套餐、eSIM技术、国际漫游指南，以更低的价格保持连接。',
      explorePlans: '探索套餐',
      readArticles: '阅读文章',
      stayInformed: '通过我们最新的预付费无线指南和见解保持了解。',
    },
    cta: {
      title: '准备好切换到 Nexitel 了吗？',
      description:
        '获得实惠的预付费无线服务，无合约，全国覆盖。套餐低至每月15美元起。',
      browseAllPlans: '浏览所有套餐',
      readyToSave: '准备好节省无线费用了吗？',
      checkOutPlans: '查看 Nexitel 预付费套餐，低至每月15美元。',
    },
    contact: {
      title: '联系我们',
      subtitle: '有问题？通过您喜欢的平台联系我们。',
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      wechat: '微信',
    },
    footer: {
      quickLinks: '快速链接',
      support: '支持',
      plans: '套餐',
      home: '首页',
      purplePlans: 'Purple 套餐',
      dataPlans: '数据套餐',
      blog: '博客',
      helpCenter: '帮助中心',
      contactUs: '联系我们',
      wholesale: '批发',
      comparePlans: '比较套餐',
      allRightsReserved: '保留所有权利。',
      tagline: '简单的预付费无线服务。',
      brandDescription:
        '实惠的预付费无线套餐，全国覆盖。无合约，无意外。与 Nexitel 保持连接。',
    },
    meta: {
      defaultTitle: 'Nexitel 博客 - 预付费无线见解与指南',
      defaultDescription:
        '来自 Nexitel 的预付费无线套餐、eSIM技术、国际漫游、5G覆盖和无合约手机套餐的专家指南。',
      titleTemplate: '%s | Nexitel 博客',
    },
    language: {
      name: '中文',
      code: '中文',
    },
  },
  es: {
    nav: {
      allPosts: 'Todos los artículos',
      backToNexitel: 'Volver a Nexitel',
      viewPlans: 'Ver planes',
      nexitelBlog: 'Blog de Nexitel',
    },
    blog: {
      latestArticles: 'Últimos artículos',
      readMore: 'Leer más',
      minRead: 'min de lectura',
      backToBlog: 'Volver al blog',
      relatedArticles: 'Artículos relacionados',
      tableOfContents: 'Tabla de contenidos',
      heroSubtitle:
        'Tu guía sobre planes prepago, tecnología eSIM, roaming internacional y cómo mantenerte conectado por menos.',
      explorePlans: 'Explorar planes',
      readArticles: 'Leer artículos',
      stayInformed:
        'Mantente informado con nuestras últimas guías y conocimientos sobre prepago.',
    },
    cta: {
      title: '¿Listo para cambiar a Nexitel?',
      description:
        'Obtén servicio prepago asequible sin contratos y cobertura nacional. Planes desde solo $15/mes.',
      browseAllPlans: 'Ver todos los planes',
      readyToSave: '¿Listo para ahorrar en servicio móvil?',
      checkOutPlans:
        'Descubre los planes prepago de Nexitel desde $15/mes.',
    },
    contact: {
      title: 'Contáctanos',
      subtitle: '¿Tienes preguntas? Comunícate con nosotros en tu plataforma favorita.',
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      wechat: 'WeChat',
    },
    footer: {
      quickLinks: 'Enlaces rápidos',
      support: 'Soporte',
      plans: 'Planes',
      home: 'Inicio',
      purplePlans: 'Planes Purple',
      dataPlans: 'Planes de datos',
      blog: 'Blog',
      helpCenter: 'Centro de ayuda',
      contactUs: 'Contáctanos',
      wholesale: 'Mayoreo',
      comparePlans: 'Comparar planes',
      allRightsReserved: 'Todos los derechos reservados.',
      tagline: 'Servicio prepago simplificado.',
      brandDescription:
        'Planes prepago asequibles con cobertura nacional. Sin contratos, sin sorpresas. Mantente conectado con Nexitel.',
    },
    meta: {
      defaultTitle: 'Blog de Nexitel - Guías e información sobre prepago',
      defaultDescription:
        'Guías expertas sobre planes prepago, tecnología eSIM, roaming internacional, cobertura 5G y planes sin contrato de Nexitel.',
      titleTemplate: '%s | Blog de Nexitel',
    },
    language: {
      name: 'Español',
      code: 'ES',
    },
  },
};

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || translations[defaultLocale];
}

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export const localeNames: Record<Locale, string> = {
  en: 'EN',
  zh: '中文',
  es: 'ES',
};

export const localeDateFormats: Record<Locale, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  es: 'es-ES',
};
