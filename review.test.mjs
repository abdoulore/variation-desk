import test from 'node:test';
import assert from 'node:assert/strict';
import { claim, calculateReview, createReview, scenarios } from './lib/review.mjs';
import { runReview } from './lib/inference.mjs';

test('revised measurement changes the draft from 25 to 40 supported square metres', async () => {
  const [initial, revised] = await Promise.all(scenarios.map((sample) => runReview(sample, {})));
  assert.equal(initial.calculation.supportedAmount, 200_000);
  assert.equal(initial.calculation.pendingAmount, 120_000);
  assert.equal(revised.calculation.supportedAmount, 320_000);
  assert.equal(revised.calculation.pendingAmount, 0);
  assert.equal(initial.trace.length, 5);
});

test('the review requires all records and checks signatures, item identity, and authorization', () => {
  const workflow = createReview(scenarios[0]);
  assert.ok(workflow.execute('calculate_review').error);
  assert.ok(workflow.execute('draft_review').error);
  const boq = workflow.execute('get_contract');
  const instruction = workflow.execute('get_instruction');
  const measurement = workflow.execute('get_measurement');
  assert.throws(() => calculateReview(claim, boq, instruction, { ...measurement, signed: false }));
  assert.throws(() => calculateReview(claim, boq, instruction, { ...measurement, item: 'wrong' }));
  assert.equal(calculateReview(claim, boq, { ...instruction, extra: 12 }, measurement).supported, 12);
});

test('a model tool-call transcript drives the production workflow', async () => {
  const sequence = [['get_instruction', 'get_contract', 'get_measurement'], ['calculate_review'], ['draft_review']];
  const request = async (url, options) => {
    assert.equal(url, 'https://api.vultrinference.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(options.body);
    const calls = sequence.shift();
    assert.equal(body.tools.length, 5);
    if (calls[0] === 'calculate_review') assert.equal(body.messages.filter(({ role }) => role === 'tool').length, 3);
    if (calls[0] === 'draft_review') assert.equal(JSON.parse(body.messages.at(-1).content).supported, 25);
    return Response.json({ choices: [{ message: { tool_calls: calls.map((name) => ({
      type: 'function', id: name, function: { name, arguments: '{}' },
    })) } }] });
  };
  const draft = await runReview(scenarios[0], { key: 'test-key', model: 'test-model', request });
  assert.equal(draft.mode, 'Vultr AI agent');
  assert.equal(draft.calculation.supported, 25);
  assert.equal(draft.trace[0].reference, 'SI-017');
  assert.equal(sequence.length, 0);
});
