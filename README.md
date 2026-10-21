# Web Scan

**Your coding agent shipped it. Web Scan checks it.**

One call audits any live URL in about 5 seconds: **85 checks** across SEO, AI search (GEO), security
headers, leaked API keys, Core Web Vitals and accessibility. Every finding comes with the exact fix, ranked by
how many points it is worth. Then your agent fixes it and **verifies the fix on the live site**, without you
re-running anything.

Free. No sign-up. No API key. Works as an **MCP server**, a **GitHub Action**, a **CLI** and on the
[web](https://web-scan.agentmarket.lol).

```
scan_url  →  fix  →  deploy  →  verify_fixes  →  allFixed: true
```

---

## Why agents use it

- **Built for the agent loop.** `scan_url` finds what is wrong, `verify_fixes` proves each fix landed in
  production, per check id. No screenshots to read, no dashboards to click.
- **Fixes, not findings.** Each failing check returns its id, what was found on the page, and a concrete fix.
  Findings are ranked by real score gain (the report is re-scored with that one fix applied), so the agent
  works in the order that matters.
- **Catches what AI-built apps leak.** Reads the JavaScript the site serves to every visitor and finds live
  secret keys (OpenAI, Anthropic, Stripe, AWS, GitHub, Slack, SendGrid, database URLs, private keys) and
  Supabase `service_role` keys. Every match gets a second look that drops placeholders and docs examples, so a
  red result is a real leak.
- **Sees the page the way AI search does.** Shows what ChatGPT, Claude and Perplexity crawlers actually
  receive (no JavaScript), which AI bots robots.txt lets in, and whether the page answers the questions buyers
  ask.
- **Honest scoring.** One number from three parts (search and sharing, security, speed), capped when a
  critical check fails, next to a benchmark of 25 well-known sites. Missing security headers are hardening
  notes, not holes. Unsure findings say "needs checking".
- **Safe to point at anything public.** Passive only: it reads what the site already serves and never probes
  hidden paths. Text from scanned pages is returned as data, never as instructions.

## MCP server

Remote, stateless, Streamable HTTP. No key needed.

```
https://preflight-api.agentmarket.lol/api/mcp
```

**Claude Code**

```bash
claude mcp add --transport http web-scan https://preflight-api.agentmarket.lol/api/mcp
```

**Cursor** (`~/.cursor/mcp.json`), **Windsurf**, **VS Code** (`.vscode/mcp.json`, key `servers`)

```json
{
  "mcpServers": {
    "web-scan": { "url": "https://preflight-api.agentmarket.lol/api/mcp" }
  }
}
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.web-scan]
url = "https://preflight-api.agentmarket.lol/api/mcp"
```

### Tools

| Tool | What it does |
|---|---|
| `scan_url` | Fresh audit of a public URL: score 0-100, grade, every failing or warning check with id, detail and fix, and `fullReportUrl` for the complete interactive report. 5-15 s. |
| `verify_fixes` | Re-scan after a deploy and report per check id whether it now passes, the new and previous score, what is still failing, and `allFixed`. |
| `get_report` | Read a shared report (`web-scan.agentmarket.lol/r/<slug>`) without re-scanning. |

Try it in your agent:

> Scan https://my-app.com with Web Scan, fix everything in this repo in order of points, and verify the fixes
> once I deploy.

## GitHub Action

Fail the build when a deploy makes the site worse.

```yaml
- uses: ankitkumarjha515/web-scan@v1
  with:
    url: https://my-app.com
    min-score: 85        # fail below this score
    fail-on: score       # score | failures | any | never
```

Writes a summary table to the job page, with a link to the full interactive report. Pair it with a preview
deployment to catch problems before they reach production.

## CLI

No dependencies, Node 18+.

```bash
node bin/web-scan.mjs https://my-app.com --min-score 90
node bin/web-scan.mjs https://my-app.com --fail-on failures --json
```

Exit code 0 passes, 1 fails the gate, 2 means the scan could not run. Every run ends with a link to the full
report on the website: charts, the AI search view, link previews and a live speed test.

## What it checks

| Area | Examples |
|---|---|
| Search basics | title, description, canonical, headings, language, structured data validity, hreflang |
| AI search (GEO) | text without JavaScript, GPTBot / ClaudeBot / PerplexityBot access, llms.txt, answer-ready sections, citability |
| Crawlability | status, noindex, robots.txt (including rules that block this exact page), sitemap, soft 404s, redirects |
| Sharing | og:image that actually loads, titles and descriptions for X, LinkedIn, Slack and WhatsApp previews |
| Security | HTTPS, HSTS, CSP strength, cookies, CORS, mixed content, framing |
| Leaked secrets | provider keys and database URLs in served JavaScript, Supabase `service_role`, source maps, debug builds |
| Speed | server response, page weight, render-blocking files, fonts, caching, plus Core Web Vitals on demand |
| Images and accessibility | alt text, sizes, lazy loading, formats, zoom, labels, landmarks |

Every report also says **what kind of site** it is (shop, local business, software, publisher, agency), the
basics that kind of site needs, and **what the scan covered and what it could not see**.

Whole-site audits, competitor comparison, hourly monitoring and a README badge are on the
[website](https://web-scan.agentmarket.lol).

## Limits

- Public URLs only: no localhost or private networks. Use a preview deployment.
- Fair-use rate limits per IP; sign in on the website for higher limits.
- One page per `scan_url` call; use the website for whole-site crawls.

## License

MIT for this repository (Action, CLI, registry metadata). The scanner itself runs as a hosted service.
