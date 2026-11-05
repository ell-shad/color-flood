/**
 * Generates the publicly accessible URL for sharing.
 *
 * P4.7: the `ais-dev-` → `ais-pre-` rewrite is dev-only (Vite `import.meta.env.DEV`),
 * so production builds never produce those synthetic origins.
 */
export const getPublicShareUrl = (roomId: string): string => {
  let origin = window.location.origin;

  // Convert private developer container origin to public shared origin —
  // only inside dev builds where the AI Studio preview exists.
  if (import.meta.env.DEV && origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }

  // Remove existing query params and attach clean ?room=CODE
  const cleanPath = window.location.pathname.split('?')[0];
  return `${origin}${cleanPath}?room=${encodeURIComponent(roomId)}`;
};
