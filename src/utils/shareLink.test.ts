import { describe, it, expect } from 'vitest';
import {
  parseSoloShareParams,
  buildSoloShareLink,
  soloShareParamsFromSearch,
} from './shareLink';

describe('parseSoloShareParams', () => {
  it('round-trips valid params', () => {
    expect(parseSoloShareParams('?seed=123456789&size=12&colors=5')).toEqual({
      seed: 123456789,
      size: 12,
      colors: 5,
    });
  });

  it('rejects every illegal dimension', () => {
    expect(parseSoloShareParams('?seed=abc&size=12&colors=5')).toBeNull();
    expect(parseSoloShareParams('?seed=999999999999&size=12&colors=5')).toBeNull(); // beyond u32
    expect(parseSoloShareParams('?seed=-1&size=12&colors=5')).toBeNull();
    expect(parseSoloShareParams('?seed=7&size=8&colors=5')).toBeNull(); // 8 not a size
    expect(parseSoloShareParams('?seed=7&size=12&colors=3')).toBeNull(); // 3 not a palette
    expect(parseSoloShareParams('?seed=7&size=12')).toBeNull(); // missing colors
    // The raw parser stays independent of the ?room= precedence guard.
    expect(parseSoloShareParams('?room=AB12&seed=7&size=12&colors=5')).toEqual({
      seed: 7,
      size: 12,
      colors: 5,
    });
  });
});

describe('soloShareParamsFromSearch', () => {
  it('defers to ?room= links and parses solo shares otherwise', () => {
    expect(soloShareParamsFromSearch('?room=ZZZZ&seed=42&size=10&colors=4')).toBeNull();
    expect(soloShareParamsFromSearch('?seed=42&size=10&colors=4')).toEqual({
      seed: 42,
      size: 10,
      colors: 4,
    });
  });
});

describe('buildSoloShareLink', () => {
  it('carries exactly the share params on an absolute URL', () => {
    const link = buildSoloShareLink(
      { seed: 42, size: 12, colors: 5 },
      'https://example.com/index.html',
    );
    const u = new URL(link);
    expect(u.origin).toBe('https://example.com');
    expect(u.searchParams.get('seed')).toBe('42');
    expect(u.searchParams.get('size')).toBe('12');
    expect(u.searchParams.get('colors')).toBe('5');
    expect(u.searchParams.get('room')).toBeNull();
  });

  it('replaces pre-existing query params (a room never drags along)', () => {
    const link = buildSoloShareLink(
      { seed: 7, size: 10, colors: 4 },
      'https://example.com/?room=AB12&utm=x',
    );
    const q = new URLSearchParams(new URL(link).search);
    expect(q.get('room')).toBeNull();
    expect(q.get('utm')).toBeNull();
    expect(q.get('seed')).toBe('7');
  });
});
