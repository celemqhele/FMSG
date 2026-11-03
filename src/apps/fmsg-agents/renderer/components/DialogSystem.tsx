import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  getBundledLegalMarkdown,
  LEGAL_DOC_TITLES,
  LegalDocKey,
  renderLegalDocumentNodes,
} from '../lib/legal';

export interface ModalRequest {
  id: string;
  title: string;
  message: string;
  bodyContent?: string;
  isLegalDoc?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  dismissible?: boolean;
  primaryVariant?: 'primary' | 'secondary' | 'danger';
  requireTypedText?: string;
  requireTypedPlaceholder?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  action?: ToastAction;
  durationMs?: number;
}

interface DialogContextValue {
  showModal: (opts: Omit<ModalRequest, 'id'>) => void;
  showToast: (
    message: string,
    variant?: 'info' | 'success' | 'warning' | 'error',
    options?: { action?: ToastAction; durationMs?: number }
  ) => void;
  openLegalDocument: (doc: LegalDocKey) => void;
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
  const [typedInput, setTypedInput] = useState('');
  const [copiedDoc, setCopiedDoc] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const activeModal = modalQueue[0] || null;

  const showModal = useCallback((opts: Omit<ModalRequest, 'id'>) => {
    if (document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }
    const id = `modal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setTypedInput('');
    setCopiedDoc(false);
    setModalQueue((prev) => [...prev, { ...opts, id }]);
  }, []);

  const showToast = useCallback(
    (
      message: string,
      variant: 'info' | 'success' | 'warning' | 'error' = 'info',
      options?: { action?: ToastAction; durationMs?: number }
    ) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const durationMs =
        options?.durationMs ?? (options?.action ? 10000 : 4500);
      setToasts((prev) => [
        ...prev,
        { id, message, variant, action: options?.action, durationMs },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    []
  );

  const openLegalDocument = useCallback(
    (doc: LegalDocKey) => {
      const bundled = getBundledLegalMarkdown(doc);
      showModal({
        title: LEGAL_DOC_TITLES[doc],
        message: '',
        bodyContent: bundled,
        isLegalDoc: true,
        confirmLabel: 'Close',
        primaryVariant: 'secondary',
        dismissible: true,
      });
    },
    [showModal]
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
    setTypedInput('');
    setCopiedDoc(false);
    setTimeout(() => {
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function'
      ) {
        previousFocusRef.current.focus();
      }
    }, 20);
  }, []);

  // Bridge for toasts raised from views rendered outside the hook scope
  // (e.g. the Application Detail view's copy-link action).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.message) {
        showToast(detail.message, detail.variant || 'info');
      }
    };
    window.addEventListener('fmsg-toast', handler);
    return () => window.removeEventListener('fmsg-toast', handler);
  }, [showToast]);

  useEffect(() => {
    if (!activeModal) return;
    const timer = setTimeout(() => {
      const firstInput = modalRef.current?.querySelector<HTMLElement>(
        'input:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModal.dismissible !== false) {
        e.preventDefault();
        closeActiveModal(false);
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  const typedMatchOk =
    !activeModal?.requireTypedText ||
    typedInput.trim().toLowerCase() ===
      activeModal.requireTypedText.trim().toLowerCase();

  const confirmBtnClass = activeModal?.destructive
    ? 'btn btn-danger'
    : activeModal?.primaryVariant === 'secondary'
      ? 'btn btn-secondary'
      : 'btn btn-primary';

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
            className={`modal-card shared-modal-shell ${
              activeModal.bodyContent ? 'modal-lg' : 'modal-sm'
            }`}
            style={{
              maxWidth: activeModal.bodyContent ? 720 : 460,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-shell-header">
              <h3 id="dialog-title" className="modal-shell-title">
                {activeModal.title}
              </h3>
              {activeModal.dismissible !== false && (
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close dialog"
                  title="Close (Esc)"
                  onClick={() => closeActiveModal(false)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="modal-shell-body">
              {activeModal.message && (
                <p className="modal-shell-message">{activeModal.message}</p>
              )}

              {activeModal.requireTypedText && (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label htmlFor="modal-typed-confirm" className="field-label">
                    Type <strong>{activeModal.requireTypedText}</strong> to
                    confirm
                  </label>
                  <input
                    id="modal-typed-confirm"
                    type="text"
                    className="field-input"
                    placeholder={
                      activeModal.requireTypedPlaceholder ||
                      activeModal.requireTypedText
                    }
                    value={typedInput}
                    onChange={(e) => setTypedInput(e.target.value)}
                  />
                </div>
              )}

              {activeModal.bodyContent && (
                <div
                  tabIndex={0}
                  className="legal-scroll-container"
                  aria-label={activeModal.title}
                >
                  {activeModal.isLegalDoc
                    ? renderLegalDocumentNodes(activeModal.bodyContent)
                    : activeModal.bodyContent}
                </div>
              )}
            </div>

            <div className="modal-shell-footer">
              {activeModal.isLegalDoc && activeModal.bodyContent && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginRight: 'auto' }}
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(activeModal.bodyContent || '')
                      .then(() => {
                        setCopiedDoc(true);
                        setTimeout(() => setCopiedDoc(false), 2000);
                      })
                      .catch(() => {});
                  }}
                >
                  {copiedDoc ? 'Copied ✓' : 'Copy Text'}
                </button>
              )}
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
                className={confirmBtnClass}
                disabled={!typedMatchOk}
                title={
                  !typedMatchOk
                    ? `Type "${activeModal.requireTypedText}" above to enable confirmation`
                    : undefined
                }
                onClick={() => closeActiveModal(true)}
              >
                {activeModal.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
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
                <div className="toast-card-actions">
                  {t.action && (
                    <button
                      type="button"
                      className="toast-undo-btn"
                      onClick={() => {
                        t.action?.onClick();
                        setToasts((prev) =>
                          prev.filter((item) => item.id !== t.id)
                        );
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                  <button
                    type="button"
                    className="toast-dismiss-btn"
                    onClick={() =>
                      setToasts((prev) =>
                        prev.filter((item) => item.id !== t.id)
                      )
                    }
                    aria-label="Dismiss notification"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DialogContext.Provider>
  );
}
