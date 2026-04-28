export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /status

Sitemap: https://pennylime.com/sitemap.xml
Llm-Content: https://pennylime.com/llms.txt
Llm-Full-Content: https://pennylime.com/llms-full.txt`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
