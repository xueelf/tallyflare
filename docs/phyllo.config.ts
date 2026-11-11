import { defineConfig } from '@phyllo/core';

export default defineConfig({
  theme: 'phyllo-theme-docs',
  title: 'Tallyflare',
  description:
    'A lightweight hit counter with SVG badges and JSON counts, powered by Cloudflare Workers and D1.',
  lang: 'en-US',
  search: true,
  redirects: {
    '/': '/en',
    '/zh/local-development': '/zh/development',
    '/zh/deploy': '/zh/deployment',
    '/en/local-development': '/en/development',
    '/en/deploy': '/en/deployment',
  },
});
