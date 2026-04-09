/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['nexivolt.us', 'blog.nexivolt.us'],
  },
};

module.exports = nextConfig;
