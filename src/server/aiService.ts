import type {
  AIConfig,
  AIFilterRule,
  AIStatus,
  EmailThread,
  FilterMatchResult,
  WritingAssistAction,
} from '../types/mail.ts';
import { getAiConfig } from './db.ts';
import { evaluateFilterHeuristically } from '../utils/aiRuleEngine.ts';
import {
  AI_PROVIDER_PRESETS,
  assertLocalPrivateAiUrl,
  buildChatCompletionsUrl,
  buildOllamaNativeUrl,
  isLocalPrivateAiUrl,
  parseJsonFromModelText,
} from '../utils/aiProviderConfig.ts';

export function getAiStatus(): AIStatus {
  const cfg = getAiConfig();
  return {
    configured: isLocalPrivateAiUrl(cfg.baseUrl),
    activeProvider: 'ollama',
    activeModel: cfg.model,
    localOnly: true,
  };
}

function getProviderDisplayName(cfg: AIConfig): string {
  return AI_PROVIDER_PRESETS[cfg.provider]?.label || 'Local Ollama (Built-In)';
}

async function callLocalOllamaChat(params: {
  config: AIConfig;
  systemPrompt: string;
  userPrompt: string;
  expectJson?: boolean;
}): Promise<string> {
  const { config, systemPrompt, userPrompt, expectJson } = params;
  const safeBaseUrl = assertLocalPrivateAiUrl(config.baseUrl);
  const url = buildChatCompletionsUrl(safeBaseUrl);

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  };

  if (expectJson) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new Error(
        `Model "${config.model}" is not installed in local Ollama yet. Click "Pull Model" in Settings to download it.`
      );
    }
    throw new Error(`Local Ollama HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Local Ollama returned an empty response.');
  }
  return content;
}

export async function listOllamaModels(baseUrl: string): Promise<{
  ok: boolean;
  models: string[];
  error?: string;
}> {
  try {
    const safeBaseUrl = assertLocalPrivateAiUrl(baseUrl);
    const url = buildOllamaNativeUrl(safeBaseUrl, '/api/tags');
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        error: `Ollama HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const models = (data.models ?? [])
      .map((m) => m.name || m.model || '')
      .filter(Boolean);
    return { ok: true, models };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Unable to reach local Ollama server';
    const isUnreachable = /fetch failed|econnrefused|enotfound|etimedout/i.test(rawMsg);
    return {
      ok: false,
      models: [],
      error: isUnreachable
        ? `Local Ollama not reachable at ${buildOllamaNativeUrl(baseUrl, '')} — deterministic local rule engine fallback is active.`
        : rawMsg,
    };
  }
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string
): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  try {
    const safeBaseUrl = assertLocalPrivateAiUrl(baseUrl);
    const url = buildOllamaNativeUrl(safeBaseUrl, '/api/pull');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
      signal: AbortSignal.timeout(600000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        error: `Ollama pull failed (HTTP ${res.status}): ${errText.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { status?: string };
    return { ok: true, status: data.status || 'success' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ollama model download failed',
    };
  }
}

export async function testAiConnection(
  overrideConfig?: AIConfig
): Promise<{
  ok: boolean;
  providerLabel: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}> {
  const cfg = overrideConfig || getAiConfig();
  const label = getProviderDisplayName(cfg);
  const start = performance.now();

  try {
    const reply = await callLocalOllamaChat({
      config: cfg,
      systemPrompt: 'Reply concisely.',
      userPrompt: 'Reply with exactly: OK',
      expectJson: false,
    });
    return {
      ok: true,
      providerLabel: label,
      latencyMs: Math.round(performance.now() - start),
      reply: reply.trim().slice(0, 60),
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Local Ollama connection test failed';
    const friendlyError = /fetch failed|econnrefused|enotfound|etimedout/i.test(rawMsg)
      ? `Could not reach local Ollama at ${cfg.baseUrl}. Ensure the container Ollama service is running (local rule fallback remains active).`
      : rawMsg;
    return {
      ok: false,
      providerLabel: label,
      latencyMs: Math.round(performance.now() - start),
      error: friendlyError,
    };
  }
}

export async function evaluateAiFilter(
  rule: AIFilterRule,
  threads: EmailThread[]
): Promise<{
  results: FilterMatchResult[];
  usedLocalAi: boolean;
  providerUsed: string;
}> {
  const cfg = getAiConfig();
  const providerName = getProviderDisplayName(cfg);
  const compactThreads = threads.slice(0, 30).map((t) => ({
    id: t.id,
    subject: t.subject,
    from: t.participants.map((p) => `${p.name} <${p.email}>`).join(', '),
    snippet: t.snippet,
    bundle: t.bundle,
    labels: t.labels,
    bodyPreview: t.messages[t.messages.length - 1]?.bodyText.slice(0, 500) ?? '',
  }));

  const threadMap = new Map(threads.map((t) => [t.id, t]));

  const mapMatches = (
    parsed: Array<{
      threadId: string;
      matched: boolean;
      reason: string;
      bundle?: string;
      addLabels?: string[];
      star?: boolean;
      archive?: boolean;
      markImportant?: boolean;
      createTodoTitle?: string;
    }>
  ): FilterMatchResult[] =>
    parsed
      .filter((item) => item.matched && threadMap.has(item.threadId))
      .map((item) => {
        const t = threadMap.get(item.threadId)!;
        return {
          threadId: t.id,
          subject: t.subject,
          from: t.participants[0]?.name || t.participants[0]?.email || 'Unknown',
          matched: true,
          reason: item.reason,
          actionsApplied: {
            ...(item.bundle || rule.targetBundle
              ? { bundle: item.bundle || rule.targetBundle || undefined }
              : {}),
            ...(item.addLabels?.length ? { addLabels: item.addLabels } : {}),
            ...(item.star ? { star: true } : {}),
            ...(item.archive ? { archive: true } : {}),
            ...(item.markImportant ? { markImportant: true } : {}),
            ...(item.createTodoTitle
              ? { createTodoTitle: item.createTodoTitle }
              : {}),
          },
        };
      });

  try {
    const rawJson = await callLocalOllamaChat({
      config: cfg,
      systemPrompt:
        'You are an inbox automation engine. Return valid JSON ONLY with shape {"matches": [{"threadId": string, "matched": boolean, "reason": string, "bundle"?: string, "addLabels"?: string[], "star"?: boolean, "archive"?: boolean, "markImportant"?: boolean, "createTodoTitle"?: string}]}. Only include emails that genuinely match the rule.',
      userPrompt: `Filter Name: "${rule.name}"
Target Bundle: "${rule.targetBundle || ''}"
Plain-English Rule: "${rule.prompt}"

Emails:
${JSON.stringify(compactThreads)}`,
      expectJson: true,
    });

    const parsedObj = parseJsonFromModelText<
      | { matches?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>
    >(rawJson, { matches: [] });

    const arr = Array.isArray(parsedObj)
      ? parsedObj
      : Array.isArray(parsedObj.matches)
        ? parsedObj.matches
        : [];

    return {
      results: mapMatches(
        arr as Array<{
          threadId: string;
          matched: boolean;
          reason: string;
          bundle?: string;
          addLabels?: string[];
          star?: boolean;
          archive?: boolean;
          markImportant?: boolean;
          createTodoTitle?: string;
        }>
      ),
      usedLocalAi: true,
      providerUsed: providerName,
    };
  } catch (err) {
    console.warn(`${providerName} filter evaluation fallback:`, err);
    return {
      results: evaluateFilterHeuristically(rule, threads),
      usedLocalAi: false,
      providerUsed: 'Local Rule Engine',
    };
  }
}

export async function summarizeThread(thread: EmailThread): Promise<{
  summary: string;
  actionItems: string[];
  detectedMeeting: EmailThread['detectedMeeting'];
  usedLocalAi: boolean;
  providerUsed: string;
}> {
  const cfg = getAiConfig();
  const providerName = getProviderDisplayName(cfg);
  const transcript = thread.messages
    .map(
      (m) =>
        `From: ${m.fromName} <${m.fromEmail}> (${m.date})\n${m.bodyText}`
    )
    .join('\n---\n');

  try {
    const rawJson = await callLocalOllamaChat({
      config: cfg,
      systemPrompt:
        'Return JSON ONLY with fields: {"summary": string, "actionItems": string[], "hasMeeting": boolean, "meetingTitle": string, "meetingIsoTime": string, "meetingDurationMinutes": number}. Summarize concisely in 1-2 sentences.',
      userPrompt: `Subject: ${thread.subject}\n\nMessages:\n${transcript}`,
      expectJson: true,
    });

    const parsed = parseJsonFromModelText<{
      summary?: string;
      actionItems?: string[];
      hasMeeting?: boolean;
      meetingTitle?: string;
      meetingIsoTime?: string;
      meetingDurationMinutes?: number;
    }>(rawJson, {});

    return {
      summary: parsed.summary || thread.snippet,
      actionItems: parsed.actionItems ?? [],
      detectedMeeting:
        parsed.hasMeeting && parsed.meetingIsoTime
          ? {
              title: parsed.meetingTitle || thread.subject,
              proposedTime: parsed.meetingIsoTime,
              durationMinutes: parsed.meetingDurationMinutes || 30,
            }
          : thread.detectedMeeting ?? null,
      usedLocalAi: true,
      providerUsed: providerName,
    };
  } catch (err) {
    console.warn(`${providerName} summarize fallback:`, err);
    const lastMsg = thread.messages[thread.messages.length - 1];
    return {
      summary:
        thread.aiSummary ||
        `${thread.participants[0]?.name || 'Sender'} wrote regarding "${thread.subject}". ${lastMsg?.bodyText.slice(0, 180) ?? ''}`,
      actionItems: thread.aiActionItems ?? [],
      detectedMeeting: thread.detectedMeeting ?? null,
      usedLocalAi: false,
      providerUsed: 'Local Fallback',
    };
  }
}

export async function assistWriting(params: {
  action: WritingAssistAction;
  draftText: string;
  subject?: string;
  targetLanguage?: string;
  writingStyle?: string;
  replyToContext?: string;
  instruction?: string;
}): Promise<{ text: string; usedLocalAi: boolean; providerUsed: string }> {
  const cfg = getAiConfig();
  const providerName = getProviderDisplayName(cfg);
  const {
    action,
    draftText,
    subject,
    targetLanguage = 'German',
    writingStyle = 'Direct, clear, warm-professional',
    replyToContext,
    instruction,
  } = params;

  let taskPrompt = '';
  if (action === 'draft' || action === 'reply') {
    taskPrompt = `Write a crisp email ${action === 'reply' ? 'reply' : 'draft'} matching this personal writing style: "${writingStyle}".
Subject: ${subject || '(none)'}
User prompt / notes: ${instruction || draftText || 'Acknowledge and confirm next steps'}
${replyToContext ? `\nThread context being replied to:\n${replyToContext.slice(0, 1500)}` : ''}
Return ONLY the email body text, ready to send.`;
  } else if (action === 'shorten') {
    taskPrompt = `Shorten the following email by ~40-50% while preserving every key fact, number, and tone ("${writingStyle}"). Return ONLY the shortened email body:\n\n${draftText}`;
  } else if (action === 'translate') {
    taskPrompt = `Translate the following email naturally into ${targetLanguage}, preserving professional formatting and intent. Return ONLY the translated email body:\n\n${draftText}`;
  } else if (action === 'proofread') {
    taskPrompt = `Proofread and polish grammar, clarity, and flow of the following email in its original language without changing the author's voice ("${writingStyle}"). Return ONLY the corrected email body:\n\n${draftText}`;
  }

  try {
    const reply = await callLocalOllamaChat({
      config: cfg,
      systemPrompt:
        'You are a private local AI email writing assistant. Output only the clean email body without markdown code fences or meta commentary.',
      userPrompt: taskPrompt,
      expectJson: false,
    });

    return {
      text: reply.trim(),
      usedLocalAi: true,
      providerUsed: providerName,
    };
  } catch (err) {
    console.warn(`${providerName} writing assist fallback:`, err);
    if (action === 'shorten') {
      const sentences = draftText.split(/(?<=[.!?])\s+/).filter(Boolean);
      return {
        text:
          sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(' ') ||
          draftText,
        usedLocalAi: false,
        providerUsed: 'Local Fallback',
      };
    }
    if (action === 'proofread') {
      return {
        text: draftText.replace(/\s{2,}/g, ' ').replace(/\bi\b/g, 'I').trim(),
        usedLocalAi: false,
        providerUsed: 'Local Fallback',
      };
    }
    if (action === 'translate') {
      return {
        text: `[${targetLanguage} translation requires the local Ollama model "${cfg.model}" to be running]\n\n${draftText}`,
        usedLocalAi: false,
        providerUsed: 'Local Fallback',
      };
    }
    return {
      text: `Hi,\n\nThanks for sending this over${subject ? ` regarding "${subject}"` : ''}. I've reviewed the details and will follow up with next steps shortly.\n\nBest,\nAlex`,
      usedLocalAi: false,
      providerUsed: 'Local Fallback',
    };
  }
}

