import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROVIDER_PRESETS,
  assertLocalPrivateAiUrl,
  buildChatCompletionsUrl,
  buildOllamaNativeUrl,
  isLocalPrivateAiUrl,
  normalizeBaseUrl,
  parseJsonFromModelText,
} from './aiProviderConfig.ts';

test('normalizeBaseUrl strips trailing slashes and enforces http/https', () => {
  assert.equal(
    normalizeBaseUrl('http://127.0.0.1:11434/v1///'),
    'http://127.0.0.1:11434/v1'
  );
  assert.equal(
    normalizeBaseUrl('http://localhost:11434/v1/'),
    'http://localhost:11434/v1'
  );
  assert.throws(() => normalizeBaseUrl('ftp://invalid.local'), /http/);
});

test('isLocalPrivateAiUrl permits loopback/LAN Ollama and blocks external cloud APIs', () => {
  assert.equal(isLocalPrivateAiUrl('http://127.0.0.1:11434/v1'), true);
  assert.equal(isLocalPrivateAiUrl('http://localhost:11434/v1'), true);
  assert.equal(isLocalPrivateAiUrl('http://ollama:11434/v1'), true);
  assert.equal(isLocalPrivateAiUrl('http://host.docker.internal:11434/v1'), true);
  assert.equal(isLocalPrivateAiUrl('http://192.168.1.50:11434/v1'), true);
  assert.equal(isLocalPrivateAiUrl('http://10.0.0.12:11434/v1'), true);
  assert.equal(isLocalPrivateAiUrl('http://macbook.local:11434/v1'), true);

  // Must block external cloud LLM providers so mail data cannot leave local/LAN network
  assert.equal(isLocalPrivateAiUrl('https://api.mistral.ai/v1'), false);
  assert.equal(isLocalPrivateAiUrl('https://api.openai.com/v1'), false);
  assert.equal(isLocalPrivateAiUrl('https://openrouter.ai/api/v1'), false);
  assert.equal(
    isLocalPrivateAiUrl('https://generativelanguage.googleapis.com'),
    false
  );
  assert.throws(() => assertLocalPrivateAiUrl('https://api.mistral.ai/v1'), /External AI APIs are disabled/);
});

test('buildChatCompletionsUrl constructs valid local Ollama completions URL', () => {
  assert.equal(
    buildChatCompletionsUrl('http://127.0.0.1:11434/v1'),
    'http://127.0.0.1:11434/v1/chat/completions'
  );
  assert.equal(
    buildChatCompletionsUrl('http://localhost:11434/v1/chat/completions'),
    'http://localhost:11434/v1/chat/completions'
  );
});

test('buildOllamaNativeUrl strips /v1 and chat/completions suffixes cleanly', () => {
  assert.equal(
    buildOllamaNativeUrl('http://127.0.0.1:11434/v1', '/api/tags'),
    'http://127.0.0.1:11434/api/tags'
  );
  assert.equal(
    buildOllamaNativeUrl('http://host.docker.internal:11434/v1/chat/completions/', 'api/pull'),
    'http://host.docker.internal:11434/api/pull'
  );
  assert.equal(
    buildOllamaNativeUrl('http://localhost:11434', '/api/tags'),
    'http://localhost:11434/api/tags'
  );
  assert.equal(AI_PROVIDER_PRESETS.ollama.requiresKey, false);
  assert.equal(AI_PROVIDER_PRESETS.ollama.defaultEnvVar, 'NONE');
  assert.equal(Object.keys(AI_PROVIDER_PRESETS).length, 1);
});

test('parseJsonFromModelText handles fenced and prose-wrapped JSON safely', () => {
  const fenced = '```json\n[{"threadId":"t1","matched":true}]\n```';
  const parsed = parseJsonFromModelText<Array<{ threadId: string; matched: boolean }>>(
    fenced,
    []
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].threadId, 't1');

  const prose = 'Here is the result:\n{"summary":"All clear","actionItems":[]}';
  const obj = parseJsonFromModelText<{ summary: string; actionItems: string[] }>(
    prose,
    { summary: '', actionItems: [] }
  );
  assert.equal(obj.summary, 'All clear');
  assert.equal(AI_PROVIDER_PRESETS.ollama.defaultModel, 'qwen2.5:3b');
});
