import moo from 'moo';

const tokenLexer = moo.compile({
  appendixLabel: {
    match: /\b[Aa][Pp][Pp][Ee][Nn][Dd][Ii][Xx][ \t]+[A-Za-z0-9]+\b/,
    value: (value) => {
      const parts = value.trim().split(/[ \t]+/);
      const suffix = parts.at(-1)?.toUpperCase() ?? '';

      return `Appendix ${suffix}`;
    },
  },
  canonicalId: /\b[A-K](?:\.[0-9A-Za-z]+)+(?::[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?\b(?!:)/,
  whitespace: { match: /[ \t\r\n]+/, lineBreaks: true },
  other: { match: /[^]/, lineBreaks: true },
});

const dedupeStrings = (values: readonly string[]): string[] => {
  return [...new Set(values)];
};

const collectTokenValues = (input: string, tokenType: string): string[] => {
  const values: string[] = [];

  tokenLexer.reset(input);

  for (const token of tokenLexer) {
    if (token.type === tokenType) {
      values.push(token.value.trim());
    }
  }

  return dedupeStrings(values);
};

const isAsciiDigit = (value: string | undefined): boolean => {
  return value !== undefined && value >= '0' && value <= '9';
};

const isAsciiUpper = (value: string | undefined): boolean => {
  return value !== undefined && value >= 'A' && value <= 'Z';
};

const isAsciiLower = (value: string | undefined): boolean => {
  return value !== undefined && value >= 'a' && value <= 'z';
};

const isAsciiLetter = (value: string | undefined): boolean => {
  return isAsciiUpper(value) || isAsciiLower(value);
};

const isAsciiAlphaNumeric = (value: string | undefined): boolean => {
  return isAsciiLetter(value) || isAsciiDigit(value);
};

const isWhitespace = (value: string | undefined): boolean => {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r';
};

export const collectCanonicalIdValues = (input: string): string[] => {
  return collectTokenValues(input, 'canonicalId');
};

export const collectAppendixLabelValues = (input: string): string[] => {
  return collectTokenValues(input, 'appendixLabel');
};

export const extractPartLetter = (input: string): string | null => {
  const trimmed = input.trimStart();

  if (!trimmed.toLowerCase().startsWith('part')) {
    return null;
  }

  let cursor = 4;

  if (!isWhitespace(trimmed[cursor])) {
    return null;
  }

  while (isWhitespace(trimmed[cursor])) {
    cursor += 1;
  }

  const branchId = trimmed[cursor]?.toUpperCase();

  if (!branchId || branchId < 'A' || branchId > 'K') {
    return null;
  }

  if (isAsciiAlphaNumeric(trimmed[cursor + 1])) {
    return null;
  }

  return branchId;
};
