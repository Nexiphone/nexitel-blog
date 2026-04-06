import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://blog.nexitel.us'),
  title: {
    default: 'Nexitel Blog - Prepaid Wireless Insights & Guides',
    template: '%s | Nexitel Blog',
  },
  description:
    'Expert guides on prepaid wireless plans, eSIM technology, international roaming, 5G coverage, and no-contract phone plans from Nexitel.',
  keywords: [
    'prepaid wireless',
    'prepaid SIM',
    'eSIM',
    'no-contract plans',
    'international roaming',
    '5G coverage',
    'Nexitel',
    'mobile plans',
  ],
  authors: [{ name: 'Nexitel', url: 'https://nexitel.us' }],
  creator: 'Nexitel',
  publisher: 'Nexitel',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://blog.nexitel.us',
    siteName: 'Nexitel Blog',
    title: 'Nexitel Blog - Prepaid Wireless Insights & Guides',
    description:
      'Expert guides on prepaid wireless plans, eSIM technology, international roaming, 5G coverage, and no-contract phone plans from Nexitel.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexitel Blog - Prepaid Wireless Insights & Guides',
    description:
      'Expert guides on prepaid wireless plans, eSIM technology, international roaming, 5G coverage, and no-contract phone plans.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://blog.nexitel.us',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Navigation */}
        <nav className="bg-nexitel-dark border-b border-purple-900/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-8">
                <Link
                  href="/"
                  className="flex items-center space-x-2"
                >
                  <span className="text-xl font-bold gradient-text">
                    Nexitel Blog
                  </span>
                </Link>
              </div>
              <div className="flex items-center space-x-6">
                <Link
                  href="/"
                  className="text-gray-300 hover:text-white text-sm transition-colors"
                >
                  All Posts
                </Link>
                <a
                  href="https://nexitel.us"
                  className="text-gray-300 hover:text-white text-sm transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Back to Nexitel &rarr;
                </a>
                <a
                  href="https://nexitel.us/blue-plans"
                  className="bg-nexitel-gradient text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Plans
                </a>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer className="bg-nexitel-dark text-gray-400 border-t border-purple-900/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {/* Brand */}
              <div className="md:col-span-2">
                <span className="text-xl font-bold gradient-text">
                  Nexitel
                </span>
                <p className="mt-3 text-sm leading-relaxed">
                  Affordable prepaid wireless plans with nationwide coverage.
                  No contracts, no surprises. Stay connected with Nexitel.
                </p>
              </div>

              {/* Quick Links */}
              <div>
                <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                  Quick Links
                </h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a
                      href="https://nexitel.us"
                      className="hover:text-white transition-colors"
                    >
                      Home
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://nexitel.us/blue-plans"
                      className="hover:text-white transition-colors"
                    >
                      Plans
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://nexitel.us/purple-plans"
                      className="hover:text-white transition-colors"
                    >
                      Purple Plans
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://nexitel.us/data-plans"
                      className="hover:text-white transition-colors"
                    >
                      Data Plans
                    </a>
                  </li>
                  <li>
                    <Link
                      href="/"
                      className="hover:text-white transition-colors"
                    >
                      Blog
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Support */}
              <div>
                <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                  Support
                </h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a
                      href="https://nexitel.us/support"
                      className="hover:text-white transition-colors"
                    >
                      Help Center
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://nexitel.us/support"
                      className="hover:text-white transition-colors"
                    >
                      Contact Us
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://nexitel.us/wholesale"
                      className="hover:text-white transition-colors"
                    >
                      Wholesale
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://nexitel.us/compare"
                      className="hover:text-white transition-colors"
                    >
                      Compare Plans
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-purple-900/30 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
              <p className="text-sm">
                &copy; {new Date().getFullYear()} Nexitel. All rights reserved.
              </p>
              <p className="text-sm mt-2 sm:mt-0">
                Prepaid wireless made simple.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
