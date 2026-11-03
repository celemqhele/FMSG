import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from './DialogSystem';

/**
 * FMSG Agents — Billing, Bundles & Pay-As-You-Go Spend Cap (v0.7.0)
 *
 * - Strictly separate from FMSG website pricing (searches are included in every
 *   FMSG Agents application).
 * - Monthly Subscription Bundles (unused applications roll over & stack forever):
 *   Starter Pack (10 apps · R349 · R35/app · 12% off)
 *   Lite         (25 apps · R749 · R30/app · 25% off)
 *   Standard     (60 apps · R1,499 · R25/app · 38% off)
 *   Power        (150 apps · R3,299 · R22/app · 45% off)
 * - Cost cap defaults to R0 (never charges extra without explicit user consent).
 * - Progressive Pay-As-You-Go charge thresholds: R40 -> R100 -> R250 -> R500 max.
 */

interface BillingPanelProps {
  costCap: number;
  onCostCapChange: (cap: number) => void;
  mode?: 'bundle' | 'pay-as-you-go';
  onModeChange?: (mode: 'bundle' | 'pay-as-you-go') => void;
  tier?: 'Starter' | 'Lite' | 'Standard' | 'Power';
  onTierChange?: (tier: 'Starter' | 'Lite' | 'Standard' | 'Power') => void;
  appliedTotal?: number;
  emailVerified?: boolean;
  onUpgraded?: () => void;
}

interface AgentBundlePlan {
  name: 'Starter' | 'Lite' | 'Standard' | 'Power';
  displayName: string;
  applications: number;
  price: number;
  priceLabel: string;
  perAppZar: number;
  discountPct: number;
  graceApps: number;
  popular?: boolean;
  features: string[];
}

const DEFAULT_AGENT_BUNDLES: AgentBundlePlan[] = [
  {
    name: 'Starter',
    displayName: 'Starter Pack',
    applications: 10,
    price: 34900,
    priceLabel: 'R349',
    perAppZar: 35,
    discountPct: 12,
    graceApps: 1,
    features: [
      '10 automated applications / month',
      'R35 per application (12% off R40)',
      'Job searches & CV tailoring included',
      'Unused applications roll over & stack',
    ],
  },
  {
    name: 'Lite',
    displayName: 'Lite',
    applications: 25,
    price: 74900,
    priceLabel: 'R749',
    perAppZar: 30,
    discountPct: 25,
    graceApps: 2,
    features: [
      '25 automated applications / month',
      'R30 per application (25% off R40)',
      'Job searches & CV tailoring included',
      'Unused applications roll over & stack',
    ],
  },
  {
    name: 'Standard',
    displayName: 'Standard',
    applications: 60,
    price: 149900,
    priceLabel: 'R1,499',
    perAppZar: 25,
    discountPct: 38,
    graceApps: 6,
    popular: true,
    features: [
      '60 automated applications / month',
      'R25 per application (38% off R40)',
      'Job searches & CV tailoring included',
      'Unused applications roll over & stack',
    ],
  },
  {
    name: 'Power',
    displayName: 'Power',
    applications: 150,
    price: 329900,
    priceLabel: 'R3,299',
    perAppZar: 22,
    discountPct: 45,
    graceApps: 15,
    features: [
      '150 automated applications / month',
      'R22 per application (45% off R40)',
      'Job searches & CV tailoring included',
      'Unused applications roll over & stack',
    ],
  },
];

const THRESHOLD_STAGES = [
  { stage: 1, label: 'First charge', thresholdZar: 40, trigger: 'New PAYG user' },
  { stage: 2, label: 'Stage 2', thresholdZar: 100, trigger: 'After 1 payment' },
  { stage: 3, label: 'Stage 3', thresholdZar: 250, trigger: 'After 3 payments' },
  { stage: 4, label: 'Max threshold', thresholdZar: 500, trigger: 'After 6 payments' },
];

const POLL_MS = 3500;
const POLL_LIMIT_MS = 4 * 60 * 1000;

