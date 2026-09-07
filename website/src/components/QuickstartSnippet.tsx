import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import styles from './QuickstartSnippet.module.css';

const COMPOSE_YAML = `services:
  pocket:
    image: ghcr.io/pinkpixel-dev/pocket:latest
    container_name: pocket
    restart: unless-stopped
    ports:
      - '8420:8420'
    volumes:
      - ./data:/data
    environment:
      - PORT=8420
      # Optional: set a shared fallback OpenAI key for all users
      # - POCKET_OPENAI_API_KEY=sk-...`;

export default function QuickstartSnippet(): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COMPOSE_YAML);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  return (
    <div className={styles.snippetContainer}>
      <div className={styles.snippetHeader}>
        <div className={styles.tabGroup}>
          <div className={styles.fileTab}>
            <Terminal size={14} className={styles.tabIcon} />
            <span>compose.yml</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={styles.copyButton}
          aria-label="Copy Docker Compose snippet"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check size={14} className={styles.checkIcon} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={styles.pre}>
        <code>{COMPOSE_YAML}</code>
      </pre>
      <div className={styles.runBox}>
        <span className={styles.prompt}>$</span>
        <code>docker compose up -d</code>
      </div>
    </div>
  );
}
