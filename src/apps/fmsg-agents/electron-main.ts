/**
 * FMSG Agents — Electron Main Process & Immutable Bootloader
 *
 * - Initializes real-time diagnostic logging (logger.ts) with strict redaction
 * - Validates bundled public configuration at startup (config.ts)
 * - Verifies active update slot health & auto-rolls back on boot failure (update-manager.ts)
 * - Initializes device-bound identity in non-roaming DPAPI storage (device-key.ts)
 * - Runs pre-login update check on 2nd+ launch without blocking or requiring user login
 * - Manages website-parity Supabase auth & OS keyring session persistence (session-manager.ts)
 * - Resolves Chrome/Chromium for visible browser automation (browser-resolver.ts)
 */

import { app, BrowserWindow, ipcMain, powerSaveBlocker, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { APP_VERSION, WEB_BASE_URL, validateStartupConfig } from './config';

// Force all Electron user data into non-roaming %LOCALAPPDATA%\fmsg-agents\user-data
try {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  app.setPath('userData', path.join(localAppData, 'fmsg-agents', 'user-data'));
} catch {
  // ignore in standalone Node
}
import {
  installProcessDiagnosticHooks,
  logEvent,
  logIPC,
  logUIInteraction,
  logException,
  finalizeLog,
  getLogPaths,
} from './logger';
import {
  ensureValidDeviceIdentityOnLaunch,
  getOrCreateDeviceIdentity,
  generateFreshDeviceIdentity,
} from './device-key';
import {
  verifyStartupSlotHealth,
  performSecureUpdateCheck,
  downloadAndApplyVerifiedRelease,
  loadInstallState,
  saveInstallState,
  handoffToSilentInstaller,
  getUpdatesBaseDir,
} from './update-manager';
import {
  restoreAndRefreshSession,
  loginUser,
  signUpUser,
  sendPasswordResetEmail,
  resendSignupConfirmationEmail,
  sendEmailVerificationCode,
  verifySixDigitEmailCode,
  logoutUser,
  fetchUserAndProfilesUnderRLS,
  createAnonSupabaseClient,
  getActiveSessionAccessToken,
  getActiveSessionUser,
} from './session-manager';
import {
  resolveAutomationBrowser,
  launchVisibleAutomationBrowser,
} from './browser-resolver';
import {
  AgentRunner,
  AgentConfig,
  AgentEvent,
  AgentRuntime,
} from './agent-controller';
import {
  listAgentProfiles,
  createAgentProfile,
  updateAgentProfile,
  deleteAgentProfile,
  uploadAgentCv,
} from './agent-profiles';
import {
  listSiteSecretsMeta,
  saveSiteSecret,
  deleteSiteSecret,
  loadScreeningRules,
  saveScreeningRules,
  loadAgentPrefs,
  saveAgentPrefs,
} from './secret-vault';

installProcessDiagnosticHooks();

let mainWindow: BrowserWindow | null = null;
let agentRunner: AgentRunner | null = null;

// Attention prompts (sign-in walls, captchas, protected fields, submit approval)
// are answered from the renderer; the runner waits on the matching resolver.
const pendingAttention = new Map<
  string,
  (answer: 'continue' | 'skip') => void
>();

function sendAgentEvent(event: AgentEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-event', event);
  }
}

function resolveAllAttention(answer: 'continue' | 'skip'): void {
  for (const [id, resolve] of pendingAttention) {
    pendingAttention.delete(id);
    try {
      resolve(answer);
    } catch {
      // ignore
    }
  }
}

