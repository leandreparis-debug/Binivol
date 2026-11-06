/** Routes shown under another section of the main navigation (/alertes is in « Rappels »). */
const SECTION_ALIASES: Record<string, string> = { "/alertes": "/rappels" };

/**
 * `/` matches only itself; other hrefs match their sub-routes too. With
 * `useAliases` (main navigation), a route shown under another section lights
 * that section.
 */
export function isActivePath(pathname: string, href: string, useAliases = false): boolean {
  if (href === "/") return pathname === "/";
  const matches = (path: string) => path === href || path.startsWith(`${href}/`);
  const alias = Object.entries(useAliases ? SECTION_ALIASES : {}).find(
    ([from]) => pathname === from || pathname.startsWith(`${from}/`),
  );
  return matches(pathname) || (alias !== undefined && matches(alias[1]));
}
