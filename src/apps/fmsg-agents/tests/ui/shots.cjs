#!/usr/bin/env node
/**
 * FMSG Agents — Reproducible Multi-Viewport UI Screenshot & Metrics Harness (P0.2)
 *
 * Usage:
 *   node tests/ui/shots.cjs [--size 960,1280,1360,1920] [--out tests/ui/shots]
 *
 * Renders the compiled renderer bundle (`renderer/bundle.js` + `renderer/design-system.css`)
 * across all target viewports (960x640, 1280x720, 1360x860, 1920x1080) with deterministic
 * populated state and real legal documents, captures screenshots of every screen/modal,
 * and outputs `metrics.json` with layout, overflow, focus, and typography measurements.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../../..');

// Read the version from config.ts so mocks and assertions never drift from the
// released build.
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

const SIZE_MAP = {
  '960': { width: 960, height: 640, label: '960x640' },
  '1280': { width: 1280, height: 720, label: '1280x720' },
  '1360': { width: 1360, height: 860, label: '1360x860' },
  '1920': { width: 1920, height: 1080, label: '1920x1080' },
};

function parseArgs() {
  const args = process.argv.slice(2);
  let sizesRaw = '960,1280,1360,1920';
  let outDir = path.join(__dirname, 'shots');

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--size' && args[i + 1]) {
      sizesRaw = args[i + 1];
      i += 1;
    } else if (args[i].startsWith('--size=')) {
      sizesRaw = args[i].split('=')[1];
    } else if (args[i] === '--out' && args[i + 1]) {
      outDir = path.resolve(APP_ROOT, args[i + 1]);
      i += 1;
    } else if (args[i].startsWith('--out=')) {
      outDir = path.resolve(APP_ROOT, args[i].split('=')[1]);
    }
  }

  const sizes = sizesRaw
    .split(',')
    .map((s) => s.trim())
    .map((s) => SIZE_MAP[s] || SIZE_MAP[s.split('x')[0]])
    .filter(Boolean);

  return {
    sizes: sizes.length > 0 ? sizes : Object.values(SIZE_MAP),
    outDir,
  };
}

function readLegalDoc(docKey) {
  const map = {
    eula: 'EULA.md',
    terms: 'Terms_of_Service.md',
    privacy: 'Privacy_Policy.md',
  };
  const file = map[docKey] || 'Terms_of_Service.md';
  const fullPath = path.join(APP_ROOT, 'legal', file);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return 'Document unavailable.';
  }
}

/**
 * The renderer bundle inlines design-system.css at build time (index.tsx injects
 * it after the <link>), so a stale bundle silently overrides the on-disk CSS and
 * produces false measurements. Fail fast instead of reporting phantom results.
 */
