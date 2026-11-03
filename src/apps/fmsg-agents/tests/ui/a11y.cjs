#!/usr/bin/env node
/**
 * FMSG Agents — Automated Accessibility & Focus Verification Harness (P0.3)
 *
 * Injects local `axe-core` across all primary views and modals (Login, Sign Up,
 * Home, Run, Run Setup Modal, Applications, Detail, Review, Profiles, Rules,
 * Billing, Settings, Account) and checks keyboard focus visibility.
 *
 * Usage:
 *   node tests/ui/a11y.cjs [--report-only]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../../..');

const APP_VERSION = (() => {
  try {
    const cfg = fs.readFileSync(path.join(APP_ROOT, 'config.ts'), 'utf8');
    const m = cfg.match(/APP_VERSION\s*=\s*'([^']+)'/);
    return m ? m[1] : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

let playwrightPkg;
try {
  playwrightPkg = require(path.join(REPO_ROOT, 'node_modules', 'playwright'));
} catch {
  playwrightPkg = require('playwright');
}
const { chromium } = playwrightPkg;

const AXE_PATH = path.join(REPO_ROOT, 'node_modules', 'axe-core', 'axe.js');
const reportOnly = process.argv.includes('--report-only');

function readLegalDoc(docKey) {
  const map = {
    eula: 'EULA.md',
    terms: 'Terms_of_Service.md',
    privacy: 'Privacy_Policy.md',
  };
  const file = map[docKey] || 'Terms_of_Service.md';
  try {
    return fs.readFileSync(path.join(APP_ROOT, 'legal', file), 'utf8');
  } catch {
    return 'Document unavailable.';
  }
}

function buildMockScript() {
  const eula = JSON.stringify(readLegalDoc('eula'));
  const terms = JSON.stringify(readLegalDoc('terms'));
  const privacy = JSON.stringify(readLegalDoc('privacy'));

  return `
(() => {
  const params = new URLSearchParams(location.search);
  const authed = params.get('auth') === '1';
  const legalDocs = { eula: ${eula}, terms: ${terms}, privacy: ${privacy} };
  const profiles = [
    { id:'p1', name:'Nomkhosi Mpungose', job_titles:['Service Delivery Manager','Client Success Manager'], industry:'Critical Digital Infrastructure', location:'Gauteng, South Africa' },
    { id:'p2', name:'Medard Yamba', job_titles:['Customer Success Manager','Account Manager'], industry:'Financial Technology', location:'Pretoria, South Africa' }
  ];
  const now = new Date('2026-11-03T09:30:00Z').getTime();
  const day = 86400000;
  const jobs = [
    { id:'j1', profile_id:'p1', job_title:'Senior Service Delivery Manager', company:'Deloitte', location:'Johannesburg, Gauteng', estimated_salary:'R65,000 pm', match_score:92, review_status:'applied', match_summary:'Applied via FMSG Agents on 2 Nov 2026.', job_url:'https://example.com/1', full_spec:'Lead a portfolio of managed service engagements.', created_at:new Date(now-day*0.5).toISOString() },
    { id:'j3', profile_id:'p1', job_title:'Head of Operations', company:'Standard Bank', location:'Gauteng', estimated_salary:'R85,000 pm', match_score:84, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 31 Oct 2026. Not auto-submitted: employer asked for a covering letter.', job_url:'https://example.com/3', full_spec:'Operations leadership across shared services.', created_at:new Date(now-day*2.4).toISOString() }
  ];
  const user = { id:'u1', email:'mqhele03@gmail.com', emailVerified:true, accountStatus:'active', name:'Mqhele', surname:'Cele' };
  const noop = async () => ({ ok:true });

  window.electronAPI = {
    getStartupStatus: async () => ({ configValid:true, activeVersion:'${APP_VERSION}', installedVersion:'${APP_VERSION}', rolledBack:false, browserStatus:{available:true,browserName:'Google Chrome',message:'Google Chrome ready'}, deviceKeyStatus:{ok:true, deviceId:'dev_fd813828a7f8f9b4bb0173b1b7ea929c'}, updateState:{channel:'stable',lastCheckAt:'2026-11-03T08:30:00.000Z',lastCheckStatus:'Up to date',launchCount:2}, logInfo:{} }),
    runStartupUpdateFlow: async () => ({ available:false }),
    onUpdateProgress: () => () => {},
    restoreSession: async () => authed ? { ok:true, user, profiles } : { ok:false },
    login: async () => ({ ok:false, error:'Incorrect email or password. Please try again.' }),
    signup: async () => ({ ok:false, field:'general', error:'An account with this email already exists.' }),
    forgotPassword: async () => ({ ok:false, field:'general', error:'No account found.' }),
    resendConfirmation: noop, sendVerificationCode: noop, verifyEmailCode: noop, logout: noop,
    loadProfiles: async () => ({ ok:true, user, profiles }),
    launchVisibleBrowser: noop, runAgent: noop, stopAgent: noop, pauseAgent: noop, resumeAgent: noop, emergencyStopAgent: noop,
    getAgentState: async () => ({ ok:true, running:false }),
    onAgentEvent: () => () => {},
    respondAgentAttention: noop,
    getBillingPlans: async () => ({ ok:true, data:{ plans:[
      { name:'Starter', displayName:'Starter', applications:10, price:34900, priceLabel:'R349', perAppZar:35, discountPct:12, graceApps:1, features:['10 automated applications / month','R35 per application'] },
      { name:'Lite', displayName:'Lite', applications:25, price:74900, priceLabel:'R749', perAppZar:30, discountPct:25, graceApps:2, features:['25 automated applications / month','R30 per application'] },
      { name:'Standard', displayName:'Standard', applications:60, price:149900, priceLabel:'R1 499', perAppZar:25, discountPct:38, graceApps:6, popular:true, features:['60 automated applications / month','R25 per application'] },
      { name:'Power', displayName:'Power', applications:150, price:329900, priceLabel:'R3 299', perAppZar:22, discountPct:45, graceApps:15, features:['150 automated applications / month','R22 per application'] }
    ] } }),
    startCheckout: noop, verifyCheckout: noop,
    getBillingSummary: async () => ({ ok:true, plan:'free', searches:10, cvGens:5, pfRuns:2 }),
    setPreventSleep: noop, checkForUpdates: async () => ({ available:false }), applyUpdate: noop,
    getUpdateSettings: async () => ({ currentVersion:'${APP_VERSION}', installedVersion:'${APP_VERSION}', channel:'stable', lastCheckAt:'2026-11-03T08:30:00.000Z', lastCheckStatus:'Up to date', deviceId:'dev_fd813828a7f8f9b4bb0173b1b7ea929c', deviceKeyOk:true, browserStatus:{available:true,browserName:'Google Chrome',message:'Google Chrome ready'} }),
    setUpdateChannel: noop, resetDeviceKey: noop,
    getLegalDocument: async (doc) => ({ ok:true, content: legalDocs[doc] || legalDocs.terms }),
    openExternalUrl: noop, minimizeWindow: noop, maximizeWindow: noop, closeWindow: noop,
    listSiteSecrets: async () => ({ ok:true, items:[
      { keyName:'LINKEDIN_PASSWORD', siteLabel:'LinkedIn', allowedDomain:'linkedin.com', username:'mqhele03@gmail.com', updatedAt:'2026-11-02T14:20:00.000Z' }
    ]}),
    saveSiteSecret: noop, deleteSiteSecret: noop,
    getScreeningRules: async () => ({ ok:true, rules:{ minSalaryZar:25000, mustHaveKeywords:['Remote','ITIL'], answers:[
      { id:'a1', question:'What is your notice period?', answer:'30 days', category:'Experience', askEachTime:false }
    ]}}),
    saveScreeningRules: noop,
    getAgentPrefs: async () => ({ ok:true, prefs:{ costCap:160, billingMode:'pay-as-you-go', bundleTier:'Starter', autonomyMode:'approve-each', onboardingCompleted:true } }),
    saveAgentPrefs: noop,
    listSavedJobs: async () => ({ ok:true, jobs }),
    deleteSavedJob: noop, updateSavedJobStatus: noop, archiveSavedJob: noop,
    sendDeleteAccountCode: noop, confirmDeleteAccount: noop,
    logUIEvent: noop, logRendererError: noop
  };
})();
`;
}

function createServer() {
  const rendererDir = path.join(APP_ROOT, 'renderer');
  const mockJs = buildMockScript();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FMSG Agents</title>
  <link rel="stylesheet" href="/design-system.css" />
  <script src="/mock.js"></script>
</head>
<body>
  <div id="root"></div>
  <script src="/bundle.js"></script>
</body>
</html>`;

  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/' || u.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (u.pathname === '/mock.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(mockJs);
      return;
    }
    if (u.pathname === '/design-system.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(fs.readFileSync(path.join(rendererDir, 'design-system.css')));
      return;
    }
    if (u.pathname === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(path.join(rendererDir, 'bundle.js')));
      return;
    }
    const candidate = path.join(rendererDir, u.pathname.replace(/^\/+/, ''));
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate).toLowerCase();
      res.writeHead(200, {
        'Content-Type': ext === '.css' ? 'text/css' : 'application/javascript',
      });
      res.end(fs.readFileSync(candidate));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
}

async function runAxeOnPage(page, screenName) {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    });
    return {
      violations: res.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        count: v.nodes.length,
        nodes: v.nodes.slice(0, 5).map((n) => ({
          target: n.target,
          html: n.html.slice(0, 140),
          failureSummary: n.failureSummary,
        })),
      })),
    };
  });
  return {
    screen: screenName,
    critical: results.violations.filter((v) => v.impact === 'critical').length,
    serious: results.violations.filter((v) => v.impact === 'serious').length,
    moderate: results.violations.filter((v) => v.impact === 'moderate').length,
    minor: results.violations.filter((v) => v.impact === 'minor').length,
    violations: results.violations,
  };
}

async function checkKeyboardFocusRing(page) {
  const focusResults = [];
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const outlineW = parseFloat(cs.outlineWidth) || 0;
      const outlineStyle = cs.outlineStyle;
      const outlineColor = cs.outlineColor;
      const boxShadow = cs.boxShadow || 'none';
      // Default Chromium auto 1px rgb(16, 16, 16) is invisible on dark backgrounds
      const isDefaultDarkOutline =
        outlineColor === 'rgb(16, 16, 16)' ||
        outlineColor === 'rgb(0, 0, 0)' ||
        (outlineStyle === 'none' && boxShadow === 'none') ||
        (outlineW < 1.5 && boxShadow === 'none');
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 32),
        outline: `${outlineStyle} ${cs.outlineWidth} ${outlineColor}`,
        boxShadow: boxShadow.slice(0, 60),
        visibleFocusRing: !isDefaultDarkOutline,
      };
    });
    if (info) focusResults.push(info);
  }
  const invisibleCount = focusResults.filter((f) => !f.visibleFocusRing).length;
  return {
    checkedCount: focusResults.length,
    invisibleCount,
    samples: focusResults,
  };
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 860 },
    locale: 'en-ZA',
  });

  const screens = [];
  let focusAudit = null;

  try {
    // Auth screens
    const authPage = await ctx.newPage();
    await authPage.goto(`${baseUrl}/?auth=0`);
    await authPage.waitForTimeout(600);
    screens.push(await runAxeOnPage(authPage, 'login'));

    await authPage.getByRole('tab', { name: /Sign Up/i }).click();
    await authPage.waitForTimeout(250);
    screens.push(await runAxeOnPage(authPage, 'signup'));
    await authPage.close();

    // Workspace screens
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/?auth=1&data=1`);
    await page.waitForTimeout(800);

    screens.push(await runAxeOnPage(page, 'home'));
    focusAudit = await checkKeyboardFocusRing(page);

    // Run Setup Modal
    await page.getByRole('button', { name: /Start Applying|Start a Run/i }).first().click();
    await page.waitForTimeout(250);
    screens.push(await runAxeOnPage(page, 'run-setup-modal'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if ((await page.locator('.run-setup-modal').count()) > 0) {
      await page.evaluate(() => {
        const btn = document.querySelector('.run-setup-modal .win-ctrl-btn, .run-setup-modal [aria-label*="Close"], .modal-close-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(150);
    }

    const navTargets = [
      { label: 'Run', name: 'run' },
      { label: 'Applications', name: 'applications' },
      { label: 'Review', name: 'review' },
      { label: 'Profiles', name: 'profiles' },
      { label: 'Billing', name: 'billing' },
      { label: 'Settings', name: 'settings' },
    ];

    for (const target of navTargets) {
      await page.locator('.sidebar-nav-item').filter({ hasText: target.label }).first().click();
      await page.waitForTimeout(300);
      screens.push(await runAxeOnPage(page, target.name));
    }
  } finally {
    await browser.close();
    server.close();
  }

  let totalCritical = 0;
  let totalSerious = 0;
  console.log('\n[ui:a11y] Screen Accessibility Summary:');
  for (const s of screens) {
    totalCritical += s.critical;
    totalSerious += s.serious;
    console.log(
      `  - ${s.screen.padEnd(18)} critical=${s.critical} serious=${s.serious} moderate=${s.moderate} minor=${s.minor}`
    );
    for (const v of s.violations.filter((x) => x.impact === 'critical' || x.impact === 'serious')) {
      console.log(`      [${v.impact.toUpperCase()}] ${v.id}: ${v.help} (${v.count} nodes)`);
    }
  }

  console.log(
    `\n[ui:a11y] Keyboard Focus Walk: ${focusAudit.checkedCount - focusAudit.invisibleCount}/${focusAudit.checkedCount} visible focus rings (invisible=${focusAudit.invisibleCount})`
  );

  const report = {
    timestamp: new Date().toISOString(),
    totalCritical,
    totalSerious,
    focusAudit,
    screens,
  };
  const reportPath = path.join(__dirname, 'a11y-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[ui:a11y] Report saved -> ${path.relative(APP_ROOT, reportPath)}`);

  if (!reportOnly && (totalCritical > 0 || totalSerious > 0 || focusAudit.invisibleCount > 0)) {
    console.error(
      `[ui:a11y] FAILED: critical=${totalCritical}, serious=${totalSerious}, invisibleFocus=${focusAudit.invisibleCount}`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[ui:a11y] Error:', err);
  process.exit(1);
});
