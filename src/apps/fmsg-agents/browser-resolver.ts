/**
 * FMSG Agents — Browser Resolver & Verifier
 *
 * Locates a compatible Chromium-based browser for visible browser automation:
 * 1. Bundled or cached Playwright Chromium (ms-playwright)
 * 2. System Google Chrome (Program Files / Program Files (x86) / LocalAppData)
 * 3. System Microsoft Edge (Chromium-based fallback)
 *
 * Exposes verification for startup, Settings, and pre-run checks with plain,
 * human-readable messages when a browser is missing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { chromium, Browser } from 'playwright';
import { logBrowserAutomation } from './logger';

export interface BrowserResolution {
  available: boolean;
  browserName: string;
  executablePath?: string;
  channel?: 'chrome' | 'msedge';
  message: string;
}

const CHROME_CANDIDATE_PATHS: Array<{ name: string; path: string }> = [
  {
    name: 'Google Chrome',
    path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  },
  {
    name: 'Google Chrome (x86)',
    path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  },
  {
    name: 'Google Chrome (User)',
    path: path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Google\\Chrome\\Application\\chrome.exe'
    ),
  },
  {
    name: 'Microsoft Edge',
    path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  },
  {
    name: 'Microsoft Edge (x64)',
    path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  },
];

export function resolveAutomationBrowser(): BrowserResolution {
  // 1. Check Playwright's default executable path if present on disk
  try {
    const pwExec = chromium.executablePath();
    if (pwExec && fs.existsSync(pwExec)) {
      return {
        available: true,
        browserName: 'Chromium',
        executablePath: pwExec,
        message: 'Browser ready',
      };
    }
  } catch {
    // ignore and check system paths
  }

  // 2. Check standard Windows Google Chrome & Edge paths
  for (const candidate of CHROME_CANDIDATE_PATHS) {
    try {
      if (fs.existsSync(candidate.path)) {
        return {
          available: true,
          browserName: candidate.name,
          executablePath: candidate.path,
          message: `${candidate.name} ready`,
        };
      }
    } catch {
      // continue
    }
  }

  return {
    available: false,
    browserName: 'None',
    message:
      'Google Chrome was not found on your computer. Please install Google Chrome to run automated job applications.',
  };
}

export async function launchVisibleAutomationBrowser(options?: {
  slowMo?: number;
}): Promise<Browser> {
  const resolved = resolveAutomationBrowser();
  logBrowserAutomation('resolve_browser', {
    available: resolved.available,
    browser_name: resolved.browserName,
  });

  if (!resolved.available || !resolved.executablePath) {
    throw new Error(resolved.message);
  }

  return chromium.launch({
    headless: false,
    executablePath: resolved.executablePath,
    slowMo: options?.slowMo ?? 200,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
}
