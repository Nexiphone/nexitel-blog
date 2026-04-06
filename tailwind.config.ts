import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nexitel: {
          purple: '#8b5cf6',
          blue: '#3b82f6',
          dark: '#1a1145',
          darker: '#0f0a2e',
          light: '#f0ecff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'nexitel-gradient': 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
        'nexitel-gradient-dark': 'linear-gradient(135deg, #1a1145, #0f0a2e)',
      },
    },
  },
  plugins: [],
};

export default config;
