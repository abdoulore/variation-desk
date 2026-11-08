const item = 'PV-014';

const contract = Object.freeze({
  id: 'BOQ-014', type: 'Bill of quantities', title: 'Courtyard paving',
  item, unit: 'm²', quantity: 120, rate: 8000, currency: 'NGN',
  detail: 'Original contract quantity and unit rate for interlocking paving.',
});

const instruction = Object.freeze({
  id: 'SI-017', type: 'Site instruction', title: 'Extend the paved area',
  item, unit: 'm²', extra: 40, signed: true,
  detail: 'Site engineer authorizes up to 40 m² of additional paving under the existing rate.',
});

const partial = Object.freeze({
  id: 'MS-041', type: 'Measurement sheet', title: 'Joint measurement',
  item, unit: 'm²', total: 145, signed: true,
  detail: 'Site engineer and contractor signed a total installed quantity of 145 m².',
});

const complete = Object.freeze({
  ...partial, id: 'MS-042', title: 'Updated joint measurement', total: 160,
  detail: 'Site engineer and contractor signed the revised total of 160 m².',
});

export const scenarios = Object.freeze([
  { id: 'partial', label: 'Initial measurement', measurement: partial },
  { id: 'complete', label: 'Revised measurement', measurement: complete },
]);

export const claim = Object.freeze({
  id: 'VC-007', item, unit: 'm²', extra: 40, title: 'Additional courtyard paving',
  project: 'Ilu Community Centre', contractor: 'Sample Works Ltd.',
});

export const steps = Object.freeze({
  get_contract: { label: 'Read contract baseline', description: 'Retrieve the bill of quantities line for the active claim.' },
  get_instruction: { label: 'Check site authorization', description: 'Retrieve the signed site instruction for the active claim.' },
  get_measurement: { label: 'Read signed measurement', description: 'Retrieve the measurement sheet for the selected scenario.' },
  calculate_review: { label: 'Calculate supported amount', description: 'Calculate supported and pending quantities from the three records already retrieved. Call after all three lookups.' },
  draft_review: { label: 'Prepare review draft', description: 'Prepare the draft for human review after a successful calculation. This must be the last tool.' },
});

export function calculateReview(activeClaim, boq, authorization, measurement) {
  const sources = [boq, authorization, measurement];
  if (
    sources.some((source) => !source || source.item !== activeClaim.item || source.unit !== activeClaim.unit) ||
    !authorization.signed || !measurement.signed
  ) {
    throw new Error('Matching contract, signed authorization, and signed measurement are required.');
  }

  const quantities = [activeClaim.extra, boq.quantity, boq.rate, authorization.extra, measurement.total];
  if (quantities.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      !Number.isSafeInteger(activeClaim.extra * boq.rate)) {
    throw new Error('The sample claim requires valid whole-unit quantities and a valid contract rate.');
  }

  const measuredExtra = Math.max(0, measurement.total - boq.quantity);
  const supported = Math.min(activeClaim.extra, authorization.extra, measuredExtra);
  const pending = activeClaim.extra - supported;

  return {
    claimed: activeClaim.extra, baseline: boq.quantity, measuredTotal: measurement.total,
    authorized: authorization.extra, supported, pending, rate: boq.rate, currency: boq.currency,
    supportedAmount: supported * boq.rate, pendingAmount: pending * boq.rate,
    sourceIds: sources.map((source) => source.id),
  };
}

export function createReview(scenario) {
  const records = { get_contract: contract, get_instruction: instruction, get_measurement: scenario.measurement };
  const seen = new Map();
  const trace = [];
  let calculation;
  let draft;

  function execute(name) {
    if (!Object.hasOwn(steps, name) || draft) return { error: 'Tool is unavailable at this stage.' };
    if (Object.hasOwn(records, name)) {
      const record = records[name];
      if (!seen.has(name)) {
        seen.set(name, record);
        trace.push({ label: steps[name].label, reference: record.id });
      }
      return record;
    }
    if (name === 'calculate_review') {
      if (seen.size !== 3) return { error: 'Retrieve all three evidence records first.' };
      if (!calculation) {
        calculation = calculateReview(claim, ...Object.keys(records).map((key) => seen.get(key)));
        trace.push({ label: steps[name].label });
      }
      return calculation;
    }
    if (!calculation) return { error: 'Run calculate_review first.' };
    trace.push({ label: steps[name].label });
    draft = { calculation, sources: Object.values(records), trace, status: 'Awaiting human review' };
    return { status: draft.status, sourceIds: calculation.sourceIds };
  }

  return { execute, get draft() { return draft; } };
}
