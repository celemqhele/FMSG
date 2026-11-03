import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from './DialogSystem';
import {
  computeAllowanceUsage,
  formatDateZA,
  formatZar,
} from '../lib/format';

/**
 * FMSG Agents — Billing, Plans & Monthly Spend Cap
 *
 * - Clear plan hierarchy (`Starter`, `Lite`, `Standard` [Recommended], `Power`)
 * - Single primary CTA (`Standard`) so the user has one clear recommended path
 * - Non-contradictory allowance/overage presentation (`computeAllowanceUsage`)
 * - Plain-English spend cap and billing backoffice (invoices, payment method, renewal)
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

interface BillingInvoiceItem {
  id: string;
  reference: string;
  plan: string;
  amountZar: number;
  status: string;
  createdAt: string;
}

const DEFAULT_AGENT_BUNDLES: AgentBundlePlan[] = [
  {
    name: 'Starter',
    displayName: 'Starter',
    applications: 10,
    price: 34900,
    priceLabel: 'R349',
    perAppZar: 35,
    discountPct: 12,
    graceApps: 1,
    features: [
      '10 automated applications per month',
      'R35 per application (save 12%)',
      'Job searches & CV tailoring included',
      'Unused applications roll over each month',
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
      '25 automated applications per month',
      'R30 per application (save 25%)',
      'Job searches & CV tailoring included',
      'Unused applications roll over each month',
    ],
  },
  {
    name: 'Standard',
    displayName: 'Standard',
    applications: 60,
    price: 149900,
    priceLabel: 'R1 499',
    perAppZar: 25,
    discountPct: 38,
    graceApps: 6,
    popular: true,
    features: [
      '60 automated applications per month',
      'R25 per application (save 38%)',
      'Job searches & CV tailoring included',
      'Unused applications roll over each month',
    ],
  },
  {
    name: 'Power',
    displayName: 'Power',
    applications: 150,
    price: 329900,
    priceLabel: 'R3 299',
    perAppZar: 22,
    discountPct: 45,
    graceApps: 15,
    features: [
      '150 automated applications per month',
      'R22 per application (save 45%)',
      'Job searches & CV tailoring included',
      'Unused applications roll over each month',
    ],
  },
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
  const { showToast, showModal } = useDialog();

  const [capInput, setCapInput] = useState<string>(String(Math.max(0, costCap)));
  const [capSavedAt, setCapSavedAt] = useState<string | null>(null);
  const [plans, setPlans] = useState<AgentBundlePlan[]>(DEFAULT_AGENT_BUNDLES);
  const [activePlanName, setActivePlanName] = useState<string>('free');
  const [invoices, setInvoices] = useState<BillingInvoiceItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<{
    brand?: string;
    last4?: string;
    expMonth?: string;
    expYear?: string;
  } | null>(null);
  const [nextRenewalDate, setNextRenewalDate] = useState<string | null>(null);

  const [checkout, setCheckout] = useState<{
    plan: string;
    reference: string;
    startedAt: number;
  } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState('');
  const pollBusy = useRef(false);

  const normalizePlanName = (
    rawName?: string
  ): 'Starter' | 'Lite' | 'Standard' | 'Power' => {
    const clean = (rawName || '').replace(/\s+(Pack|Bundle)$/i, '').trim();
    if (clean === 'Lite' || clean === 'Standard' || clean === 'Power') {
      return clean;
    }
    return 'Starter';
  };

  const loadPlansAndSummary = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getBillingPlans?.();
      if (res?.ok && Array.isArray(res.data?.plans) && res.data.plans.length > 0) {
        const mapped = res.data.plans
          .filter((p: any) =>
            ['Starter', 'Lite', 'Standard', 'Power'].includes(p.name)
          )
          .map((p: any) => {
            const def =
              DEFAULT_AGENT_BUNDLES.find((d) => d.name === p.name) ||
              DEFAULT_AGENT_BUNDLES[0];
            const cleanName = normalizePlanName(p.name);
            return {
              name: cleanName,
              displayName: cleanName,
              applications: p.applications || def.applications,
              price: p.price || def.price,
              priceLabel: formatZar(Math.round((p.price || def.price) / 100)),
              perAppZar: p.perAppZar || def.perAppZar,
              discountPct: p.discountPct || def.discountPct,
              graceApps: p.graceApps || def.graceApps,
              popular: cleanName === 'Standard',
              features: def.features,
            };
          });
        if (mapped.length === 4) {
          setPlans(mapped);
        }
      }
    } catch {
      // Keep built-in DEFAULT_AGENT_BUNDLES
    }

    try {
      const sum: any = await window.electronAPI?.getBillingSummary?.();
      if (sum?.ok) {
        if (sum.plan) setActivePlanName(String(sum.plan).toLowerCase());
        if (Array.isArray(sum.invoices)) setInvoices(sum.invoices);
        if (sum.paymentMethod) setPaymentMethod(sum.paymentMethod);
        if (sum.nextRenewalDate) setNextRenewalDate(sum.nextRenewalDate);
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
    const stamp = new Date().toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    setCapSavedAt(stamp);
    showToast(
      value === 0
        ? 'Monthly spend cap set to R0 (no Pay-As-You-Go charges allowed).'
        : `Monthly spend cap saved as ${formatZar(value)}.`,
      'success'
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
          'Complete payment in the browser window that opened. Unused applications roll over automatically.'
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
          onCostCapChange(0);
          window.electronAPI
            ?.saveAgentPrefs?.({
              billingMode: 'bundle',
              bundleTier: checkout.plan,
              costCap: 0,
            })
            .catch(() => {});
          showToast(
            `${checkout.plan} plan activated. Applications added to your balance.`,
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

  const usageTruth = computeAllowanceUsage(appliedTotal, totalAllowance);
  const welcomeUsed = Math.min(appliedTotal, welcomeBonus);

  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference * (1 - usageTruth.ringPercent / 100);

  const estimatedMaxAppsAtCap =
    costCap > 0 ? Math.floor(costCap / effectivePaygRate) : 0;

  return (
    <div className="billing-panel">
      <header className="billing-header">
        <div>
          <h1 className="billing-title">Billing</h1>
          <p className="billing-subtitle">
            Manage your monthly application plan, Pay-As-You-Go spend cap, and
            billing history. Job searches and CV tailoring are included in every
            application.
          </p>
        </div>
        <div className="billing-balance">
          <span className="balance-chip">
            Active rate{' '}
            <strong>{formatZar(effectivePaygRate, { perApplication: true })}</strong>
          </span>
          <span className="balance-chip">
            Monthly cap <strong>{formatZar(costCap)}</strong>
          </span>
        </div>
      </header>

      {/* Top Row: Application Allowance + Monthly Spend Cap */}
      <div className="billing-top-grid">
        {/* Application Balance Card (BL-02, BL-08) */}
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">Application Balance</h2>
            <span
              className={`status-pill-sm ${
                usageTruth.isOverage ? 'review' : 'applied'
              }`}
            >
              {usageTruth.badgeText}
            </span>
          </div>
          <div className="billing-usage-row">
            <div className="billing-ring-box">
              <svg width="82" height="82" viewBox="0 0 82 82" aria-hidden="true">
                <circle
                  cx="41"
                  cy="41"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeWidth="6"
                />
                <circle
                  cx="41"
                  cy="41"
                  r={ringRadius}
                  fill="none"
                  stroke={usageTruth.isOverage ? '#f59e0b' : '#203eea'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 41 41)"
                />
              </svg>
              <div className="billing-ring-center">
                <strong>{usageTruth.ringCenterTop}</strong>
                <span>{usageTruth.ringCenterBottom}</span>
              </div>
            </div>
            <div className="billing-usage-meta">
              <div className="billing-stat-line">
                <span>Current plan:</span>
                <strong>
                  {mode === 'bundle'
                    ? `${selectedBundle.displayName} (${selectedBundle.applications} applications / month)`
                    : 'Pay-As-You-Go'}
                </strong>
              </div>
              <div className="billing-stat-line">
                <span>Included usage:</span>
                <strong>{usageTruth.summaryLine}</strong>
              </div>
              <div className="billing-stat-line">
                <span>Welcome bonus:</span>
                <strong>
                  {emailVerified
                    ? welcomeUsed >= welcomeBonus
                      ? `All ${welcomeBonus} welcome applications used`
                      : `${welcomeBonus - welcomeUsed} of ${welcomeBonus} free applications remaining`
                    : 'Verify your email to unlock 5 free applications'}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* Monthly Spend Cap Card (BL-01, BL-06) */}
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">
              Monthly Pay-As-You-Go Spend Cap
            </h2>
            <span
              className={`status-pill-sm ${
                costCap > 0 ? 'applied' : 'neutral'
              }`}
            >
              {costCap > 0
                ? `${formatZar(costCap)} monthly cap`
                : 'R0 (Extra charges off)'}
            </span>
          </div>
          <p className="billing-section-note">
            Controls the maximum amount you can spend on Pay-As-You-Go
            applications each month ({formatZar(effectivePaygRate, { perApplication: true })}).
            {costCap > 0
              ? ` Your current ${formatZar(costCap)} cap covers up to ${estimatedMaxAppsAtCap} Pay-As-You-Go application${estimatedMaxAppsAtCap === 1 ? '' : 's'}, then pauses automatically.`
              : ' Set to R0 to prevent any charges beyond your included balance.'}
          </p>

          <div className="spend-input-row">
            <label className="spend-field" htmlFor="billing-spend-cap-input">
              <span className="spend-prefix">R</span>
              <input
                id="billing-spend-cap-input"
                className="spend-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-label="Monthly spend cap in South African Rand"
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
            {capSavedAt && (
              <span className="spend-saved" role="status">
                Saved at {capSavedAt}
              </span>
            )}
          </div>

          <div className="spend-preset-pills" role="group" aria-label="Spend cap presets">
            {[0, 160, 350, 500, 1000].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`spend-preset-chip ${
                  costCap === preset ? 'active' : ''
                }`}
                onClick={() => saveCap(preset)}
              >
                {preset === 0 ? 'R0 (Off)' : formatZar(preset)}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Monthly Plans (BL-04, BL-05, BL-09, BL-12) */}
      <section className="billing-section">
        <div className="billing-section-head">
          <div>
            <h2 className="billing-section-title">Monthly Application Plans</h2>
            <p className="billing-section-note" style={{ margin: '4px 0 0' }}>
              Lower your per-application rate from R40 down to R22. Unused
              monthly applications roll over automatically while your plan is
              active.
            </p>
          </div>
        </div>

        {checkout && (
          <div className="billing-wait" style={{ marginBottom: 12 }}>
            <span className="billing-spinner" aria-hidden="true" />
            <span>
              {waitNote || 'Waiting for Paystack confirmation…'} ·{' '}
              <button
                type="button"
                className="viewport-footer-link"
                onClick={() => setCheckout(null)}
              >
                Cancel checkout
              </button>
            </span>
          </div>
        )}

        <div className="plan-grid-four">
          {plans.map((plan) => {
            const isSelected =
              (mode === 'bundle' && tier === plan.name) ||
              activePlanName === plan.name.toLowerCase();
            const isRecommended = plan.name === 'Standard';
            const busy = starting === plan.name;
            // Decision D4 / BL-04: Only Standard (Recommended) uses primary CTA
            const usePrimaryCta = isRecommended && !isSelected;

            return (
              <article
                key={plan.name}
                className={`plan-card ${isSelected ? 'current' : ''} ${
                  isRecommended ? 'popular' : ''
                }`}
              >
                <div className="plan-card-top">
                  <div>
                    <h3 className="plan-name">{plan.displayName}</h3>
                    <span className="plan-apps-pill">
                      {plan.applications} applications / month
                    </span>
                  </div>
                  {isRecommended && !isSelected && (
                    <span className="plan-badge-inline">Recommended</span>
                  )}
                  {isSelected && (
                    <span className="plan-badge-inline current">Active</span>
                  )}
                </div>

                <div className="plan-price">
                  <strong>{plan.priceLabel}</strong>
                  <span>/ month</span>
                </div>

                <div className="plan-rate-highlight">
                  <span>
                    <strong>{formatZar(plan.perAppZar)}</strong> per application
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
                    usePrimaryCta ? 'btn-primary' : 'btn-secondary'
                  } plan-cta`}
                  disabled={Boolean(starting) || Boolean(checkout)}
                  onClick={() => startUpgrade(plan)}
                >
                  {busy ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Opening Checkout…
                    </>
                  ) : isSelected ? (
                    `Add ${plan.displayName} Allowance`
                  ) : (
                    `Choose ${plan.displayName}`
                  )}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Billing Backoffice: Payment Method, Renewal & Invoices (BL-07 / P3.1) */}
      <div className="billing-top-grid">
        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">
              Payment Method &amp; Subscription
            </h2>
            <span className="status-pill-sm neutral">Paystack ZAR</span>
          </div>
          <div className="billing-usage-meta" style={{ marginTop: 8 }}>
            <div className="billing-stat-line">
              <span>Payment method:</span>
              <strong>
                {paymentMethod?.last4
                  ? `${paymentMethod.brand || 'Card'} ending in ${paymentMethod.last4} (exp ${paymentMethod.expMonth}/${paymentMethod.expYear})`
                  : 'Authorized via Paystack Checkout on purchase'}
              </strong>
            </div>
            <div className="billing-stat-line">
              <span>Next renewal date:</span>
              <strong>
                {mode === 'bundle' && nextRenewalDate
                  ? formatDateZA(nextRenewalDate)
                  : mode === 'bundle'
                    ? 'Monthly from activation date'
                    : 'No recurring plan active'}
              </strong>
            </div>
            <div className="billing-stat-line">
              <span>Monthly spend forecast:</span>
              <strong>
                {mode === 'bundle'
                  ? `${selectedBundle.priceLabel} plan + up to ${formatZar(costCap)} cap`
                  : `Up to ${formatZar(costCap)} monthly cap`}
              </strong>
            </div>
          </div>
          {mode === 'bundle' && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => {
                  showModal({
                    title: 'Switch to Pay-As-You-Go?',
                    message:
                      'Your existing application balance remains available, and your plan will not renew next month. Continue?',
                    confirmLabel: 'Switch to Pay-As-You-Go',
                    cancelLabel: 'Keep Plan',
                    onConfirm: () => {
                      onModeChange?.('pay-as-you-go');
                      showToast(
                        'Switched to Pay-As-You-Go. Remaining applications stay in your balance.',
                        'info'
                      );
                    },
                  });
                }}
              >
                Cancel Monthly Renewal
              </button>
            </div>
          )}
        </section>

        <section className="billing-section" style={{ margin: 0 }}>
          <div className="billing-section-head">
            <h2 className="billing-section-title">Billing History &amp; Receipts</h2>
            <button
              type="button"
              className="viewport-footer-link"
              onClick={() =>
                window.electronAPI?.openExternalUrl?.(
                  'https://www.findmesomejobs.co.za/dashboard'
                )
              }
            >
              Open Web Billing Portal ↗
            </button>
          </div>
          {invoices.length === 0 ? (
            <p className="billing-section-note" style={{ marginTop: 8 }}>
              No completed card charges recorded yet. Receipts are emailed
              automatically after every Paystack payment and appear here.
            </p>
          ) : (
            <div className="invoices-mini-list">
              {invoices.map((inv) => (
                <div key={inv.id} className="invoice-mini-row">
                  <div>
                    <strong>{inv.plan} Plan</strong>
                    <span>
                      {formatDateZA(inv.createdAt)} · Ref {inv.reference}
                    </span>
                  </div>
                  <div className="invoice-mini-right">
                    <strong>{formatZar(inv.amountZar)}</strong>
                    <span className="status-pill-sm applied">
                      {inv.status === 'paid' ? 'Paid' : inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
