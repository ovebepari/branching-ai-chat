import { useEffect, useState, useCallback, useRef } from 'react';
import { useTreeStore } from './store/useTreeStore';
import { Sidebar } from './components/Sidebar';
import { TreeCanvas } from './components/TreeCanvas';
import { ChatPane } from './components/ChatPane';
import { SettingsModal } from './components/SettingsModal';
import { NodeSearch } from './components/NodeSearch';
import { ResizeHandle } from './components/ResizeHandle';
import { GitFork, Plus } from 'lucide-react';

const LAYOUT_STORAGE_KEY = 'dfs-chat-layout';

interface LayoutSizes {
  sidebarWidth: number;
  chatWidth: number;
}

function loadLayout(): LayoutSizes {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const sidebarWidth = 260;
  const chatWidth = Math.round((window.innerWidth - sidebarWidth) * 0.7);
  return { sidebarWidth, chatWidth };
}

function saveLayout(layout: LayoutSizes) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

export default function App() {
  const {
    activeProjectId,
    sidebarCollapsed,
    loadProjects,
    createProject,
    serverOnline,
    toggleDarkMode,
    setActiveNode,
  } = useTreeStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [layout, setLayout] = useState<LayoutSizes>(loadLayout);

  // Refs for direct DOM manipulation during drag (no React re-renders)
  const sidebarRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutSizes>(layout);
  layoutRef.current = layout;

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
      // Cmd/Ctrl+K → Node search
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

  // Sidebar resize — direct DOM manipulation, commit on end
  const handleSidebarResize = useCallback((delta: number) => {
    const el = sidebarRef.current;
    if (!el) return;
    const cur = parseFloat(el.style.width) || layoutRef.current.sidebarWidth;
    const next = Math.max(180, Math.min(500, cur + delta));
    el.style.width = `${next}px`;
  }, []);

  const handleChatResize = useCallback((delta: number) => {
    const el = chatRef.current;
    if (!el) return;
    const cur = parseFloat(el.style.width) || layoutRef.current.chatWidth;
    const maxChat = Math.round(window.innerWidth * 0.85);
    const next = Math.max(280, Math.min(maxChat, cur - delta));
    el.style.width = `${next}px`;
  }, []);

  const handleResizeEnd = useCallback(() => {
    const sidebarW = sidebarRef.current ? parseFloat(sidebarRef.current.style.width) || layoutRef.current.sidebarWidth : layoutRef.current.sidebarWidth;
    const chatW = chatRef.current ? parseFloat(chatRef.current.style.width) || layoutRef.current.chatWidth : layoutRef.current.chatWidth;
    const next = { sidebarWidth: sidebarW, chatWidth: chatW };
    setLayout(next);
    saveLayout(next);
  }, []);

  const handleSidebarReset = useCallback(() => {
    if (sidebarRef.current) sidebarRef.current.style.width = '260px';
    const next = { ...layoutRef.current, sidebarWidth: 260 };
    setLayout(next);
    saveLayout(next);
  }, []);

  const handleChatReset = useCallback(() => {
    const chatWidth = Math.round((window.innerWidth - 260) * 0.7);
    if (chatRef.current) chatRef.current.style.width = `${chatWidth}px`;
    const next = { ...layoutRef.current, chatWidth };
    setLayout(next);
    saveLayout(next);
  }, []);

  return (
    <div className="app-layout">
      <div
        ref={sidebarRef}
        className="sidebar-wrapper"
        style={sidebarCollapsed ? undefined : { width: layout.sidebarWidth }}
      >
        <Sidebar
          onOpenSettings={() => setShowSettings(true)}
          onNewProject={handleNewProject}
        />
      </div>

      {/* Sidebar resize handle */}
      {!sidebarCollapsed && (
        <ResizeHandle
          direction="vertical"
          onResize={handleSidebarResize}
          onResizeEnd={handleResizeEnd}
          onDoubleClick={handleSidebarReset}
        />
      )}

      {activeProjectId ? (
        <div className="main-content">
          <TreeCanvas />

          {/* Chat resize handle */}
          <ResizeHandle
            direction="vertical"
            onResize={handleChatResize}
            onResizeEnd={handleResizeEnd}
            onDoubleClick={handleChatReset}
          />

          <div
            ref={chatRef}
            className="chat-pane-wrapper"
            style={{ width: layout.chatWidth }}
          >
            <ChatPane />
          </div>
        </div>
      ) : (
        <div className="main-content">
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
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showSearch && activeProjectId && (
        <NodeSearch onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}
