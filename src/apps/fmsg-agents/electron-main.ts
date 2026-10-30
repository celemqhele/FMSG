import { app, BrowserWindow, ipcMain, powerSaveBlocker } from 'electron';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import * as path from 'path';
import { AgentRunner, AgentConfig } from './agent-controller';

const SUPABASE_URL = 'https://nnebtygloqixibbjxsjr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: true,
  });

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// IPC: load profiles
ipcMain.handle('load-profiles', async () => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('search_profiles')
      .select('id, user_id, job_titles, location, industry, industry_step_1, industry_step_2, location_scope');
    if (error) throw error;
    return { profiles: data ?? [] };
  } catch (e: any) {
    return { error: e.message || String(e) };
  }
});

// IPC: visible Playwright browser launch
ipcMain.handle('launch-visible-browser', async (_event, url: string) => {
  try {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(url);
    return { ok: true, message: 'Visible browser launched' };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let agentRunner: AgentRunner | null = null;

ipcMain.handle('run-agent', async (_event, config: AgentConfig) => {
  if (!agentRunner) agentRunner = new AgentRunner(config);
  await agentRunner.init();
  await agentRunner.runBatch(config.profileId);
  return { done: true };
});

ipcMain.handle('stop-agent', async () => {
  if (agentRunner) await agentRunner.stop();
  return { stopped: true };
});

ipcMain.handle('set-prevent-sleep', async (_event, enabled: boolean) => {
  const id = (globalThis as any).__preventSleepId;
  if (enabled && !id) {
    (globalThis as any).__preventSleepId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!enabled && id) {
    powerSaveBlocker.stop(id);
    (globalThis as any).__preventSleepId = null;
  }
  return { ok: true, enabled };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
