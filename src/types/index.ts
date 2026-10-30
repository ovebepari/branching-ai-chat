export interface TreeNode {
  id: string;
  label: string;
  prompt: string;
  response: string;
  parentId: string | null;
  children: string[];
  status: 'idle' | 'streaming' | 'complete' | 'error';
  createdAt: number;
  bookmarked?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  images?: string[];  // data URLs for attached images
}

export interface Project {
  id: string;
  name: string;
  rootNodeId: string | null;
  nodes: Record<string, TreeNode>;
  activeNodeId: string | null;
  createdAt: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  nodeId: string;
}

export interface QueryPayload {
  activeNodeId: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  newQuery: string;
  config: {
    provider: string;
    apiKey?: string;
  };
}

export type ProviderType = 'agy' | 'gemini' | 'openrouter' | 'ollama' | 'mock';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
}
