import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function renderSafeMarkdown(markdown: string): string {
  const html = marked.parse(markdown, {
    async: false,
    breaks: false,
    gfm: true,
  }) as string;

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
