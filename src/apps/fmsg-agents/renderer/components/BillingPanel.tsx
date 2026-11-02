import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from './DialogSystem';

/**
 * Spend Cap & Plan.
 *
 * Anything that costs money is set here. The cap is a plain amount you type in
 * rand — no steppers, no arrows — and the agent stops the moment it would go
 * over it. Upgrades go through FMSG's hosted card checkout: the app opens the
 * payment page in your own browser and waits for it to confirm, so no card
 * details are ever entered inside this window.
 */

interface BillingPanelProps {
  costCap: number;
  onCostCapChange: (cap: number) => void;
  mode?: 'bundle' | 'pay-as-you-go';
  onModeChange?: (mode: 'bundle' | 'pay-as-you-go') => void;
  tier?: 'Starter' | 'Lite' | 'Standard' | 'Power';
  onTierChange?: (tier: 'Starter' | 'Lite' | 'Standard' | 'Power') => void;
  onUpgraded?: () => void;
}

interface Plan {
  name: string;
  price: number;
  priceLabel: string;
  billingCycle?: string;
  limits: { searches: number; cv_gens: number; pf_balance: number };
  features: string[];
  popular?: boolean;
}

interface Summary {
  ok: boolean;
  plan?: string;
  searches?: number;
  cvGens?: number;
  pfRuns?: number;
}

const POLL_MS = 3500;
const POLL_LIMIT_MS = 4 * 60 * 1000;

