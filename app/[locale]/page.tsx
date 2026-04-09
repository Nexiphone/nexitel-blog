import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPosts } from '@/lib/posts';
import {
  Locale,
  isValidLocale,
  getTranslations,
  localeDateFormats,
} from '@/lib/i18n';

interface Props {
  params: { locale: string };
}

export default function LocaleHomePage({ params }: Props) {
  const locale = params.locale as Locale;
  if (!isValidLocale(locale)) {
    notFound();
  }

  const t = getTranslations(locale);
  const posts = getAllPosts(locale);
  const dateLocale = localeDateFormats[locale];

  return (
    <>
      {/* Hero Section - matching main site */}
      <section className="blog-hero-gradient relative overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(hsl(0 0% 100% / 0.04) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 animate-fade-in-up" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <span className="gradient-text">{t.nav.nexitelBlog}</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {t.blog.heroSubtitle}
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <a
              href="https://nexivolt.us/blue-plans"
              className="btn-vibrant text-base"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.blog.explorePlans}
            </a>
            <a
              href="#posts"
              className="border border-purple-500/50 text-gray-300 hover:text-white font-semibold px-6 py-3 rounded-lg hover:border-purple-400 transition-colors"
            >
              {t.blog.readArticles}
            </a>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section
        id="posts"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
      >
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {t.blog.latestArticles}
        </h2>
        <p className="text-gray-500 mb-10">{t.blog.stayInformed}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/${locale}/blog/${post.slug}`}
              className="group block glow-card overflow-hidden"
            >
              {/* Card Image */}
              <div className="h-48 bg-nexitel-gradient-dark relative overflow-hidden">
                {post.image && post.image.startsWith('/') ? (
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-nexitel-gradient opacity-20 group-hover:opacity-30 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl opacity-50">
                        {post.category === 'Plans' ? '📱' : post.category === 'Technology' ? '⚡' : post.category === 'Travel' ? '🌍' : post.category === 'Guide' ? '📖' : '📡'}
                      </span>
                    </div>
                  </>
                )}
                {/* Category Badge */}
                <div className="absolute top-4 left-4">
                  <span className="tag-pill text-[10px]">
                    {post.category}
                  </span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-6">
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString(dateLocale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                  <span>&middot;</span>
                  <span>
                    {post.readingTime} {t.blog.minRead}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-nexitel-purple transition-colors mb-2 line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {post.description}
                </p>
                <div className="mt-4 flex items-center text-nexitel-purple text-sm font-medium">
                  {t.blog.readMore}
                  <svg
                    className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="blog-hero-gradient">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            {t.cta.title}
          </h2>
          <p className="text-gray-300 mb-8 text-lg">{t.cta.description}</p>
          <a
            href="https://nexivolt.us/blue-plans"
            className="btn-vibrant text-lg px-8 py-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.cta.browseAllPlans}
          </a>
        </div>
      </section>
    </>
  );
}
