import { z } from 'zod';

/**
 * P4.5 safe localStorage access.
 *
 * Rules:
 *  - NEVER throw: every read/write is guarded; storage can be unavailable
 *    (private mode, quota, disabled) and the app must keep working.
 *  - ALWAYS validate with zod: corrupted or foreign JSON must never crash a
 *    caller; invalid data is dropped and the key cleaned up.
 *  - Versioned keys: all writes go to `color-flood:<name>`; legacy unprefixed
 *    keys (`color-flood-<name>`) are migrated on first read and then removed.
 */

const PREFIX = 'color-flood';

export const storageKey = (name: string): string => `${PREFIX}:${name}`;

export const removeKey = (name: string): void => {
  try {
    localStorage.removeItem(storageKey(name));
  } catch {
    /* storage unavailable */
  }
};

// --- Strings -----------------------------------------------------------------

export const loadString = (name: string, legacyKey?: string): string | null => {
  try {
    const current = localStorage.getItem(storageKey(name));
    if (current !== null) return current;
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        // Migrate forward; keep silent if the migration itself fails.
        try {
          localStorage.setItem(storageKey(name), legacy);
          localStorage.removeItem(legacyKey);
        } catch {
          /* best effort */
        }
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const saveString = (name: string, value: string): void => {
  try {
    localStorage.setItem(storageKey(name), value);
  } catch {
    /* storage unavailable */
  }
};

// --- Typed JSON --------------------------------------------------------------

/**
 * Read, zod-validate and migrate a JSON value. Returns null when the key is
 * missing OR invalid (invalid data is dropped, never surfaced to the caller).
 */
export const loadJson = <T>(
  name: string,
  schema: z.ZodType<T>,
  legacyKey?: string,
): T | null => {
  const readAndValidate = (key: string): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined; // corrupt JSON → treated as invalid below
      }
      const result = schema.safeParse(parsed);
      if (!result.success) {
        // Corrupted: clean it up so one bad write cannot poison future reads.
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        return null;
      }
      return result.data;
    } catch {
      return null; // storage itself unavailable
    }
  };

  const fromNamespaced = readAndValidate(storageKey(name));
  if (fromNamespaced !== null) return fromNamespaced;

  if (!legacyKey) return null;
  const fromLegacy = readAndValidate(legacyKey);
  if (fromLegacy === null) return null;
  // Migrate the legacy payload into the versioned key.
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(fromLegacy));
    localStorage.removeItem(legacyKey);
  } catch {
    /* best effort */
  }
  return fromLegacy;
};

export const saveJson = (name: string, value: unknown): void => {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

// --- React-friendly state init ----------------------------------------------

/** `useState(() => loadString(...))` helper with a fallback default. */
export const loadStringOr = (
  name: string,
  fallback: string,
  legacyKey?: string,
): string => loadString(name, legacyKey) ?? fallback;

/** Persisted boolean pref ('true'/'false' strings, tolerant of garbage). */
export const loadBool = (
  name: string,
  fallback: boolean,
  legacyKey?: string,
): boolean => {
  const raw = loadString(name, legacyKey);
  if (raw === null) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
};
