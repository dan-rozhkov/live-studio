import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { ChevronRight, Clipboard, Check, AlertTriangle } from 'lucide-preact';
import { useStore } from '../../state/store';
import {
  parseDesignMd,
  resolveRef,
  contrastRatio,
  toCssLength,
  type DesignMdDoc,
  type TypographyToken,
} from './design-md-parse';
import { renderSafeMarkdown } from '../../utils/markdown';
import type { JSX } from 'preact';
import styles from './DesignMdPanel.module.css';

const SKILL_PROMPT = `Create a DESIGN.md file at the project root following the google-labs-code/design.md spec. Inspect Tailwind config, CSS custom properties, and existing component styles to derive real tokens. See the /studio skill for the full template and schema.`;

export function DesignMdPanel() {
  const designMd = useStore((s) => s.designMd);

  const parsed = useMemo(() => {
    if (!designMd.content) return null;
    return parseDesignMd(designMd.content);
  }, [designMd.content]);

  if (!designMd.content || !parsed) return <EmptyState />;

  const { doc, body, error } = parsed;

  return (
    <div class={styles.panel}>
      <Header doc={doc} />
      {error && (
        <div class={styles.warning}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {doc.colors && <ColorsSection doc={doc} />}
      {doc.typography && <TypographySection doc={doc} />}
      {doc.rounded && <RoundedSection doc={doc} />}
      {doc.spacing && <SpacingSection doc={doc} />}
      {body.trim() && <MarkdownBody body={body} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function Header({ doc }: { doc: DesignMdDoc }) {
  return (
    <div class={styles.header}>
      <div class={styles.title}>{doc.name ?? 'Untitled design'}</div>
      {doc.description && <div class={styles.subtitle}>{doc.description}</div>}
      {doc.version && <div class={styles.version}>v{doc.version}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible section (local variant — PropertiesPanel's is not exported)
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string;
  children: preact.ComponentChildren;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div class={styles.section}>
      <button class={styles.sectionHeader} onClick={() => setOpen(!open)}>
        <ChevronRight
          size={12}
          class={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
        <span>{title}</span>
      </button>
      {open && <div class={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyIllustration() {
  return (
    <svg
      class={styles.emptyIllustration}
      width="96"
      height="72"
      viewBox="0 0 96 72"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {/* window frame */}
      <rect x="2" y="2" width="92" height="68" rx="4" />
      {/* traffic lights */}
      <circle cx="8" cy="8" r="1" />
      <circle cx="13" cy="8" r="1" />
      <circle cx="18" cy="8" r="1" />
      {/* sidebar divider */}
      <line x1="32" y1="14" x2="32" y2="70" />
      {/* sidebar rows */}
      <line x1="7" y1="20" x2="18" y2="20" />
      <line x1="7" y1="26" x2="22" y2="26" />
      <line x1="7" y1="32" x2="18" y2="32" />
      <line x1="7" y1="38" x2="22" y2="38" />
      {/* content rows */}
      <line x1="37" y1="20" x2="48" y2="20" />
      <line x1="52" y1="20" x2="60" y2="20" />
      <line x1="37" y1="26" x2="46" y2="26" />
      <line x1="50" y1="26" x2="58" y2="26" />
      <line x1="37" y1="32" x2="48" y2="32" />
      {/* dashed placeholder frame */}
      <rect
        x="56"
        y="38"
        width="32"
        height="26"
        rx="1"
        stroke-dasharray="3 2"
      />
      {/* sparkle */}
      <path d="M72 45 L73 49 L77 50 L73 51 L72 55 L71 51 L67 50 L71 49 Z" />
    </svg>
  );
}

function EmptyState() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(SKILL_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div class={styles.empty}>
      <EmptyIllustration />
      <div class={styles.emptyTitle}>No DESIGN.md yet</div>
      <div class={styles.emptyText}>
        Live Studio looks for <code>DESIGN.md</code> at your project root. Ask
        your agent to create one — it follows the{' '}
        <a
          href="https://github.com/google-labs-code/design.md"
          target="_blank"
          rel="noreferrer"
        >
          google-labs-code/design.md
        </a>{' '}
        spec.
      </div>
      <div class={styles.emptyText}>
        If you already have one, the <code>live-studio</code> MCP server may not
        be running — make sure it's started and connected.
      </div>
      <button class={styles.emptyBtn} onClick={copy}>
        {copied ? <Check size={12} /> : <Clipboard size={12} />}
        {copied ? 'Copied' : 'Copy prompt'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────────────────────

function ColorsSection({ doc }: { doc: DesignMdDoc }) {
  const entries = Object.entries(doc.colors ?? {});
  return (
    <Section title="Colors">
      <div class={styles.swatchGrid}>
        {entries.map(([name, raw]) => {
          const { value, unresolved } = resolveRef(doc, raw);
          const ratio = contrastRatio(value, '#ffffff');
          return (
            <div class={styles.swatch} key={name}>
              <div
                class={styles.swatchChip}
                style={{ background: unresolved ? 'transparent' : value }}
              >
                {unresolved && <AlertTriangle size={14} />}
              </div>
              <div class={styles.swatchMeta}>
                <div class={styles.swatchName}>{name}</div>
                <div class={styles.swatchValue}>
                  {unresolved ? `↯ ${unresolved}` : value}
                </div>
                {ratio !== null && !unresolved && (
                  <div class={styles.swatchHint} title="Contrast vs white">
                    {ratio.toFixed(2)}:1
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────

function TypographySection({ doc }: { doc: DesignMdDoc }) {
  const entries = Object.entries(doc.typography ?? {});
  return (
    <Section title="Typography">
      <div class={styles.typeList}>
        {entries.map(([name, token]) => (
          <TypographyRow key={name} name={name} token={token} />
        ))}
      </div>
    </Section>
  );
}

function TypographyRow({ name, token }: { name: string; token: TypographyToken }) {
  const style: JSX.CSSProperties = {
    fontFamily: token.fontFamily,
    fontSize: typeof token.fontSize === 'number' ? `${token.fontSize}px` : token.fontSize,
    fontWeight: token.fontWeight,
    lineHeight: token.lineHeight,
    letterSpacing:
      typeof token.letterSpacing === 'number'
        ? `${token.letterSpacing}px`
        : token.letterSpacing,
    fontFeatureSettings: token.fontFeature,
    fontVariationSettings: token.fontVariation,
  };
  const meta = [
    token.fontFamily,
    token.fontSize,
    token.fontWeight && `w${token.fontWeight}`,
    token.lineHeight && `lh ${token.lineHeight}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div class={styles.typeRow}>
      <div class={styles.typeName}>{name}</div>
      <div class={styles.typePreview} style={style}>
        The quick brown fox jumps
      </div>
      <div class={styles.typeMeta}>{meta}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rounded / Spacing — scale sections share the same iteration shape
// ─────────────────────────────────────────────────────────────────────────────

function RoundedSection({ doc }: { doc: DesignMdDoc }) {
  return (
    <Section title="Rounded">
      <div class={styles.roundedRow}>
        {Object.entries(doc.rounded ?? {}).map(([name, raw]) => {
          const value = toCssLength(raw);
          return (
            <div class={styles.roundedItem} key={name}>
              <div class={styles.roundedBox} style={{ borderRadius: value }} />
              <div class={styles.scaleName}>{name}</div>
              <div class={styles.scaleValue}>{value}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function SpacingSection({ doc }: { doc: DesignMdDoc }) {
  return (
    <Section title="Spacing">
      <div class={styles.spacingList}>
        {Object.entries(doc.spacing ?? {}).map(([name, raw]) => {
          const value = toCssLength(raw);
          return (
            <div class={styles.spacingRow} key={name}>
              <div class={styles.scaleName}>{name}</div>
              <div class={styles.spacingBar} style={{ width: value }} />
              <div class={styles.scaleValue}>{value}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Markdown body
// ─────────────────────────────────────────────────────────────────────────────

function MarkdownBody({ body }: { body: string }) {
  const html = useMemo(() => renderSafeMarkdown(body), [body]);
  return (
    <Section title="Notes" defaultOpen={false}>
      <div class={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} />
    </Section>
  );
}
