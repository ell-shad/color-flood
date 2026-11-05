import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  loadBool,
  loadJson,
  loadString,
  loadStringOr,
  removeKey,
  saveJson,
  saveString,
  storageKey,
} from './storage';

/**
 * P4.5: the safe storage layer must never throw — unavailable storage, corrupt
 * JSON, or wrong shapes are all dropped silently. Every test installs a fresh
 * in-memory fake; throwing fakes simulate quota/private-mode errors.
 */

const FakeSchema = z.object({ a: z.number() });

type Fake = {
  data: Map<string, string>;
  throwing: boolean;
};

const fakeStorage = (opts: Fake) =>
  ({
    getItem: (k: string) => {
      if (opts.throwing) throw new Error('quota');
      return opts.data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.throwing) throw new Error('quota');
      opts.data.set(k, v);
    },
    removeItem: (k: string) => {
      if (opts.throwing) throw new Error('quota');
      opts.data.delete(k);
    },
  }) as Storage;

const state: Fake = { data: new Map(), throwing: false };

beforeEach(() => {
  state.data.clear();
  state.throwing = false;
  vi.stubGlobal('localStorage', fakeStorage(state));
  return () => vi.unstubAllGlobals();
});

describe('P4.5 safe storage', () => {
  it('round-trips strings and JSON', () => {
    saveString('theme', 'neon');
    expect(loadString('theme')).toBe('neon');

    saveJson('obj', { a: 1 });
    expect(loadJson('obj', FakeSchema)).toEqual({ a: 1 });
  });

  it('names new keys under the versioned prefix', () => {
    saveString('theme', 'frost');
    expect(state.data.has(storageKey('theme'))).toBe(true);
    expect(state.data.get(storageKey('theme'))).toBe('frost');
  });

  it('migrates legacy keys forward and removes them', () => {
    state.data.set('color-flood-theme', 'sunset');
    expect(loadString('theme', 'color-flood-theme')).toBe('sunset');
    expect(state.data.get(storageKey('theme'))).toBe('sunset');
    expect(state.data.has('color-flood-theme')).toBe(false);
  });

  it('drops corrupt JSON instead of throwing', () => {
    state.data.set(storageKey('obj'), '{not json');
    expect(loadJson('obj', FakeSchema)).toBeNull();
    // The poison key is cleaned up.
    expect(state.data.has(storageKey('obj'))).toBe(false);
  });

  it('drops wrong-shape JSON via zod', () => {
    state.data.set(storageKey('obj'), JSON.stringify({ a: 'nope' }));
    expect(loadJson('obj', FakeSchema)).toBeNull();

    state.data.set(storageKey('obj'), JSON.stringify([1, 2, 3]));
    expect(loadJson('obj', FakeSchema)).toBeNull();
  });

  it('tolerates a throwing storage (quota / private mode)', () => {
    state.throwing = true;
    saveString('x', '1');
    saveJson('y', { a: 1 });
    expect(loadString('x')).toBeNull();
    expect(loadJson('y', FakeSchema)).toBeNull();
    expect(removeKey('x')).toBeUndefined();
    expect(loadBool('muted', true)).toBe(true);
    expect(loadStringOr('theme', 'arcade')).toBe('arcade');
  });

  it('loadBool tolerates garbage and honors true/false', () => {
    saveString('muted', 'true');
    expect(loadBool('muted', false)).toBe(true);
    saveString('muted', 'gibberish');
    expect(loadBool('muted', true)).toBe(true);
    expect(loadBool('unset', false)).toBe(false);
  });

  it('returns null (not the fallback) when JSON exists but is invalid', () => {
    state.data.set(storageKey('obj'), '[]');
    expect(loadJson('obj', FakeSchema)).toBeNull();
  });
});
