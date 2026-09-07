import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Pocket',
  tagline: 'A private, self-hosted bookmark library for your NAS.',
  favicon: 'img/favicon.png',

  url: 'https://pocket.pinkpixel.dev',
  baseUrl: '/',

  organizationName: 'pinkpixel-dev',
  projectName: 'pocket',

  future: {
    faster: true,
    v4: true,
  },


  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    function polyfillResolveWeakPlugin() {
      return {
        name: 'polyfill-resolve-weak',
        configureWebpack(config, isServer, utils) {
          const customConfig: any = {
            module: {
              rules: [
                {
                  test: /\.m?js$/,
                  type: 'javascript/auto',
                  resolve: {
                    fullySpecified: false,
                  },
                },
              ],
            },
          };

          if (isServer) {
            const Bundler = utils.currentBundler.instance;
            customConfig.plugins = [
              new Bundler.BannerPlugin({
                banner:
                  'if (typeof require !== "undefined") {\n' +
                  '  const _origReq = require;\n' +
                  '  const _mockReq = function(id) {\n' +
                  '    if (typeof id === "string" && (id.includes("prism-include-languages") || id.includes("nprogress"))) {\n' +
                  '      return function() {};\n' +
                  '    }\n' +
                  '    return _origReq(id);\n' +
                  '  };\n' +
                  '  Object.assign(_mockReq, _origReq);\n' +
                  '  if (!_mockReq.resolveWeak) {\n' +
                  '    _mockReq.resolveWeak = function(id) { try { return _mockReq.resolve(id); } catch(e) { return id; } };\n' +
                  '  }\n' +
                  '  if (_mockReq.extensions) {\n' +
                  '    _mockReq.extensions[".css"] = function(module) { module.exports = {}; };\n' +
                  '  }\n' +
                  '  require = _mockReq;\n' +
                  '}\n',
                raw: true,
                entryOnly: false,
              }),
              {
                apply(compiler: any) {
                  compiler.hooks.afterEmit.tap('ServerPackageJsonPlugin', (compilation: any) => {
                    const fs = require('node:fs');
                    const path = require('node:path');
                    const outputPath = compilation.outputOptions.path;
                    if (outputPath) {
                      fs.writeFileSync(
                        path.join(outputPath, 'package.json'),
                        JSON.stringify({ type: 'commonjs' })
                      );
                    }
                  });
                },
              },
            ];
          }
          return customConfig;
        },
      };
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Pocket',
      logo: {
        alt: 'Pocket Logo',
        src: 'img/logo.png',
        width: 28,
        height: 28,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/docs/getting-started/quickstart',
          label: 'Quickstart',
          position: 'left',
        },
        {
          to: '/docs/ai-automation/configuration',
          label: 'AI Setup',
          position: 'left',
        },
        {
          href: 'https://github.com/pinkpixel-dev/pocket',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Overview',
              to: '/docs/intro',
            },
            {
              label: 'Quickstart',
              to: '/docs/getting-started/quickstart',
            },
            {
              label: 'NAS Guides',
              to: '/docs/getting-started/nas-guides',
            },
          ],
        },
        {
          title: 'Features',
          items: [
            {
              label: 'User Guide',
              to: '/docs/user-guide/bookmarks',
            },
            {
              label: 'AI Automation',
              to: '/docs/ai-automation/configuration',
            },
            {
              label: 'Mobile PWA',
              to: '/docs/user-guide/mobile',
            },
          ],
        },
        {
          title: 'Self-Hosting',
          items: [
            {
              label: 'Multi-User Isolation',
              to: '/docs/operations/multi-user',
            },
            {
              label: 'Database & Backups',
              to: '/docs/operations/database-backup',
            },
            {
              label: 'Link Health Audit',
              to: '/docs/operations/link-health',
            },
            {
              label: 'Configuration Reference',
              to: '/docs/operations/configuration',
            },
          ],
        },
      ],
      copyright: `Pocket — A private, self-hosted bookmark library for your NAS. Apache 2.0 License.`,
    },
    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'yaml', 'json', 'docker', 'nginx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
