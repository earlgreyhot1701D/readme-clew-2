// The public address. Always this one, never a hashed preview URL.
export const SITE_URL = 'https://readme-clew-2.vercel.app';

// Share link for a repo: the page fills the field from ?repo= and waits for a click.
export function deepLink(repo) {
  return `${SITE_URL}/?repo=${repo}`;
}
