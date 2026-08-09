import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MAX_AI_REQUEST_BYTES,
  assertAiRequestSize,
  buildAiRateLimitId,
  sanitizeGeminiRequestPayload
} = require('../functions/aiGatewaySecurity.js');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

test('valid text request preserves contents, system instruction and safe generation config', () => {
  const result = sanitizeGeminiRequestPayload({
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    systemInstruction: { parts: [{ text: 'Only return JSON.' }] },
    generationConfig: { responseMimeType: 'application/json', temperature: 0 }
  });
  assert.equal(result.contents[0].parts[0].text, 'Hello');
  assert.equal(result.systemInstruction.parts[0].text, 'Only return JSON.');
  assert.equal(result.generationConfig.responseMimeType, 'application/json');
  assert.equal(result.generationConfig.temperature, 0);
});

test('valid image and audio payloads are accepted', () => {
  const result = sanitizeGeminiRequestPayload({
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: 'YWJjZA==' } },
        { inlineData: { mimeType: 'audio/webm', data: 'YWJjZA==' } }
      ]
    }]
  });
  assert.equal(result.contents[0].parts.length, 2);
});

test('unsupported media and malformed base64 are rejected', () => {
  assert.throws(() => sanitizeGeminiRequestPayload({
    contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: 'YWJjZA==' } }] }]
  }), error => error.code === 'unsupported_ai_media_type');
  assert.throws(() => sanitizeGeminiRequestPayload({
    contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: '<script>' } }] }]
  }), error => error.code === 'invalid_ai_media');
});

test('empty and oversized text requests are rejected', () => {
  assert.throws(() => sanitizeGeminiRequestPayload({ contents: [] }), error => error.code === 'invalid_ai_request');
  assert.throws(() => sanitizeGeminiRequestPayload({
    contents: [{ parts: [{ text: 'x'.repeat(120_001) }] }]
  }), error => error.code === 'ai_text_too_large');
});

test('request byte limit rejects oversized bodies', () => {
  const rawBody = Buffer.alloc(MAX_AI_REQUEST_BYTES + 1);
  assert.throws(() => assertAiRequestSize({ rawBody }), error => error.statusCode === 413);
  assert.equal(assertAiRequestSize({ rawBody: Buffer.from('{}') }), 2);
});

test('rate-limit id is stable per identity and does not expose the identity', () => {
  const first = buildAiRateLimitId({ identityId: 'identity-a', windowKey: 'minute-a' });
  const second = buildAiRateLimitId({ identityId: 'identity-a', windowKey: 'minute-b' });
  const other = buildAiRateLimitId({ identityId: 'identity-b' });
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.includes('identity-a'), false);
});

console.log(`AI gateway security: ${passed} tests passed.`);
