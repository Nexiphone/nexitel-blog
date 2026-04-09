import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Locale,
  locales,
  isValidLocale,
  getTranslations,
  localeNames,
} from '@/lib/i18n';

interface Props {
  children: React.ReactNode;
  params: { locale: string };
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = params.locale as Locale;
  if (!isValidLocale(locale)) return {};

  const t = getTranslations(locale);
  const localeMap: Record<Locale, string> = {
    en: 'en_US',
    zh: 'zh_CN',
    es: 'es_ES',
  };

  return {
    metadataBase: new URL('https://blog.nexivolt.us'),
    title: {
      default: t.meta.defaultTitle,
      template: t.meta.titleTemplate,
    },
    description: t.meta.defaultDescription,
    keywords: ['prepaid wireless', 'prepaid SIM', 'eSIM', 'no-contract plans', 'international roaming', '5G coverage', 'Nexitel', 'mobile plans'],
    authors: [{ name: 'Nexitel', url: 'https://nexivolt.us' }],
    creator: 'Nexitel',
    publisher: 'Nexitel',
    openGraph: {
      type: 'website',
      locale: localeMap[locale],
      url: `https://blog.nexivolt.us/${locale}`,
      siteName: t.nav.nexitelBlog,
      title: t.meta.defaultTitle,
      description: t.meta.defaultDescription,
    },
    twitter: {
      card: 'summary_large_image',
      title: t.meta.defaultTitle,
      description: t.meta.defaultDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    alternates: {
      canonical: `https://blog.nexivolt.us/${locale}`,
      languages: { en: 'https://blog.nexivolt.us/en', zh: 'https://blog.nexivolt.us/zh', es: 'https://blog.nexivolt.us/es' },
    },
  };
}

export default function LocaleLayout({ children, params }: Props) {
  const locale = params.locale as Locale;
  if (!isValidLocale(locale)) notFound();

  const t = getTranslations(locale);

  return (
    <>
      {/* Navigation - matching main site style */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(260,50%,8%)]/95 backdrop-blur-xl border-b border-purple-500/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-8">
              <a href="https://nexivolt.us" className="flex items-center space-x-2">
                <span className="text-2xl font-extrabold gradient-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Nexitel
                </span>
              </a>
              <span className="hidden sm:inline text-white/30 text-sm">|</span>
              <Link href={`/${locale}`} className="hidden sm:inline text-white/70 hover:text-white text-sm font-medium transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Blog
              </Link>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-3 sm:space-x-5">
              {/* Language Switcher */}
              <div className="flex items-center space-x-1 text-xs">
                {locales.map((loc, index) => (
                  <span key={loc} className="flex items-center">
                    {index > 0 && <span className="text-white/20 mx-0.5">|</span>}
                    <Link
                      href={`/${loc}`}
                      className={`transition-colors px-1 py-0.5 rounded ${
                        loc === locale
                          ? 'text-white font-bold'
                          : 'text-white/40 hover:text-white/80'
                      }`}
                    >
                      {localeNames[loc]}
                    </Link>
                  </span>
                ))}
              </div>

              <a
                href="https://nexivolt.us"
                className="hidden sm:inline text-white/60 hover:text-white text-sm transition-colors"
              >
                {t.nav.backToNexitel} &rarr;
              </a>
              <a
                href="https://nexivolt.us/blue-plans"
                className="btn-vibrant text-xs sm:text-sm"
              >
                {t.nav.viewPlans}
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for fixed nav */}
      <div className="h-16" />

      {/* Main Content */}
      <main className="min-h-screen">{children}</main>

      {/* Footer - matching main site style */}
      <footer className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, hsl(260,50%,8%) 0%, hsl(260,55%,5%) 100%)' }}>
        {/* CTA Section */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <span className="gradient-text">{t.cta.title}</span>
            </h2>
            <p className="text-white/50 mb-6 max-w-lg mx-auto">{t.cta.description}</p>
            <a href="https://nexivolt.us/blue-plans" className="btn-vibrant">
              {t.cta.browseAllPlans}
            </a>
          </div>
        </div>

        <div className="section-divider" />

        {/* Links */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <span className="text-xl font-extrabold gradient-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Nexitel</span>
              <p className="mt-3 text-sm text-white/30 leading-relaxed">{t.footer.brandDescription}</p>
            </div>

            {/* Plans */}
            <div>
              <h3 className="text-white font-bold mb-4 text-xs uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.footer.quickLinks}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="https://nexivolt.us/blue-plans" className="text-white/40 hover:text-white transition-colors">{t.footer.plans}</a></li>
                <li><a href="https://nexivolt.us/purple-plans" className="text-white/40 hover:text-white transition-colors">{t.footer.purplePlans}</a></li>
                <li><a href="https://nexivolt.us/data-plans" className="text-white/40 hover:text-white transition-colors">{t.footer.dataPlans}</a></li>
                <li><Link href={`/${locale}`} className="text-white/40 hover:text-white transition-colors">{t.footer.blog}</Link></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h3 className="text-white font-bold mb-4 text-xs uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.footer.support}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="https://nexivolt.us/support" className="text-white/40 hover:text-white transition-colors">{t.footer.helpCenter}</a></li>
                <li><a href="https://nexivolt.us/support" className="text-white/40 hover:text-white transition-colors">{t.footer.contactUs}</a></li>
                <li><a href="https://nexivolt.us/wholesale" className="text-white/40 hover:text-white transition-colors">{t.footer.wholesale}</a></li>
                <li><a href="https://nexivolt.us/compare" className="text-white/40 hover:text-white transition-colors">{t.footer.comparePlans}</a></li>
              </ul>
            </div>
          </div>

          <div className="section-divider mt-10" />

          <div className="flex flex-col sm:flex-row justify-between items-center pt-8">
            <p className="text-xs text-white/25">
              &copy; {new Date().getFullYear()} Nexitel. {t.footer.allRightsReserved}
            </p>
            <p className="text-xs text-white/25 mt-2 sm:mt-0">{t.footer.tagline}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
