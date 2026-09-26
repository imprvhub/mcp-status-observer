import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStatus, formatTime, StatusObserver } from '../build/index.js';

test('normalizeStatus maps every vendor vocabulary onto one scale', () => {
  for (const s of ['operational', 'All Systems Operational', 'ok', 'good', 'none', 'normal']) {
    assert.equal(normalizeStatus(s), 'Operational ✅', s);
  }
  for (const s of ['degraded', 'Partial Outage', 'minor']) {
    assert.equal(normalizeStatus(s), 'Degraded Performance ⚠️', s);
  }
  for (const s of ['major', 'Major Outage', 'critical', 'service_down']) {
    assert.equal(normalizeStatus(s), 'Major Outage 🔴', s);
  }
  assert.equal(normalizeStatus('maintenance'), 'Under Maintenance 🔧');
  assert.equal(normalizeStatus(''), 'Unknown');
});

test('formatTime is locale-independent and survives junk', () => {
  assert.equal(formatTime('2026-09-26T10:00:00.000Z'), '2026-09-26T10:00:00Z');
  assert.equal(formatTime(undefined), 'unknown');
  assert.equal(formatTime('not a date'), 'not a date');
});

test('platform registry holds only reachable platforms', () => {
  const obs = new StatusObserver();
  // Dropped for lack of a machine-readable public status API.
  assert.equal(obs.getPlatform('openrouter'), undefined);
  assert.equal(obs.getPlatform('x'), undefined);
  // Previously served by a dead helper service, now read from the vendor directly.
  for (const id of ['anthropic', 'openai', 'docker', 'atlassian', 'supabase', 'linkedin', 'gcp', 'gemini']) {
    assert.ok(obs.getPlatform(id), `${id} should be registered`);
  }
  assert.match(obs.getPlatformsList(), /21 platforms/);
});

test('no platform points at the retired helper service', () => {
  const obs = new StatusObserver();
  const list = obs.getPlatformsList();
  assert.ok(!list.includes('status-observer-helpers'));
  for (const id of ['anthropic', 'openai', 'gcp', 'gemini', 'docker']) {
    assert.ok(!obs.getPlatform(id).url.includes('vercel.app'), `${id} still uses the helper`);
  }
});
