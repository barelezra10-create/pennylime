export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /status

Sitemap: https://pennylime.com/sitemap.xml`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