export async function semanticSearch(
  query: string,
  threads: EmailThread[]
): Promise<{
  threadIds: string[];
  explanation: string;
  usedLocalAi: boolean;
  providerUsed: string;
}> {
  const cfg = getAiConfig();
  const providerName = getProviderDisplayName(cfg);
  const catalog = threads.slice(0, 40).map((t) => ({
    id: t.id,
    subject: t.subject,
    from: t.participants.map((p) => `${p.name} <${p.email}>`).join(', '),
    date: t.lastMessageAt,
    bundle: t.bundle,
    snippet: t.snippet,
    attachments: t.messages.flatMap((m) => m.attachments.map((a) => a.filename)),
  }));

  try {
    const rawJson = await callLocalOllamaChat({
      config: cfg,
      systemPrompt:
        'Return JSON ONLY: {"threadIds": string[], "explanation": string}. Select the matching threadIds ordered by relevance.',
      userPrompt: `Natural language email search query: "${query}"\n\nThreads:\n${JSON.stringify(catalog)}`,
      expectJson: true,
    });

    const parsed = parseJsonFromModelText<{
      threadIds?: string[];
      explanation?: string;
    }>(rawJson, {});

    return {
      threadIds: parsed.threadIds ?? [],
      explanation: parsed.explanation || `${providerName} search results`,
      usedLocalAi: true,
      providerUsed: providerName,
    };
  } catch (err) {
    console.warn(`${providerName} semantic search fallback:`, err);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matched = threads
      .filter((t) => {
        const hay = `${t.subject} ${t.snippet} ${t.bundle} ${t.labels.join(' ')} ${t.messages
          .map((m) => m.bodyText)
          .join(' ')}`.toLowerCase();
        return terms.some((term) => hay.includes(term));
      })
      .map((t) => t.id);
    return {
      threadIds: matched,
      explanation: `Matched locally across ${matched.length} threads`,
      usedLocalAi: false,
      providerUsed: 'Local FTS5 Index',
    };
  }
}
