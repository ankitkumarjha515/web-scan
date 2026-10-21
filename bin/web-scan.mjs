#!/usr/bin/env node
// Web Scan CI gate. No dependencies, no install step, it talks to the
// hosted scanner and sets an exit code.
//
//   node bin/web-scan.mjs https://example.com --min-score 90
//   node bin/web-scan.mjs https://example.com --fail-on failures
//
// WEB_SCAN_ENDPOINT is preferred; PREFLIGHT_ENDPOINT is kept so existing
// workflows keep working.

const ENDPOINT =
  process.env.WEB_SCAN_ENDPOINT ??
  process.env.PREFLIGHT_ENDPOINT ??
  'https://web-scan.agentmarket.lol';

const USAGE = `web-scan <url> [options]

  --min-score <n>   fail when the score is below n            (default 90)
  --fail-on <what>  score | failures | any | never            (default score)
                      score     fail below --min-score
                      failures  fail on any failing check
                      any       fail on any failing check or warning
                      never     always exit 0, just report
  --json            print the raw report as JSON
  --quiet           only print the verdict line
`;

function parseArgs(argv) {
  const options = { minScore: 90, failOn: 'score', json: false, quiet: false, url: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Number('') is 0, so `--min-score "$THRESHOLD"` with the variable unset
    // used to read as "require nothing" rather than as the mistake it is.
    if (arg === '--min-score') {
      const value = argv[++i];
      options.minScore = value === undefined || value.trim() === '' ? NaN : Number(value);
    }
    else if (arg === '--fail-on') options.failOn = argv[++i];
    else if (arg === '--json') options.json = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (!arg.startsWith('-') && !options.url) options.url = arg;
  }
  return options;
}

const SEVERITY_MARK = { fail: 'FAIL', warn: 'WARN', pass: 'pass', info: 'info' };

function render(report, options) {
  const lines = [];
  lines.push('');
  lines.push(`  ${report.domain}, ${report.score}/100 (grade ${report.grade})`);
  lines.push(`  ${report.finalUrl}`);
  lines.push('');
  for (const category of report.categories) {
    const bar = '█'.repeat(Math.round(category.score / 10)).padEnd(10, '·');
    lines.push(`  ${category.label.padEnd(22)} ${bar} ${String(category.score).padStart(3)}`);
  }

  const notable = report.checks.filter((c) => c.severity === 'fail' || c.severity === 'warn');
  if (notable.length) {
    lines.push('');
    for (const check of notable) {
      lines.push(`  ${SEVERITY_MARK[check.severity]}  ${check.title}, ${check.detail}`);
      if (check.fix && check.severity === 'fail' && !options.quiet) {
        lines.push(`        ${check.fix}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** The full interactive report on the website. A saved report has its own
 *  page; an anonymous scan is not stored, so the link reruns it there. Only
 *  origin and path go in: a query string could carry a token. */
function fullReportUrl(report, slug) {
  if (slug) return `${ENDPOINT}/r/${slug}`;
  let target = report.finalUrl;
  try {
    const u = new URL(report.finalUrl);
    target = `${u.origin}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    /* keep as given */
  }
  return `${ENDPOINT}/?url=${encodeURIComponent(target)}`;
}

function stepSummary(report, slug) {
  const rows = report.categories
    .map((c) => `| ${c.label} | ${c.score} | ${c.fail} | ${c.warn} |`)
    .join('\n');
  const notable = report.checks
    .filter((c) => c.severity === 'fail' || c.severity === 'warn')
    .map((c) => `| **${c.severity === 'fail' ? 'FAIL' : 'WARN'}** | ${c.title} | ${c.detail} |`)
    .join('\n');

  return [
    `## Web Scan, ${report.domain}: ${report.score}/100 (grade ${report.grade})`,
    '',
    '| Category | Score | Failing | Warnings |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    notable ? '| | Check | Detail |\n| --- | --- | --- |\n' + notable : 'Every check passed.',
    '',
    `**[See the full report](${fullReportUrl(report, slug)})**: charts, AI search view, link previews and a speed test.`,
    '',
  ].join('\n');
}

function shouldFail(report, options) {
  const failures = report.checks.filter((c) => c.severity === 'fail').length;
  const warnings = report.checks.filter((c) => c.severity === 'warn').length;
  switch (options.failOn) {
    case 'never':
      return null;
    case 'failures':
      return failures > 0 ? `${failures} failing check(s)` : null;
    case 'any':
      return failures + warnings > 0 ? `${failures} failing, ${warnings} warning(s)` : null;
    default:
      return report.score < options.minScore
        ? `score ${report.score} is below the required ${options.minScore}`
        : null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.url) {
    process.stdout.write(USAGE);
    process.exitCode = options.url ? 0 : 2;
    return;
  }
  if (!['score', 'failures', 'any', 'never'].includes(options.failOn)) {
    process.stderr.write(`web-scan: unknown --fail-on value "${options.failOn}"\n`);
    process.exitCode = 2;
    return;
  }
  // `score < NaN` is false, so a typo'd threshold silently turned the gate off
  // and every build went green. A threshold that cannot be read has to say so.
  //
  // Only when it is the thing being gated on, though: action.yml passes
  // --min-score on every run, so rejecting it under --fail-on never/failures/any
  // would break workflows over a value their verdict never consults.
  if (
    options.failOn === 'score' &&
    (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 100)
  ) {
    process.stderr.write('web-scan: --min-score expects a number between 0 and 100\n');
    process.exitCode = 2;
    return;
  }

  let payload;
  try {
    const res = await fetch(`${ENDPOINT}/api/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: options.url }),
      signal: AbortSignal.timeout(60_000),
    });
    payload = await res.json();
    if (!res.ok || !payload.report) {
      process.stderr.write(`web-scan: ${payload.error ?? `scan failed (HTTP ${res.status})`}\n`);
      process.exitCode = 2;
      return;
    }
  } catch (err) {
    process.stderr.write(`web-scan: could not reach the scanner, ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const { report, slug } = payload;

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (!options.quiet) {
    process.stdout.write(render(report, options));
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, stepSummary(report, slug));
  }

  const reason = shouldFail(report, options);
  if (reason) {
    process.stdout.write(`  FAILED, ${reason}\n`);
    process.stdout.write(`  See the full report: ${fullReportUrl(report, slug)}\n\n`);
    // process.exitCode rather than process.exit(): exiting while the fetch
    // socket is still tearing down aborts the process on Windows, so CI would
    // read 127 instead of the failure code the gate is supposed to return.
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`  PASSED, ${report.score}/100\n`);
  process.stdout.write(`  See the full report: ${fullReportUrl(report, slug)}\n\n`);
}

main();
