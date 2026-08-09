const crypto = require('crypto');

const MAX_AI_REQUEST_BYTES = 7_500_000;
const MAX_CONTENTS = 8;
const MAX_PARTS_PER_CONTENT = 48;
const MAX_TEXT_LENGTH = 120_000;
const MAX_INLINE_DATA_LENGTH = 7_000_000;
const ALLOWED_INLINE_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const createValidationError = (message, code = 'invalid_ai_request') => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
};

const sanitizeInlineData = (inlineData = {}) => {
  const mimeType = `${inlineData?.mimeType || ''}`.trim().toLowerCase();
  const data = `${inlineData?.data || ''}`.trim();
  if (!ALLOWED_INLINE_MIME_TYPES.has(mimeType)) {
    throw createValidationError('Dinh dang tep AI khong duoc ho tro.', 'unsupported_ai_media_type');
  }
  if (!data || data.length > MAX_INLINE_DATA_LENGTH || !/^[a-zA-Z0-9+/=\r\n]+$/.test(data)) {
    throw createValidationError('Du lieu tep AI khong hop le hoac qua lon.', 'invalid_ai_media');
  }
  return { mimeType, data };
};

const sanitizePart = (part = {}) => {
  if (typeof part?.text === 'string') {
    if (part.text.length > MAX_TEXT_LENGTH) {
      throw createValidationError('Noi dung AI vuot qua gioi han cho phep.', 'ai_text_too_large');
    }
    const text = part.text;
    if (!text.trim()) throw createValidationError('Noi dung AI dang rong.');
    return { text };
  }
  if (part?.inlineData && typeof part.inlineData === 'object') {
    return { inlineData: sanitizeInlineData(part.inlineData) };
  }
  throw createValidationError('Thanh phan yeu cau AI khong hop le.');
};

const sanitizeSystemInstruction = (instruction) => {
  if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction)) return undefined;
  const parts = Array.isArray(instruction.parts) ? instruction.parts.slice(0, MAX_PARTS_PER_CONTENT) : [];
  if (!parts.length) return undefined;
  return { parts: parts.map(sanitizePart) };
};

const sanitizeGeminiRequestPayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createValidationError('Yeu cau AI khong hop le.');
  }
  const contents = Array.isArray(payload.contents) ? payload.contents.slice(0, MAX_CONTENTS) : [];
  if (!contents.length) throw createValidationError('Yeu cau AI chua co noi dung.');
  const safeContents = contents.map((content = {}) => {
    const parts = Array.isArray(content.parts) ? content.parts.slice(0, MAX_PARTS_PER_CONTENT) : [];
    if (!parts.length) throw createValidationError('Yeu cau AI chua co du lieu can xu ly.');
    return {
      role: content.role === 'model' ? 'model' : 'user',
      parts: parts.map(sanitizePart)
    };
  });
  const generationConfig = payload.generationConfig && typeof payload.generationConfig === 'object'
    ? {
        responseMimeType: payload.generationConfig.responseMimeType === 'application/json'
          ? 'application/json'
          : 'text/plain',
        ...(Number.isFinite(Number(payload.generationConfig.temperature))
          ? { temperature: Math.min(2, Math.max(0, Number(payload.generationConfig.temperature))) }
          : {})
      }
    : undefined;
  const systemInstruction = sanitizeSystemInstruction(payload.systemInstruction);
  return {
    contents: safeContents,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(generationConfig ? { generationConfig } : {})
  };
};

const getRequestByteLength = (request = {}) => {
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody.length;
  return Buffer.byteLength(JSON.stringify(request.body || {}), 'utf8');
};

const assertAiRequestSize = (request = {}) => {
  const byteLength = getRequestByteLength(request);
  if (byteLength > MAX_AI_REQUEST_BYTES) {
    const error = createValidationError('Tep AI qua lon. Vui long giam kich thuoc va thu lai.', 'ai_request_too_large');
    error.statusCode = 413;
    throw error;
  }
  return byteLength;
};

const buildAiRateLimitId = ({ identityId = '' } = {}) => crypto
  .createHash('sha256')
  .update(`${identityId}`)
  .digest('hex');

module.exports = {
  MAX_AI_REQUEST_BYTES,
  assertAiRequestSize,
  buildAiRateLimitId,
  sanitizeGeminiRequestPayload
};
