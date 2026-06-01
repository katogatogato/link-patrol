# LinkPatrol

[![npm version](https://img.shields.io/npm/v/link-patrol.svg)](https://www.npmjs.com/package/link-patrol)
[![license](https://img.shields.io/npm/l/link-patrol.svg)](https://github.com/katogatogato/link-patrol/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/link-patrol.svg)](https://nodejs.org/)

Crawl your site, find broken links, generate reports — CLI and CI ready.

LinkPatrol crawls a website starting from a given URL, discovers all internal links by parsing HTML, checks each one with HTTP requests, and reports broken links, redirects, and slow responses. It generates colored terminal output, Markdown reports, and JSON data — perfect for CI pipelines.

## Features

- **Website crawler** — BFS crawl discovers all pages via `<a>`, `<img>`, `<link>`, `<script>`, `<source>` tags
- **Smart link checking** — HEAD requests with GET fallback, redirect following (up to 5 hops)
- **Concurrent & respectful** — Configurable concurrency (default: 10) with per-domain rate limiting
- **Colored terminal output** — Sortable results table with status icons
- **Markdown + JSON reports** — Machine-readable and human-readable output files
- **CI-ready** — Exit code 1 when broken links found, zero-config GitHub Actions integration
- **Zero dependencies** — Uses Node.js built-in `http`/`https` for all network requests
- **TypeScript** — Strict mode, ES modules, fully typed

## Installation

```bash
# Install globally
npm install -g link-patrol

# Or use with npx (no install needed)
npx link-patrol check https://example.com
```

### From source

```bash
git clone https://github.com/katogatogato/link-patrol.git
cd link-patrol
npm install
npm run build
npm link
```

## Quick Start

```bash
# Check all links on a website
link-patrol check https://example.com

# Check and generate report files
link-patrol report https://example.com

# Check a single URL
link-patrol single https://example.com/some-page
```

## Commands

### `link-patrol check <url>`

Crawl a website starting from the given URL and check all discovered links.

```bash
link-patrol check https://example.com
link-patrol check https://example.com --concurrency 5 --timeout 15000
link-patrol check https://example.com --follow-external
link-patrol check https://example.com --exclude "(/admin|/test)"
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --concurrency <n>` | 10 | Max concurrent HTTP requests |
| `-t, --timeout <ms>` | 10000 | Request timeout in milliseconds |
| `-m, --max-pages <n>` | 100 | Max pages to crawl |
| `--follow-external` | false | Also check external links (different domain) |
| `--exclude <pattern>` | — | Skip URLs matching regex pattern |
| `--user-agent <string>` | LinkPatrol/1.0 | Custom User-Agent header |

### `link-patrol report <url>`

Same as `check`, but also writes report files to disk.

```bash
link-patrol report https://example.com
link-patrol report https://example.com --output ./reports
```

**Additional options:**

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <dir>` | `.` | Output directory for report files |

**Generated files:**

- `link-report.md` — Markdown report with tables for broken links, redirects, slow links
- `link-report.json` — Machine-readable JSON with all link data

### `link-patrol single <url>`

Quick check of a single URL — no crawling, just one HTTP request.

```bash
link-patrol single https://example.com/some-page
```

Shows status code, response time, and redirect chain.

## Output Format

### Terminal

```
  Link Patrol — https://example.com
  ──────────────────────────────────────────────

  Status        Code      URL                                           Source               Time
  ──────────────────────────────────────────────────────────────────────────────────────────────
  ✓ OK           200       https://example.com/about                     (crawl start)        120ms
  ✗ FAIL         404       https://example.com/old-page                  /about               45ms
  ↻ REDIR        301       https://example.com/blog → /news              /about               89ms
  ⏱ TIMEOUT      —         https://example.com/heavy-page                /about               10.0s

  Summary: 42 OK, 2 broken, 1 redirect, 1 slow — checked 46 links on 12 pages
```

### Markdown Report

```markdown
# LinkPatrol Report

**URL:** https://example.com
**Date:** 2025-01-15T10:30:00.000Z
**Pages crawled:** 12
**Links checked:** 46

## Summary

| Metric | Count |
|--------|-------|
| Total links | 46 |
| OK | 42 |
| Broken | 2 |
| Redirects | 1 |
| Slow (>2000ms) | 1 |
```

## CI Integration

### GitHub Actions

```yaml
name: Link Check

on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6am
  workflow_dispatch:       # Manual trigger

jobs:
  check-links:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install -g link-patrol

      - name: Check links
        run: link-patrol report https://example.com --output ./reports

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: link-reports
          path: reports/
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All links OK |
| 1 | Broken links found |
| 2 | Runtime error |

## Link Categories

| Category | HTTP Status | Description |
|----------|-------------|-------------|
| OK | 200–299 | Healthy link |
| Redirect | 301, 302, 307, 308 | Redirects to another URL |
| Client Error | 400–499 | Broken link (404 = not found, 410 = gone) |
| Server Error | 500–599 | Server-side failure |
| Timeout | — | No response within threshold |
| DNS Error | — | Domain doesn't resolve |

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b my-feature`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin my-feature`
5. Submit a pull request

## License

[MIT](LICENSE) © katogatogato
