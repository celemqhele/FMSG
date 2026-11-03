#!/usr/bin/env node
/**
 * FMSG Agents — Behavioural Flow Regression Harness (Phase 1A/1B acceptance)
 *
 * Verifies the audit's functional acceptance criteria in a real browser:
 *  - RV-01 Approve marks the record approved, opens the posting and clears the queue
 *  - RV-03 Skip removes the item from the queue and offers a working Undo
 *  - AP-05 Remove on the tracker archives the row and Undo restores it
 *  - AP-01/AP-08 Sorting, filtering and search-clear work
 *  - ST-11/ST-12 Legal documents render structured headings at the app version
 *  - NT-01/NT-03 Notifications never show a stale version and clear on open
 *  - P1A.5 Every route has one stable noun H1
 *
 * Usage: node tests/ui/flows.cjs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../../..');

// Read the version from the repository instead of hardcoding it, so this
// harness keeps asserting the real released string after every bump.
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

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function readLegalDoc(docKey) {
  const map = {
    eula: 'EULA.md',
    terms: 'Terms_of_Service.md',
    privacy: 'Privacy_Policy.md',
  };
  try {
    return fs.readFileSync(
      path.join(APP_ROOT, 'legal', map[docKey] || 'Terms_of_Service.md'),
      'utf8'
    );
  } catch {
    return 'Document unavailable.';
  }
}

function buildMockScript() {
  const docs = JSON.stringify({
    eula: readLegalDoc('eula'),
    terms: readLegalDoc('terms'),
    privacy: readLegalDoc('privacy'),
  });

  return `
(() => {
  const params = new URLSearchParams(location.search);
  const authed = params.get('auth') === '1';
  const legalDocs = ${docs};
  const profiles = [
    { id:'p1', name:'Nomkhosi Mpungose 1', job_titles:['Service Delivery Manager','Client Success Manager'], industry:'Critical Digital Infrastructure', location:'Gauteng South Africa', cv_file_path:'u1/cv.pdf' },
    { id:'p2', name:'Medard Yamba', job_titles:['Customer Success Manager'], industry:'Financial Technology', location:'Pretoria South Africa' }
  ];
  let jobs = [
    { id:'j1', profile_id:'p1', job_title:'Senior Service Delivery Manager', company:'Deloitte', location:'Johannesburg, Gauteng', estimated_salary:'R65 000 pm', match_score:92, review_status:'applied', match_summary:'Applied via FMSG Agents on 2 Nov 2026.', job_url:'https://example.com/1', full_spec:'Lead managed services.', created_at:'2026-11-02T08:00:00Z' },
    { id:'j2', profile_id:'p1', job_title:'Client Success Manager', company:'Microsoft', location:'Johannesburg, Gauteng', estimated_salary:'R55 000 pm', match_score:88, review_status:'applied', match_summary:'Applied via FMSG Agents on 1 Nov 2026.', job_url:'https://example.com/2', full_spec:'Own client relationships.', created_at:'2026-11-01T08:00:00Z' },
    { id:'j3', profile_id:'p1', job_title:'Head of Operations', company:'Standard Bank', location:'Gauteng', estimated_salary:'R85 000 pm', match_score:84, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 31 Oct 2026. Not auto-submitted: employer asked for a covering letter.', job_url:'https://example.com/3', full_spec:'Operations leadership.', created_at:'2026-10-31T08:00:00Z' },
    { id:'j4', profile_id:'p1', job_title:'Service Delivery Lead', company:'Dimension Data', location:'Sandton, Gauteng', estimated_salary:'R60 000 pm', match_score:81, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 30 Oct 2026. Portal requires manual sign-in.', job_url:'https://example.com/4', full_spec:'Managed services delivery.', created_at:'2026-10-30T08:00:00Z' },
    { id:'j5', profile_id:'p2', job_title:'Customer Operations Manager', company:'Takealot', location:'Cape Town', estimated_salary:'R50 000 pm', match_score:76, review_status:'applied', match_summary:'Applied via FMSG Agents on 29 Oct 2026.', job_url:'https://example.com/5', full_spec:'Scale operations.', created_at:'2026-10-29T08:00:00Z' },
    { id:'j6', profile_id:'p1', job_title:'Account Director', company:'Accenture', location:'Johannesburg, Gauteng', estimated_salary:'R72 000 pm', match_score:73, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 28 Oct 2026. Not auto-submitted: work authorisation question required review.', job_url:'https://example.com/6', full_spec:'Account leadership.', created_at:'2026-10-28T08:00:00Z' }
  ];

  // Large-dataset mode (?rows=100) for the G3 table stress test.
  const rowCount = parseInt(params.get('rows') || '0', 10);
  if (rowCount > 0) {
    jobs = Array.from({ length: rowCount }).map((_, i) => ({
      id: 'bulk_' + (i + 1),
      profile_id: 'p1',
      job_title: 'Synthetic Role ' + String(i + 1).padStart(3, '0'),
      company: 'Employer ' + String((i % 40) + 1).padStart(2, '0'),
      location: i % 3 === 0 ? 'Cape Town' : 'Johannesburg, Gauteng',
      estimated_salary: 'R50 000 pm',
      match_score: 60 + (i % 40),
      review_status: i % 4 === 0 ? 'needs_review' : 'applied',
      match_summary: 'Synthetic record ' + (i + 1) + ' for the pagination test.',
      job_url: 'https://example.com/bulk/' + (i + 1),
      full_spec: 'Synthetic job specification for table stress testing.',
      created_at: new Date(Date.UTC(2026, 9, 1, 8, 0, 0) + i * 3600000).toISOString(),
    }));
  }
  const user = { id:'u1', email:'mqhele03@gmail.com', emailVerified:true, accountStatus:'active', name:'Mqhele', surname:'Cele' };
  const noop = async () => ({ ok:true });
  window.__openedUrls = [];
  window.__ipcCalls = [];

  window.electronAPI = {
    getStartupStatus: async () => ({ configValid:true, activeVersion:'${APP_VERSION}', installedVersion:'${APP_VERSION}', browserStatus:{available:true,browserName:'Google Chrome',message:'Google Chrome ready'}, deviceKeyStatus:{ok:true, deviceId:'dev_test'}, updateState:{channel:'stable',lastCheckAt:'2026-11-03T08:30:00.000Z',lastCheckStatus:'Up to date'}, logInfo:{} }),
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
    getBillingPlans: async () => ({ ok:true, data:{ plans:[] } }),
    startCheckout: noop, verifyCheckout: noop,
    getBillingSummary: async () => ({ ok:true, plan:'free' }),
    setPreventSleep: noop, checkForUpdates: async () => ({ available:false }), applyUpdate: noop,
    getUpdateSettings: async () => ({ currentVersion:'${APP_VERSION}', installedVersion:'${APP_VERSION}', channel:'stable', lastCheckAt:'2026-11-03T08:30:00.000Z', lastCheckStatus:'Up to date', deviceId:'dev_test', deviceKeyOk:true, browserStatus:{available:true,browserName:'Google Chrome',message:'Google Chrome ready'} }),
    setUpdateChannel: noop, resetDeviceKey: noop,
    getLegalDocument: async (doc) => ({ ok:true, content: legalDocs[doc] || legalDocs.terms }),
    openExternalUrl: async (url) => { window.__openedUrls.push(url); return { ok:true }; },
    minimizeWindow: noop, maximizeWindow: noop, closeWindow: noop,
    listSiteSecrets: async () => ({ ok:true, items:[{ keyName:'LINKEDIN_PASSWORD', siteLabel:'LinkedIn', allowedDomain:'linkedin.com', username:'mqhele03@gmail.com', updatedAt:'2026-11-02T14:20:00.000Z' }] }),
    saveSiteSecret: noop, deleteSiteSecret: noop,
    getScreeningRules: async () => ({ ok:true, rules:{ minSalaryZar:25000, mustHaveKeywords:['Remote'], answers:[{ id:'a1', question:'Notice period?', answer:'30 days', category:'Experience', askEachTime:false }] } }),
    saveScreeningRules: noop,
    getAgentPrefs: async () => ({ ok:true, prefs:{ costCap:160, billingMode:'pay-as-you-go', bundleTier:'Starter', autonomyMode:'approve-each', onboardingCompleted:true } }),
    saveAgentPrefs: noop,
    listSavedJobs: async () => ({ ok:true, jobs }),
    deleteSavedJob: async (id) => { jobs = jobs.filter(j => j.id !== id); return { ok:true }; },
    updateSavedJobStatus: async (id, status, summary) => { window.__ipcCalls.push({ call:'updateSavedJobStatus', id, status, summary }); jobs = jobs.map(j => j.id === id ? { ...j, review_status: status } : j); return { ok:true }; },
    archiveSavedJob: async (id, archived) => { window.__ipcCalls.push({ call:'archiveSavedJob', id, archived }); return { ok:true }; },
    sendDeleteAccountCode: noop, confirmDeleteAccount: noop,
    logUIEvent: noop, logRendererError: noop
  };
})();
`;
}

function createServer() {
  const mockJs = buildMockScript();
  const rendererDir = path.join(APP_ROOT, 'renderer');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><link rel="stylesheet" href="/design-system.css" /></head><body><div id="root"></div><script src="/mock.js"></script><script src="/bundle.js"></script></body></html>`;

  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/' || u.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (u.pathname === '/mock.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      return res.end(mockJs);
    }
    if (u.pathname === '/design-system.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(rendererDir, 'design-system.css')));
    }
    if (u.pathname === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(rendererDir, 'bundle.js')));
    }
    res.writeHead(404);
    res.end('not found');
  });
}

async function main() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'en-ZA' });

  try {
    const page = await ctx.newPage();
    await page.goto(`${base}/?auth=1&data=1`);
    await page.waitForTimeout(900);

    // ── P1A.5 Page-title contract ───────────────────────────────────────────
    const h1For = async (nav) => {
      if (nav) {
        await page.locator('.sidebar-nav-item').filter({ hasText: nav }).first().click();
        await page.waitForTimeout(250);
      }
      const h1s = await page.locator('h1').allInnerTexts();
      return h1s.map((s) => s.trim()).filter(Boolean);
    };

    check('Home has exactly one H1', (await h1For(null)).length === 1, (await h1For(null)).join(' | '));
    check('Run page has an H1', (await h1For('Run')).includes('Run'));
    check('Applications page has an H1', (await h1For('Applications')).includes('Applications'));
    const reviewH1 = await h1For('Review');
    check('Review page has a stable H1', reviewH1.includes('Review Queue'), reviewH1.join(' | '));
    check('Profiles page has an H1', (await h1For('Profiles')).includes('Search Profiles'));
    check('Billing page has an H1', (await h1For('Billing')).includes('Billing'));
    check('Settings page has an H1', (await h1For('Settings')).includes('Settings'));
    check('Account page has an H1', (await h1For('Account')).includes('Account'));

    // ── RV-01 Approve ───────────────────────────────────────────────────────
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Review' }).first().click();
    await page.waitForTimeout(250);
    const queueBefore = await page.locator('.review-queue-card').count();
    await page.locator('.review-queue-card').first().getByRole('button', { name: /Approve/i }).click();
    await page.waitForTimeout(400);
    const queueAfter = await page.locator('.review-queue-card').count();
    const opened = await page.evaluate(() => (window.__openedUrls || []).length);
    check(
      'Approve clears the item from the queue (RV-01)',
      queueAfter === queueBefore - 1,
      `${queueBefore} -> ${queueAfter}`
    );
    check('Approve opens the employer posting (RV-01)', opened >= 1, `${opened} url(s) opened`);

    const approveIpc = await page.evaluate(
      () =>
        (window.__ipcCalls || []).filter(
          (c) => c.call === 'updateSavedJobStatus' && c.status === 'approved'
        )
    );
    check(
      'Approve persists through the status IPC channel (P1B.2)',
      approveIpc.length >= 1 &&
        approveIpc[0].id === 'j3' &&
        typeof approveIpc[0].summary === 'string' &&
        /Approved in Review Queue/.test(approveIpc[0].summary),
      JSON.stringify(approveIpc[0] || {}).slice(0, 120)
    );

    // Approved record persists in Applications with the Approved status
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Applications' }).first().click();
    await page.waitForTimeout(350);
    const approvedPill = await page.locator('.tracker-table .status-pill-sm.approved').count();
    check('Approved record persists in Applications (RV-01)', approvedPill >= 1, `${approvedPill} approved row(s)`);

    // ── RV-03 Skip + Undo ───────────────────────────────────────────────────
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Review' }).first().click();
    await page.waitForTimeout(250);
    const beforeSkip = await page.locator('.review-queue-card').count();
    await page.locator('.review-queue-card').first().getByRole('button', { name: /^Skip$/ }).click();
    await page.waitForTimeout(350);
    const afterSkip = await page.locator('.review-queue-card').count();
    const undoVisible = await page.locator('.toast-undo-btn').count();
    check('Skip removes the item (RV-03)', afterSkip === beforeSkip - 1, `${beforeSkip} -> ${afterSkip}`);
    check('Skip offers an Undo action (RV-03/DL-03)', undoVisible >= 1, `${undoVisible} undo button(s)`);

    await page.locator('.toast-undo-btn').first().click();
    await page.waitForTimeout(400);
    const afterUndo = await page.locator('.review-queue-card').count();
    check('Undo restores the skipped item (RV-03)', afterUndo === beforeSkip, `${afterSkip} -> ${afterUndo}`);

    const skipIpc = await page.evaluate(() => window.__ipcCalls || []);
    const archivedTrue = skipIpc.filter((c) => c.call === 'archiveSavedJob' && c.archived === true).length;
    const archivedFalse = skipIpc.filter((c) => c.call === 'archiveSavedJob' && c.archived === false).length;
    check('Skip archives through IPC and Undo un-archives it (P1B.2)', archivedTrue >= 1 && archivedFalse >= 1, `archived=${archivedTrue}, restored=${archivedFalse}`);

    // ── AP-05 Remove + Undo, AP-01 sort, AP-08 search clear ─────────────────
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Applications' }).first().click();
    await page.waitForTimeout(350);
    const rowsBefore = await page.locator('.tracker-table tbody tr').count();
    await page.locator('.tracker-table tbody tr').first().getByRole('button', { name: /Remove/ }).click();
    await page.waitForTimeout(350);
    const rowsAfter = await page.locator('.tracker-table tbody tr').count();
    check('Remove archives the row (AP-05)', rowsAfter === rowsBefore - 1, `${rowsBefore} -> ${rowsAfter}`);
    await page.locator('.toast-undo-btn').first().click();
    await page.waitForTimeout(400);
    const rowsRestored = await page.locator('.tracker-table tbody tr').count();
    check('Undo restores the removed row (AP-05)', rowsRestored === rowsBefore, `${rowsAfter} -> ${rowsRestored}`);

    // Sorting by company toggles order
    const firstCompanyBefore = (await page.locator('.tracker-table tbody tr td').first().innerText()).trim();
    await page.locator('.tracker-table thead button', { hasText: 'Company' }).first().click();
    await page.waitForTimeout(250);
    const firstCompanyAfter = (await page.locator('.tracker-table tbody tr td').first().innerText()).trim();
    check('Company column sorts (AP-01)', firstCompanyBefore !== firstCompanyAfter || rowsBefore === 1, `${firstCompanyBefore} -> ${firstCompanyAfter}`);

    // Search + clear
    await page.locator('.tracker-search').fill('zzzznomatch');
    await page.waitForTimeout(250);
    const noMatch = await page.getByText('No matching applications').count();
    await page.locator('.tracker-search-clear').click();
    await page.waitForTimeout(250);
    const clearedRows = await page.locator('.tracker-table tbody tr').count();
    check('Search filters and clear restores rows (AP-08)', noMatch >= 1 && clearedRows === rowsBefore, `noMatch=${noMatch}, restored=${clearedRows}`);

    // ── ST-11/ST-12 Legal document rendering & version ──────────────────────
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Settings' }).first().click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: /Terms of Service/ }).first().click();
    await page.waitForTimeout(500);
    const legal = await page.evaluate(() => {
      const container = document.querySelector('.legal-scroll-container');
      if (!container) return null;
      return {
        headings: container.querySelectorAll('.legal-doc-heading').length,
        paragraphs: container.querySelectorAll('.legal-doc-paragraph').length,
        rawDashes: /-{20,}/.test(container.textContent || ''),
        text: (container.textContent || '').slice(0, 400),
      };
    });
    check(
      'Terms renders structured headings (ST-11)',
      Boolean(legal && legal.headings >= 3 && legal.paragraphs >= 3 && !legal.rawDashes),
      legal ? `headings=${legal.headings}, paragraphs=${legal.paragraphs}, rawDashes=${legal.rawDashes}` : 'no container'
    );
    check(
      'Terms shows the current app version (ST-12)',
      Boolean(legal && new RegExp(`VERSION ${APP_VERSION.replace(/\./g, '\\.')}`, 'i').test(legal.text)),
      `expected ${APP_VERSION}`
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // ── NT-01/NT-03 Notifications ───────────────────────────────────────────
    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.waitForTimeout(300);
    const notifText = await page.locator('.notifications-popover').innerText();
    check('Notifications never show a stale version (NT-01)', !/v0\.7\.0|v0\.6\.\d/.test(notifText), notifText.slice(0, 60).replace(/\n/g, ' '));
    const badgeAfterOpen = await page.locator('.titlebar-notif-dot').count();
    check('Opening notifications clears the unread badge (NT-03)', badgeAfterOpen === 0, `${badgeAfterOpen} badge(s)`);
    // ── G3: 100-row dataset (pagination, page sizes, CSV export) ────────────
    const large = await ctx.newPage();
    await large.setViewportSize({ width: 1360, height: 860 });
    await large.goto(`${base}/?auth=1&data=1&rows=100`);
    await large.waitForTimeout(900);
    await large.locator('.sidebar-nav-item').filter({ hasText: 'Applications' }).first().click();
    await large.waitForTimeout(450);

    const rowsPage1 = await large.locator('.tracker-table tbody tr').count();
    const pageIndicator = await large.locator('.tracker-page-indicator').innerText();
    const countText = await large.locator('.tracker-footer-count').innerText();
    check(
      '100-row dataset paginates at 25 rows (G3)',
      rowsPage1 === 25 && /Page 1 of 4/.test(pageIndicator) && /1–25 of 100/.test(countText),
      `rows=${rowsPage1}, ${pageIndicator}, ${countText}`
    );

    await large.getByRole('button', { name: 'Next' }).click();
    await large.waitForTimeout(250);
    const page2 = await large.locator('.tracker-page-indicator').innerText();
    check('Pagination advances to page 2 (G3)', /Page 2 of 4/.test(page2), page2);

    await large.locator('.tracker-page-size select').selectOption('100');
    await large.waitForTimeout(300);
    const rowsAll = await large.locator('.tracker-table tbody tr').count();
    check('100 rows per page renders the full dataset (G3)', rowsAll === 100, `rows=${rowsAll}`);

    const downloadPromise = large.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await large.getByRole('button', { name: /Export CSV/i }).click();
    const download = await downloadPromise;
    check(
      'CSV export downloads a file (P2.7)',
      Boolean(download && /fmsg-applications-.*\.csv/.test(download.suggestedFilename())),
      download ? download.suggestedFilename() : 'no download event'
    );

    const largeOverflow = await large.evaluate(() => {
      const main = document.querySelector('.workspace-main');
      return {
        page: document.documentElement.scrollWidth > window.innerWidth + 1,
        main: main ? main.scrollWidth > main.clientWidth + 1 : false,
      };
    });
    check(
      '100-row dataset has no horizontal overflow (G3)',
      !largeOverflow.page && !largeOverflow.main,
      JSON.stringify(largeOverflow)
    );
    await large.close();
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.pass);
  fs.mkdirSync(path.join(__dirname), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, 'flows-report.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2),
    'utf8'
  );
  console.log(`\n[ui:flows] ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[ui:flows] Error:', err);
  process.exit(1);
});
