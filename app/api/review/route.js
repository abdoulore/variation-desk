import { randomUUID } from 'node:crypto';
import { scenarios } from '../../../lib/review.mjs';
import { runReview } from '../../../lib/inference.mjs';
import { getEvidenceRequest, reserveInferenceRun, saveDraft, saveRevisedDraft } from '../../../lib/store.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  if (request.headers.get('x-variation-desk') !== '1') {
    return Response.json({ error: 'Use the Variation Desk review page.' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const scenario = scenarios.find(({ id }) => id === params.get('scenario'));
  if (!scenario) return Response.json({ error: 'Select a valid sample case.' }, { status: 400 });

  const followup = params.get('followup');
  if (followup !== null && (scenario.id !== 'complete' || !/^[\da-f-]{36}$/.test(followup))) {
    return Response.json({ error: 'Select a valid evidence follow-up.' }, { status: 400 });
  }

  const key = process.env.VULTR_INFERENCE_API_KEY;
  const model = process.env.VULTR_INFERENCE_MODEL || 'glm-5.2';

  try {
    if (followup) {
      const evidence = getEvidenceRequest(followup);
      if (evidence?.measurementId !== scenario.measurement.id) {
        return Response.json({ error: 'Attach the revised measurement first.' }, { status: 409 });
      }
      if (evidence.revised) return Response.json(evidence.revised);
    }
    if (key && !reserveInferenceRun()) {
      return Response.json({ error: 'Today’s public demo limit has been reached.' }, { status: 429 });
    }

    const review = await runReview(scenario, { key, model });
    const draft = { ...review, scenario: scenario.id, id: randomUUID(), createdAt: new Date().toISOString() };
    return Response.json(followup ? saveRevisedDraft(followup, draft) : saveDraft(draft));
  } catch (error) {
    console.error('Review failed:', error.message);
    return Response.json({ error: 'The review could not be completed. Please try again.' }, { status: 502 });
  }
}
