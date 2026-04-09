/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['nexitel.us', 'blog.nexitel.us'],
  },
};

module.exports = nextConfig;
