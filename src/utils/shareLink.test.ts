import { describe, it, expect } from 'vitest';
import {
  parseSoloShareParams,
  buildSoloShareLink,
  soloShareParamsFromSearch,
} from './shareLink';
import { WHEEL_GEOMETRY, generateSeededWheelBoard } from './circleEngine';
import { generateSeededCubeBoard, getCubeSide } from './cubeEngine';
import { generateMosaicBoard } from './mosaicEngine';
import { mulberry32 } from './engine';

describe('parseSoloShareParams', () => {
  it('round-trips valid params (shape absent ⇒ classic)', () => {
    expect(parseSoloShareParams('?seed=123456789&size=12&colors=5')).toEqual({
      seed: 123456789,
      size: 12,
      colors: 5,
      shape: 'classic',
    });
  });

  it('accepts an explicit topology and rejects unknown ones', () => {
    expect(parseSoloShareParams('?seed=7&size=10&colors=4&shape=wheel')).toEqual({
      seed: 7,
      size: 10,
      colors: 4,
      shape: 'wheel',
    });
    expect(parseSoloShareParams('?seed=7&size=10&colors=4&shape=classic')).toMatchObject({
      shape: 'classic',
    });
    // A malformed topology must not silently open a different board.
    expect(parseSoloShareParams('?seed=7&size=10&colors=4&shape=sphere')).toBeNull();
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
      shape: 'classic',
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
      shape: 'classic',
    });
  });
});

describe('buildSoloShareLink', () => {
  it('carries exactly the share params on an absolute URL', () => {
    const link = buildSoloShareLink(
      { seed: 42, size: 12, colors: 5, shape: 'classic' },
      'https://example.com/index.html',
    );
    const u = new URL(link);
    expect(u.origin).toBe('https://example.com');
    expect(u.searchParams.get('seed')).toBe('42');
    expect(u.searchParams.get('size')).toBe('12');
    expect(u.searchParams.get('colors')).toBe('5');
    expect(u.searchParams.get('room')).toBeNull();
    // P7.3: classic links stay byte-identical to the pre-wheel format.
    expect(u.searchParams.get('shape')).toBeNull();
  });

  it('appends shape=wheel for wheel boards', () => {
    const link = buildSoloShareLink(
      { seed: 42, size: 14, colors: 6, shape: 'wheel' },
      'https://example.com/',
    );
    const u = new URL(link);
    expect(u.searchParams.get('shape')).toBe('wheel');
    expect(u.searchParams.get('size')).toBe('14');
  });

  it('replaces pre-existing query params (a room never drags along)', () => {
    const link = buildSoloShareLink(
      { seed: 7, size: 10, colors: 4, shape: 'classic' },
      'https://example.com/?room=AB12&utm=x',
    );
    const q = new URLSearchParams(new URL(link).search);
    expect(q.get('room')).toBeNull();
    expect(q.get('utm')).toBeNull();
    expect(q.get('seed')).toBe('7');
  });
});

describe('P7.3 wheel share round-trip', () => {
  it('rebuilds the identical wheel from the link params', () => {
    const link = buildSoloShareLink(
      { seed: 987654321, size: 12, colors: 6, shape: 'wheel' },
      'https://example.com/',
    );
    const parsed = soloShareParamsFromSearch(new URL(link).search);
    expect(parsed).not.toBeNull();
    if (!parsed) return; // narrowed
    const shared = generateSeededWheelBoard(parsed.size, parsed.colors, parsed.seed);
    const original = generateSeededWheelBoard(12, 6, 987654321);
    expect(shared).toEqual(original);
    expect(WHEEL_GEOMETRY[12]).toEqual({
      rings: shared.length,
      sectors: shared[0].length,
    });
  });
});

describe('P11 cube share round-trip', () => {
  it('parses and builds ?shape=cube without changing classic links', () => {
    expect(parseSoloShareParams('?seed=7&size=10&colors=4&shape=cube')).toEqual({
      seed: 7,
      size: 10,
      colors: 4,
      shape: 'cube',
    });
    const link = buildSoloShareLink(
      { seed: 42, size: 14, colors: 6, shape: 'cube' },
      'https://example.com/',
    );
    expect(new URL(link).searchParams.get('shape')).toBe('cube');
    expect(parseSoloShareParams('?seed=7&size=10&colors=4&shape=sphere')).toBeNull();
  });

  it('rebuilds the identical cube from the link params', () => {
    const link = buildSoloShareLink(
      { seed: 987654321, size: 12, colors: 6, shape: 'cube' },
      'https://example.com/',
    );
    const parsed = soloShareParamsFromSearch(new URL(link).search);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const shared = generateSeededCubeBoard(parsed.size, parsed.colors, parsed.seed);
    const original = generateSeededCubeBoard(12, 6, 987654321);
    expect(shared).toEqual(original);
    expect(getCubeSide(shared)).toBe(5);
  });
});

describe('P13 mosaic share round-trip', () => {
  it('parses and builds ?shape=mosaic without changing classic links', () => {
    expect(parseSoloShareParams('?seed=7&size=10&colors=4&shape=mosaic')).toEqual({
      seed: 7,
      size: 10,
      colors: 4,
      shape: 'mosaic',
    });
    const link = buildSoloShareLink(
      { seed: 42, size: 14, colors: 6, shape: 'mosaic' },
      'https://example.com/',
    );
    expect(new URL(link).searchParams.get('shape')).toBe('mosaic');
  });

  it('rebuilds the identical mosaic board from the link params', () => {
    const link = buildSoloShareLink(
      { seed: 987654321, size: 12, colors: 6, shape: 'mosaic' },
      'https://example.com/',
    );
    const parsed = soloShareParamsFromSearch(new URL(link).search);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const fromLink = generateMosaicBoard(
      parsed.size,
      parsed.colors,
      mulberry32(parsed.seed),
    );
    const original = generateMosaicBoard(12, 6, mulberry32(987654321));
    expect(fromLink).toEqual(original);
  });
});
