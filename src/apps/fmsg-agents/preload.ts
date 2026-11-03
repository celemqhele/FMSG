import { contextBridge, ipcRenderer } from 'electron';

ipcRenderer.on('update-available', (_event, data) => {
  window.dispatchEvent(new CustomEvent('agent-update-available', { detail: data }));
});

ipcRenderer.on('agent-event', (_event, data) => {
  window.dispatchEvent(new CustomEvent('agent-event', { detail: data }));
});

const api = {
  getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),
  runStartupUpdateFlow: () => ipcRenderer.invoke('run-startup-update-flow'),
  onUpdateProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('update-progress', listener);
    return () => {
      ipcRenderer.removeListener('update-progress', listener);
    };
  },
  restoreSession: () => ipcRenderer.invoke('restore-session'),
  login: (creds: { email: string; password: string; keepSignedIn?: boolean }) =>
    ipcRenderer.invoke('login', creds),
  signup: (payload: {
    name: string;
    surname: string;
    email: string;
    password: string;
    agreeTos: boolean;
    agreePrivacy: boolean;
    agreeAge: boolean;
  }) => ipcRenderer.invoke('signup', payload),
  forgotPassword: (email: string) =>
    ipcRenderer.invoke('forgot-password', { email }),
  resendConfirmation: (email: string) =>
    ipcRenderer.invoke('resend-confirmation', { email }),
  sendVerificationCode: () => ipcRenderer.invoke('send-verification-code'),
  verifyEmailCode: (code: string) =>
    ipcRenderer.invoke('verify-email-code', { code }),
  logout: () => ipcRenderer.invoke('logout'),
  loadProfiles: () => ipcRenderer.invoke('load-profiles'),
  launchVisibleBrowser: (url: string) =>
    ipcRenderer.invoke('launch-visible-browser', url),
  runAgent: (config: any) => ipcRenderer.invoke('run-agent', config),
  stopAgent: () => ipcRenderer.invoke('stop-agent'),
  pauseAgent: () => ipcRenderer.invoke('pause-agent'),
  resumeAgent: () => ipcRenderer.invoke('resume-agent'),
  emergencyStopAgent: () => ipcRenderer.invoke('emergency-stop-agent'),
  getAgentState: () => ipcRenderer.invoke('get-agent-state'),
  focusAutomationBrowser: () => ipcRenderer.invoke('agent-focus-browser'),
  onAgentEvent: (callback: (event: any) => void) => {
    const listener = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('agent-event', listener);
    return () => {
      ipcRenderer.removeListener('agent-event', listener);
    };
  },
  respondAgentAttention: (id: string, answer: 'continue' | 'skip') =>
    ipcRenderer.invoke('agent-attention-response', { id, answer }),
  getBillingPlans: () => ipcRenderer.invoke('billing-plans'),
  startCheckout: (plan: string) =>
    ipcRenderer.invoke('billing-checkout', { plan }),
  verifyCheckout: (reference: string, plan: string) =>
    ipcRenderer.invoke('billing-verify', { reference, plan }),
  getBillingSummary: () => ipcRenderer.invoke('billing-summary'),
  setPreventSleep: (enabled: boolean) =>
    ipcRenderer.invoke('set-prevent-sleep', enabled),
  checkForUpdates: (manual = true) =>
    ipcRenderer.invoke('check-for-updates', { manual }),
  applyUpdate: (manifest?: any) => ipcRenderer.invoke('apply-update', manifest),
  getUpdateSettings: () => ipcRenderer.invoke('get-update-settings'),
  setUpdateChannel: (channel: 'stable' | 'beta') =>
    ipcRenderer.invoke('set-update-channel', { channel }),
  resetDeviceKey: () => ipcRenderer.invoke('reset-device-key'),
  getLegalDocument: (doc: 'eula' | 'terms' | 'privacy') =>
    ipcRenderer.invoke('get-legal-document', { doc }),
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke('open-external-url', { url }),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  listSiteSecrets: () => ipcRenderer.invoke('secrets-list'),
  saveSiteSecret: (payload: {
    siteLabel: string;
    allowedDomain: string;
    username: string;
    password: string;
    keyName?: string;
  }) => ipcRenderer.invoke('secrets-save', payload),
  deleteSiteSecret: (keyName: string) =>
    ipcRenderer.invoke('secrets-delete', { keyName }),
  getScreeningRules: () => ipcRenderer.invoke('rules-get'),
  saveScreeningRules: (rules: any) => ipcRenderer.invoke('rules-save', rules),
  getAgentPrefs: () => ipcRenderer.invoke('agent-prefs-get'),
  saveAgentPrefs: (prefs: any) => ipcRenderer.invoke('agent-prefs-save', prefs),
  listSavedJobs: () => ipcRenderer.invoke('saved-jobs-list'),
  updateSavedJobStatus: (
    id: string,
    reviewStatus: 'applied' | 'needs_review' | 'approved' | 'submitted' | 'skipped',
    matchSummary?: string
  ) =>
    ipcRenderer.invoke('saved-jobs-update-status', {
      id,
      reviewStatus,
      matchSummary,
    }),
  archiveSavedJob: (id: string, archived: boolean) =>
    ipcRenderer.invoke('saved-jobs-archive', { id, archived }),
  deleteSavedJob: (id: string) =>
    ipcRenderer.invoke('saved-jobs-delete', { id }),
  sendDeleteAccountCode: () => ipcRenderer.invoke('account-send-delete-code'),
  confirmDeleteAccount: (code: string) =>
    ipcRenderer.invoke('account-confirm-delete', { code }),
  logUIEvent: (action: string, target: string, meta?: Record<string, any>) =>
    ipcRenderer.invoke('log-ui-event', { action, target, meta }),
  logRendererError: (message: string, stack?: string, meta?: Record<string, any>) =>
    ipcRenderer.invoke('log-renderer-error', { message, stack, meta }),
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
