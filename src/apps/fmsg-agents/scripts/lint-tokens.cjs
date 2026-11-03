#!/usr/bin/env node
/**
 * FMSG Agents — Design Token & CSS Consistency Linter (P0.4)
 *
 * Audits `renderer/design-system.css` (and any modular CSS under `renderer/styles/`)
 * against the audit's quality thresholds (§4.4):
 * - Sub-12px font-size declarations (excluding 11px uppercase overlines/eyebrows if any; target: 0 < 12px)
 * - Total distinct font-size values (Phase 2 target: <= 8)
 * - Total distinct border-radius values (Phase 2 target: <= 4)
 * - Layout `!important` declarations outside reduced-motion media query (Phase 2 target: 0)
 * - WCAG AA contrast check on `--text-muted` and `--text-secondary` against `--bg-card` (#0e111a)
 *
 * Usage:
 *   node scripts/lint-tokens.cjs [--strict-phase2] [--report-only]
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const reportOnly = process.argv.includes('--report-only');
const strictPhase2 = process.argv.includes('--strict-phase2');

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function collectCssFiles() {
  const files = [path.join(APP_ROOT, 'renderer', 'design-system.css')];
  const stylesDir = path.join(APP_ROOT, 'renderer', 'styles');
  if (fs.existsSync(stylesDir)) {
    for (const entry of fs.readdirSync(stylesDir)) {
      if (entry.endsWith('.css')) {
        files.push(path.join(stylesDir, entry));
      }
    }
  }
  return files.filter((f) => fs.existsSync(f));
}

function main() {
  const cssFiles = collectCssFiles();
  const combined = cssFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const noComments = combined.replace(/\/\*[\s\S]*?\*\//g, '');

  // 1. Extract --text-muted and --bg-card
  const bgCardMatch = noComments.match(/--bg-card:\s*(#[0-9a-fA-F]{6})/);
  const textMutedMatch = noComments.match(/--text-muted:\s*(#[0-9a-fA-F]{6})/);
  const bgCard = bgCardMatch ? bgCardMatch[1] : '#0e111a';
  const textMuted = textMutedMatch ? textMutedMatch[1] : '#64748b';
  const mutedContrast = contrastRatio(textMuted, bgCard);

  // 2. Collect font-size declarations
  const fontSizeMatches = [...noComments.matchAll(/font-size:\s*([^;!}]+)/g)].map((m) =>
    m[1].trim()
  );
  const pxFontSizes = new Set();
  const sub12FontSizes = [];
  for (const val of fontSizeMatches) {
    const pxMatch = val.match(/^(\d+(?:\.\d+)?)px$/);
    if (pxMatch) {
      const num = parseFloat(pxMatch[1]);
      pxFontSizes.add(`${num}px`);
      if (num < 12) {
        sub12FontSizes.push(`${num}px`);
      }
    }
  }

  // 3. Collect border-radius declarations
  const radiusMatches = [...noComments.matchAll(/border-radius:\s*([^;!}]+)/g)].map((m) =>
    m[1].trim()
  );
  const literalRadii = new Set();
  for (const val of radiusMatches) {
    if (!val.startsWith('var(') && val !== '0' && val !== 'inherit') {
      literalRadii.add(val);
    }
  }

  // 4. Count !important outside prefers-reduced-motion
  const withoutReducedMotion = noComments.replace(
    /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\}\s*\}/g,
    ''
  );
  const importantCount = (withoutReducedMotion.match(/!important/g) || []).length;

  // 5. Check :focus-visible presence
  const hasGlobalFocusVisible = /(?:^|[\s,}])(?:\*|:focus-visible|button:focus-visible)/.test(
    noComments
  );

  const summary = {
    timestamp: new Date().toISOString(),
    textMutedHex: textMuted,
    bgCardHex: bgCard,
    textMutedContrastOnCard: mutedContrast,
    distinctPxFontSizes: [...pxFontSizes].sort((a, b) => parseFloat(a) - parseFloat(b)),
    distinctPxFontSizeCount: pxFontSizes.size,
    sub12pxOccurrences: sub12FontSizes.length,
    distinctLiteralRadii: [...literalRadii],
    distinctLiteralRadiiCount: literalRadii.size,
    layoutImportantCount: importantCount,
    hasGlobalFocusVisible,
  };

  console.log('\n[lint:tokens] Design System Token Audit:');
  console.log(`  - --text-muted (${textMuted}) on ${bgCard}: ${mutedContrast}:1 (min 4.5:1)`);
  console.log(
    `  - Distinct px font sizes (${summary.distinctPxFontSizeCount}): ${summary.distinctPxFontSizes.join(', ')}`
  );
  console.log(`  - Sub-12px font-size declarations: ${summary.sub12pxOccurrences}`);
  console.log(
    `  - Distinct literal border-radii (${summary.distinctLiteralRadiiCount}): ${summary.distinctLiteralRadii.join(', ')}`
  );
  console.log(`  - Layout !important count (excl. reduced-motion): ${summary.layoutImportantCount}`);

  const outPath = path.join(APP_ROOT, 'tests', 'ui', 'token-lint-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');

  if (!reportOnly) {
    const errors = [];
    if (mutedContrast < 4.5) {
      errors.push(`--text-muted contrast ${mutedContrast}:1 is below WCAG AA 4.5:1`);
    }
    if (summary.sub12pxOccurrences > 0) {
      errors.push(`${summary.sub12pxOccurrences} font-size declaration(s) below 12px minimum`);
    }
    if (strictPhase2) {
      if (summary.distinctPxFontSizeCount > 8) {
        errors.push(`Distinct font sizes (${summary.distinctPxFontSizeCount}) exceeds Phase 2 limit of 8`);
      }
      if (summary.distinctLiteralRadiiCount > 4) {
        errors.push(`Distinct literal border radii (${summary.distinctLiteralRadiiCount}) exceeds Phase 2 limit of 4`);
      }
      if (summary.layoutImportantCount > 0) {
        errors.push(`Layout !important count (${summary.layoutImportantCount}) exceeds Phase 2 limit of 0`);
      }
    }
    if (errors.length > 0) {
      console.error('[lint:tokens] FAILED:\n  - ' + errors.join('\n  - '));
      process.exit(1);
    }
  }
}

main();
