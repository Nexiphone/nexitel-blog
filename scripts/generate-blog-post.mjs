#!/usr/bin/env node
/**
 * Generate a new blog post using the Anthropic API.
 * Writes English post + Chinese/Spanish translations, and downloads a stock image.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import https from 'https';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const POSTS_DIR = path.join(process.cwd(), 'posts');
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'blog');

// List of topic categories to rotate through
const TOPIC_CATEGORIES = [
  { category: 'City Safety', topics: ['parking lot safety', 'public transit safety', 'bar and nightlife safety', 'festival safety', 'neighborhood safety', 'urban biking safety', 'subway safety tips', 'walking dogs safely at night', 'grocery shopping safety', 'ATM safety tips', 'gas station safety', 'farmers market safety', 'sidewalk safety', 'crosswalk safety', 'street vendor interactions', 'busy intersection safety', 'late-night convenience store safety', 'street photography safety', 'urban exploration safety', 'protest and rally safety', 'concert venue safety', 'street fair safety', 'public restroom safety', 'food truck safety', 'tourist district safety', 'downtown safety after dark', 'sporting event safety', 'shopping mall safety', 'food court safety', 'parking garage safety'] },
  { category: 'Student Safety', topics: ['dorm safety', 'study group safety', 'campus parking safety', 'spring break safety', 'fraternity and sorority party safety', 'late-night library safety', 'roommate safety agreements', 'campus jogging safety', 'study abroad airport safety', 'campus dating safety', 'student housing safety', 'graduate student lab safety', 'commuter student safety', 'online class privacy', 'tutoring session safety', 'campus tour safety', 'orientation week safety', 'finals week stress and safety', 'study group meetup safety', 'campus event safety'] },
  { category: 'Travel Safety', topics: ['airport safety', 'road trip safety', 'hiking safety', 'beach safety', 'cruise ship safety', 'backpacking safety', 'train travel safety', 'bus travel safety', 'hostel safety', 'Airbnb safety tips', 'car rental safety', 'gas station rest stop safety', 'border crossing safety', 'language barrier emergency tips', 'travel scam awareness', 'currency exchange safety', 'taxi safety abroad', 'pickpocket prevention', 'photography travel safety', 'camping safety', 'national park safety', 'museum and tourist site safety', 'street food safety abroad', 'travel insurance basics', 'lost passport recovery', 'embassy and consulate help', 'altitude sickness prevention', 'jet lag and safety', 'ferry and boat safety', 'desert travel safety'] },
  { category: 'Emergency Preparedness', topics: ['first aid basics', 'power outage preparedness', 'home fire safety', 'earthquake readiness', 'tornado safety', 'flood preparedness', 'hurricane preparation', 'winter storm safety', 'heatwave safety', 'wildfire evacuation', 'go-bag essentials', 'emergency water supply', 'emergency food storage', 'emergency communication plan', 'CPR basics', 'choking response', 'severe allergy response', 'snake bite first aid', 'severe weather alerts', 'lightning safety', 'gas leak response', 'carbon monoxide awareness', 'home invasion response', 'workplace evacuation plans', 'school emergency drills', 'pandemic preparedness', 'medical emergency at home', 'fall prevention for elderly', 'pet emergency preparedness', 'documenting emergencies for insurance'] },
  { category: 'Digital Safety', topics: ['online dating safety', 'social media privacy', 'phone security', 'identity theft prevention', 'public WiFi safety', 'password manager basics', 'two-factor authentication guide', 'phishing email detection', 'safe online shopping', 'smart home device security', 'webcam privacy', 'voice assistant privacy', 'kids online safety', 'teen social media safety', 'dating app red flags', 'video chat safety', 'cloud storage privacy', 'data breach response', 'safe file sharing', 'cryptocurrency safety basics', 'NFT scam awareness', 'remote work data security', 'VPN basics', 'phone tracking awareness', 'social engineering defense'] },
  { category: 'Family Safety', topics: ['child safety tips', 'teen safety guide', 'pet owner safety', 'babysitter safety guide', 'newborn home safety', 'toddler outdoor safety', 'school pickup safety', 'playground safety', 'pool safety for families', 'family vacation safety', 'family hike safety', 'children walking to school', 'kids and strangers training', 'sibling supervision tips', 'family emergency contact tree', 'grandparent care safety', 'family bike ride safety', 'family camping safety', 'visitor and guest safety at home', 'family movie night safety drill'] },
  { category: 'Workplace Safety', topics: ['commute safety', 'late shift worker safety', 'remote worker safety', 'business travel safety', 'co-working space safety', 'office break-in prevention', 'workplace harassment safety', 'field worker safety', 'real estate agent safety', 'delivery driver safety', 'gig worker safety', 'food delivery rider safety', 'home healthcare worker safety', 'rideshare driver safety', 'night security guard tips', 'small business owner safety', 'retail worker safety', 'bartender safety', 'restaurant server safety', 'hospital worker safety'] },
  { category: 'Senior Safety', topics: ['elderly fall prevention', 'medication management safety', 'senior driving safety', 'senior dating safety', 'scam awareness for seniors', 'senior travel safety', 'aging in place safety', 'senior bathroom safety', 'senior kitchen safety', 'senior winter walking safety', 'caregiver coordination', 'memory care safety', 'senior fitness safety', 'senior pet safety'] },
  { category: 'Outdoor Activities', topics: ['running alone safety', 'cycling safety', 'rock climbing safety', 'kayaking safety', 'paddleboard safety', 'fishing trip safety', 'hunting safety', 'mountain biking safety', 'trail running safety', 'cross-country skiing safety', 'snowboarding safety', 'surfing safety', 'open water swimming safety', 'rollerblading safety', 'skateboarding safety', 'horseback riding safety', 'bird watching trip safety', 'foraging trip safety', 'geocaching safety', 'metal detecting safety'] },
];

function getExistingSlugs() {
  const enDir = path.join(POSTS_DIR, 'en');
  if (!fs.existsSync(enDir)) return [];
  return fs.readdirSync(enDir)
    .filter(f => f.endsWith('.mdx'))
    .map(f => f.replace('.mdx', ''));
}

function pickTopic(existingSlugs) {
  const shuffled = [...TOPIC_CATEGORIES].sort(() => Math.random() - 0.5);
  for (const cat of shuffled) {
    const shuffledTopics = [...cat.topics].sort(() => Math.random() - 0.5);
    for (const topic of shuffledTopics) {
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      // Only skip if exact slug already used (no fuzzy match — was causing false positives)
      if (!existingSlugs.includes(slug)) {
        return { category: cat.category, topic, slug };
      }
    }
  }
  return null; // Signal to use AI to generate a fresh topic
}

async function generateFreshTopic(existingSlugs) {
  const existingList = existingSlugs.join(', ');
  const prompt = `I run a personal safety blog for the One Tap Alert app. I need a fresh, specific blog post topic about personal safety that is NOT already covered.

Topics already covered (do not repeat or duplicate): ${existingList}

Generate ONE new specific, SEO-friendly safety topic. Pick something unique — a specific scenario, audience, or situation we haven't covered. Be creative but practical (real situations people search for).

Examples of good topics: "Holiday Shopping Safety", "Yoga Studio Safety for Solo Practitioners", "Safety Tips for Dog Park Visits", "Working Late at the Office Alone".

Respond with ONLY a JSON object (no markdown, no code fences) like:
{"topic":"the topic name","category":"one of: City Safety, Student Safety, Travel Safety, Emergency Preparedness, Digital Safety, Family Safety, Workplace Safety, Senior Safety, Outdoor Activities","slug":"url-friendly-slug-with-dashes"}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(text);
  return { category: parsed.category, topic: parsed.topic, slug: parsed.slug };
}

async function downloadImage(slug) {
  // Use Unsplash Source API (redirects to a relevant random photo)
  const unsplashTopicMap = {
    'parking-lot-safety': 'photo-1506521781263-d8422e82f27a',
    'public-transit-safety': 'photo-1515767094208-cf67b81d1be5',
    'bar-and-nightlife-safety': 'photo-1514933651103-005eec06c04b',
    'festival-safety': 'photo-1533174072545-7a4b6ad7a6c3',
    'hiking-safety': 'photo-1551632811-561732d1e306',
    'beach-safety': 'photo-1507525428034-b723cf961d3e',
    'airport-safety': 'photo-1436491865332-7a61a109cc05',
    'road-trip-safety': 'photo-1469854523086-cc02fe5d8800',
    'first-aid-basics': 'photo-1584515933487-779824d29309',
    'home-fire-safety': 'photo-1582485199248-e34d3e37b7ad',
    'online-dating-safety': 'photo-1516321318423-f06f85e504b3',
    'child-safety-tips': 'photo-1607582544393-8a0c0e76b4e7',
    'pet-owner-safety': 'photo-1552053831-71594a27632d',
    'commute-safety': 'photo-1449965408869-ebd13bc9e5a8',
  };

  // Default to a generic safety image if no mapping
  const photoId = unsplashTopicMap[slug] || 'photo-1519608487953-e999c86e7455';
  const url = `https://images.unsplash.com/${photoId}?w=1200&h=630&fit=crop&q=80`;

  const filepath = path.join(IMAGES_DIR, `${slug}.jpg`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(filepath);
          if (stats.size < 1000) {
            reject(new Error('Image too small'));
          } else {
            resolve(filepath);
          }
        });
      } else {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(filepath); } catch {}
      reject(err);
    });
  });
}

async function generateEnglishPost(topic, category, slug) {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `Write an SEO-optimized blog post for the One Tap Alert personal safety app blog.

ABOUT ONE TAP ALERT:
One Tap Alert is an SOS emergency safety app for iOS. Key features:
- **Instant SOS Button** — Press and hold for 1 second to alert all emergency contacts with live location
- **Real-Time Location Sharing** — Emergency contacts see exactly where you are via live GPS tracking
- **Safety Timer** — Set a countdown for activities (walks, dates, runs); if you don't check in, contacts are auto-alerted
- **Secure Vault** — End-to-end encrypted storage for sensitive documents (ID, insurance, medical info)
- **Unlimited Emergency Contacts** — Add as many trusted people as you want
- **Privacy First** — No background tracking, no location history stored, no data selling
- Free to download, premium features $5.99/month or $24.99/year
- App Store: https://apps.apple.com/us/app/one-tap-alert/id6758563344
- Website: https://onetapalert.com

TOPIC: ${topic}
CATEGORY: ${category}

Requirements:
- 1200-1800 words
- SEO-optimized title and 150-160 char description
- Proper H2 (##) and H3 (###) heading structure
- **MUST mention "One Tap Alert" throughout the article** — at least 4-5 times naturally woven into the content
- **MUST have a dedicated H2 section titled "How One Tap Alert Helps With [topic]"** explaining how specific features (SOS button, safety timer, location sharing) apply to this scenario
- **MUST include specific feature mentions** — don't just name the brand, reference the actual features (SOS button, safety timer, live location sharing) in context
- Every section should tie back to how the reader can use One Tap Alert to apply the advice
- End with a strong CTA section titled "Download One Tap Alert Today" that includes:
  - The App Store link: https://apps.apple.com/us/app/one-tap-alert/id6758563344
  - Mention it's free to download
  - Mention premium pricing ($5.99/mo or $24.99/yr)
- Practical, actionable advice the reader can apply immediately
- Position One Tap Alert as the natural solution throughout — this is a product blog, so every post should drive app awareness

Output ONLY the complete .mdx file content including the YAML frontmatter. Use this exact format:

---
title: "..."
description: "..."
date: "${today}"
category: "${category}"
author: "One Tap Alert Team"
image: "/images/blog/${slug}.jpg"
---

[blog post content in markdown here]`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  return stripCodeFences(response.content[0].text.trim());
}

function stripCodeFences(text) {
  // Remove ```mdx or ```markdown wrappers that AI sometimes adds
  return text.replace(/^```\w*\n/, '').replace(/\n```\s*$/, '').trim();
}

async function translatePost(englishContent, targetLang) {
  const langName = targetLang === 'zh' ? 'Simplified Chinese' : 'Spanish';

  const prompt = `Translate this blog post to ${langName}. Keep the YAML frontmatter format but translate the title and description. Keep category, author, date, and image values UNCHANGED. Keep "One Tap Alert" as brand name. Keep all markdown formatting.

Output ONLY the translated .mdx file content, nothing else.

---

${englishContent}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  return stripCodeFences(response.content[0].text.trim());
}

async function main() {
  console.log('🚀 Starting daily blog post generation...');

  const existingSlugs = getExistingSlugs();
  console.log(`Found ${existingSlugs.length} existing posts`);

  let picked = pickTopic(existingSlugs);
  if (!picked) {
    console.log('🤖 Topic rotation exhausted — asking Claude for a fresh topic...');
    picked = await generateFreshTopic(existingSlugs);
  }
  const { category, topic, slug } = picked;
  console.log(`📝 Topic: ${topic} (${category}) → slug: ${slug}`);

  // Ensure directories exist
  ['en', 'zh', 'es'].forEach(lang => {
    const dir = path.join(POSTS_DIR, lang);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Download image
  try {
    console.log('🖼️  Downloading image...');
    await downloadImage(slug);
    console.log('✅ Image downloaded');
  } catch (e) {
    console.warn('⚠️  Image download failed:', e.message);
  }

  // Generate English post
  console.log('✍️  Writing English post...');
  const englishContent = await generateEnglishPost(topic, category, slug);
  fs.writeFileSync(path.join(POSTS_DIR, 'en', `${slug}.mdx`), englishContent);
  console.log('✅ English post written');

  // Translate to Chinese
  console.log('🇨🇳 Translating to Chinese...');
  const chineseContent = await translatePost(englishContent, 'zh');
  fs.writeFileSync(path.join(POSTS_DIR, 'zh', `${slug}.mdx`), chineseContent);
  console.log('✅ Chinese translation written');

  // Translate to Spanish
  console.log('🇪🇸 Translating to Spanish...');
  const spanishContent = await translatePost(englishContent, 'es');
  fs.writeFileSync(path.join(POSTS_DIR, 'es', `${slug}.mdx`), spanishContent);
  console.log('✅ Spanish translation written');

  console.log('🎉 Done! New post created:', slug);

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `topic=${topic}\n`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
