const API_BASE = '/api';

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const db = {
  // Projects
  listProjects: () => fetchJson('/projects'),

  getProject: (id: string) => fetchJson(`/projects/${id}`),

  createProject: (id: string, name: string) =>
    fetchJson('/projects', {
      method: 'POST',
      body: JSON.stringify({ id, name }),
    }),

  renameProject: (id: string, name: string) =>
    fetchJson(`/projects/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  setActiveNode: (projectId: string, nodeId: string | null) =>
    fetchJson(`/projects/${projectId}/active-node`, {
      method: 'PATCH',
      body: JSON.stringify({ nodeId }),
    }),

  deleteProject: (id: string) =>
    fetchJson(`/projects/${id}`, { method: 'DELETE' }),

  // Nodes
  createNode: (projectId: string, id: string, label: string, prompt: string, parentId: string | null) =>
    fetchJson(`/projects/${projectId}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ id, label, prompt, parentId }),
    }),

  updateNodeResponse: (nodeId: string, response: string, status: string) =>
    fetchJson(`/nodes/${nodeId}/response`, {
      method: 'PATCH',
      body: JSON.stringify({ response, status }),
    }),

  updateNodeLabel: (nodeId: string, label: string) =>
    fetchJson(`/nodes/${nodeId}/label`, {
      method: 'PATCH',
      body: JSON.stringify({ label }),
    }),

  updateNodeStatus: (nodeId: string, status: string) =>
    fetchJson(`/nodes/${nodeId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteNode: (projectId: string, nodeId: string) =>
    fetchJson(`/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' }),

  compressBranch: (projectId: string, nodeId: string, summary: string) =>
    fetchJson(`/projects/${projectId}/nodes/${nodeId}/compress`, {
      method: 'POST',
      body: JSON.stringify({ summary }),
    }),

  // Bookmarks
  toggleBookmark: (nodeId: string) =>
    fetchJson(`/nodes/${nodeId}/bookmark`, { method: 'PATCH' }),

  // Search
  searchNodes: (projectId: string, query: string) =>
    fetchJson(`/projects/${projectId}/search?q=${encodeURIComponent(query)}`),

  // Export / Import
  exportProject: (id: string) =>
    fetchJson(`/projects/${id}/export`),

  importProject: (data: any) =>
    fetchJson('/projects/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  health: () => fetchJson('/health'),
};
