# Nexitel Blog

The official blog for [Nexitel](https://nexitel.us) - affordable prepaid wireless plans with no contracts.

Hosted at [blog.nexitel.us](https://blog.nexitel.us).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Content:** MDX/Markdown with gray-matter frontmatter
- **Deployment:** Vercel
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Adding Blog Posts

Create a new `.mdx` file in the `/posts` directory with the following frontmatter:

```markdown
---
title: "Your Post Title"
description: "A brief description for SEO and previews"
date: "2026-04-01"
category: "Plans"
author: "Nexitel Team"
image: "/images/your-image.jpg"
---

Your markdown content here...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| title | Yes | Post title (used in H1 and meta tags) |
| description | Yes | Short description for SEO and card previews |
| date | Yes | Publication date (YYYY-MM-DD) |
| category | Yes | Post category (Plans, Technology, Travel, Guide) |
| author | No | Author name (defaults to "Nexitel Team") |
| image | No | OG image path |

## Project Structure

```
nexitel-blog/
├── app/
│   ├── blog/[slug]/page.tsx   # Individual blog post pages
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout with nav/footer
│   ├── page.tsx                # Blog homepage
│   ├── robots.ts               # robots.txt generation
│   └── sitemap.ts              # sitemap.xml generation
├── lib/
│   └── posts.ts                # Post reading/parsing utilities
├── posts/                      # MDX blog post files
├── public/                     # Static assets
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

## Deployment

This project is configured for Vercel deployment. Connect the repository to Vercel and set the custom domain to `blog.nexitel.us`.

### Vercel Settings

- **Framework Preset:** Next.js
- **Build Command:** `npm run build`
- **Output Directory:** (default)
- **Domain:** blog.nexitel.us

## SEO Features

- Dynamic meta tags per blog post (title, description, OG tags)
- JSON-LD Article structured data on each post
- Auto-generated sitemap.xml
- robots.txt configuration
- Canonical URLs
- Static page generation (SSG) for fast load times
