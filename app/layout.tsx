import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://blog.nexitel.us'),
  title: {
    default: 'Nexitel Blog - Prepaid Wireless Insights & Guides',
    template: '%s | Nexitel Blog',
  },
  description:
    'Expert guides on prepaid wireless plans, eSIM technology, international roaming, 5G coverage, and no-contract phone plans from Nexitel.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
