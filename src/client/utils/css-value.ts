const NAMED_COLORS = [
  'red', 'blue', 'green', 'white', 'black', 'orange', 'yellow', 'purple',
  'pink', 'cyan', 'magenta', 'transparent', 'currentcolor', 'inherit',
];

export function isColorValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) return true;
  if (v.startsWith('rgb')) return true;
  if (v.startsWith('hsl')) return true;
  if (v.startsWith('lch')) return true;
  if (v.startsWith('oklch')) return true;
  if (v.startsWith('lab')) return true;
  if (v.startsWith('oklab')) return true;
  if (v.startsWith('color(')) return true;
  return NAMED_COLORS.includes(v);
}

export function isNumericValue(value: string): boolean {
  return /^-?[\d.]+\s*(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|pt|cm|mm|in|s|ms|deg|rad|turn)?$/.test(value.trim());
}
