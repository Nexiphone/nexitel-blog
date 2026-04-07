import { Metadata } from 'next';
import Link from 'next/link';
import { getPostBySlug, getAllPosts, getAllSlugs } from '@/lib/posts';
import { notFound } from 'next/navigation';
import {
  Locale,
  locales,
  isValidLocale,
  getTranslations,
  localeDateFormats,
} from '@/lib/i18n';

interface Props {
  params: { locale: string; slug: string };
}

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];

  for (const locale of locales) {
    const slugs = getAllSlugs(locale);
    for (const slug of slugs) {
      params.push({ locale, slug });
    }
  }

  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = params.locale as Locale;
  if (!isValidLocale(locale)) return {};

  const post = getPostBySlug(params.slug, locale);
  if (!post) return {};

  const t = getTranslations(locale);

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      url: `https://blog.nexitel.us/${locale}/blog/${post.slug}`,
      siteName: t.nav.nexitelBlog,
      images: [
        {
          url: post.image?.startsWith('/') ? `https://blog.nexitel.us${post.image}` : 'https://blog.nexitel.us/og-default.png',
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
    alternates: {
      canonical: `https://blog.nexitel.us/${locale}/blog/${post.slug}`,
      languages: Object.fromEntries(
        locales
          .filter((loc) => {
            // Only add alternate if the post exists in that locale
            const exists = getPostBySlug(params.slug, loc);
            return exists !== null;
          })
          .map((loc) => [loc, `https://blog.nexitel.us/${loc}/blog/${post.slug}`])
      ),
    },
  };
}

function extractHeadings(
  content: string
): { id: string; text: string; level: number }[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: { id: string; text: string; level: number }[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\u00e0-\u00ff]+/g, '-')
      .replace(/(^-|-$)/g, '');
    headings.push({
      id,
      text,
      level: match[1].length,
    });
  }

  return headings;
}

