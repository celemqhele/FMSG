import React from 'react';
import eulaRaw from '../../legal/EULA.md';
import termsRaw from '../../legal/Terms_of_Service.md';
import privacyRaw from '../../legal/Privacy_Policy.md';

export type LegalDocKey = 'eula' | 'terms' | 'privacy';

export const LEGAL_DOC_TITLES: Record<LegalDocKey, string> = {
  eula: 'End User License Agreement (EULA)',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const BUNDLED_LEGAL_DOCS: Record<LegalDocKey, string> = {
  eula: eulaRaw,
  terms: termsRaw,
  privacy: privacyRaw,
};

/**
 * Returns the bundled legal markdown synchronized with the active application version
 * so legal documents never lag behind an OTA or installer release (ST-12).
 */
export function getBundledLegalMarkdown(
  doc: LegalDocKey,
  activeVersion?: string
): string {
  const raw = BUNDLED_LEGAL_DOCS[doc] || BUNDLED_LEGAL_DOCS.terms;
  const cleanVer = (activeVersion || '0.7.2').replace(/^v/i, '').trim() || '0.7.2';
  return raw.replace(
    /VERSION\s+\d+\.\d+\.\d+\s+-\s+EFFECTIVE\s+\d{4}-\d{2}-\d{2}/gi,
    `VERSION ${cleanVer} - EFFECTIVE 2026-11-03`
  );
}

/**
 * Renders structured legal text (headings, clauses, bullet lists, and dividers)
 * without raw 72-dash ASCII walls (ST-11).
 */
export function renderLegalDocumentNodes(markdown: string): React.ReactNode {
  const lines = (markdown || '').split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let keyCounter = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list_${keyCounter++}`} className="legal-doc-list">
        {listItems.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      flushList();
      continue;
    }

    // Skip raw ASCII horizontal rule walls (----)
    if (/^-{4,}$/.test(line)) {
      flushList();
      blocks.push(<hr key={`hr_${keyCounter++}`} className="legal-doc-divider" />);
      continue;
    }

    // Top document metadata headers (lines 1-4)
    if (i < 5 && /^[A-Z0-9\s.()-]+$/.test(line)) {
      flushList();
      if (i === 0) {
        blocks.push(
          <div key={`eyebrow_${keyCounter++}`} className="legal-doc-eyebrow">
            {line}
          </div>
        );
      } else {
        blocks.push(
          <div key={`meta_${keyCounter++}`} className="legal-doc-meta">
            {line}
          </div>
        );
      }
      continue;
    }

    // Numbered section headings like "1. AGREEMENT TO TERMS" or "# Heading"
    if (/^(?:#+\s+|\d+\.\s+[A-Z\s,&/-]{4,}$)/.test(line)) {
      flushList();
      const cleanHeading = line.replace(/^#+\s+/, '');
      blocks.push(
        <h4 key={`h4_${keyCounter++}`} className="legal-doc-heading">
          {cleanHeading}
        </h4>
      );
      continue;
    }

    // Sub-heading like "2.1 Account and Profile Information"
    if (/^\d+\.\d+\s+[A-Z][A-Za-z\s,&/-]+$/.test(line) && line.length < 72 && !line.endsWith('.')) {
      flushList();
      blocks.push(
        <h5 key={`h5_${keyCounter++}`} className="legal-doc-subheading">
          {line}
        </h5>
      );
      continue;
    }

    // Lettered or bulleted list items: "(a) ...", "- ...", "* ..."
    if (/^(?:\([a-z]\)|[-*•])\s+/i.test(line)) {
      listItems.push(line.replace(/^(?:\([a-z]\)|[-*•])\s+/i, ''));
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p_${keyCounter++}`} className="legal-doc-paragraph">
        {line}
      </p>
    );
  }

  flushList();
  return <div className="legal-doc-rendered">{blocks}</div>;
}