export default function BillingPanel({
  costCap,
  onCostCapChange,
  onUpgraded,
}: BillingPanelProps) {
  const { showToast } = useDialog();

  const [capInput, setCapInput] = useState<string>(
    costCap > 0 ? String(costCap) : ''
  );
  const [capSaved, setCapSaved] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [checkout, setCheckout] = useState<{
    plan: string;
    reference: string;
    startedAt: number;
  } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState('');
  const pollBusy = useRef(false);

  const loadPlans = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getBillingPlans?.();
      if (res?.ok && Array.isArray(res.data?.plans)) {
        setPlans(res.data.plans);
      } else {
        setPlans([]);
      }
    } catch {
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getBillingSummary?.();
      if (res?.ok) setSummary(res as Summary);
    } catch {
      // balances stay hidden rather than showing invented numbers
    }
  }, []);

  useEffect(() => {
    loadPlans();
    loadSummary();
  }, [loadPlans, loadSummary]);

  // Keep the typed amount in step when the cap is changed elsewhere.
  useEffect(() => {
    if (checkout) return;
    setCapInput(costCap > 0 ? String(costCap) : '');
  }, [costCap, checkout]);

  const saveCap = () => {
    const cleaned = capInput.replace(/[^0-9.]/g, '');
    const value = Math.max(0, Math.round(Number(cleaned) || 0));
    onCostCapChange(value);
    setCapInput(value > 0 ? String(value) : '');
    setCapSaved(true);
    window.setTimeout(() => setCapSaved(false), 2200);
  };

  const startUpgrade = async (plan: Plan) => {
    if (starting || checkout) return;
    setStarting(plan.name);

    try {
      const res = await window.electronAPI?.startCheckout?.(plan.name);
      if (res?.ok && res.data?.reference) {
        setCheckout({
          plan: plan.name,
          reference: res.data.reference,
          startedAt: Date.now(),
        });
        setWaitNote(
          'Finish the payment in the browser tab that just opened. This screen updates by itself.'
        );
      } else {
        showToast(
          res?.data?.error ||
            'The payment page could not be opened. Please try again.',
          'error'
        );
      }
    } catch {
      showToast('The payment page could not be opened. Please try again.', 'error');
    } finally {
      setStarting(null);
    }
  };

  const cancelCheckout = () => {
    setCheckout(null);
    setWaitNote('');
  };

  // Poll the payment until Paystack confirms, then refresh balances.
  useEffect(() => {
    if (!checkout) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || pollBusy.current) return;

      if (Date.now() - checkout.startedAt > POLL_LIMIT_MS) {
        setCheckout(null);
        setWaitNote('');
        showToast(
          'We stopped waiting for that payment. If you were charged, your plan appears after the site confirms it.',
          'info'
        );
        return;
      }

      pollBusy.current = true;
      try {
        const res = await window.electronAPI?.verifyCheckout?.(
          checkout.reference,
          checkout.plan
        );

        if (!cancelled && res?.ok && res.data?.ok) {
          setCheckout(null);
          setWaitNote('');
          showToast(`Your ${checkout.plan} plan is active.`, 'success');
          loadSummary();
          onUpgraded?.();
          return;
        }

        if (res?.status === 403 || res?.status === 402) {
          setCheckout(null);
          setWaitNote('');
          showToast(
            res?.data?.error ||
              'That payment could not be matched to your account.',
            'error'
          );
        }
      } catch {
        // transient — next tick retries
      } finally {
        pollBusy.current = false;
      }
    };

    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkout, loadSummary, onUpgraded, showToast]);

  const capRands = Math.max(0, Number(costCap) || 0);
  const currentPlan = (summary?.plan || 'free').toUpperCase();

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Spend cap &amp; plan</h2>
          <p className="billing-subtitle">
            Signed in as {currentPlan.toLowerCase()} — the agent never spends past
            your cap.
          </p>
        </div>
        {summary?.ok && (
          <div className="billing-balance">
            <span className="balance-chip">
              Searches <strong>{summary.searches ?? 0}</strong>
            </span>
            <span className="balance-chip">
              CVs <strong>{summary.cvGens ?? 0}</strong>
            </span>
            <span className="balance-chip">
              PF runs <strong>{summary.pfRuns ?? 0}</strong>
            </span>
          </div>
        )}
      </header>

      {/* Spend cap — manual entry only */}
      <section className="billing-section">
        <div className="billing-section-head">
          <h3 className="billing-section-title">Monthly spend cap</h3>
          <span className="billing-section-note" style={{ margin: 0 }}>
            {capRands > 0 ? `R${capRands.toLocaleString('en-ZA')} limit` : 'Not set'}
          </span>
        </div>
        <p className="billing-section-note">
          Type the most you want the agent to spend in a month. When a step would
          take you past it, the run stops safely instead of continuing.
        </p>

        <div className="spend-input-row">
          <label className="spend-field">
            <span className="spend-prefix">R</span>
            <input
              className="spend-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              aria-label="Monthly spend cap in rand"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={saveCap}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveCap();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary spend-save"
            onClick={saveCap}
          >
            Save cap
          </button>
          {capSaved && <span className="spend-saved">Saved</span>}
        </div>
      </section>

      {/* Plans */}
      <section className="billing-section">
        <div className="billing-section-head">
          <h3 className="billing-section-title">Upgrade your plan</h3>
          <span className="billing-section-note" style={{ margin: 0 }}>
            One month, card payment
          </span>
        </div>
        <p className="billing-section-note">
          Plans add searches, CV generations and Persistent Finder runs to your
          account. Payment opens in your browser — this window waits and activates
          the plan automatically.
        </p>

        {checkout && (
          <div className="billing-wait" style={{ marginBottom: 10 }}>
            <span className="billing-spinner" />
            <span>
              {waitNote || 'Waiting for payment confirmation…'} ·{' '}
              <button
                type="button"
                className="viewport-footer-link"
                onClick={cancelCheckout}
              >
                stop waiting
              </button>
            </span>
          </div>
        )}

        <div className="plan-grid">
          {plansLoading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="plan-card" aria-hidden="true">
                <span
                  className="plan-name"
                  style={{ opacity: 0.3, height: 14 }}
                />
                <span
                  className="plan-price"
                  style={{ opacity: 0.2, height: 24 }}
                />
              </div>
            ))}

          {!plansLoading && plans.length === 0 && (
            <p className="billing-note">
              Plans could not be loaded right now. Check your connection and try
              again.
            </p>
          )}

          {!plansLoading &&
            plans.map((plan) => {
              const isCurrent =
                (summary?.plan || '').toLowerCase() === plan.name.toLowerCase();
              const busy = starting === plan.name;
              return (
                <article
                  key={plan.name}
                  className={`plan-card ${isCurrent ? 'current' : ''}`}
                >
                  {plan.popular && !isCurrent && (
                    <span className="plan-badge">Popular</span>
                  )}
                  {isCurrent && <span className="plan-badge">Current</span>}

                  <h4 className="plan-name">{plan.name}</h4>
                  <div className="plan-price">
                    <strong>{plan.priceLabel}</strong>
                    <span>/ month</span>
                  </div>

                  <ul className="plan-features">
                    {(plan.features || []).slice(0, 4).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={`btn ${isCurrent ? 'btn-secondary' : 'btn-primary'} plan-cta`}
                    disabled={isCurrent || Boolean(starting) || Boolean(checkout)}
                    onClick={() => startUpgrade(plan)}
                  >
                    {isCurrent
                      ? 'Active'
                      : busy
                        ? 'Opening…'
                        : 'Choose plan'}
                  </button>
                </article>
              );
            })}
        </div>

        <p className="billing-note" style={{ marginTop: 10 }}>
          Card details are entered on FMSG&apos;s secure payment page, never inside
          this app. A plan is activated only after the payment provider confirms
          it.
        </p>
      </section>
    </div>
  );
}