function assertBundleFresh() {
  const bundlePath = path.join(APP_ROOT, 'renderer', 'bundle.js');
  if (!fs.existsSync(bundlePath)) {
    console.error('[ui:shots] renderer/bundle.js is missing. Run: npm run build:renderer');
    process.exit(1);
  }
  const bundleMtime = fs.statSync(bundlePath).mtimeMs;
  const roots = [
    path.join(APP_ROOT, 'renderer'),
    path.join(APP_ROOT, 'legal'),
  ];
  const stale = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tsx?|css|md)$/.test(entry.name)) continue;
      if (entry.name === 'bundle.js') continue;
      if (fs.statSync(full).mtimeMs > bundleMtime) {
        stale.push(path.relative(APP_ROOT, full));
      }
    }
  };
  for (const root of roots) {
    if (fs.existsSync(root)) walk(root);
  }
  if (stale.length > 0) {
    console.error(
      `[ui:shots] Stale renderer bundle — newer sources: ${stale.slice(0, 5).join(', ')}. Run: npm run build:renderer`
    );
    process.exit(1);
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
  const populated = params.get('data') !== '0';
  const noSecrets = params.get('secrets') === '0';
  const legalDocs = { eula: ${eula}, terms: ${terms}, privacy: ${privacy} };

  const profiles = [
    { id:'p1', name:'Nomkhosi Mpungose 1', target_job_title:'Service Delivery Manager', job_titles:['Service Delivery Manager','Client Success Manager','Account Manager','Operations Manager','Business Professional'], industry:'Critical Digital Infrastructure', location:'Gauteng South Africa', desired_salary:'R65,000', cv_storage_path:'u1/p1/9f2c1a4b.pdf' },
    { id:'p2', name:'Khanyiswa Monakali 2', target_job_title:'Collections Consultant', job_titles:['Collections Consultant','Recoveries Officer','Credit Risk Analyst','Debt Recovery Specialist','Banking Professional'], industry:'Retail Banking', location:'Gauteng South Africa', desired_salary:'R28,000', cv_storage_path:'u1/p2/4b7d0e13.pdf' },
    { id:'p3', name:'Medard Yamba', target_job_title:'Customer Success Manager', job_titles:['Customer Success Manager','Account Manager','Client Success Specialist','Client Relationship Manager','Business Professional'], industry:'Financial Technology', location:'Pretoria South Africa', desired_salary:'R45,000', cv_storage_path:null },
    { id:'p4', name:'Sufyaan Blunden 2', target_job_title:'Logistics and Operations Assistant', job_titles:['Logistics and Operations Assistant','Supply Chain Coordinator','Inventory Controller','Transport Coordinator','Operations Professional'], industry:'Signage & Print Manufacturing', location:'Newcastle South Africa', desired_salary:'R22,000', cv_storage_path:'u1/p4/1c8a5f62.pdf' },
    { id:'p5', name:'Mqhele Cele', target_job_title:'Paid Media Specialist', job_titles:['Paid Media Specialist','Digital Marketing Specialist','Performance Marketing Specialist','Paid Search Specialist','Marketing Professional'], industry:'Real Estate', location:'Durban South Africa', desired_salary:'R40,000', cv_storage_path:'u1/p5/7e3b9d05.pdf' },
    { id:'p6', name:'Thuliswa Thuba', target_job_title:'Senior Key Account Manager', job_titles:['Senior Key Account Manager','Senior Business Development Manager','Senior Client Relationship Manager','Senior Strategic Account Manager','Senior Sales Professional'], industry:'Pharmaceuticals', location:'Johannesburg South Africa', desired_salary:'R75,000', cv_storage_path:'u1/p6/2a6f4c88.pdf' }
  ];

  const now = new Date('2026-11-03T09:30:00Z').getTime();
  const day = 86400000;
  let jobs = [
    { id:'j1', profile_id:'p1', job_title:'Senior Service Delivery Manager', company:'Deloitte', location:'Johannesburg, Gauteng', estimated_salary:'R65,000 - R80,000 pm', match_score:92, review_status:'applied', match_summary:'Applied via FMSG Agents on 2 Nov 2026. Strong match on ITIL and service governance.', job_url:'https://example.com/1', full_spec:'Lead a portfolio of managed service engagements across financial services clients. 10+ years ITIL, vendor governance, SLA management.', created_at:new Date(now-day*0.5).toISOString() },
    { id:'j2', profile_id:'p1', job_title:'Client Success Manager', company:'Microsoft', location:'Johannesburg, Gauteng', estimated_salary:'R55,000 - R70,000 pm', match_score:88, review_status:'applied', match_summary:'Applied via FMSG Agents on 1 Nov 2026.', job_url:'https://example.com/2', full_spec:'Own strategic client relationships across enterprise accounts.', created_at:new Date(now-day*1.2).toISOString() },
    { id:'j3', profile_id:'p1', job_title:'Head of Operations', company:'Standard Bank', location:'Gauteng', estimated_salary:'R85,000 pm', match_score:84, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 31 Oct 2026. Not auto-submitted: employer asked for a covering letter.', job_url:'https://example.com/3', full_spec:'Operations leadership across a 200-person shared services function.', created_at:new Date(now-day*2.4).toISOString() },
    { id:'j4', profile_id:'p1', job_title:'Service Delivery Lead', company:'Dimension Data', location:'Sandton, Gauteng', estimated_salary:'R60,000 pm', match_score:81, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 30 Oct 2026. Portal requires manual sign-in.', job_url:'https://example.com/4', full_spec:'Managed services delivery for a mining client.', created_at:new Date(now-day*3.1).toISOString() },
    { id:'j5', profile_id:'p3', job_title:'Customer Operations Manager', company:'Takealot', location:'Cape Town', estimated_salary:'R50,000 pm', match_score:76, review_status:'applied', match_summary:'Applied via FMSG Agents on 29 Oct 2026.', job_url:'https://example.com/5', full_spec:'Scale customer operations for a high-growth e-commerce business.', created_at:new Date(now-day*4.4).toISOString() },
    { id:'j6', profile_id:'p1', job_title:'Account Director', company:'Accenture', location:'Johannesburg, Gauteng', estimated_salary:'R72,000 pm', match_score:73, review_status:'needs_review', match_summary:'Opened via FMSG Agents on 28 Oct 2026. Not auto-submitted: work authorisation question required review.', job_url:'https://example.com/6', full_spec:'Account leadership across banking and insurance.', created_at:new Date(now-day*5.8).toISOString() }
  ];

  const user = { id:'u1', email:'mqhele03@gmail.com', emailVerified:true, accountStatus:'active', name:'Mqhele', surname:'Cele', phone:'+27 82 000 0000', location:'Johannesburg, Gauteng' };
  const noop = async () => ({ ok:true });

  window.electronAPI = {
    getStartupStatus: async () => ({ configValid:true, activeVersion:'${APP_VERSION}', installedVersion:'${APP_VERSION}', rolledBack:false, browserStatus:{available:true,browserName:'Google Chrome',message:'Google Chrome ready'}, deviceKeyStatus:{ok:true, deviceId:'dev_fd813828a7f8f9b4bb0173b1b7ea929c'}, updateState:{channel:'stable',lastCheckAt:'2026-11-03T08:30:00.000Z',lastCheckStatus:'Up to date',launchCount:2}, logInfo:{} }),
    runStartupUpdateFlow: async () => ({ available:false }),
    onUpdateProgress: () => () => {},
    restoreSession: async () => authed ? { ok:true, user, profiles } : { ok:false },
    login: async (c) => { if (window.__mockLogin) return window.__mockLogin(c); return { ok:false, error:'Incorrect email or password. Please try again.' }; },
    signup: async () => ({ ok:false, field:'general', error:'An account with this email already exists.' }),
    forgotPassword: async () => ({ ok:false, field:'general', error:'No account found with that email address.' }),
    resendConfirmation: async () => ({ ok:true }),
    sendVerificationCode: async () => ({ ok:true }),
    verifyEmailCode: async () => ({ ok:false, error:'That code is incorrect or has expired.' }),
    logout: async () => ({ ok:true }),
    loadProfiles: async () => ({ ok:true, user, profiles }),
    launchVisibleBrowser: noop,
    runAgent: async () => ({ ok:true }),
    stopAgent: noop, pauseAgent: noop, resumeAgent: noop, emergencyStopAgent: noop,
    getAgentState: async () => ({ ok:true, running:false }),
    onAgentEvent: () => () => {},
    respondAgentAttention: noop,
    getBillingPlans: async () => ({ ok:true, data:{ plans:[
      { name:'Starter', displayName:'Starter', applications:10, price:34900, priceLabel:'R349', perAppZar:35, discountPct:12, graceApps:1, features:['10 automated applications / month','R35 per application (12% off R40)','Job searches & CV tailoring included','Unused applications roll over'] },
      { name:'Lite', displayName:'Lite', applications:25, price:74900, priceLabel:'R749', perAppZar:30, discountPct:25, graceApps:2, features:['25 automated applications / month','R30 per application (25% off R40)','Job searches & CV tailoring included','Unused applications roll over'] },
      { name:'Standard', displayName:'Standard', applications:60, price:149900, priceLabel:'R1 499', perAppZar:25, discountPct:38, graceApps:6, popular:true, features:['60 automated applications / month','R25 per application (38% off R40)','Job searches & CV tailoring included','Unused applications roll over'] },
      { name:'Power', displayName:'Power', applications:150, price:329900, priceLabel:'R3 299', perAppZar:22, discountPct:45, graceApps:15, features:['150 automated applications / month','R22 per application (45% off R40)','Job searches & CV tailoring included','Unused applications roll over'] }
    ] } }),
    startCheckout: async () => ({ ok:false, data:{ error:'Could not open the Paystack checkout page.' } }),
    verifyCheckout: async () => ({ ok:true, data:{ ok:false } }),
    getBillingSummary: async () => ({
      ok:true,
      plan:'free',
      searches: 12,
      cvGens: 5,
      pfRuns: 2,
      invoices: [
        { id:'inv_1', reference:'FMSG_9928172', plan:'Standard', amountZar:1499, status:'paid', createdAt:'2026-10-15T10:12:00Z' },
        { id:'inv_2', reference:'FMSG_8817261', plan:'Starter', amountZar:349, status:'paid', createdAt:'2026-09-15T09:04:00Z' }
      ],
      paymentMethod: { brand:'Visa', last4:'4242', expMonth:'08', expYear:'2028', reusable:true },
      nextRenewalDate: '2026-11-15T00:00:00Z'
    }),
    setPreventSleep: noop,
    checkForUpdates: async () => ({ available:false, message:'You are running the latest version.' }),
    applyUpdate: noop,
    getUpdateSettings: async () => ({ currentVersion:'${APP_VERSION}', installedVersion:'${APP_VERSION}', channel:'stable', lastCheckAt:'2026-11-03T08:30:00.000Z', lastCheckStatus:'Up to date', deviceId:'dev_fd813828a7f8f9b4bb0173b1b7ea929c', deviceKeyOk:true, browserStatus:{available:true,browserName:'Google Chrome',message:'Google Chrome ready'} }),
    setUpdateChannel: noop, resetDeviceKey: async () => ({ ok:true }),
    getLegalDocument: async (doc) => ({ ok:true, content: legalDocs[doc] || legalDocs.terms }),
    openExternalUrl: noop, minimizeWindow: noop, maximizeWindow: noop, closeWindow: noop,
    listSiteSecrets: async () => noSecrets ? { ok:true, items:[] } : { ok:true, items:[
      { keyName:'LINKEDIN_PASSWORD', siteLabel:'LinkedIn', allowedDomain:'linkedin.com', username:'mqhele03@gmail.com', updatedAt:'2026-11-02T14:20:00.000Z' },
      { keyName:'PNET_PASSWORD', siteLabel:'PNet', allowedDomain:'pnet.co.za', username:'mqhele03@gmail.com', updatedAt:'2026-11-01T11:10:00.000Z' }
    ]},
    saveSiteSecret: async () => ({ ok:true }),
    deleteSiteSecret: async (keyName) => { return { ok:true }; },
    getScreeningRules: async () => ({ ok:true, rules:{ minSalaryZar:25000, mustHaveKeywords:['Remote','ITIL'], answers:[
      { id:'a1', question:'What is your notice period?', answer:'30 days / 1 calendar month', category:'Experience', askEachTime:false },
      { id:'a2', question:'Are you legally authorized to work in South Africa?', answer:'Yes', category:'Personal', askEachTime:false },
      { id:'a3', question:'Are you willing to relocate or work hybrid?', answer:'Yes', category:'Preferences', askEachTime:false }
    ]}}),
    saveScreeningRules: async (r) => ({ ok:true, rules: r }),
    getAgentPrefs: async () => ({ ok:true, prefs:{ costCap:160, billingMode:'pay-as-you-go', bundleTier:'Starter', autonomyMode:'approve-each', onboardingCompleted:true } }),
    saveAgentPrefs: async (p) => ({ ok:true, prefs: p }),
    listSavedJobs: async () => ({ ok:true, jobs: populated ? jobs.filter(j => !j.archived_at) : [] }),
    deleteSavedJob: async (id) => { jobs = jobs.filter(j => j.id !== id); return { ok:true }; },
    updateSavedJobStatus: async (id, reviewStatus, matchSummary) => {
      jobs = jobs.map(j => j.id === id ? { ...j, review_status: reviewStatus, ...(matchSummary ? { match_summary: matchSummary } : {}) } : j);
      return { ok:true, job: jobs.find(j => j.id === id) };
    },
    archiveSavedJob: async (id, archived) => {
      jobs = jobs.map(j => j.id === id ? { ...j, archived_at: archived ? new Date().toISOString() : null } : j);
      return { ok:true };
    },
    sendDeleteAccountCode: async () => ({ ok:false, data:{ error:'Could not send deletion code.' } }),
    confirmDeleteAccount: async () => ({ ok:false, data:{ error:'Invalid code.' } }),
    logUIEvent: noop,
    logRendererError: noop
  };
})();
`;
}

function createHarnessServer() {
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
      const mime =
        ext === '.css'
          ? 'text/css'
          : ext === '.js'
            ? 'application/javascript'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(candidate));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
}

async function collectViewportMetrics(page) {
  return page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight;
    };
    const els = [...document.querySelectorAll('button, a, input, select')].filter(vis);
    const heights = {};
    const radii = {};
    const fonts = {};
    for (const e of els) {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const h = Math.round(r.height);
      heights[h] = (heights[h] || 0) + 1;
      radii[s.borderRadius] = (radii[s.borderRadius] || 0) + 1;
      fonts[s.fontSize] = (fonts[s.fontSize] || 0) + 1;
    }
    const tiny = [...document.querySelectorAll('*')]
      .filter(
        (e) =>
          vis(e) &&
          e.children.length === 0 &&
          (e.textContent || '').trim() &&
          parseFloat(getComputedStyle(e).fontSize) < 12
      )
      .map((e) => ({
        text: e.textContent.trim().slice(0, 44),
        fs: getComputedStyle(e).fontSize,
        cls: e.className?.toString().slice(0, 40),
      }))
      .slice(0, 30);

    const clipped = [...document.querySelectorAll('*')]
      .filter(
        (e) =>
          vis(e) &&
          e.clientWidth > 10 &&
          e.scrollWidth > e.clientWidth + 2 &&
          getComputedStyle(e).overflow !== 'visible' &&
          getComputedStyle(e).overflowX !== 'auto' &&
          getComputedStyle(e).textOverflow !== 'ellipsis'
      )
      .map((e) => ({
        text: e.textContent.trim().slice(0, 44),
        cls: e.className?.toString().slice(0, 40),
        cw: e.clientWidth,
        sw: e.scrollWidth,
      }))
      .slice(0, 30);

    const main = document.querySelector('.workspace-main');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalScroll: document.documentElement.scrollWidth > innerWidth + 1,
      mainScroll: main
        ? {
            clientWidth: main.clientWidth,
            scrollWidth: main.scrollWidth,
            clientHeight: main.clientHeight,
            scrollHeight: main.scrollHeight,
          }
        : null,
      heights,
      radii,
      fonts,
      tinyTextCount: tiny.length,
      tinySample: tiny.slice(0, 10),
      clippedCount: clipped.length,
      clippedSample: clipped.slice(0, 10),
    };
  });
}

async function run() {
  const { sizes, outDir } = parseArgs();
  assertBundleFresh();
  fs.mkdirSync(outDir, { recursive: true });

  const server = createHarnessServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const allMetrics = {
    capturedAt: new Date().toISOString(),
    sizes: {},
  };

  try {
    for (const size of sizes) {
      const sizeDir = path.join(outDir, size.label);
      fs.mkdirSync(sizeDir, { recursive: true });
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        locale: 'en-ZA',
      });
      const sizeMetrics = {};

      // 1. Auth screens
      const authPage = await ctx.newPage();
      await authPage.goto(`${baseUrl}/?auth=0`);
      await authPage.waitForTimeout(700);
      await authPage.screenshot({ path: path.join(sizeDir, '01-login.png') });
      sizeMetrics.login = await collectViewportMetrics(authPage);

      await authPage.getByRole('tab', { name: /Sign Up/i }).click();
      await authPage.waitForTimeout(250);
      await authPage.screenshot({ path: path.join(sizeDir, '02-signup.png') });
      sizeMetrics.signup = await authPage.evaluate(() => {
        const card = document.querySelector('.auth-card');
        const r = card ? card.getBoundingClientRect() : null;
        return {
          vw: innerWidth,
          vh: innerHeight,
          card: r
            ? {
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                height: Math.round(r.height),
                overflowsViewport: Math.round(r.bottom) > innerHeight,
              }
            : null,
        };
      });
      await authPage.close();

      // 2. Authenticated workspace screens
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/?auth=1&data=1`);
      await page.waitForTimeout(900);

      // Home
      await page.screenshot({ path: path.join(sizeDir, '03-home.png') });
      sizeMetrics.home = await collectViewportMetrics(page);

      // Run Setup Modal
      const startBtn = page.getByRole('button', { name: /Start Applying|Start a Run/i }).first();
      await startBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(sizeDir, '04-run-setup-modal.png') });
      sizeMetrics.runSetupModal = await page.evaluate(() => {
        const modal = document.querySelector('.run-setup-modal, .modal-card');
        const closeBtn = document.querySelector('.run-setup-modal .win-ctrl-btn, .run-setup-modal [aria-label*="Close"], .modal-close-btn');
        const mr = modal ? modal.getBoundingClientRect() : null;
        const cr = closeBtn ? closeBtn.getBoundingClientRect() : null;
        return {
          vw: innerWidth,
          vh: innerHeight,
          modal: mr
            ? {
                left: Math.round(mr.left),
                top: Math.round(mr.top),
                right: Math.round(mr.right),
                bottom: Math.round(mr.bottom),
                width: Math.round(mr.width),
                height: Math.round(mr.height),
                topClipped: mr.top < 36,
                bottomClipped: mr.bottom > innerHeight,
              }
            : null,
          closeButtonReachable: cr
            ? cr.top >= 36 && cr.bottom <= innerHeight && cr.left >= 0 && cr.right <= innerWidth
            : false,
        };
      });

      // Dismiss Run Setup modal via Escape or backdrop or close button
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const stillOpen = await page.locator('.run-setup-modal').count();
      if (stillOpen > 0) {
        await page.evaluate(() => {
          const btn = document.querySelector('.run-setup-modal .win-ctrl-btn, .run-setup-modal [aria-label*="Close"], .modal-close-btn');
          if (btn) btn.click();
        });
        await page.waitForTimeout(200);
      }

      // Run screen
      await page.locator('.sidebar-nav-item').filter({ hasText: 'Run' }).first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(sizeDir, '05-run.png') });
      sizeMetrics.run = await collectViewportMetrics(page);

      // Applications screen
      await page.locator('.sidebar-nav-item').filter({ hasText: 'Applications' }).first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(sizeDir, '06-applications.png') });
      sizeMetrics.applications = await collectViewportMetrics(page);

      // Application Detail
      const firstRow = page.locator('.tracker-table tbody tr').first();
      if ((await firstRow.count()) > 0) {
        await firstRow.click();
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(sizeDir, '07-application-detail.png') });
        sizeMetrics.applicationDetail = await collectViewportMetrics(page);
      }

      // Review screen
      await page.locator('.sidebar-nav-item').filter({ hasText: 'Review' }).first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(sizeDir, '08-review.png') });
      sizeMetrics.review = await collectViewportMetrics(page);

      // Profiles screen
      await page.locator('.sidebar-nav-item').filter({ hasText: 'Profiles' }).first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(sizeDir, '09-profiles.png') });
      sizeMetrics.profiles = await collectViewportMetrics(page);

      // Rules tab / view
      const rulesBtn = page.getByRole('button', { name: /Rules/i }).first();
      if ((await rulesBtn.count()) > 0) {
        await rulesBtn.click();
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(sizeDir, '10-rules.png') });
        sizeMetrics.rules = await collectViewportMetrics(page);
      }

      // Billing screen
      await page.locator('.sidebar-nav-item').filter({ hasText: 'Billing' }).first().click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(sizeDir, '11-billing.png') });
      sizeMetrics.billing = await collectViewportMetrics(page);

      // Settings screen
      await page.locator('.sidebar-nav-item').filter({ hasText: 'Settings' }).first().click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(sizeDir, '12-settings.png') });
      sizeMetrics.settings = await collectViewportMetrics(page);

      // Account screen
      const accountNav = page.locator('.sidebar-nav-item').filter({ hasText: 'Account' });
      if ((await accountNav.count()) > 0) {
        await accountNav.first().click();
      } else {
        await page.locator('.sidebar-user-btn').click();
      }
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(sizeDir, '13-account.png') });
      sizeMetrics.account = await collectViewportMetrics(page);

      allMetrics.sizes[size.label] = sizeMetrics;
      await ctx.close();
      console.log(`[ui:shots] Captured 13 screens at ${size.label}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const metricsPath = path.join(outDir, 'metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(allMetrics, null, 2), 'utf8');
  console.log(`[ui:shots] Saved metrics -> ${path.relative(APP_ROOT, metricsPath)}`);
}

run().catch((err) => {
  console.error('[ui:shots] Failed:', err);
  process.exit(1);
});
