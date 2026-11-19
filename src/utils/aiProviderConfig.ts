import type { AIConfig, AIProviderType } from '../types/mail.ts';

export interface AIProviderPreset {
  provider: AIProviderType;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  defaultEnvVar: string;
  requiresKey: boolean;
  suggestedModels: string[];
}

export const AI_PROVIDER_PRESETS: Record<AIProviderType, AIProviderPreset> = {
  ollama: {
    provider: 'ollama',
    label: 'Local Ollama (Built-In)',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:3b',
    defaultEnvVar: 'NONE',
    requiresKey: false,
    suggestedModels: [
      'qwen2.5:3b',
      'qwen2.5:1.5b',
      'mistral:latest',
      'llama3.2',
      'qwen2.5:14b',
    ],
  },
};

export const OLLAMA_ENDPOINT_PRESETS = [
  { label: 'Container Built-in', url: 'http://127.0.0.1:11434/v1' },
  { label: 'Localhost', url: 'http://localhost:11434/v1' },
  { label: 'Host Machine', url: 'http://host.docker.internal:11434/v1' },
] as const;

export function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Ollama Base URL must start with http:// or https://');
  }
  return trimmed;
}

function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((n) => Number(n));
  if (octets.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / Tailscale private mesh
  return false;
}

/**
 * Ensures AI inference stays strictly on local loopback, Docker internal, or private LAN hosts,
 * preventing email data from ever being transmitted to external/cloud AI APIs.
 */
export function isLocalPrivateAiUrl(rawUrl: string): boolean {
  try {
    const normalized = normalizeBaseUrl(rawUrl);
    if (!normalized) return false;
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === 'ollama' ||
      host === 'host.docker.internal'
    ) {
      return true;
    }

    if (isPrivateIpv4(host)) return true;

    // Single-label internal Docker/compose service names (no dots, e.g. http://tarsel-ollama:11434)
    if (!host.includes('.')) return true;

    // Explicit local/private DNS suffixes
    if (
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home') ||
      host.endsWith('.home.arpa')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function assertLocalPrivateAiUrl(rawUrl: string): string {
  const normalized = normalizeBaseUrl(rawUrl);
  if (!isLocalPrivateAiUrl(normalized)) {
    throw new Error(
      'External AI APIs are disabled. Only local container, localhost, or private LAN Ollama endpoints are permitted.'
    );
  }
  return normalized;
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

export function buildOllamaNativeUrl(baseUrl: string, apiPath: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/v1$/i, '');
  const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${normalized}${cleanPath}`;
}

/**
 * Extracts valid JSON from an LLM response, stripping optional ```json markdown fences
 * that local models sometimes emit.
 */
export function parseJsonFromModelText<T>(rawText: string, fallback: T): T {
  const trimmed = rawText.trim();
  if (!trimmed) return fallback;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const firstBracket = candidate.indexOf('[');
    let start = -1;
    let end = -1;

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      start = firstBracket;
      end = candidate.lastIndexOf(']');
    } else if (firstBrace !== -1) {
      start = firstBrace;
      end = candidate.lastIndexOf('}');
    }

    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export function formatProviderLabel(config: AIConfig): string {
  const preset = AI_PROVIDER_PRESETS[config.provider];
  return preset ? `${preset.label} (${config.model})` : `Local Ollama (${config.model})`;
}
