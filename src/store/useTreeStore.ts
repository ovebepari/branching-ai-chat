import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '../services/db';
import type { TreeNode, Project, ProviderConfig } from '../types';

interface TreeStore {
  // Projects
  projects: Project[];
  activeProjectId: string | null;

  // Provider
  provider: ProviderConfig;
  setProvider: (config: ProviderConfig) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Server status
  serverOnline: boolean;

  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Project CRUD
  createProject: (name: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;

  // Node operations
  setActiveNode: (nodeId: string | null) => void;
  addNode: (prompt: string, parentId: string | null, images?: string[]) => Promise<string>;
  updateNodeResponse: (nodeId: string, response: string) => void;
  appendNodeResponse: (nodeId: string, chunk: string) => void;
  setNodeStatus: (nodeId: string, status: TreeNode['status']) => void;
  setNodeUsage: (nodeId: string, tokensIn: number, tokensOut: number) => void;
  setNodeLabel: (nodeId: string, label: string) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  compressBranch: (nodeId: string, summary: string) => Promise<void>;

  // Persist final response to DB
  persistNodeResponse: (nodeId: string) => Promise<void>;

  // Bookmarks
  toggleBookmark: (nodeId: string) => Promise<void>;

  // Import
  importProject: (data: any) => Promise<void>;

  // Helpers
  getActiveProject: () => Project | undefined;
  getNode: (nodeId: string) => TreeNode | undefined;
  getAncestorChain: (nodeId: string) => TreeNode[];
  getThreadHistory: (nodeId: string) => Array<{ role: 'user' | 'model'; text: string }>;

  // Load from DB
  loadProjects: (initialProjectId?: string) => Promise<void>;
  loadProject: (id: string) => Promise<void>;
}

const PROVIDER_STORAGE_KEY = 'dfs-chat-provider';

function loadProvider(): ProviderConfig {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { type: 'agy', model: 'gemini-3.8-flash-low' };
}

function saveProvider(config: ProviderConfig) {
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));
}

const THEME_STORAGE_KEY = 'dfs-chat-theme';

function loadDarkMode(): boolean {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved !== null) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch { return false; }
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
}

// Apply on load immediately
applyTheme(loadDarkMode());

