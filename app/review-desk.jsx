'use client';

import { useEffect, useState } from 'react';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const followupKey = 'variation-desk-followup';

async function post(url) {
  const response = await fetch(url, { method: 'POST', headers: { 'x-variation-desk': '1' } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export default function ReviewDesk({ claim, cases, inferenceConfigured }) {
  const [selected, selectCase] = useState(cases[0].id);
  const [draft, setDraft] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [action, setAction] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem(followupKey);
    if (!id) return;
    const controller = new AbortController();
    setAction('restore');
    fetch(`/api/evidence?draft=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Saved request unavailable.');
        return response.json();
      })
      .then((result) => {
        const latest = result.revised ?? result.original;
        setEvidence(result);
        setDraft(latest);
        selectCase(latest.scenario);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setAction(''); });
    return () => controller.abort();
  }, []);

  function resetEvidence() {
    setEvidence(null);
    sessionStorage.removeItem(followupKey);
  }

  async function review() {
    setRunning(true);
    setDraft(null);
    resetEvidence();
    setError('');
    try {
      setDraft(await post(`/api/review?scenario=${encodeURIComponent(selected)}`));
    } catch (failure) {
      setError(failure.message || 'The review failed. Please try again.');
    } finally {
      setRunning(false);
    }
  }

  async function followUp(nextAction) {
    const id = evidence?.original.id ?? draft.id;
    setAction(nextAction);
    setError('');
    try {
      if (nextAction === 'review') {
        const revised = await post(`/api/review?scenario=complete&followup=${id}`);
        setEvidence({ ...evidence, revised });
        setDraft(revised);
        selectCase(revised.scenario);
      } else {
        const result = await post(`/api/evidence?draft=${id}&action=${nextAction}`);
        setEvidence(result);
        sessionStorage.setItem(followupKey, id);
      }
    } catch (failure) {
      setError(failure.message || 'The evidence follow-up failed. Please try again.');
    } finally {
      setAction('');
    }
  }

  const calculation = draft?.calculation;
  const supportedShare = calculation ? 100 * calculation.supported / calculation.claimed : 0;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark" aria-hidden="true">V</span>Variation Desk</div>
          <span className="environment"><i aria-hidden="true" />{inferenceConfigured ? 'Vultr AI agent' : 'Rules preview'}</span>
        </div>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">CONSTRUCTION OPERATIONS / SAMPLE PROJECT</p>
          <h1>Variation claim review</h1>
          <p className="subtitle">Check what was authorized, what was measured, and how much the records support before a payment decision.</p>
        </section>
        <div className="workspace">
          <section className="card setup" aria-labelledby="claim-heading">
            <p className="eyebrow">01 / CLAIM INTAKE</p>
            <h2 id="claim-heading">{claim.title}</h2>
            <p className="muted">{claim.project} · {claim.contractor}</p>
            <dl className="claim-facts">
              <div><dt>Claim reference</dt><dd>{claim.id}</dd></div>
              <div><dt>Extra quantity claimed</dt><dd>{claim.extra} {claim.unit}</dd></div>
            </dl>
            <fieldset disabled={running || Boolean(action)}>
              <legend>Evidence version</legend>
              {cases.map((sample) => (
                <label key={sample.id} className={sample.id === selected ? 'choice selected' : 'choice'}>
                  <input type="radio" name="case" value={sample.id} checked={selected === sample.id} onChange={() => {
                    selectCase(sample.id);
                    setDraft(null);
                    resetEvidence();
                    setError('');
                  }} />
                  <span>{sample.label}</span>
                </label>
              ))}
            </fieldset>
            <button type="button" className="review-button" disabled={running || Boolean(action)} onClick={review}>
              {running ? 'Reviewing evidence…' : 'Review claim'} <span aria-hidden="true">{running ? '◌' : '→'}</span>
            </button>
            {!inferenceConfigured && <p className="setup-note">Preview runs the same evidence checks without a model connection.</p>}
          </section>
          <section className="card results" aria-labelledby="review-heading" aria-busy={running || Boolean(action)}>
            <p className="eyebrow">02 / REVIEW OUTPUT</p>
            <h2 id="review-heading">Evidence and calculation</h2>
            <div aria-live="polite">
              {error && <p className="error" role="alert">{error}</p>}
              {!draft && !error && (
                <div className="empty">
                  <div className="evidence-icon" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 4.5h12l5 5v18H8z M20 4.5v5h5 M12 15h9 M12 19h9 M12 23h5" /></svg></div>
                  <h3>{running ? 'Checking project records' : 'Ready to review'}</h3>
                  <p>{running ? 'The review will appear here once the evidence checks finish.' : 'Run the review to see the supported amount, evidence gaps, and the records behind the calculation.'}</p>
                </div>
              )}
              {draft && (
                <>
                  <div className="review-state"><span className="status">{draft.status}</span><span className="muted">{draft.mode}</span></div>
                  <div className="amounts">
                    <div className="supported"><span>Supported by evidence</span><strong>{money.format(calculation.supportedAmount)}</strong><small>{calculation.supported} {claim.unit} supported</small></div>
                    <div className="pending"><span>Pending evidence</span><strong>{money.format(calculation.pendingAmount)}</strong><small>{calculation.pending} {claim.unit} pending</small></div>
                  </div>
                  <div className="quantity-meter" aria-hidden="true"><span style={{ width: `${supportedShare}%` }} /></div>
                  <p className="review-explanation">The signed sheet records {calculation.measuredTotal} {claim.unit} in total, against {calculation.baseline} {claim.unit} in the original contract. The supported amount uses the contract rate of {money.format(calculation.rate)} per {claim.unit}.</p>
                  <div className="records">
                    <h3>Source records</h3>
                    {draft.sources.map((record) => (
                      <details key={record.id}>
                        <summary><span className="record-id">{record.id}</span> {record.type}</summary>
                        <p><strong>{record.title}</strong> · {record.detail}</p>
                      </details>
                    ))}
                  </div>
                  <details className="trace">
                    <summary>Execution trace · {draft.trace.length} steps</summary>
                    <ol>{draft.trace.map((step) => <li key={step.label}>{step.label}{step.reference && <span> · {step.reference}</span>}</li>)}</ol>
                  </details>
                  <p className="draft-reference">Saved draft {draft.id.slice(0, 8).toUpperCase()}</p>
                  {((draft.scenario === 'partial' && calculation.pending > 0) || evidence) && (
                    <section className="followup" aria-labelledby="followup-heading">
                      <div className="followup-heading">
                        <h3 id="followup-heading">Evidence follow-up</h3>
                        {evidence && <span className="status">{evidence.revised ? 'Resolved' : evidence.attachedAt ? 'Evidence attached' : 'Request saved'}</span>}
                      </div>
                      <p>{evidence ? 'Request saved for' : 'Request a revised signed measurement covering'} the remaining {evidence?.original.calculation.pending ?? calculation.pending} {claim.unit}.</p>
                      {evidence?.measurementId && <p><span className="record-id">{evidence.measurementId}</span> Revised signed measurement attached.</p>}
                      {evidence?.revised ? (
                        <div className="followup-comparison">
                          <span>Initially supported<strong>{money.format(evidence.original.calculation.supportedAmount)}</strong></span>
                          <span>Supported after revision<strong>{money.format(calculation.supportedAmount)}</strong></span>
                        </div>
                      ) : (
                        <button type="button" className="followup-button" disabled={Boolean(action)} onClick={() => followUp(!evidence ? 'request' : !evidence.attachedAt ? 'attach' : 'review')}>
                          {action ? 'Working…' : !evidence ? 'Request evidence' : !evidence.attachedAt ? 'Attach revised sample measurement' : 'Review revised claim'}
                        </button>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
        <footer>Variation Desk <span>•</span> Fictional project records for a demonstration.</footer>
      </main>
    </>
  );
}
