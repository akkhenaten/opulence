# Make opulence.orbsolutions.co.uk readable by outside AI tools and search engines

## Context
Another assistant said it "couldn't load" https://opulence.orbsolutions.co.uk, so it reviewed the public site (www.opulence-security.com) instead.

Checked from here:
- The subdomain works. It has IPv4 and IPv6 records, returns HTTP 200 and serves the full static landing page ("Security you can see…", with title, description and og tags).
- `/robots.txt` and `/sitemap.xml` don't exist. The SPA fallback answers both with the landing-page HTML and a 200 status. Crawlers and AI fetchers expect plain text or XML there, so they can treat the site as malformed. The domain is also new and not indexed yet. Some browsing tools only open pages they can find in search.
- So nothing is down. The other tool's review covers the **old** public site, not the new landing page.

## Change (small, static)
1. Add `site/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Disallow: /app/
   Sitemap: https://opulence.orbsolutions.co.uk/sitemap.xml
   ```
2. Add `site/sitemap.xml` with the single URL `https://opulence.orbsolutions.co.uk/`, plus lastmod.
3. Add `<link rel="canonical" href="https://opulence.orbsolutions.co.uk/">` to `site/index.html` if it isn't already there.
4. `openkbs site deploy`, then commit.

## Verification
- `curl -sI https://opulence.orbsolutions.co.uk/robots.txt` → content-type text/plain with the rules above. The sitemap should come back as XML.
- The landing page still returns 200, and `/app/` still loads the app.

## User follow-ups (outside the code)
- Give the other assistant the exact link `https://opulence.orbsolutions.co.uk/`. If it still can't fetch the page, paste the page text or screenshots into that chat.
- Optionally add the domain to Google Search Console so it gets indexed.
