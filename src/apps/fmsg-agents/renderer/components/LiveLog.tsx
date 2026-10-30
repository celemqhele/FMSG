import React from 'react';

export default function LiveLog() {
  return (
    <div className="live-log">
      <div className="checklist">
        <h3>Agent Checklist (always reiterating)</h3>
        <ul>
          <li>✓ Source of truth = profile only — never invent facts</li>
          <li>✓ No fabricated metrics — every number must be from profile</li>
          <li>✓ Sensitive data encrypted locally — only agent accesses</li>
          <li>✓ If unexpected sensitive info found → navigate back, skip, log</li>
          <li>✓ CV matches job spec honestly (borrowed from FMSG CLIENT ASSIST)</li>
        </ul>
      </div>

      <div style={{ fontSize: 11, color: '#555', marginBottom: 12, padding: '4px 0', borderBottom: '1px solid #222' }}>
        Live Agent Stream — start will populate this
      </div>

      <div className="step">
        <strong>Ready</strong> — agent is idle. Press Start to begin.
      </div>
      <div className="step">
        <strong>Step 1: Load profile</strong> — will read from search_profiles.
      </div>
      <div className="step">
        <strong>Step 2: Load rules</strong> — hardcoded checklist + agent-rules.json (Supabase update).
      </div>
      <div className="step">
        <strong>Step 3: Search</strong> — agent writes custom query. If batch &gt; 4 uses PF (4 rounds: industry ladder steps 1-2, then without industry).
      </div>
      <div className="step">
        <strong>Step 4: Tailor CV</strong> — profile source of truth, ATS scan, pipeline build (docx + pdf).
      </div>
      <div className="step">
        <strong>Step 5: Apply</strong> — visible Playwright browser, login popup if required (10 min timer, skip available).
      </div>
    </div>
  );
}
