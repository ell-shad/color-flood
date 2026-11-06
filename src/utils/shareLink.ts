import { GRID_SIZES, COLOR_COUNTS } from './floodLogic';
import type { GridSize, ColorCount } from '../types';

/**
 * P6.3: every solo board knows the seed + config it was generated from, so
 * any finished game can hand out a link that rebuilds the exact board:
 *
 *   ?seed=123456789&size=12&colors=5
 *
 * The online lobby uses `?room=`; when both are present the room wins and
 * the solo share params are ignored (parse still validates independently).
 */

export interface SoloShareParams {
  seed: number;
  size: GridSize;
  colors: ColorCount;
}

const MAX_UINT32 = 0xffffffff;

/** Validates seed/size/colors against the legal board space (null when off). */
export const parseSoloShareParams = (search: string): SoloShareParams | null => {
  const q = new URLSearchParams(search);
  const rawSeed = q.get('seed');
  const rawSize = q.get('size');
  const rawColors = q.get('colors');
  if (!rawSeed || !rawSize || !rawColors) return null;
  const seed = Number(rawSeed);
  const size = Number(rawSize);
  const colors = Number(rawColors);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_UINT32) return null;
  if (!(GRID_SIZES as number[]).includes(size)) return null;
  if (!(COLOR_COUNTS as number[]).includes(colors)) return null;
  return { seed, size: size as GridSize, colors: colors as ColorCount };
};

/**
 * Absolute URL with ONLY the share params (a shared board should not drag a
 * `?room=` or other transient query along). `baseHref` defaults to the
 * current location — injected in tests.
 */
export const buildSoloShareLink = (
  params: SoloShareParams,
  baseHref?: string,
): string => {
  const url = new URL(baseHref ?? window.location.href);
  url.search = `?seed=${params.seed}&size=${params.size}&colors=${params.colors}`;
  return url.toString();
};

/** Params, only when the URL is a solo-share link (and not a room link). */
export const soloShareParamsFromLocation = (): SoloShareParams | null =>
  soloShareParamsFromSearch(window.location.search);

/** Same precedence rule as the location variant, with the search injected. */
export const soloShareParamsFromSearch = (search: string): SoloShareParams | null => {
  const q = new URLSearchParams(search);
  if (q.get('room')) return null; // online session takes precedence
  return parseSoloShareParams(search);
};