export const useTreeStore = create<TreeStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  sidebarCollapsed: false,
  serverOnline: false,
  darkMode: loadDarkMode(),

  provider: loadProvider(),

  setProvider: (config) => {
    set({ provider: config });
    saveProvider(config);
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toggleDarkMode: () => {
    const next = !get().darkMode;
    applyTheme(next);
    set({ darkMode: next });
  },

  // ===== Projects =====

  createProject: async (name: string) => {
    const id = nanoid(10);
    try {
      await db.createProject(id, name);
      const project: Project = {
        id,
        name,
        rootNodeId: null,
        nodes: {},
        activeNodeId: null,
        createdAt: Date.now(),
      };
      set((s) => ({
        projects: [project, ...s.projects],
        activeProjectId: id,
      }));
    } catch (err) {
      console.error('Failed to create project:', err);
    }
    return id;
  },

  deleteProject: async (id: string) => {
    try {
      await db.deleteProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      }));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  },

  setActiveProject: async (id: string | null) => {
    if (!id) {
      set({ activeProjectId: null });
      return;
    }
    set({ activeProjectId: id });
    // Load full project data from DB
    await get().loadProject(id);
  },

  renameProject: async (id: string, name: string) => {
    try {
      await db.renameProject(id, name);
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
      }));
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
  },

  // ===== Nodes =====

  setActiveNode: (nodeId: string | null) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: projects.map((p) =>
        p.id === activeProjectId ? { ...p, activeNodeId: nodeId } : p
      ),
    });
    // Only persist real node selections to DB — null is just UI "go home" state
    if (nodeId) {
      db.setActiveNode(activeProjectId, nodeId).catch(() => {});
    }
  },

  addNode: async (prompt: string, parentId: string | null, images?: string[]) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return '';

    const nodeId = nanoid(10);
    const label = prompt.slice(0, 50) + (prompt.length > 50 ? '…' : '');
    const node: TreeNode = {
      id: nodeId,
      label,
      prompt,
      response: '',
      parentId,
      children: [],
      status: 'idle',
      createdAt: Date.now(),
      ...(images && images.length > 0 ? { images } : {}),
    };

    // Optimistic update
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const newNodes = { ...p.nodes, [nodeId]: node };
        if (parentId && newNodes[parentId]) {
          newNodes[parentId] = {
            ...newNodes[parentId],
            children: [...newNodes[parentId].children, nodeId],
          };
        }
        return {
          ...p,
          nodes: newNodes,
          rootNodeId: p.rootNodeId ?? nodeId,
          activeNodeId: nodeId,
        };
      }),
    });

    // Persist to DB
    try {
      await db.createNode(activeProjectId, nodeId, label, prompt, parentId, images);
    } catch (err) {
      console.error('Failed to persist node:', err);
    }

    return nodeId;
  },

  updateNodeResponse: (nodeId: string, response: string) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId || !p.nodes[nodeId]) return p;
        return {
          ...p,
          nodes: {
            ...p.nodes,
            [nodeId]: { ...p.nodes[nodeId], response, status: 'complete' },
          },
        };
      }),
    });
  },

  appendNodeResponse: (nodeId: string, chunk: string) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId || !p.nodes[nodeId]) return p;
        return {
          ...p,
          nodes: {
            ...p.nodes,
            [nodeId]: {
              ...p.nodes[nodeId],
              response: p.nodes[nodeId].response + chunk,
              status: 'streaming',
            },
          },
        };
      }),
    });
  },

  setNodeStatus: (nodeId: string, status: TreeNode['status']) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId || !p.nodes[nodeId]) return p;
        return {
          ...p,
          nodes: {
            ...p.nodes,
            [nodeId]: { ...p.nodes[nodeId], status },
          },
        };
      }),
    });
  },

  setNodeUsage: (nodeId: string, tokensIn: number, tokensOut: number) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId || !p.nodes[nodeId]) return p;
        return {
          ...p,
          nodes: {
            ...p.nodes,
            [nodeId]: { ...p.nodes[nodeId], tokensIn, tokensOut },
          },
        };
      }),
    });
    // Persist to DB
    db.updateNodeUsage(nodeId, tokensIn, tokensOut).catch(() => {});
  },

  // Persist the final accumulated response to the DB
  persistNodeResponse: async (nodeId: string) => {
    const node = get().getNode(nodeId);
    if (!node) return;
    try {
      await db.updateNodeResponse(nodeId, node.response, node.status);
    } catch (err) {
      console.error('Failed to persist response:', err);
    }
  },

  toggleBookmark: async (nodeId: string) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;

    // Optimistic update
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId || !p.nodes[nodeId]) return p;
        return {
          ...p,
          nodes: {
            ...p.nodes,
            [nodeId]: { ...p.nodes[nodeId], bookmarked: !p.nodes[nodeId].bookmarked },
          },
        };
      }),
    });

    try {
      await db.toggleBookmark(nodeId);
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  },

  importProject: async (data: any) => {
    try {
      await db.importProject(data);
      await get().loadProjects();
    } catch (err) {
      console.error('Failed to import project:', err);
    }
  },

  setNodeLabel: (nodeId: string, label: string) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId || !p.nodes[nodeId]) return p;
        return {
          ...p,
          nodes: {
            ...p.nodes,
            [nodeId]: { ...p.nodes[nodeId], label },
          },
        };
      }),
    });
    db.updateNodeLabel(nodeId, label).catch(() => {});
  },

  deleteNode: async (nodeId: string) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;

    const project = projects.find((p) => p.id === activeProjectId);
    if (!project) return;
    const node = project.nodes[nodeId];
    if (!node) return;

    // Persist to DB first
    try {
      await db.deleteNode(activeProjectId, nodeId);
    } catch (err) {
      console.error('Failed to delete node:', err);
      return;
    }

    // Optimistic update: remove node + all descendants
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const newNodes = { ...p.nodes };

        const deleteRecursive = (id: string) => {
          const n = newNodes[id];
          if (!n) return;
          n.children.forEach(deleteRecursive);
          delete newNodes[id];
        };

        if (node.parentId && newNodes[node.parentId]) {
          newNodes[node.parentId] = {
            ...newNodes[node.parentId],
            children: newNodes[node.parentId].children.filter((c) => c !== nodeId),
          };
        }
        deleteRecursive(nodeId);

        return {
          ...p,
          nodes: newNodes,
          rootNodeId: p.rootNodeId === nodeId ? null : p.rootNodeId,
          activeNodeId: p.activeNodeId === nodeId ? node.parentId ?? null : p.activeNodeId,
        };
      }),
    });
  },

  compressBranch: async (nodeId: string, summary: string) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;

    try {
      await db.compressBranch(activeProjectId, nodeId, summary);
    } catch (err) {
      console.error('Failed to compress:', err);
    }

    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const newNodes = { ...p.nodes };
        const node = newNodes[nodeId];
        if (!node) return p;

        const deleteChildren = (id: string) => {
          const n = newNodes[id];
          if (!n) return;
          n.children.forEach(deleteChildren);
          delete newNodes[id];
        };
        node.children.forEach(deleteChildren);

        newNodes[nodeId] = {
          ...node,
          children: [],
          response: summary,
          label: '📦 ' + node.label,
          status: 'complete',
        };

        return { ...p, nodes: newNodes };
      }),
    });
  },

  // ===== Helpers =====

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },

  getNode: (nodeId: string) => {
    const project = get().getActiveProject();
    return project?.nodes[nodeId];
  },

  getAncestorChain: (nodeId: string) => {
    const project = get().getActiveProject();
    if (!project) return [];
    const chain: TreeNode[] = [];
    let current: TreeNode | undefined = project.nodes[nodeId];
    while (current) {
      chain.unshift(current);
      current = current.parentId ? project.nodes[current.parentId] : undefined;
    }
    return chain;
  },

  getThreadHistory: (nodeId: string) => {
    const chain = get().getAncestorChain(nodeId);
    const history: Array<{ role: 'user' | 'model'; text: string }> = [];
    for (const node of chain) {
      if (node.prompt) history.push({ role: 'user', text: node.prompt });
      if (node.response) history.push({ role: 'model', text: node.response });
    }
    return history;
  },

  // ===== Load from DB =====

  loadProjects: async (initialProjectId?: string) => {
    try {
      await db.health();
      set({ serverOnline: true });
      const rows = await db.listProjects();
      let projects: Project[] = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        rootNodeId: r.root_node_id,
        activeNodeId: r.active_node_id,
        nodes: {},
        createdAt: r.created_at,
      }));

      // If an initial project ID is given (from URL), load its full data atomically
      if (initialProjectId && projects.some((p) => p.id === initialProjectId)) {
        try {
          const fullData = await db.getProject(initialProjectId);
          if (fullData) {
            projects = projects.map((p) =>
              p.id === initialProjectId
                ? {
                    ...p,
                    name: fullData.name,
                    rootNodeId: fullData.rootNodeId,
                    activeNodeId: fullData.activeNodeId,
                    nodes: fullData.nodes,
                  }
                : p
            );
            console.log(`[url-restore] loaded project=${initialProjectId}, activeNodeId=${fullData.activeNodeId}, nodes=${Object.keys(fullData.nodes).length}`);
            set({ projects, activeProjectId: initialProjectId });
            return;
          }
        } catch (err) {
          console.error('[url-restore] Failed to load initial project:', err);
        }
      }

      set({ projects });
    } catch {
      set({ serverOnline: false });
    }
  },

  loadProject: async (id: string) => {
    try {
      const data = await db.getProject(id);
      if (!data) return;
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id
            ? {
                ...p,
                name: data.name,
                rootNodeId: data.rootNodeId,
                activeNodeId: data.activeNodeId,
                nodes: data.nodes,
              }
            : p
        ),
      }));
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  },
}));
