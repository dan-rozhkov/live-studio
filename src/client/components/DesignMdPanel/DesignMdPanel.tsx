import { h, Fragment, type JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { marked } from 'marked';
import { ChevronRight, Clipboard, Check, AlertTriangle } from 'lucide-preact';
import { useStore } from '../../state/store';
import {
  parseDesignMd,
  resolveRef,
  lookupRef,
  contrastRatio,
  toCssLength,
  type DesignMdDoc,
  type TypographyToken,
} from './design-md-parse';
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
      {doc.components && <ComponentsSection doc={doc} />}
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

function EmptyState() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(SKILL_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div class={styles.empty}>
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
// Components — render actual previews with resolved tokens applied
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedStyles {
  base: JSX.CSSProperties;
  hover: JSX.CSSProperties;
  active: JSX.CSSProperties;
}

function applyTypography(target: JSX.CSSProperties, t: TypographyToken): void {
  if (t.fontFamily) target.fontFamily = t.fontFamily;
  if (t.fontSize != null)
    target.fontSize = typeof t.fontSize === 'number' ? `${t.fontSize}px` : t.fontSize;
  if (t.fontWeight != null) target.fontWeight = t.fontWeight;
  if (t.lineHeight != null) target.lineHeight = t.lineHeight;
  if (t.letterSpacing != null)
    target.letterSpacing =
      typeof t.letterSpacing === 'number' ? `${t.letterSpacing}px` : t.letterSpacing;
  if (t.fontFeature) target.fontFeatureSettings = t.fontFeature;
  if (t.fontVariation) target.fontVariationSettings = t.fontVariation;
}

function applyProp(
  target: JSX.CSSProperties,
  key: string,
  rawVal: string,
  doc: DesignMdDoc,
): void {
  if (key === 'font') {
    const typo = lookupRef(doc, rawVal);
    if (typo && typeof typo === 'object') applyTypography(target, typo as TypographyToken);
    return;
  }
  const { value, unresolved } = resolveRef(doc, rawVal);
  if (unresolved) return;
  switch (key) {
    case 'background': target.background = value; break;
    case 'color': target.color = value; break;
    case 'border': target.border = value; break;
    case 'radius': target.borderRadius = value; break;
    case 'shadow': target.boxShadow = value; break;
    case 'width': target.width = value; break;
    case 'height': target.height = value; break;
    case 'padding-y': target.paddingTop = value; target.paddingBottom = value; break;
    case 'padding-x': target.paddingLeft = value; target.paddingRight = value; break;
    // Unknown keys (e.g. project-specific) are silently ignored — this is a preview.
  }
}

function resolveComponentStyles(
  props: Record<string, string>,
  doc: DesignMdDoc,
): ResolvedStyles {
  const out: ResolvedStyles = { base: {}, hover: {}, active: {} };
  for (const [key, raw] of Object.entries(props)) {
    if (key.startsWith('hover-')) applyProp(out.hover, key.slice(6), raw, doc);
    else if (key.startsWith('active-')) applyProp(out.active, key.slice(7), raw, doc);
    else if (key.startsWith('selected-')) continue; // no demo surface for selection
    else applyProp(out.base, key, raw, doc);
  }
  return out;
}

function styleToCss(style: JSX.CSSProperties): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (v == null) continue;
    const prop = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    pairs.push(`${prop}:${v}`);
  }
  return pairs.join(';');
}

type ElementKind = 'button' | 'input' | 'chip' | 'row' | 'surface';

function pickElementKind(name: string): ElementKind {
  const n = name.toLowerCase();
  if (n.includes('button') || n.includes('btn')) return 'button';
  if (n.includes('input') || n.includes('field') || n.includes('textarea')) return 'input';
  if (n.includes('chip') || n.includes('tag') || n.includes('badge')) return 'chip';
  if (n.includes('row') || n.includes('item') || n.includes('cell')) return 'row';
  return 'surface';
}

function renderPreview(name: string, kind: ElementKind, className: string): h.JSX.Element {
  switch (kind) {
    case 'button':
      return <button class={className}>{name}</button>;
    case 'input':
      return <input class={className} type="text" placeholder={name} />;
    case 'chip':
      return <span class={className}>{name}</span>;
    case 'row':
      return (
        <div class={className}>
          <span>{name}</span>
          <span class={styles.rowMeta}>row · hover me</span>
        </div>
      );
    case 'surface':
    default:
      return (
        <div class={className}>
          <div class={styles.surfaceLabel}>{name}</div>
        </div>
      );
  }
}

function ComponentPreview({ name, props, doc, slug }: {
  name: string;
  props: Record<string, string>;
  doc: DesignMdDoc;
  slug: string;
}) {
  const { base, hover, active } = useMemo(
    () => resolveComponentStyles(props, doc),
    [props, doc],
  );
  const kind = pickElementKind(name);
  const cls = `ls-cmp-${slug}`;
  const kindClass = kindToClass(kind);
  const className = `${styles.preview} ${kindClass} ${cls}`;

  // Scoped stylesheet: inline styles can't reach :hover / :active,
  // and we want width/padding to come from tokens rather than CSS modules.
  const baseCss = styleToCss(base);
  const hoverCss = styleToCss(hover);
  const activeCss = styleToCss(active);
  const scoped = [
    baseCss && `.${cls}{${baseCss}}`,
    hoverCss && `.${cls}:hover{${hoverCss}}`,
    activeCss && `.${cls}:active{${activeCss}}`,
  ].filter(Boolean).join('\n');

  return (
    <div class={styles.componentCell}>
      {scoped && <style>{scoped}</style>}
      <div class={styles.previewWrap}>
        {renderPreview(name, kind, className)}
      </div>
      <div class={styles.componentName}>{name}</div>
    </div>
  );
}

function kindToClass(kind: ElementKind): string {
  switch (kind) {
    case 'button': return styles.preview_button;
    case 'input': return styles.preview_input;
    case 'chip': return styles.preview_chip;
    case 'row': return styles.preview_row;
    case 'surface': return styles.preview_surface;
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ComponentsSection({ doc }: { doc: DesignMdDoc }) {
  const entries = Object.entries(doc.components ?? {});
  return (
    <Section title="Components" defaultOpen={true}>
      <div class={styles.componentGrid}>
        {entries.map(([name, props]) => (
          <ComponentPreview
            key={name}
            name={name}
            props={props}
            doc={doc}
            slug={slugify(name)}
          />
        ))}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown body
// ─────────────────────────────────────────────────────────────────────────────

function MarkdownBody({ body }: { body: string }) {
  const html = useMemo(
    () => marked.parse(body, { async: false, breaks: false, gfm: true }) as string,
    [body],
  );
  return (
    <Section title="Notes" defaultOpen={false}>
      <div class={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} />
    </Section>
  );
}