export default function BillingPanel({
  costCap,
  onCostCapChange,
  mode = 'pay-as-you-go',
  onModeChange,
  tier = 'Starter',
  onTierChange,
  appliedTotal = 0,
  emailVerified = true,
  onUpgraded,
}: BillingPanelProps) {
  const { showToast } = useDialog();

  const [capInput, setCapInput] = useState<string>(String(Math.max(0, costCap)));
  const [capSaved, setCapSaved] = useState(false);
  const [plans, setPlans] = useState<AgentBundlePlan[]>(DEFAULT_AGENT_BUNDLES);
  const [activePlanName, setActivePlanName] = useState<string>('free');

  const [checkout, setCheckout] = useState<{
    plan: string;
    reference: string;
    startedAt: number;
  } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState('');
  const pollBusy = useRef(false);

  const loadPlansAndSummary = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getBillingPlans?.();
      if (res?.ok && Array.isArray(res.data?.plans) && res.data.plans.length > 0) {
        const mapped = res.data.plans
          .filter((p: any) =>
            ['Starter', 'Lite', 'Standard', 'Power'].includes(p.name)
          )
          .map((p: any) => ({
            name: p.name,
            displayName: p.displayName || p.name,
            applications:
              p.applications ||
              DEFAULT_AGENT_BUNDLES.find((d) => d.name === p.name)
                ?.applications ||
              10,
            price: p.price,
            priceLabel: p.priceLabel,
            perAppZar:
              p.perAppZar ||
              DEFAULT_AGENT_BUNDLES.find((d) => d.name === p.name)?.perAppZar ||
              35,
            discountPct:
              p.discountPct ||
              DEFAULT_AGENT_BUNDLES.find((d) => d.name === p.name)
                ?.discountPct ||
              12,
            graceApps:
              p.graceApps ||
              DEFAULT_AGENT_BUNDLES.find((d) => d.name === p.name)?.graceApps ||
              1,
            popular: p.popular,
            features: p.features || [],
          }));
        if (mapped.length === 4) {
          setPlans(mapped);
        }
      }
    } catch {
      // Keep built-in DEFAULT_AGENT_BUNDLES
    }

    try {
      const sum = await window.electronAPI?.getBillingSummary?.();
      if (sum?.ok && sum.plan) {
        setActivePlanName(String(sum.plan).toLowerCase());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadPlansAndSummary();
  }, [loadPlansAndSummary]);

  useEffect(() => {
    if (checkout) return;
    setCapInput(String(Math.max(0, costCap)));
  }, [costCap, checkout]);

  const saveCap = (overrideVal?: number) => {
    const raw =
      overrideVal !== undefined
        ? overrideVal
        : Number(capInput.replace(/[^0-9.]/g, '')) || 0;
    const value = Math.max(0, Math.round(raw));
    onCostCapChange(value);
    setCapInput(String(value));
    window.electronAPI?.saveAgentPrefs?.({ costCap: value }).catch(() => {});
    setCapSaved(true);
    window.setTimeout(() => setCapSaved(false), 2200);
    showToast(
      value === 0
        ? 'Pay-As-You-Go cost cap set to R0 (no extra charges allowed).'
        : `Monthly Pay-As-You-Go cost cap updated to R${value.toLocaleString('en-ZA')}.`,
      'info'
    );
  };

  const startUpgrade = async (plan: AgentBundlePlan) => {
    if (starting || checkout) return;
    setStarting(plan.name);
    onTierChange?.(plan.name);
    onModeChange?.('bundle');

    try {
      const res = await window.electronAPI?.startCheckout?.(plan.name);
      if (res?.ok && res.data?.reference) {
        setCheckout({
          plan: plan.name,
          reference: res.data.reference,
          startedAt: Date.now(),
        });
        setWaitNote(
          'Complete payment in the browser window that opened. Unused applications stack automatically.'
        );
      } else {
        showToast(
          res?.data?.error ||
            'Could not open the Paystack checkout page. Please try again.',
          'error'
        );
      }
    } catch {
      showToast(
        'Could not open the Paystack checkout page. Please try again.',
        'error'
      );
    } finally {
      setStarting(null);
    }
  };

  useEffect(() => {
    if (!checkout) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || pollBusy.current) return;
      if (Date.now() - checkout.startedAt > POLL_LIMIT_MS) {
        setCheckout(null);
        setWaitNote('');
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
          // Reset costCap to R0 when a bundle starts so user is never charged extra without consent
          onCostCapChange(0);
          window.electronAPI
            ?.saveAgentPrefs?.({
              billingMode: 'bundle',
              bundleTier: checkout.plan,
              costCap: 0,
            })
            .catch(() => {});
          showToast(
            `${checkout.plan} bundle activated! Applications added to your stacked balance.`,
            'success'
          );
          loadPlansAndSummary();
          onUpgraded?.();
        }
      } catch {
        // retry on next tick
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
  }, [checkout, loadPlansAndSummary, onCostCapChange, onUpgraded, showToast]);

  const selectedBundle =
    plans.find((p) => p.name === tier) || DEFAULT_AGENT_BUNDLES[0];
  const effectivePaygRate =
    mode === 'bundle' ? selectedBundle.perAppZar : 40;
  const welcomeBonus = emailVerified ? 5 : 0;
  const totalAllowance =
    (mode === 'bundle' ? selectedBundle.applications : 0) + welcomeBonus;
  const usedPct =
    totalAllowance > 0
      ? Math.min(100, Math.round((appliedTotal / totalAllowance) * 100))
      : 0;

  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - usedPct / 100);

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h2 className="billing-title">Billing, Bundles &amp; Spend Cap</h2>
          <p className="billing-subtitle">
            FMSG Agents pricing includes job searches and CV tailoring in every
            application. Unused bundle applications stack indefinitely.
          </p>
        </div>
        <div className="billing-balance">
          <span className="balance-chip">
            Welcome bonus <strong>{welcomeBonus} apps</strong>
          </span>
          <span className="balance-chip">
            Active rate <strong>R{effectivePaygRate}/app</strong>
          </span>
          <span className="balance-chip">
            Spend cap <strong>R{Math.max(0, costCap).toLocaleString('en-ZA')}</strong>
          </span>
        </div>
      </header>

      {/* Top Row: Usage Ring + Pay-As-You-Go Spend Cap + Progressive Thresholds */}
      <div className="billing-top-grid">
        {/* Usage & Stacked Balance Card */}
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h3 className="billing-section-title">Application Balance</h3>
            <span className="tag">Stacks forever</span>
          </div>
          <div className="billing-usage-row">
            <div className="billing-ring-box">
              <svg width="78" height="78" viewBox="0 0 78 78">
                <circle
                  cx="39"
                  cy="39"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.16)"
                  strokeWidth="5.5"
                />
                <circle
                  cx="39"
                  cy="39"
                  r={ringRadius}
                  fill="none"
                  stroke="#203eea"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 39 39)"
                />
              </svg>
              <div className="billing-ring-center">
                <strong>{usedPct}%</strong>
                <span>used</span>
              </div>
            </div>
            <div className="billing-usage-meta">
              <div className="billing-stat-line">
                <span>Mode:</span>
                <strong>
                  {mode === 'bundle'
                    ? `${selectedBundle.displayName} (${selectedBundle.applications} apps/mo)`
                    : 'Pure Pay-As-You-Go (R40/app)'}
                </strong>
              </div>
              <div className="billing-stat-line">
                <span>Fallback PAYG rate:</span>
                <strong>
                  R{effectivePaygRate}/app{' '}
                  {mode === 'bundle'
                    ? `(${selectedBundle.discountPct}% bundle discount locked in)`
                    : '(standard rate)'}
                </strong>
              </div>
              <div className="billing-stat-line">
                <span>Grace protection:</span>
                <strong>
                  {mode === 'bundle'
                    ? `${selectedBundle.graceApps} grace app(s) (10%) + gentle pause`
                    : 'Gentle pause on cap reached'}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* Manual Spend Cap (Starts at R0) */}
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h3 className="billing-section-title">
              Pay-As-You-Go Cost Cap (Default R0)
            </h3>
            <span className="tag" style={{ color: costCap > 0 ? '#22c55e' : '#94a3b8' }}>
              {costCap > 0
                ? `R${costCap.toLocaleString('en-ZA')} max`
                : 'R0 (No extra charges)'}
            </span>
          </div>
          <p className="billing-section-note">
            Starts at <strong>R0</strong> so you are never charged extra without
            consent. When your bundle balance hits 0, set a cap above R0 to
            continue applying at your discounted rate (R{effectivePaygRate}/app),
            or leave at R0 to wait for next month&apos;s renewal.
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
                onChange={(e) =>
                  setCapInput(e.target.value.replace(/[^0-9]/g, ''))
                }
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
              onClick={() => saveCap()}
            >
              Save Cap
            </button>
            {capSaved && <span className="spend-saved">Saved</span>}
          </div>

          <div className="spend-preset-pills">
            {[0, 160, 350, 500, 1000].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`spend-preset-chip ${costCap === preset ? 'active' : ''}`}
                onClick={() => saveCap(preset)}
              >
                {preset === 0 ? 'R0 (Off)' : `R${preset}`}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Progressive Charge Threshold Schedule */}
      <section className="billing-section">
        <div className="billing-section-head">
          <h3 className="billing-section-title">
            Pay-As-You-Go Charge Thresholds
          </h3>
          <span className="billing-section-note" style={{ margin: 0 }}>
            R40/app pure PAYG · Bundle buyers keep their R35–R22/app rate
          </span>
        </div>
        <div className="threshold-grid">
          {THRESHOLD_STAGES.map((t) => (
            <div key={t.stage} className="threshold-card">
              <span className="threshold-eyebrow">{t.trigger}</span>
              <strong className="threshold-amount">R{t.thresholdZar}</strong>
              <span className="threshold-label">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Monthly Subscription Bundles */}
      <section className="billing-section">
        <div className="billing-section-head">
          <div>
            <h3 className="billing-section-title">
              Monthly Application Bundles (One Active Bundle per Account)
            </h3>
            <p className="billing-section-note" style={{ margin: '2px 0 0' }}>
              Monthly subscriptions renew and stack unused applications forever.
              Upgrades stack immediately; downgrades can stack today or take
              effect at next renewal. Non-refundable.
            </p>
          </div>
        </div>

        {checkout && (
          <div className="billing-wait" style={{ marginBottom: 10 }}>
            <span className="billing-spinner" />
            <span>
              {waitNote || 'Waiting for Paystack confirmation…'} ·{' '}
              <button
                type="button"
                className="viewport-footer-link"
                onClick={() => setCheckout(null)}
              >
                cancel
              </button>
            </span>
          </div>
        )}

        <div className="plan-grid-four">
          {plans.map((plan) => {
            const isSelected =
              (mode === 'bundle' && tier === plan.name) ||
              activePlanName === plan.name.toLowerCase();
            const busy = starting === plan.name;
            return (
              <article
                key={plan.name}
                className={`plan-card ${isSelected ? 'current' : ''} ${
                  plan.popular ? 'popular' : ''
                }`}
              >
                <div className="plan-card-top">
                  <div>
                    <h4 className="plan-name">{plan.displayName}</h4>
                    <span className="plan-apps-pill">
                      {plan.applications} applications / mo
                    </span>
                  </div>
                  {plan.popular && !isSelected && (
                    <span className="plan-badge">Popular</span>
                  )}
                  {isSelected && <span className="plan-badge">Selected</span>}
                </div>

                <div className="plan-price">
                  <strong>{plan.priceLabel}</strong>
                  <span>/ month</span>
                </div>

                <div className="plan-rate-highlight">
                  <span>
                    <strong>R{plan.perAppZar}</strong> per application
                  </span>
                  <span className="plan-discount-tag">
                    Save {plan.discountPct}%
                  </span>
                </div>

                <ul className="plan-features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`btn ${
                    isSelected ? 'btn-secondary' : 'btn-primary'
                  } plan-cta`}
                  disabled={Boolean(starting) || Boolean(checkout)}
                  onClick={() => startUpgrade(plan)}
                >
                  {busy
                    ? 'Opening Checkout…'
                    : isSelected
                      ? 'Renew / Stack Bundle'
                      : `Choose ${plan.displayName}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
