import { claim, createReview, steps } from './review.mjs';

const tools = Object.entries(steps).map(([name, step]) => ({
  type: 'function',
  function: { name, description: step.description, parameters: { type: 'object', properties: {}, additionalProperties: false } },
}));

export async function runReview(scenario, { key, model, request = fetch }) {
  const workflow = createReview(scenario);
  if (!key) {
    for (const name of Object.keys(steps)) workflow.execute(name);
    return { ...workflow.draft, mode: 'Rules preview' };
  }

  const messages = [
    { role: 'system', content: 'Review one construction variation. Call get_contract, get_instruction, and get_measurement first. You may call all three together. After receiving all three results, call calculate_review, then draft_review. Always use the tools and finish by calling draft_review. Use empty arguments for every tool. The draft goes to a human reviewer.' },
    { role: 'user', content: JSON.stringify({ claim, case: scenario.label }) },
  ];
  const deadline = AbortSignal.timeout(40_000);

  for (let turn = 0; turn < 6; turn++) {
    const response = await request('https://api.vultrinference.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'required', max_tokens: 512 }),
      signal: deadline,
    });
    if (!response.ok) throw new Error(`Vultr Inference responded with HTTP ${response.status}.`);

    const message = (await response.json()).choices?.[0]?.message;
    if (!Array.isArray(message?.tool_calls) || !message.tool_calls.length || message.tool_calls.length > 5) {
      throw new Error('Inference did not return the expected tool calls.');
    }
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls });
    for (const call of message.tool_calls) {
      if (!call.id || call.type !== 'function') throw new Error('Inference returned an invalid tool call.');
      const result = workflow.execute(call.function?.name);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
    if (workflow.draft) return { ...workflow.draft, mode: 'Vultr AI agent', model };
  }

  throw new Error('The agent did not complete the evidence review.');
}
