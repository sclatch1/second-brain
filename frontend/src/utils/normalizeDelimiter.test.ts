import { describe, it, expect } from 'vitest';
import { normalizeMathDelimiters } from './normalizeMathDelimiter';

describe('normalizeMathDelimiters', () => {
  it('converts \\[ \\] to $$ $$', () => {
    expect(normalizeMathDelimiters('\\[x^2\\]')).toBe('$$x^2$$');
  });

  it('converts \\( \\) to $ $', () => {
    expect(normalizeMathDelimiters('\\(x\\)')).toBe('$x$');
  });

  it('leaves plain text unchanged', () => {
    expect(normalizeMathDelimiters('hello world')).toBe('hello world');
  });
});
