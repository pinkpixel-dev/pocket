import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {
  Database,
  Users,
  Cpu,
  Smartphone,
  ShieldCheck,
  FolderSync,
  ArrowRight,
  ExternalLink,
  BookOpen,
  Layers,
  Sparkles,
} from 'lucide-react';
import QuickstartSnippet from '../components/QuickstartSnippet';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  const [activeView, setActiveView] = useState<'grid' | 'list' | 'mobile'>('grid');

  return (
    <Layout
      title="Pocket — Self-Hosted Bookmark Library for Your NAS"
      description="A private, self-hosted bookmark library for your NAS. Single SQLite file, multi-user isolation, fast background metadata, and optional AI filing."
    >
      <header className={styles.hero}>
        <div className={styles.heroContainer}>
          <div className={styles.badgeRow}>
            <span className={styles.versionBadge}>v2.2.0</span>
            <span className={styles.categoryBadge}>Local-First & Self-Hosted</span>
          </div>

          <h1 className={styles.heroTitle}>
            A private bookmark library for your NAS.
          </h1>

          <p className={styles.heroSubtitle}>
            Save links with a single paste. Pocket fetches titles, favicons, and real page previews
            in the background, keeping your entire library inside a single SQLite file on your own server.
            No subscriptions, no cloud sync, no tracking.
          </p>

          <div className={styles.heroActions}>
            <Link
              to="/docs/getting-started/quickstart"
              className={`button button--primary ${styles.primaryCta}`}
            >
              <span>Get Started</span>
              <ArrowRight size={16} />
            </Link>

            <Link
              to="/docs/intro"
              className={`button button--secondary ${styles.secondaryCta}`}
            >
              <BookOpen size={16} />
              <span>Read Documentation</span>
            </Link>

            <a
              href="https://github.com/pinkpixel-dev/pocket"
              target="_blank"
              rel="noopener noreferrer"
              className={`button button--secondary ${styles.githubCta}`}
            >
              <span>GitHub</span>
              <ExternalLink size={14} />
            </a>
          </div>

          <div className={styles.quickstartSection}>
            <QuickstartSnippet />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Screenshot / Interface Showcase */}
        <section className={styles.showcaseSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Designed for scanning and browsing</h2>
            <p className={styles.sectionSubtitle}>
              Switch seamlessly between rich visual cards, a compact scanning list, or a standalone mobile PWA.
            </p>
          </div>

          <div className={styles.viewToggleGroup}>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${activeView === 'grid' ? styles.viewToggleActive : ''}`}
              onClick={() => setActiveView('grid')}
            >
              <Layers size={15} />
              <span>Grid View</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${activeView === 'list' ? styles.viewToggleActive : ''}`}
              onClick={() => setActiveView('list')}
            >
              <FolderSync size={15} />
              <span>List View</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${activeView === 'mobile' ? styles.viewToggleActive : ''}`}
              onClick={() => setActiveView('mobile')}
            >
              <Smartphone size={15} />
              <span>Mobile PWA</span>
            </button>
          </div>

          <div className={styles.imageWrapper}>
            {activeView === 'grid' && (
              <div className={styles.imageCard}>
                <img
                  src="/img/grid-view.png"
                  alt="Pocket Grid View Interface"
                  className={styles.screenshotImage}
                  loading="lazy"
                />
                <div className={styles.imageCaption}>
                  Grid view with custom covers, domain badges, tags, and resizable collection sidebar.
                </div>
              </div>
            )}
            {activeView === 'list' && (
              <div className={styles.imageCard}>
                <img
                  src="/img/list-view.png"
                  alt="Pocket List View Interface"
                  className={styles.screenshotImage}
                  loading="lazy"
                />
                <div className={styles.imageCaption}>
                  Compact list view designed for fast scanning, bulk selection, and rapid library auditing.
                </div>
              </div>
            )}
            {activeView === 'mobile' && (
              <div className={styles.mobileImageCard}>
                <img
                  src="/img/mobile.png"
                  alt="Pocket Mobile PWA Interface"
                  className={styles.mobileScreenshotImage}
                  loading="lazy"
                />
                <div className={styles.imageCaption}>
                  Fully responsive mobile layout with bottom navigation and touch-optimized gestures.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Core Architecture Features */}
        <section className={styles.featuresSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Built for stability, privacy, and control</h2>
            <p className={styles.sectionSubtitle}>
              No complex microservices. Pocket is engineered to run quietly on your home server for years without maintenance.
            </p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Database size={22} />
              </div>
              <h3 className={styles.featureTitle}>Single-File SQLite & WAL</h3>
              <p className={styles.featureText}>
                The entire database is stored in <code>pocket.db</code>. Backing up your bookmarks, tags, and user accounts
                is as simple as copying the <code>data/</code> folder. Zero external database servers required.
              </p>
              <Link to="/docs/operations/database-backup" className={styles.featureLink}>
                Learn about backups &rarr;
              </Link>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Users size={22} />
              </div>
              <h3 className={styles.featureTitle}>Multi-User Account Isolation</h3>
              <p className={styles.featureText}>
                Share your home server with your household. Every user receives a completely isolated library
                with private bookmarks, collections, tags, and individual AI quota settings.
              </p>
              <Link to="/docs/operations/multi-user" className={styles.featureLink}>
                Learn about user isolation &rarr;
              </Link>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <ShieldCheck size={22} />
              </div>
              <h3 className={styles.featureTitle}>SSRF Protection & Safe Fetching</h3>
              <p className={styles.featureText}>
                Inbound URLs are vetted against local subnets and loopbacks before crawling. DNS resolution is guarded
                to prevent private network probing, keeping your NAS secure.
              </p>
              <Link to="/docs/operations/link-health" className={styles.featureLink}>
                Link health & security &rarr;
              </Link>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Sparkles size={22} />
              </div>
              <h3 className={styles.featureTitle}>Taxonomy-First AI Organization</h3>
              <p className={styles.featureText}>
                Optional OpenAI integration. Pocket plans high-level shelf structures first, then files backlog bookmarks,
                deduplicates tags by synonym, and refuses to hallucinate duplicate collections.
              </p>
              <Link to="/docs/ai-automation/taxonomy" className={styles.featureLink}>
                AI taxonomy rules &rarr;
              </Link>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <FolderSync size={22} />
              </div>
              <h3 className={styles.featureTitle}>Browser Import & Audit</h3>
              <p className={styles.featureText}>
                Import thousands of links from Chrome, Firefox, or Safari HTML exports in seconds.
                An optional background audit verifies link health without blocking your imports.
              </p>
              <Link to="/docs/user-guide/import-export" className={styles.featureLink}>
                Import & export guide &rarr;
              </Link>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Cpu size={22} />
              </div>
              <h3 className={styles.featureTitle}>Lightweight Docker Container</h3>
              <p className={styles.featureText}>
                Runs in under 150 MB of RAM with minimal CPU overhead. Ready-to-use templates for Synology
                Container Manager, TrueNAS SCALE, and Unraid.
              </p>
              <Link to="/docs/getting-started/nas-guides" className={styles.featureLink}>
                NAS setup guides &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaCard}>
            <h2 className={styles.ctaTitle}>Deploy Pocket on your NAS today</h2>
            <p className={styles.ctaSubtitle}>
              Takes less than 60 seconds with Docker Compose. Check out our step-by-step guides.
            </p>
            <div className={styles.ctaButtons}>
              <Link to="/docs/getting-started/quickstart" className="button button--primary">
                Docker Quickstart
              </Link>
              <Link to="/docs/getting-started/nas-guides" className="button button--secondary">
                Synology & NAS Setup
              </Link>
              <Link to="/docs/intro" className="button button--secondary">
                Architecture Overview
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
