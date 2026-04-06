import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';

export default function HomePage() {
  const posts = getAllPosts();

  return (
    <>
      {/* Hero Section */}
      <section className="bg-nexitel-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-nexitel-gradient opacity-10" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
            <span className="gradient-text">Nexitel Blog</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Your guide to prepaid wireless plans, eSIM technology,
            international roaming, and staying connected for less.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <a
              href="https://nexitel.us/blue-plans"
              className="bg-nexitel-gradient text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              Explore Plans
            </a>
            <a
              href="#posts"
              className="border border-purple-500/50 text-gray-300 hover:text-white font-semibold px-6 py-3 rounded-lg hover:border-purple-400 transition-colors"
            >
              Read Articles
            </a>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section id="posts" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Latest Articles
        </h2>
        <p className="text-gray-500 mb-10">
          Stay informed with our latest guides and insights on prepaid wireless.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block bg-white rounded-xl border border-gray-200 hover:border-nexitel-purple/50 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 overflow-hidden"
            >
              {/* Card Image Placeholder */}
              <div className="h-48 bg-nexitel-gradient-dark relative overflow-hidden">
                <div className="absolute inset-0 bg-nexitel-gradient opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl opacity-50">
                    {post.category === 'Plans'
                      ? '📱'
                      : post.category === 'Technology'
                        ? '⚡'
                        : post.category === 'Travel'
                          ? '🌍'
                          : post.category === 'Guide'
                            ? '📖'
                            : '📡'}
                  </span>
                </div>
                {/* Category Badge */}
                <div className="absolute top-4 left-4">
                  <span className="bg-nexitel-purple/90 text-white text-xs font-medium px-3 py-1 rounded-full">
                    {post.category}
                  </span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-6">
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                  <span>&middot;</span>
                  <span>{post.readingTime} min read</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-nexitel-purple transition-colors mb-2 line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {post.description}
                </p>
                <div className="mt-4 flex items-center text-nexitel-purple text-sm font-medium">
                  Read more
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
      <section className="bg-nexitel-dark">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Switch to Nexitel?
          </h2>
          <p className="text-gray-300 mb-8 text-lg">
            Get affordable prepaid wireless with no contracts and nationwide
            coverage. Plans start at just $15/month.
          </p>
          <a
            href="https://nexitel.us/blue-plans"
            className="inline-block bg-nexitel-gradient text-white font-semibold px-8 py-4 rounded-lg hover:opacity-90 transition-opacity text-lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Browse All Plans
          </a>
        </div>
      </section>
    </>
  );
}
