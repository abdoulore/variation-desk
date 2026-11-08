import { attachEvidence, getEvidenceRequest, requestEvidence } from '../../../lib/store.mjs';
import { scenarios } from '../../../lib/review.mjs';

export const runtime = 'nodejs';
const revisedMeasurementId = scenarios.find(({ id }) => id === 'complete').measurement.id;

function readDraftId(request) {
  const id = new URL(request.url).searchParams.get('draft');
  return id && /^[\da-f-]{36}$/.test(id) ? id : null;
}

export async function GET(request) {
  const draftId = readDraftId(request);
  const evidence = draftId && getEvidenceRequest(draftId);
  if (!evidence) return Response.json({ error: 'Evidence request not found.' }, { status: 404 });
  return Response.json(evidence, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  if (request.headers.get('x-variation-desk') !== '1') {
    return Response.json({ error: 'Use the Variation Desk review page.' }, { status: 403 });
  }

  const draftId = readDraftId(request);
  const action = new URL(request.url).searchParams.get('action');
  if (!draftId || !['request', 'attach'].includes(action)) {
    return Response.json({ error: 'Select a valid evidence action.' }, { status: 400 });
  }

  const evidence = action === 'request' ? requestEvidence(draftId) : attachEvidence(draftId, revisedMeasurementId);
  if (!evidence) return Response.json({ error: 'No open claim is available for that action.' }, { status: 409 });
  return Response.json(evidence);
}
