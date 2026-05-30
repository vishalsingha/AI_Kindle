import { defineConfig } from 'vitepress'

// AI Kindle docs site.
//
// Built with VitePress; deployed to GitHub Pages from main via
// .github/workflows/deploy-docs.yml. Site lives at:
//
//   https://vishalsingha.github.io/AI_Kindle/
//
// Because this is a *project* Pages site (not a user/org one), every
// URL is prefixed with /AI_Kindle/, which means we have to set `base`
// accordingly. VitePress then rewrites all internal links and asset
// URLs to include the prefix automatically.

export default defineConfig({
  title: 'AI Kindle',
  description:
    'A fast, local, privacy-first PDF study companion. Highlight, annotate, take notes, and chat with AI — all on your machine.',
  base: '/AI_Kindle/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/AI_Kindle/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#b8860b' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'AI Kindle' }],
    ['meta', { property: 'og:image', content: '/AI_Kindle/screenshots/library.png' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'A fast, local, privacy-first PDF study companion. Highlight, annotate, take notes, and chat with AI — all on your machine.'
      }
    ]
  ],

  themeConfig: {
    logo: { src: '/logo.svg', alt: 'AI Kindle' },
    siteTitle: 'AI Kindle',

    nav: [
      { text: 'Guide', link: '/guide/installation', activeMatch: '/guide/' },
      { text: 'Development', link: '/development/architecture', activeMatch: '/development/' },
      {
        text: 'Download',
        items: [
          { text: 'Latest release', link: 'https://github.com/vishalsingha/AI_Kindle/releases/latest' },
          { text: 'All releases', link: 'https://github.com/vishalsingha/AI_Kindle/releases' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          collapsed: false,
          items: [
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick start', link: '/guide/quickstart' },
            { text: 'Configuration', link: '/guide/configuration' }
          ]
        },
        {
          text: 'Using AI Kindle',
          collapsed: false,
          items: [
            { text: 'Usage', link: '/guide/usage' },
            { text: 'Keyboard shortcuts', link: '/guide/keyboard-shortcuts' },
            { text: 'Syncing across devices', link: '/guide/syncing' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' }
          ]
        }
      ],
      '/development/': [
        {
          text: 'Development',
          collapsed: false,
          items: [
            { text: 'Architecture', link: '/development/architecture' },
            { text: 'Build from source', link: '/development/build-from-source' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vishalsingha/AI_Kindle' }
    ],

    footer: {
      message:
        'A local, AI-assisted PDF study companion. Personal use, no warranty.',
      copyright: '© 2026 AI Kindle contributors'
    },

    editLink: {
      pattern:
        'https://github.com/vishalsingha/AI_Kindle/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local',
      options: {
        detailedView: true
      }
    },

    outline: {
      level: [2, 3],
      label: 'On this page'
    }
  }
})
