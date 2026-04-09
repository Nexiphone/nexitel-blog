import { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { locales, Locale } from '@/lib/i18n';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // Add locale homepages
  for (const locale of locales) {
    entries.push({
      url: `https://blog.nexivolt.us/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    });

    // Add blog posts for each locale
    const posts = getAllPosts(locale as Locale);
    for (const post of posts) {
      entries.push({
        url: `https://blog.nexivolt.us/${locale}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        changeFrequency: 'monthly',
        priority: 0.8,
      });
    }
  }

  return entries;
}
