import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';

export interface ModalRequest {
  id: string;
  title: string;
  message: string;
  bodyContent?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  dismissible?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
}

interface DialogContextValue {
  showModal: (opts: Omit<ModalRequest, 'id'>) => void;
  showToast: (
    message: string,
    variant?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
  openLegalDocument: (doc: 'eula' | 'terms' | 'privacy') => void;
}

const DialogContext = createContext<DialogContextValue>({
  showModal: () => {},
  showToast: () => {},
  openLegalDocument: () => {},
});

export function useDialog(): DialogContextValue {
  return useContext(DialogContext);
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [modalQueue, setModalQueue] = useState<ModalRequest[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeModal = modalQueue[0] || null;

  const showModal = useCallback((opts: Omit<ModalRequest, 'id'>) => {
    const id = `modal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setModalQueue((prev) => [...prev, { ...opts, id }]);
  }, []);

  const showToast = useCallback(
    (
      message: string,
      variant: 'info' | 'success' | 'warning' | 'error' = 'info'
    ) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const openLegalDocument = useCallback(
    (doc: 'eula' | 'terms' | 'privacy') => {
      const titles: Record<'eula' | 'terms' | 'privacy', string> = {
        eula: 'End User License Agreement',
        terms: 'Terms of Service',
        privacy: 'Privacy Policy',
      };
      window.electronAPI
        ?.getLegalDocument(doc)
        .then((res) => {
          showModal({
            title: titles[doc],
            message: '',
            bodyContent: res?.content || 'Document unavailable.',
            confirmLabel: 'Close',
            dismissible: true,
          });
        })
        .catch(() => {
          showToast('Could not load document.', 'error');
        });
    },
    [showModal, showToast]
  );

  const closeActiveModal = useCallback((confirmed: boolean) => {
    setModalQueue((prev) => {
      const current = prev[0];
      if (current) {
        if (confirmed) current.onConfirm?.();
        else current.onCancel?.();
      }
      return prev.slice(1);
    });
  }, []);

  // Focus trap & Escape key handler for active modal
  useEffect(() => {
    if (!activeModal) return;
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModal.dismissible !== false) {
        e.preventDefault();
        closeActiveModal(false);
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal, closeActiveModal]);

  return (
    <DialogContext.Provider
      value={{ showModal, showToast, openLegalDocument }}
    >
      {children}

      {activeModal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (activeModal.dismissible !== false) closeActiveModal(false);
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal-card"
            style={{
              maxWidth: activeModal.bodyContent ? 620 : 440,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="dialog-title"
              style={{
                margin: '0 0 12px 0',
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {activeModal.title}
            </h3>

            {activeModal.message && (
              <p
                style={{
                  margin: '0 0 24px 0',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.55,
                }}
              >
                {activeModal.message}
              </p>
            )}

            {activeModal.bodyContent && (
              <div
                tabIndex={0}
                style={{
                  maxHeight: 380,
                  overflowY: 'auto',
                  padding: '16px',
                  marginBottom: '24px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12.5px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {activeModal.bodyContent}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              {activeModal.cancelLabel && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => closeActiveModal(false)}
                >
                  {activeModal.cancelLabel}
                </button>
              )}
              <button
                ref={confirmBtnRef}
                type="button"
                className={`btn ${
                  activeModal.destructive ? 'btn-danger' : 'btn-primary'
                }`}
                onClick={() => closeActiveModal(true)}
              >
                {activeModal.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((t) => {
            const borderColor =
              t.variant === 'error'
                ? 'var(--danger)'
                : t.variant === 'success'
                  ? 'var(--success)'
                  : t.variant === 'warning'
                    ? 'var(--warning)'
                    : 'var(--accent)';
            return (
              <div
                key={t.id}
                className="toast-card"
                style={{ borderLeft: `3px solid ${borderColor}` }}
              >
                <span>{t.message}</span>
                <button
                  type="button"
                  onClick={() =>
                    setToasts((prev) => prev.filter((item) => item.id !== t.id))
                  }
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 6px',
                  }}
                  aria-label="Dismiss notification"
                >
                  Close
                </button>
              </div>
            );
          })}
        </div>
      )}
    </DialogContext.Provider>
  );
}
