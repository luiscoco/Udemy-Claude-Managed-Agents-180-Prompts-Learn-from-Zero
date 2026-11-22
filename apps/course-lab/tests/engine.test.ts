import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessons, lessonByNumber } from '../src/lessons.js';
import { executeLesson, total } from '../src/engine.js';
import { initialState, type State, type Data } from '../src/types.js';

async function run(number: number, steps?: { action: string; input?: Data }[]) {
  const lesson = lessonByNumber(number); let state = initialState(lesson); const history: State[] = [];
  for (const step of steps || lesson.walkthrough) { const action = lesson.actions.find(item => item.id === step.action)!; assert.ok(action); state = await executeLesson(lesson, state, action, step.input); history.push(state); }
  return { state, history };
}
test('catalog has every remaining lesson and every action has an implementation', async () => {
  assert.equal(lessons.length, 172); assert.equal(total, 440);
  for (const lesson of lessons) {
    // The browser suite verifies the real local HTTP and Playwright boundaries.
    if ([26, 64].includes(lesson.number)) continue;
    const { state } = await run(lesson.number);
    assert.equal(state.revision, lesson.walkthrough.length, `Prompt ${lesson.number}`);
    assert.equal(state.events.length, state.revision);
    assert.equal(typeof state.result.accepted, 'boolean');
  }
});
test('stale agent version fails and retry succeeds without overwriting unseen changes', async () => {
  const { history } = await run(16); assert.equal(history[2].result.accepted, false); assert.equal(history[2].resources.agent.version, 2); assert.equal(history[3].resources.agent.version, 3);
});
test('memory CAS preserves a competing edit and restoration appends history', async () => {
  const { history } = await run(111); assert.equal(history[2].result.accepted, false); assert.match(history[3].result.content, /Competing/);
  const { state } = await run(113); assert.equal(state.resources.memory.history.length, 3); assert.equal(state.resources.memory.content, state.resources.memory.history[0].content);
});
test('duplicate write and report delivery cause one side effect', async () => {
  assert.equal((await run(62)).state.resources.writeCount, 1);
  const { state } = await run(180); assert.equal(state.resources.outbox.length, 1); assert.equal(state.result.duplicate, true);
});
test('authorization, network and server denial cannot be bypassed by user text', async () => {
  assert.equal((await run(78)).state.result.accepted, false);
  assert.equal((await run(76)).state.result.accepted, false);
  const { history } = await run(22); assert.equal(history[1].result.accepted, false); assert.equal(history[2].result.accepted, true);
});
test('signature verification rejects changed raw bytes and stale timestamps', async () => {
  const { history } = await run(150); assert.equal(history[1].result.accepted, true); assert.equal(history[2].result.accepted, false); assert.equal(history[3].result.accepted, false);
});
test('usage snapshots are cumulative, budget removal is irreversible within a session', async () => {
  assert.equal((await run(156)).state.metrics.tokens, 150);
  const { history } = await run(160); assert.equal(history[1].resources.budget.paused, false); assert.equal(history[3].result.accepted, false);
});
test('independent checks catch a claimed passing total and JSON validation is bounded', async () => {
  const { history } = await run(142); assert.equal(history[0].result.satisfied, false); assert.equal(history[1].result.matches, false); assert.equal(history[2].result.satisfied, true);
  const { state } = await run(171, Array.from({ length: 4 }, () => ({ action: 'correct' }))); assert.equal(state.result.accepted, false);
});
test('SQLite and local isolation checks use actual local execution', async () => {
  assert.equal((await run(25)).state.result.total, 440);
  assert.equal((await run(166)).state.result.isolated, true);
});
