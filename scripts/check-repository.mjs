import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Inspect tracked content, including CI checkouts, without printing matched values.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const excluded = /(^|\/)(node_modules|\.next|\.data|coverage|playwright-report|test-results)(\/|$)|(^|\/)\.env(\..*)?$|\.(sqlite(?:-.*)?|db(?:-.*)?|pem|key|p12|pfx|log|tsbuildinfo)$/i;
const patterns = [
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ['Privy app secret', /privy_app_secret_[A-Za-z0-9]{24,}/],
  ['GitHub access token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['Private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['Resend credential', /\bre_[A-Za-z0-9_-]{30,}\b/],
];
const findings = [];
for (const path of files) {
  if (path !== '.env.example' && excluded.test(path)) findings.push(`${path}: local or sensitive artifact`);
  const data = readFileSync(path);
  if (data.length > 50 * 1024 * 1024) findings.push(`${path}: exceeds repository asset size limit`);
  if (data.includes(0)) continue;
  const content = data.toString('utf8');
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) findings.push(`${path}: possible ${label}`);
  }
  if (path === '.env.example') {
    for (const line of content.split(/\r?\n/)) {
      if (/^[A-Z_]*(SECRET|API_KEY|TOKEN|PASSWORD)\s*=\s*\S/.test(line)) {
        findings.push(`${path}: credential example must remain blank`);
      }
    }
  }
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} tracked files: no blocked artifacts or known credential patterns.`);
}
