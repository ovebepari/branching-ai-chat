import { useEffect, useState, useCallback, useRef } from 'react';
import { useTreeStore } from './store/useTreeStore';
import { TopBar } from './components/TopBar';
import { TreeCanvas } from './components/TreeCanvas';
import { ChatPane } from './components/ChatPane';
import { SettingsModal } from './components/SettingsModal';
import { NodeSearch } from './components/NodeSearch';
import { ResizeHandle } from './components/ResizeHandle';
import { GitFork, Plus } from 'lucide-react';

const LAYOUT_STORAGE_KEY = 'dfs-chat-layout';

interface LayoutSizes {
  chatWidth: number;
}

function loadLayout(): LayoutSizes {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { chatWidth: parsed.chatWidth || Math.round(window.innerWidth * 0.45) };
    }
  } catch {}
  return { chatWidth: Math.round(window.innerWidth * 0.45) };
}

function saveLayout(layout: LayoutSizes) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

export default function App() {
  const activeProjectId = useTreeStore((s) => s.activeProjectId);
  const loadProjects = useTreeStore((s) => s.loadProjects);
  const createProject = useTreeStore((s) => s.createProject);
  const serverOnline = useTreeStore((s) => s.serverOnline);
  const toggleDarkMode = useTreeStore((s) => s.toggleDarkMode);
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const projects = useTreeStore((s) => s.projects);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);
  const getActiveProject = useTreeStore((s) => s.getActiveProject);

  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [layout, setLayout] = useState<LayoutSizes>(loadLayout);

  const chatRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutSizes>(layout);
  layoutRef.current = layout;

  // Track whether we've restored from URL to avoid double-load
  const restoredRef = useRef(false);
  // Capture URL params once at init (before any effects clear them)
  const initUrlParams = useRef(new URLSearchParams(window.location.search));

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // After projects load, restore active project + node from URL
  useEffect(() => {
    if (restoredRef.current || projects.length === 0) return;
    restoredRef.current = true;

    const urlProjectId = initUrlParams.current.get('project_id');
    const urlNodeId = initUrlParams.current.get('node_id');

    if (urlProjectId && projects.some((p) => p.id === urlProjectId)) {
      setActiveProject(urlProjectId);

      // Wait for nodes to load, then restore node
      if (urlNodeId) {
        const unsub = useTreeStore.subscribe((state) => {
          const proj = state.projects.find((p) => p.id === urlProjectId);
          if (proj && Object.keys(proj.nodes).length > 0) {
            unsub();
            if (proj.nodes[urlNodeId]) {
              // Use setTimeout to avoid calling setState during subscribe
              setTimeout(() => setActiveNode(urlNodeId), 0);
            }
          }
        });
        // Safety: unsubscribe after 10s
        setTimeout(() => unsub(), 10000);
      }
    }
  }, [projects, setActiveProject, setActiveNode]);

  // Sync activeProjectId + activeNodeId → URL (skip until restore is done)
  const activeNodeId = getActiveProject()?.activeNodeId;
  useEffect(() => {
    if (!restoredRef.current) return;

    const params = new URLSearchParams();
    if (activeProjectId) {
      params.set('project_id', activeProjectId);
    }
    if (activeNodeId) {
      params.set('node_id', activeNodeId);
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [activeProjectId, activeNodeId]);

  const handleNewProject = useCallback(async () => {
    const name = `Project ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    await createProject(name);
  }, [createProject]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'n') {
        e.preventDefault();
        handleNewProject();
      }
      if (meta && e.key === 'd') {
        e.preventDefault();
        toggleDarkMode();
      }
      if (meta && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      if (meta && e.key === 'k') {
        e.preventDefault();
        setShowSearch((s) => !s);
      }
      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else {
          setActiveNode(null);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNewProject, toggleDarkMode, setActiveNode, showSettings, showSearch]);

  // Chat resize
  const handleChatResize = useCallback((delta: number) => {
    const el = chatRef.current;
    if (!el) return;
    const cur = parseFloat(el.style.width) || layoutRef.current.chatWidth;
    const maxChat = Math.round(window.innerWidth * 0.85);
    const next = Math.max(280, Math.min(maxChat, cur + delta));
    el.style.width = `${next}px`;
  }, []);

  const handleResizeEnd = useCallback(() => {
    const chatW = chatRef.current ? parseFloat(chatRef.current.style.width) || layoutRef.current.chatWidth : layoutRef.current.chatWidth;
    const next = { chatWidth: chatW };
    setLayout(next);
    saveLayout(next);
  }, []);

  const handleChatReset = useCallback(() => {
    const chatWidth = Math.round(window.innerWidth * 0.45);
    if (chatRef.current) chatRef.current.style.width = `${chatWidth}px`;
    const next = { chatWidth };
    setLayout(next);
    saveLayout(next);
  }, []);

  return (
    <div className="app-layout">
      <div className="app-body">
        {activeProjectId ? (
          <>
            <div
              ref={chatRef}
              className="chat-pane-wrapper"
              style={{ width: layout.chatWidth }}
            >
              <ChatPane />
            </div>

            <ResizeHandle
              direction="vertical"
              onResize={handleChatResize}
              onResizeEnd={handleResizeEnd}
              onDoubleClick={handleChatReset}
            />

            <div className="canvas-wrapper">
              <TopBar
                onOpenSettings={() => setShowSettings(true)}
                onNewProject={handleNewProject}
              />
              <TreeCanvas />
            </div>
          </>
        ) : (
          <div className="no-project">
            <div className="no-project-icon">
              <GitFork size={36} />
            </div>
            <h2>Branch Chat</h2>
            <p>
              Create a new project to start branching conversations.
              Each message becomes a node in a visual tree — fork any point
              to explore different directions.
            </p>
            {!serverOnline && (
              <p style={{ color: 'var(--accent-danger)', fontSize: 'var(--text-sm)' }}>
                ⚠ Backend server is offline. Run <code>npm run server</code> to start it.
              </p>
            )}
            <button className="no-project-btn" onClick={handleNewProject}>
              <Plus size={18} />
              New Project
            </button>

            {projects.length > 0 && (
              <div className="no-project-list">
                <div className="no-project-list-title">Existing Projects</div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="no-project-list-item"
                    onClick={() => setActiveProject(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showSearch && activeProjectId && (
        <NodeSearch onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}
