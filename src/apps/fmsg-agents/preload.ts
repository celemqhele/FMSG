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
  getAgentState: () => ipcRenderer.invoke('get-agent-state'),
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
