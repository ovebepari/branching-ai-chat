import { useState } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { X } from 'lucide-react';
import type { ProviderType } from '../types';

interface SettingsModalProps {
  onClose: () => void;
}

const PROVIDER_OPTIONS: Array<{ value: ProviderType; label: string; hint: string }> = [
  { value: 'agy', label: 'Antigravity (agy)', hint: 'Routes through your local Antigravity CLI — one session per project' },
  { value: 'mock', label: 'Mock (Development)', hint: 'Fake responses for testing the UI' },
  { value: 'gemini', label: 'Google Gemini API', hint: 'Free tier — get a key at makersuite.google.com' },
  { value: 'openrouter', label: 'OpenRouter', hint: 'Access Gemini, Claude, GPT via one API — openrouter.ai' },
  { value: 'ollama', label: 'Ollama (Local)', hint: 'Run models locally — ollama.com' },
];

const DEFAULT_MODELS: Record<ProviderType, string> = {
  agy: 'gemini-3.8-flash-low',
  mock: 'mock',
  gemini: 'gemini-2.0-flash',
  openrouter: 'google/gemini-2.0-flash-exp:free',
  ollama: 'llama3.2',
};

const MODEL_OPTIONS: Partial<Record<ProviderType, Array<{ value: string; label: string }>>> = {
  agy: [
    { value: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { value: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    { value: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' },
    { value: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  openrouter: [
    { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)' },
    { value: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro Preview' },
    { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  ],
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const provider = useTreeStore((s) => s.provider);
  const setProvider = useTreeStore((s) => s.setProvider);

  const [type, setType] = useState<ProviderType>(provider.type);
  const [apiKey, setApiKey] = useState(provider.apiKey || '');
  const [model, setModel] = useState(provider.model || DEFAULT_MODELS[provider.type]);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || 'http://localhost:11434');
  const [systemPrompt, setSystemPrompt] = useState(provider.systemPrompt || '');

  const handleSave = () => {
    setProvider({
      type,
      apiKey: apiKey || undefined,
      model: model || DEFAULT_MODELS[type],
      baseUrl: type === 'ollama' ? baseUrl : undefined,
      systemPrompt: systemPrompt.trim() || undefined,
    });
    onClose();
  };

  const selectedOption = PROVIDER_OPTIONS.find((o) => o.value === type);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">AI Provider</label>
            <select
              className="form-select"
              value={type}
              onChange={(e) => {
                const newType = e.target.value as ProviderType;
                setType(newType);
                setModel(DEFAULT_MODELS[newType]);
              }}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {selectedOption && (
              <span className="form-hint">{selectedOption.hint}</span>
            )}
          </div>

          {(type === 'gemini' || type === 'openrouter') && (
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={type === 'gemini' ? 'AIza...' : 'sk-or-...'}
              />
            </div>
          )}

          {type !== 'mock' && (
            <div className="form-group">
              <label className="form-label">Model</label>
              {MODEL_OPTIONS[type] ? (
                <select
                  className="form-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {MODEL_OPTIONS[type]!.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={DEFAULT_MODELS[type]}
                />
              )}
              {type === 'ollama' && (
                <span className="form-hint">e.g. llama3.2, mistral, gemma2</span>
              )}
            </div>
          )}

          {type === 'ollama' && (
            <div className="form-group">
              <label className="form-label">Ollama Base URL</label>
              <input
                className="form-input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">System Prompt</label>
            <textarea
              className="form-textarea"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Optional instructions that get prepended to every conversation…"
              rows={4}
            />
            <span className="form-hint">This text is sent as the first message in every chat to guide the AI's behavior.</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
