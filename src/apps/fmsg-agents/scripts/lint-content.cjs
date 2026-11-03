#!/usr/bin/env node
/**
 * FMSG Agents — User-Facing Content & Terminology Linter (P0.4)
 *
 * Scans renderer source files (renderer/*.tsx and subdirectories) for
 * prohibited internal engineering identifiers, pricing-memo jargon, and unlocalized
 * formatting calls identified in the UI/UX audit (§4.4 & F7).
 *
 * Usage:
 *   node scripts/lint-content.cjs [--report-only]
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const RENDERER_DIR = path.join(APP_ROOT, 'renderer');
const reportOnly = process.argv.includes('--report-only');

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const RULES = [
  {
    id: 'CT-ENV-VAR-DISPLAY',
    auditIds: ['ST-01', 'ON-02', 'CT-07'],
    description: 'User-facing display of *_PASSWORD secret key names or fill_secret()',
    regex: /fill_secret|<code>\s*\{[^}]*keyName[^}]*\}\s*<\/code>|<code>\s*(?:LINKEDIN|INDEED|PNET|CAREERJUNCTION|GLASSDOOR|CAREERS24|SITE)_PASSWORD\s*<\/code>|stored as \$\{editingSite\.keyName\}|(?:Saved|Removed) \$\{[^}]*keyName\}/g,
  },
  {
    id: 'CT-CREDENTIAL-MANAGER-JARGON',
    auditIds: ['ST-01', 'ST-14', 'ON-02', 'NT-04'],
    description: 'Internal "Windows Credential Manager" implementation jargon in user copy',
    regex: /Windows Credential Manager|Save in Credential Manager/g,
  },
  {
    id: 'CT-PRICING-MEMO-JARGON',
    auditIds: ['BL-01', 'BL-03', 'BL-11', 'CT-07'],
    description: 'Internal pricing memo terminology ("Fallback PAYG rate", "Grace protection", "Stacks forever", "Default R0", "pure PAYG")',
    regex: /Fallback PAYG rate|Grace protection|Stacks forever|Default R0|pure PAYG|Pure Pay-As-You-Go/g,
  },
  {
    id: 'CT-STALE-WELCOME-VERSION',
    auditIds: ['NT-01'],
    description: 'Hardcoded stale version in welcome notification ("Welcome to FMSG Agents v0.7.")',
    regex: /Welcome to FMSG Agents v0\.\d+\.\d+/g,
  },
  {
    id: 'CT-BARE-LOCALE-STRING',
    auditIds: ['ST-06', 'CT-01'],
    description: 'Bare .toLocaleString() without explicit en-ZA locale',
    regex: /\.toLocaleString\(\s*\)/g,
  },
  {
    id: 'CT-EMOJI-ONBOARDING-ICONS',
    auditIds: ['ON-01'],
    description: 'Emoji icons in onboarding feature cards (🔍 📄 🚀)',
    regex: /[🔍📄🚀]/gu,
  },
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function main() {
  const files = walkFiles(RENDERER_DIR);
  const findings = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const clean = stripComments(raw);
    const lines = clean.split(/\r?\n/);
    const rel = path.relative(APP_ROOT, file).replace(/\\/g, '/');

    for (const rule of RULES) {
      lines.forEach((line, idx) => {
        rule.regex.lastIndex = 0;
        const match = rule.regex.exec(line);
        if (match) {
          findings.push({
            ruleId: rule.id,
            auditIds: rule.auditIds,
            file: rel,
            line: idx + 1,
            match: match[0],
            description: rule.description,
          });
        }
      });
    }
  }

  console.log(`\n[lint:content] Scanned ${files.length} renderer files. Violations: ${findings.length}`);
  for (const f of findings) {
    console.log(
      `  - [${f.ruleId}] (${f.auditIds.join(', ')}) ${f.file}:${f.line} -> "${f.match}"`
    );
  }

  const outPath = path.join(APP_ROOT, 'tests', 'ui', 'content-lint-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ timestamp: new Date().toISOString(), count: findings.length, findings }, null, 2),
    'utf8'
  );

  if (!reportOnly && findings.length > 0) {
    console.error(`[lint:content] FAILED with ${findings.length} violation(s).`);
    process.exit(1);
  }
}

main();
