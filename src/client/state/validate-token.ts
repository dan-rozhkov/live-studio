export type ValidateTokenResult =
  | { ok: true; name: string; value: string }
  | { ok: false; error: string };

const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const ILLEGAL_VALUE_CHARS = /[;{}]/;

export function validateToken(
  rawName: string,
  rawValue: string,
  existingTokens: ReadonlyArray<{ name: string }>,
): ValidateTokenResult {
  const name = rawName.trim().replace(/^-+/, '');
  const value = rawValue.trim();

  if (!name) return { ok: false, error: 'Name is required' };
  if (!value) return { ok: false, error: 'Value is required' };
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, error: 'Name may contain only letters, digits, hyphens, and underscores' };
  }
  if (ILLEGAL_VALUE_CHARS.test(value)) {
    return { ok: false, error: 'Value contains illegal characters' };
  }
  if (existingTokens.some((t) => t.name === name)) {
    return { ok: false, error: `Variable --${name} already exists` };
  }

  return { ok: true, name, value };
}
