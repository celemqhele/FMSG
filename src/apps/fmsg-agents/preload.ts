import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  loadProfiles: () => ipcRenderer.invoke('load-profiles'),
  launchVisibleBrowser: (url: string) => ipcRenderer.invoke('launch-visible-browser', url),
  runAgent: (config: any) => ipcRenderer.invoke('run-agent', config),
  stopAgent: () => ipcRenderer.invoke('stop-agent'),
});

declare global {
  interface Window {
    electronAPI: {
      loadProfiles: () => Promise<any>;
      launchVisibleBrowser: (url: string) => Promise<any>;
      runAgent: (config: any) => Promise<any>;
      stopAgent: () => Promise<any>;
    };
  }
}