function addIdsToHeadings(html: string): string {
  return html.replace(/<h([23])>(.+?)<\/h[23]>/g, (_, level, text) => {
    const id = text
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\u00e0-\u00ff]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

export default function BlogPostPage({ params }: Props) {
  const locale = params.locale as Locale;
  if (!isValidLocale(locale)) {
    notFound();
  }

  const post = getPostBySlug(params.slug, locale);
  if (!post) notFound();

  const t = getTranslations(locale);
  const dateLocale = localeDateFormats[locale];

  const allPosts = getAllPosts(locale);
  const relatedPosts = allPosts
    .filter((p) => p.slug !== post.slug)
    .filter((p) => p.category === post.category)
    .slice(0, 2);

  // If not enough related by category, fill with recent posts
  const finalRelated =
    relatedPosts.length >= 2
      ? relatedPosts
      : [
          ...relatedPosts,
          ...allPosts
            .filter(
              (p) =>
                p.slug !== post.slug &&
                !relatedPosts.find((r) => r.slug === p.slug)
            )
            .slice(0, 2 - relatedPosts.length),
        ];

  const headings = extractHeadings(post.rawContent);
  const contentWithIds = addIdsToHeadings(post.contentHtml);

  const localeMap: Record<Locale, string> = {
    en: 'en',
    zh: 'zh',
    es: 'es',
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: post.image || 'https://blog.nexitel.us/og-default.png',
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: localeMap[locale],
    author: {
      '@type': 'Organization',
      name: post.author,
      url: 'https://nexitel.us',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Nexitel',
      url: 'https://nexitel.us',
      logo: {
        '@type': 'ImageObject',
        url: 'https://nexitel.us/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://blog.nexitel.us/${locale}/blog/${post.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Image */}
      {post.image && post.image.startsWith('/') && (
        <div className="w-full h-64 sm:h-80 lg:h-96 relative overflow-hidden bg-nexitel-dark">
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-nexitel-dark via-nexitel-dark/50 to-transparent" />
        </div>
      )}

      {/* Article Header */}
      <header className="bg-nexitel-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-nexitel-gradient opacity-10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center text-gray-400 hover:text-white text-sm mb-6 transition-colors"
          >
            <svg
              className="mr-2 w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.blog.backToBlog}
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <span className="bg-nexitel-purple/90 text-white text-xs font-medium px-3 py-1 rounded-full">
              {post.category}
            </span>
            <span className="text-gray-400 text-sm">
              {post.readingTime} {t.blog.minRead}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
            {post.title}
          </h1>

          <p className="text-lg text-gray-300 mb-6">{post.description}</p>

          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>By {post.author}</span>
            <span>&middot;</span>
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString(dateLocale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          </div>
        </div>
      </header>

      {/* Article Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Table of Contents - Sidebar */}
          {headings.length > 0 && (
            <aside className="lg:w-64 shrink-0 order-2 lg:order-1">
              <div className="lg:sticky lg:top-8">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                  {t.blog.tableOfContents}
                </h2>
                <nav className="space-y-2">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`block text-sm text-gray-500 hover:text-nexitel-purple transition-colors ${
                        heading.level === 3 ? 'pl-4' : ''
                      }`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </nav>

                {/* CTA in Sidebar */}
                <div className="mt-8 p-4 bg-nexitel-dark rounded-lg">
                  <p className="text-white text-sm font-semibold mb-2">
                    {t.cta.readyToSave}
                  </p>
                  <p className="text-gray-400 text-xs mb-3">
                    {t.cta.checkOutPlans}
                  </p>
                  <a
                    href="https://nexitel.us/blue-plans"
                    className="block text-center bg-nexitel-gradient text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.nav.viewPlans}
                  </a>
                </div>
              </div>
            </aside>
          )}

          {/* Main Content */}
          <article className="flex-1 order-1 lg:order-2 min-w-0">
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: contentWithIds }}
            />
          </article>
        </div>
      </div>

      {/* Contact Us */}
      <section className="bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-nexitel-dark rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              {t.contact.title}
            </h2>
            <p className="text-gray-400 mb-6">{t.contact.subtitle}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://wa.me/18082006178"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white font-medium px-5 py-2.5 rounded-lg transition-colors w-full sm:w-auto justify-center"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t.contact.whatsapp}
              </a>
              <a
                href="https://t.me/nexitel"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#0088cc] hover:bg-[#006da3] text-white font-medium px-5 py-2.5 rounded-lg transition-colors w-full sm:w-auto justify-center"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                {t.contact.telegram}
              </a>
              <div className="inline-flex items-center gap-2 bg-[#07C160] hover:bg-[#06ae56] text-white font-medium px-5 py-2.5 rounded-lg w-full sm:w-auto justify-center">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.045c.134 0 .24-.11.24-.245 0-.06-.024-.12-.04-.178l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zm-2.18 2.945c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982z" />
                </svg>
                {t.contact.wechat}: wxid_i2o8boe95gka22
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Related Posts */}
      {finalRelated.length > 0 && (
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              {t.blog.relatedArticles}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {finalRelated.map((related) => (
                <Link
                  key={related.slug}
                  href={`/${locale}/blog/${related.slug}`}
                  className="group block bg-white rounded-xl border border-gray-200 hover:border-nexitel-purple/50 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 p-6"
                >
                  <span className="bg-nexitel-purple/10 text-nexitel-purple text-xs font-medium px-3 py-1 rounded-full">
                    {related.category}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-nexitel-purple transition-colors mt-3 mb-2">
                    {related.title}
                  </h3>
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {related.description}
                  </p>
                  <div className="mt-3 flex items-center text-sm text-gray-500">
                    <time dateTime={related.date}>
                      {new Date(related.date).toLocaleDateString(dateLocale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                    <span className="mx-2">&middot;</span>
                    <span>
                      {related.readingTime} {t.blog.minRead}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
