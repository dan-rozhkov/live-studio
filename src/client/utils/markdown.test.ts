import { describe, expect, it } from 'vitest';
import { renderSafeMarkdown } from './markdown';

describe('renderSafeMarkdown', () => {
  it('removes scripts, event handlers, and unsafe URLs', () => {
    const html = renderSafeMarkdown(`
<script>alert('x')</script>
<img src="x" onerror="alert('x')">
<a href="javascript:alert('x')">bad</a>
`);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('keeps normal markdown structures', () => {
    const html = renderSafeMarkdown(`
# Title

- item

[safe](https://example.com)

| A | B |
| - | - |
| 1 | 2 |
`);

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>item</li>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<table>');
  });
});
