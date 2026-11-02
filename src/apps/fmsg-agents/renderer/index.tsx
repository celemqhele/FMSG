import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import designSystemCss from './design-system.css';

// Ensure bundled design system CSS is injected even if loaded from an update slot
if (typeof document !== 'undefined' && !document.getElementById('fmsg-bundled-css')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'fmsg-bundled-css';
  styleEl.textContent = String(designSystemCss);
  document.head.appendChild(styleEl);
}

// Forward uncaught renderer errors to the main-process diagnostic log
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    window.electronAPI?.logRendererError(
      event.message || 'Renderer error',
      event.error?.stack
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    window.electronAPI?.logRendererError(
      reason?.message || String(reason || 'Unhandled rejection'),
      reason?.stack
    );
  });
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(React.createElement(App));
