/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates the publicly accessible URL for sharing.
 * In AI Studio, development instances use 'ais-dev-' which requires authorization.
 * 'ais-pre-' is the public shared app URL that anyone can open from distance.
 */
export const getPublicShareUrl = (roomId: string): string => {
  let origin = window.location.origin;

  // Convert private developer container origin to public shared origin
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }

  // Remove existing query params and attach clean ?room=CODE
  const cleanPath = window.location.pathname.split('?')[0];
  return `${origin}${cleanPath}?room=${encodeURIComponent(roomId)}`;
};