const agentRuntime: AgentRuntime = {
  emit: (event: AgentEvent) => {
    sendAgentEvent(event);
  },
  requestAttention: (event, signal) =>
    new Promise<'continue' | 'skip'>((resolve) => {
      const id = `attn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let settled = false;
      const finish = (answer: 'continue' | 'skip') => {
        if (settled) return;
        settled = true;
        pendingAttention.delete(id);
        resolve(answer);
      };

      pendingAttention.set(id, finish);
      signal.addEventListener('abort', () => finish('skip'), { once: true });

      if (!mainWindow || mainWindow.isDestroyed()) {
        finish('skip');
        return;
      }

      sendAgentEvent({ type: 'attention', id, ...event });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }),
};
let startupHealth: {
  healthy: boolean;
  rolledBack: boolean;
  activeVersion: string;
  activeRendererBundlePath?: string;
  activeHtmlPath?: string;
} = {
  healthy: true,
  rolledBack: false,
  activeVersion: APP_VERSION,
  activeRendererBundlePath: undefined,
  activeHtmlPath: undefined,
};
let startupConfigCheck = validateStartupConfig();
let deviceKeyStatus: {
  ok: boolean;
  deviceId?: string;
  error?: string;
} = { ok: true };

function initializeBootSequence(): void {
  startupConfigCheck = validateStartupConfig();
  logEvent('boot', 'startup_config_validated', {
    valid: startupConfigCheck.valid,
    key_role: startupConfigCheck.keyRole,
    reason: startupConfigCheck.reason,
  });

  // Ensure device key exists on every launch (auto-create if missing or corrupted)
  try {
    const ensured = ensureValidDeviceIdentityOnLaunch();
    deviceKeyStatus = { ok: true, deviceId: ensured.identity.deviceId };
  } catch (err: any) {
    deviceKeyStatus = { ok: false, error: err.message };
    logEvent('boot', 'device_key_mismatch', { error: err.message }, 'warn');
  }

  // Verify update slot health and auto-rollback if previous update failed boot
  startupHealth = verifyStartupSlotHealth();
  logEvent('boot', 'slot_health_checked', {
    healthy: startupHealth.healthy,
    rolled_back: startupHealth.rolledBack,
    active_version: startupHealth.activeVersion,
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'FMSG Agents',
    backgroundColor: '#040613',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: true,
  });

  const htmlPath =
    startupHealth.activeHtmlPath && fs.existsSync(startupHealth.activeHtmlPath)
      ? startupHealth.activeHtmlPath
      : path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(htmlPath);

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logException('rendererError', new Error(`Render process gone: ${details.reason}`), {
      exitCode: details.exitCode,
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC: Startup status (config validation, slot health, browser resolution, device key)
ipcMain.handle('get-startup-status', async () => {
  logIPC('get-startup-status', 'handle');
  const browser = resolveAutomationBrowser();
  const state = loadInstallState();
  return {
    configValid: startupConfigCheck.valid,
    activeVersion: startupHealth.activeVersion || APP_VERSION,
    installedVersion: APP_VERSION,
    rolledBack: startupHealth.rolledBack,
    browserStatus: browser,
    deviceKeyStatus,
    updateState: {
      channel: state.channel,
      lastCheckAt: state.last_check_at,
      lastCheckStatus: state.last_check_status,
      launchCount: state.launch_count_for_version,
    },
    logInfo: getLogPaths(),
  };
});

// IPC: Restore persisted session from OS keyring & silently refresh
ipcMain.handle('restore-session', async () => {
  logIPC('restore-session', 'handle');
  return restoreAndRefreshSession();
});

// IPC: Login (website parity)
ipcMain.handle(
  'login',
  async (
    _event,
    creds: { email: string; password: string; keepSignedIn?: boolean }
  ) => {
    logIPC('login', 'handle', {
      email_len: creds?.email?.length ?? 0,
      password_len: creds?.password?.length ?? 0,
      keep_signed_in: creds?.keepSignedIn,
    });
    return loginUser(creds);
  }
);

// IPC: Sign Up (website parity)
ipcMain.handle(
  'signup',
  async (
    _event,
    payload: {
      name: string;
      surname: string;
      email: string;
      password: string;
      agreeTos: boolean;
      agreePrivacy: boolean;
      agreeAge: boolean;
    }
  ) => {
    logIPC('signup', 'handle', {
      name_len: payload?.name?.length ?? 0,
      surname_len: payload?.surname?.length ?? 0,
      email_len: payload?.email?.length ?? 0,
      password_len: payload?.password?.length ?? 0,
      agree_tos: payload?.agreeTos,
      agree_privacy: payload?.agreePrivacy,
      agree_age: payload?.agreeAge,
    });
    return signUpUser(payload);
  }
);

// IPC: Forgot password
ipcMain.handle('forgot-password', async (_event, payload: { email: string }) => {
  logIPC('forgot-password', 'handle', { email_len: payload?.email?.length ?? 0 });
  return sendPasswordResetEmail(payload?.email);
});

// IPC: Resend signup confirmation email
ipcMain.handle(
  'resend-confirmation',
  async (_event, payload: { email: string }) => {
    logIPC('resend-confirmation', 'handle', {
      email_len: payload?.email?.length ?? 0,
    });
    return resendSignupConfirmationEmail(payload?.email);
  }
);

// IPC: Send 6-digit verification code
ipcMain.handle('send-verification-code', async () => {
  logIPC('send-verification-code', 'handle');
  return sendEmailVerificationCode();
});

// IPC: Verify 6-digit email code
ipcMain.handle(
  'verify-email-code',
  async (_event, payload: { code: string }) => {
    logIPC('verify-email-code', 'handle', { code_len: payload?.code?.length ?? 0 });
    return verifySixDigitEmailCode(payload?.code);
  }
);

// IPC: Logout
ipcMain.handle('logout', async () => {
  logIPC('logout', 'handle');
  if (agentRunner && agentRunner.isRunning()) {
    await agentRunner.stop();
  }
  return logoutUser();
});

// IPC: Load profiles under active RLS session
ipcMain.handle('load-profiles', async () => {
  logIPC('load-profiles', 'handle');
  const token = getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user) {
    return { ok: false, profiles: [] };
  }
  try {
    const res = await fetchUserAndProfilesUnderRLS(token, user);
    return { ok: true, user: res.user, profiles: res.profiles };
  } catch (err: any) {
    logIPC('load-profiles', 'error', { error: err.message });
    return { ok: false, profiles: [] };
  }
});

// IPC: Independent agent profiles (migration 040) under active RLS session
ipcMain.handle('agent-profiles-list', async () => {
  logIPC('agent-profiles-list', 'handle');
  try {
    const profiles = await listAgentProfiles();
    return { ok: true, profiles };
  } catch (err: any) {
    logIPC('agent-profiles-list', 'error', { error: err.message });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle(
  'agent-profiles-create',
  async (_event, payload: { name: string; targetJobTitle: string }) => {
    logIPC('agent-profiles-create', 'handle');
    try {
      const profile = await createAgentProfile(
        payload || { name: '', targetJobTitle: '' }
      );
      return { ok: true, profile };
    } catch (err: any) {
      logIPC('agent-profiles-create', 'error', { error: err.message });
      return { ok: false, error: err.message };
    }
  }
);

ipcMain.handle(
  'agent-profiles-update',
  async (
    _event,
    payload: { id: string; name?: string; targetJobTitle?: string }
  ) => {
    logIPC('agent-profiles-update', 'handle');
    try {
      const profile = await updateAgentProfile(payload);
      return { ok: true, profile };
    } catch (err: any) {
      logIPC('agent-profiles-update', 'error', { error: err.message });
      return { ok: false, error: err.message };
    }
  }
);

ipcMain.handle('agent-profiles-delete', async (_event, payload: { id: string }) => {
  logIPC('agent-profiles-delete', 'handle');
  try {
    await deleteAgentProfile(payload?.id);
    return { ok: true };
  } catch (err: any) {
    logIPC('agent-profiles-delete', 'error', { error: err.message });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle(
  'agent-cv-upload',
  async (
    _event,
    payload: {
      profileId: string;
      name: string;
      mime: string;
      data: ArrayBuffer;
    }
  ) => {
    // Log metadata only — never CV bytes or contents.
    logIPC('agent-cv-upload', 'handle', {
      profileId: payload?.profileId,
      name: payload?.name,
      mime: payload?.mime,
    });
    try {
      const profile = await uploadAgentCv(payload);
      return { ok: true, profile };
    } catch (err: any) {
      logIPC('agent-cv-upload', 'error', { error: err.message });
      return { ok: false, error: err.message };
    }
  }
);

// IPC: Launch visible browser
ipcMain.handle('launch-visible-browser', async (_event, url: string) => {
  logIPC('launch-visible-browser', 'handle', { url });
  try {
    const browser = await launchVisibleAutomationBrowser({ slowMo: 200 });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.goto(url || WEB_BASE_URL);
    return { ok: true, message: 'Browser launched' };
  } catch (e: any) {
    logIPC('launch-visible-browser', 'error', { error: e.message });
    return { ok: false, error: e.message || 'Could not launch browser' };
  }
});

// IPC: bring the automation Chrome window to the foreground (E-003-A)
ipcMain.handle('agent-focus-browser', async () => {
  logIPC('agent-focus-browser', 'handle', {});
  try {
    if (!agentRunner || !agentRunner.isRunning()) {
      return { ok: false, error: 'No run in progress' };
    }
    const ok = await agentRunner.focusAutomationBrowser();
    return ok ? { ok: true } : { ok: false, error: 'No browser window found' };
  } catch (e: any) {
    logIPC('agent-focus-browser', 'error', { error: e.message });
    return { ok: false, error: e.message || 'Could not focus browser' };
  }
});

// IPC: Run agent
ipcMain.handle('run-agent', async (_event, config: AgentConfig) => {
  logIPC('run-agent', 'handle', {
    profile_id: config?.profileId,
    batch_size: config?.batchSize,
    mode: config?.mode,
  });
  try {
    if (agentRunner && agentRunner.isRunning()) {
      await agentRunner.stop();
    }
    agentRunner = new AgentRunner(config, agentRuntime);
    await agentRunner.init();

    // Stream the run instead of blocking the IPC call: the renderer renders
    // every phase, screenshot and attention prompt as it happens.
    agentRunner
      .runBatch(config.profileId)
      .catch((err: any) => {
        logIPC('run-agent', 'error', { error: err?.message });
        sendAgentEvent({
          type: 'phase',
          phase: 'error',
          label: 'Run stopped',
          sublabel:
            err?.message ||
            'Something interrupted the run. Please try again.',
        });
        sendAgentEvent({
          type: 'run-done',
          applied: 0,
          skipped: 0,
          total: 0,
        });
      })
      .finally(() => {
        resolveAllAttention('skip');
      });

    return { ok: true, started: true };
  } catch (err: any) {
    logIPC('run-agent', 'error', { error: err.message });
    return {
      ok: false,
      error:
        err.message ||
        'Could not start the agent. Please check your browser and connection.',
    };
  }
});

// IPC: Stop agent
ipcMain.handle('stop-agent', async () => {
  logIPC('stop-agent', 'handle');
  resolveAllAttention('skip');
  if (agentRunner) await agentRunner.stop();
  return { stopped: true };
});

// IPC: Pause / Resume / Emergency Stop agent
ipcMain.handle('pause-agent', async () => {
  logIPC('pause-agent', 'handle');
  if (agentRunner) agentRunner.pause();
  return { ok: true, paused: true };
});

ipcMain.handle('resume-agent', async () => {
  logIPC('resume-agent', 'handle');
  if (agentRunner) agentRunner.resume();
  return { ok: true, paused: false };
});

ipcMain.handle('emergency-stop-agent', async () => {
  logIPC('emergency-stop-agent', 'handle');
  resolveAllAttention('skip');
  if (agentRunner) await agentRunner.stop();
  return { ok: true, stopped: true };
});

// IPC: Answer a pending attention prompt (continue or skip)
ipcMain.handle(
  'agent-attention-response',
  async (_event, payload: { id: string; answer: 'continue' | 'skip' }) => {
    logIPC('agent-attention-response', 'handle', {
      id: payload?.id,
      answer: payload?.answer,
    });
    const resolver = pendingAttention.get(payload?.id);
    if (!resolver) return { ok: false, stale: true };
    resolver(payload?.answer === 'continue' ? 'continue' : 'skip');
    return { ok: true };
  }
);

// IPC: Get agent state
ipcMain.handle('get-agent-state', async () => {
  return agentRunner
    ? agentRunner.getState()
    : {
        running: false,
        currentJobIndex: 0,
        appliedCount: 0,
        skippedCount: 0,
        lastStep: 'idle',
        checklistVisible: true,
      };
});

// ── Billing (hosted Paystack checkout, secret key stays on the server) ──────

async function authedWebRequest(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = getActiveSessionAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { error: 'Please sign in again to manage your plan.' },
    };
  }

  try {
    const res = await fetch(`${WEB_BASE_URL}${path}`, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: { error: err?.message || 'Could not reach FMSG right now.' },
    };
  }
}

ipcMain.handle('billing-plans', async () => {
  logIPC('billing-plans', 'handle');
  return authedWebRequest('/api/agent/billing/plans');
});

ipcMain.handle(
  'billing-checkout',
  async (_event, payload: { plan: string }) => {
    logIPC('billing-checkout', 'handle', { plan: payload?.plan });
    const result = await authedWebRequest('/api/agent/billing/checkout', {
      method: 'POST',
      body: { plan: payload?.plan },
    });

    if (result.ok && result.data?.authorizationUrl) {
      try {
        await shell.openExternal(result.data.authorizationUrl);
      } catch (err: any) {
        logIPC('billing-checkout', 'error', {
          error: err?.message,
        });
        return {
          ok: false,
          error: 'Could not open your browser for the payment page.',
        };
      }
    }

    return result;
  }
);

ipcMain.handle(
  'billing-verify',
  async (_event, payload: { reference: string; plan: string }) => {
    logIPC('billing-verify', 'handle', { plan: payload?.plan });
    return authedWebRequest('/api/agent/billing/verify', {
      method: 'POST',
      body: {
        reference: payload?.reference,
        plan: payload?.plan,
        billing_cycle: 'once',
      },
    });
  }
);

ipcMain.handle('billing-summary', async () => {
  const token = getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user?.id) {
    return { ok: false, error: 'Please sign in again.' };
  }

  try {
    const supabase = createAnonSupabaseClient(token);
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'plan, search_balance, cv_generation_balance, persistent_finder_balance'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return { ok: false, error: 'Could not load your balances right now.' };
    }

    return {
      ok: true,
      plan: (data?.plan || 'free').toString(),
      searches: data?.search_balance ?? 0,
      cvGens: data?.cv_generation_balance ?? 0,
      pfRuns: data?.persistent_finder_balance ?? 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: 'Could not load your balances right now.',
    };
  }
});

// IPC: Run startup update flow on every launch before login
ipcMain.handle('run-startup-update-flow', async () => {
  logIPC('run-startup-update-flow', 'handle');
  const isBusy = agentRunner ? agentRunner.isRunning() : false;
  const channelOverride =
    process.env.FMSG_UPDATE_CHANNEL === 'beta'
      ? 'beta'
      : process.env.FMSG_UPDATE_CHANNEL === 'stable'
        ? 'stable'
        : undefined;

  const res = await performSecureUpdateCheck({
    manual: false,
    isAgentBusy: isBusy,
    channelOverride,
    onProgress: (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-progress', progress);
      }
    },
  });

  if (res.applied && res.latestVersion) {
    startupHealth.activeVersion = res.latestVersion;
    const updatesDir = getUpdatesBaseDir();
    const slotHtml = path.join(updatesDir, 'Slot-Active', 'renderer', 'index.html');
    if (fs.existsSync(slotHtml)) {
      startupHealth.activeHtmlPath = slotHtml;
    }

    if (res.requiresInstaller && res.installerPath && fs.existsSync(res.installerPath)) {
      setTimeout(() => {
        handoffToSilentInstaller(res.installerPath!, () => {
          app.quit();
        });
      }, 650);
    } else {
      // Reopen on the newly installed Slot-Active bundle automatically
      setTimeout(() => {
        if (process.env.FMSG_TEST_RELOAD_IN_PLACE === '1' && mainWindow && !mainWindow.isDestroyed()) {
          const targetHtml =
            startupHealth.activeHtmlPath && fs.existsSync(startupHealth.activeHtmlPath)
              ? startupHealth.activeHtmlPath
              : path.join(__dirname, '../renderer/index.html');
          mainWindow.loadFile(targetHtml);
        } else {
          app.relaunch();
          app.exit(0);
        }
      }, 750);
    }
  }

  return res;
});

// IPC: Check for updates (manual trigger from Settings or footer)
ipcMain.handle(
  'check-for-updates',
  async (_event, opts?: { manual?: boolean }) => {
    logIPC('check-for-updates', 'handle', { manual: !!opts?.manual });
    const isBusy = agentRunner ? agentRunner.isRunning() : false;
    return performSecureUpdateCheck({
      manual: !!opts?.manual,
      isAgentBusy: isBusy,
      autoApplyUpdates: false,
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-progress', progress);
        }
      },
    });
  }
);

// IPC: Apply update (downloads if needed, verifies signature & SHA-256, and reopens automatically)
ipcMain.handle('apply-update', async (_event, manifest?: any) => {
  logIPC('apply-update', 'handle', { version: manifest?.version });
  if (agentRunner && agentRunner.isRunning()) {
    return {
      ok: false,
      deferred: true,
      message:
        'An application run is currently in progress. The update will be applied as soon as the run finishes.',
    };
  }

  if (manifest && Array.isArray(manifest.files)) {
    const dl = await downloadAndApplyVerifiedRelease(manifest, {
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-progress', progress);
        }
      },
    });
    if (!dl.ok || !dl.applied) {
      return {
        ok: false,
        applied: false,
        message: dl.reason || 'Could not download or verify update.',
      };
    }

    startupHealth.activeVersion = manifest.version;
    const updatesDir = getUpdatesBaseDir();
    const slotHtml = path.join(updatesDir, 'Slot-Active', 'renderer', 'index.html');
    if (fs.existsSync(slotHtml)) {
      startupHealth.activeHtmlPath = slotHtml;
    }

    if (manifest.requires_installer && dl.installerPath && fs.existsSync(dl.installerPath)) {
      const launched = handoffToSilentInstaller(dl.installerPath, () => {
        app.quit();
      });
      return {
        ok: launched,
        applied: launched,
        mode: 'installer_handoff',
        message: 'Installing update silently...',
      };
    }
  }

  setTimeout(() => {
    if (process.env.FMSG_TEST_RELOAD_IN_PLACE === '1' && mainWindow && !mainWindow.isDestroyed()) {
      const targetHtml =
        startupHealth.activeHtmlPath && fs.existsSync(startupHealth.activeHtmlPath)
          ? startupHealth.activeHtmlPath
          : path.join(__dirname, '../renderer/index.html');
      mainWindow.loadFile(targetHtml);
    } else {
      app.relaunch();
      app.exit(0);
    }
  }, 750);

  return {
    ok: true,
    applied: true,
    mode: 'bundle_swap',
    message: 'Installing new updates and reopening...',
  };
});

// IPC: Get update & device settings for Settings panel
ipcMain.handle('get-update-settings', async () => {
  const state = loadInstallState();
  const browser = resolveAutomationBrowser();
  let devId = deviceKeyStatus.deviceId || 'Unregistered';
  try {
    const dev = getOrCreateDeviceIdentity();
    devId = dev.deviceId;
    deviceKeyStatus = { ok: true, deviceId: dev.deviceId };
  } catch (err: any) {
    deviceKeyStatus = { ok: false, error: err.message };
  }

  return {
    currentVersion: startupHealth.activeVersion || APP_VERSION,
    installedVersion: APP_VERSION,
    channel: state.channel,
    lastCheckAt: state.last_check_at,
    lastCheckStatus: state.last_check_status,
    launchCount: state.launch_count_for_version,
    deferredUpdateVersion: state.deferred_update_version,
    deviceId: devId,
    deviceKeyOk: deviceKeyStatus.ok,
    browserStatus: browser,
  };
});

// IPC: Set release channel (stable / beta)
ipcMain.handle(
  'set-update-channel',
  async (_event, payload: { channel: 'stable' | 'beta' }) => {
    const ch = payload?.channel === 'beta' ? 'beta' : 'stable';
    const state = loadInstallState();
    state.channel = ch;
    saveInstallState(state);
    logIPC('set-update-channel', 'handle', { channel: ch });
    return { ok: true, channel: ch };
  }
);

// IPC: Reset & re-register device key (recovery path on key mismatch)
ipcMain.handle('reset-device-key', async () => {
  logIPC('reset-device-key', 'handle');
  try {
    const fresh = generateFreshDeviceIdentity();
    deviceKeyStatus = { ok: true, deviceId: fresh.deviceId };
    return { ok: true, deviceId: fresh.deviceId };
  } catch (err: any) {
    return { ok: false, error: 'Could not reset device key.' };
  }
});

// IPC: Read legal documents (EULA, Terms, Privacy Policy) for in-app modal
ipcMain.handle(
  'get-legal-document',
  async (_event, payload: { doc: 'eula' | 'terms' | 'privacy' }) => {
    const map: Record<string, string> = {
      eula: 'EULA.md',
      terms: 'Terms_of_Service.md',
      privacy: 'Privacy_Policy.md',
    };
    const fileName = map[payload?.doc] || 'Terms_of_Service.md';
    const filePath = path.join(__dirname, '../legal', fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { ok: true, content };
    } catch {
      return { ok: false, content: 'Document unavailable.' };
    }
  }
);

// IPC: Open external HTTPS link in system browser
ipcMain.handle('open-external-url', async (_event, payload: { url: string }) => {
  const url = payload?.url || '';
  if (url.startsWith('https://')) {
    logUIInteraction('open_external_url', url);
    await shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false };
});

// IPC: Prevent PC sleep
ipcMain.handle('set-prevent-sleep', async (_event, enabled: boolean) => {
  logIPC('set-prevent-sleep', 'handle', { enabled });
  const id = (globalThis as any).__preventSleepId;
  if (enabled && !id) {
    (globalThis as any).__preventSleepId = powerSaveBlocker.start(
      'prevent-app-suspension'
    );
  } else if (!enabled && id) {
    powerSaveBlocker.stop(id);
    (globalThis as any).__preventSleepId = null;
  }
  return { enabled };
});

// IPC: Custom frameless title bar window controls
ipcMain.handle('window-minimize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
  return { ok: true };
});

ipcMain.handle('window-maximize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return { ok: true, maximized: mainWindow.isMaximized() };
  }
  return { ok: false, maximized: false };
});

ipcMain.handle('window-close', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  return { ok: true };
});

// IPC: Local Credential Manager Secret Vault (never returns password values)
ipcMain.handle('secrets-list', async () => {
  logIPC('secrets-list', 'handle');
  const items = await listSiteSecretsMeta();
  return { ok: true, items };
});

ipcMain.handle(
  'secrets-save',
  async (
    _event,
    payload: {
      siteLabel: string;
      allowedDomain: string;
      username: string;
      password: string;
      keyName?: string;
    }
  ) => {
    logIPC('secrets-save', 'handle', {
      site_label: payload?.siteLabel,
      allowed_domain: payload?.allowedDomain,
    });
    return saveSiteSecret(payload);
  }
);

ipcMain.handle('secrets-delete', async (_event, payload: { keyName: string }) => {
  logIPC('secrets-delete', 'handle', { key_name: payload?.keyName });
  return deleteSiteSecret(payload?.keyName || '');
});

// IPC: Rules & Answer Bank + Persistent Agent Preferences (Cost Cap defaults to R0)
ipcMain.handle('rules-get', async () => {
  return { ok: true, rules: loadScreeningRules() };
});

ipcMain.handle('rules-save', async (_event, payload: any) => {
  const saved = saveScreeningRules(payload || {});
  return { ok: true, rules: saved };
});

ipcMain.handle('agent-prefs-get', async () => {
  return { ok: true, prefs: loadAgentPrefs() };
});

ipcMain.handle('agent-prefs-save', async (_event, payload: any) => {
  const saved = saveAgentPrefs(payload || {});
  return { ok: true, prefs: saved };
});

// IPC: Applications Tracker & History (from shared public.saved_jobs under RLS)
ipcMain.handle('saved-jobs-list', async () => {
  const token = getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user?.id) {
    return { ok: false, jobs: [] };
  }
  try {
    const supabase = createAnonSupabaseClient(token);
    const { data, error } = await supabase
      .from('saved_jobs')
      .select(
        'id, profile_id, job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec, created_at, review_status, archived_at'
      )
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      // Tolerate a not-yet-applied Migration 039: fall back to the legacy column set
      if (/review_status|archived_at/.test(error.message || '')) {
        const legacy = await supabase
          .from('saved_jobs')
          .select(
            'id, profile_id, job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec, created_at'
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200);
        if (legacy.error) {
          return { ok: false, jobs: [], error: legacy.error.message };
        }
        return {
          ok: true,
          jobs: legacy.data || [],
          schema: 'legacy',
        };
      }
      return { ok: false, jobs: [], error: error.message };
    }
    return { ok: true, jobs: data || [], schema: 'v039' };
  } catch (err: any) {
    return { ok: false, jobs: [], error: err?.message };
  }
});

const REVIEW_STATUSES = [
  'applied',
  'needs_review',
  'approved',
  'submitted',
  'skipped',
] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// IPC: Update review status (Approve / Mark submitted / Skip) — never deletes
ipcMain.handle(
  'saved-jobs-update-status',
  async (
    _event,
    payload: { id: string; reviewStatus: ReviewStatus; matchSummary?: string }
  ) => {
    const token = getActiveSessionAccessToken();
    const user = getActiveSessionUser();
    if (!token || !user?.id || !payload?.id) {
      return { ok: false, error: 'Not signed in.' };
    }
    if (!REVIEW_STATUSES.includes(payload.reviewStatus)) {
      return { ok: false, error: 'Unknown review status.' };
    }
    try {
      const supabase = createAnonSupabaseClient(token);
      const patch: Record<string, unknown> = {
        review_status: payload.reviewStatus,
      };
      if (typeof payload.matchSummary === 'string') {
        patch.match_summary = payload.matchSummary.slice(0, 500);
      }
      const { data, error } = await supabase
        .from('saved_jobs')
        .update(patch)
        .eq('id', payload.id)
        .eq('user_id', user.id)
        .select('id, review_status, archived_at')
        .maybeSingle();
      if (error) {
        logIPC('saved-jobs-update-status', 'error', { error: error.message });
        return { ok: false, error: error.message };
      }
      return { ok: true, job: data };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  }
);

// IPC: Archive / restore a record (reversible removal, no data loss)
ipcMain.handle(
  'saved-jobs-archive',
  async (_event, payload: { id: string; archived: boolean }) => {
    const token = getActiveSessionAccessToken();
    const user = getActiveSessionUser();
    if (!token || !user?.id || !payload?.id) {
      return { ok: false, error: 'Not signed in.' };
    }
    try {
      const supabase = createAnonSupabaseClient(token);
      const { data, error } = await supabase
        .from('saved_jobs')
        .update({
          archived_at: payload.archived ? new Date().toISOString() : null,
        })
        .eq('id', payload.id)
        .eq('user_id', user.id)
        .select('id, review_status, archived_at')
        .maybeSingle();
      if (error) {
        logIPC('saved-jobs-archive', 'error', { error: error.message });
        return { ok: false, error: error.message };
      }
      return { ok: true, job: data };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  }
);

ipcMain.handle('saved-jobs-delete', async (_event, payload: { id: string }) => {
  const token = getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user?.id || !payload?.id) {
    return { ok: false };
  }
  try {
    const supabase = createAnonSupabaseClient(token);
    const { error } = await supabase
      .from('saved_jobs')
      .delete()
      .eq('id', payload.id)
      .eq('user_id', user.id);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
});

// IPC: Account deletion (website parity: send code + confirm delete)
ipcMain.handle('account-send-delete-code', async () => {
  logIPC('account-send-delete-code', 'handle');
  return authedWebRequest('/api/auth/send-delete-code', { method: 'POST' });
});

ipcMain.handle(
  'account-confirm-delete',
  async (_event, payload: { code: string }) => {
    logIPC('account-confirm-delete', 'handle');
    const res = await authedWebRequest('/api/delete-account', {
      method: 'DELETE',
      body: { code: payload?.code },
    });
    if (res.ok) {
      await logoutUser();
    }
    return res;
  }
);

// IPC: Renderer UI & error logging
ipcMain.handle(
  'log-ui-event',
  async (
    _event,
    payload: { action: string; target: string; meta?: Record<string, any> }
  ) => {
    logUIInteraction(payload.action, payload.target, payload.meta);
    return { ok: true };
  }
);

ipcMain.handle(
  'log-renderer-error',
  async (
    _event,
    payload: { message: string; stack?: string; meta?: Record<string, any> }
  ) => {
    const err = new Error(payload.message);
    if (payload.stack) err.stack = payload.stack;
    logException('rendererError', err, payload.meta);
    return { ok: true };
  }
);

app.whenReady().then(async () => {
  initializeBootSequence();
  createWindow();

  // Automated visual verification mode for DPI & window scaling screenshots
  if (process.env.FMSG_SCREENSHOT_DIR && mainWindow) {
    const outDir = process.env.FMSG_SCREENSHOT_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    setTimeout(async () => {
      try {
        if (!mainWindow) return;
        const scales = [
          { label: '100pct_1360x860', factor: 1.0, w: 1360, h: 860 },
          { label: '125pct_1360x860', factor: 1.25, w: 1360, h: 860 },
          { label: '150pct_1360x860', factor: 1.5, w: 1360, h: 860 },
          { label: 'minsize_960x640_100pct', factor: 1.0, w: 960, h: 640 },
        ];
        for (const s of scales) {
          mainWindow.setSize(s.w, s.h);
          mainWindow.webContents.setZoomFactor(s.factor);
          await new Promise((r) => setTimeout(r, 600));
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(
            path.join(outDir, `screenshot_${s.label}.png`),
            image.toPNG()
          );
        }
        finalizeLog('screenshot_verification_complete');
        app.exit(0);
      } catch (err) {
        logException('mainError', err);
        app.exit(1);
      }
    }, 1800);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  finalizeLog('window_all_closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  finalizeLog('will_quit');
});
