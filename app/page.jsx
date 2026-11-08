import { claim, scenarios } from '../lib/review.mjs';
import ReviewDesk from './review-desk';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ReviewDesk
    claim={claim}
    cases={scenarios.map(({ id, label }) => ({ id, label }))}
    inferenceConfigured={Boolean(process.env.VULTR_INFERENCE_API_KEY)}
  />;
}
