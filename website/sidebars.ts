import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/quickstart',
        'getting-started/installation',
        'getting-started/nas-guides',
      ],
    },
    {
      type: 'category',
      label: 'User Guide',
      collapsed: false,
      items: [
        'user-guide/bookmarks',
        'user-guide/organization',
        'user-guide/import-export',
        'user-guide/mobile',
      ],
    },
    {
      type: 'category',
      label: 'AI Automation',
      collapsed: false,
      items: [
        'ai-automation/configuration',
        'ai-automation/models',
        'ai-automation/taxonomy',
      ],
    },
    {
      type: 'category',
      label: 'Operations & Self-Hosting',
      collapsed: false,
      items: [
        'operations/multi-user',
        'operations/database-backup',
        'operations/link-health',
        'operations/configuration',
      ],
    },
  ],
};

export default sidebars;
