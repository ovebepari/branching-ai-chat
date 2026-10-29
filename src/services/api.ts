import type { ProviderConfig } from '../types';

// --- Pluggable provider interface ---
// Each provider streams text chunks via a callback

type OnChunk = (chunk: string) => void;
type OnDone = (usage?: { tokensIn: number; tokensOut: number }) => void;
type OnError = (err: Error) => void;

interface StreamOptions {
  history: Array<{ role: 'user' | 'model'; text: string }>;
  query: string;
  provider: ProviderConfig;
  projectId?: string;
  onChunk: OnChunk;
  onDone: OnDone;
  onError: OnError;
}

// --- Mock provider (for dev/testing) ---
async function streamMock({ query, onChunk, onDone }: StreamOptions) {
  const mockResponse = `## Response to: "${query.slice(0, 60)}"\n\nThis is a **mock response** from the development provider. It demonstrates:\n\n- Markdown rendering\n- Streaming behavior\n- Code blocks:\n\n\`\`\`typescript\nconst greeting = "Hello from DFS Chat!";\nconsole.log(greeting);\n\`\`\`\n\n> The tree branching system is working correctly.\n\nSwitch to a real provider (Gemini, OpenRouter, or Ollama) in Settings to get actual AI responses.`;

  const words = mockResponse.split(' ');
  for (let i = 0; i < words.length; i++) {
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
    onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
  }
  onDone();
}

// --- Gemini API (free tier) ---
async function streamGemini({ history, query, provider, onChunk, onDone, onError }: StreamOptions) {
  const apiKey = provider.apiKey;
  if (!apiKey) {
    onError(new Error('Gemini API key is required. Get one at makersuite.google.com'));
    return;
  }

  const model = provider.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const contents = history.map((msg) => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }],
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(new Error(`Gemini API error ${res.status}: ${errText}`));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError(new Error('No response body')); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onChunk(text);
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// --- OpenRouter ---
async function streamOpenRouter({ history, query, provider, onChunk, onDone, onError }: StreamOptions) {
  const apiKey = provider.apiKey;
  if (!apiKey) {
    onError(new Error('OpenRouter API key is required. Get one at openrouter.ai'));
    return;
  }

  const model = provider.model || 'google/gemini-2.0-flash-exp:free';

  try {
    const messages = history.map((msg) => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text,
    }));
    messages.push({ role: 'user', content: query });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(new Error(`OpenRouter error ${res.status}: ${errText}`));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError(new Error('No response body')); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const text = json?.choices?.[0]?.delta?.content;
            if (text) onChunk(text);
          } catch {
            // skip
          }
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// --- Ollama (local) ---
async function streamOllama({ history, query, provider, onChunk, onDone, onError }: StreamOptions) {
  const baseUrl = provider.baseUrl || 'http://localhost:11434';
  const model = provider.model || 'llama3.2';

  try {
    const messages = history.map((msg) => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text,
    }));
    messages.push({ role: 'user', content: query });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(new Error(`Ollama error ${res.status}: ${errText}`));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError(new Error('No response body')); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) onChunk(json.message.content);
        } catch {
          // skip
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// --- Antigravity (agy) provider ---
async function streamAgy({ query, projectId, provider, onChunk, onDone, onError }: StreamOptions) {
  if (!projectId) {
    onError(new Error('projectId is required for agy provider'));
    return;
  }

  try {
    const res = await fetch('/api/agy/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        query,
        model: provider.model || 'gemini-3.8-flash-low',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(new Error(`agy error ${res.status}: ${errText}`));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError(new Error('No response body')); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    let capturedUsage: { tokensIn: number; tokensOut: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json.type === 'delta' && json.text) {
              onChunk(json.text);
            } else if (json.type === 'done') {
              const u = json.usage;
              if (u) {
                capturedUsage = {
                  tokensIn: u.input_tokens || u.prompt_tokens || u.tokensIn || 0,
                  tokensOut: u.output_tokens || u.completion_tokens || u.tokensOut || 0,
                };
              }
            } else if (json.type === 'error') {
              onError(new Error(json.error));
              return;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
    onDone(capturedUsage);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// --- Main dispatcher ---
export function streamQuery(options: StreamOptions) {
  const { provider } = options;

  // Prepend system prompt as first message if configured
  let opts = options;
  if (provider.systemPrompt) {
    opts = {
      ...options,
      history: [
        { role: 'user' as const, text: provider.systemPrompt },
        { role: 'model' as const, text: 'Understood. I will follow these instructions.' },
        ...options.history,
      ],
    };
  }

  switch (provider.type) {
    case 'agy':
      return streamAgy(opts);
    case 'gemini':
      return streamGemini(opts);
    case 'openrouter':
      return streamOpenRouter(opts);
    case 'ollama':
      return streamOllama(opts);
    case 'mock':
    default:
      return streamMock(opts);
  }
}

// --- Auto-label generator ---
export function generateLabel(prompt: string): string {
  const words = prompt.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(' ') || 'New query';
}
