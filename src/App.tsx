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
  return { sidebarWidth: 260, chatWidth: 440 };
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
  const [resizing, setResizing] = useState<'sidebar' | 'chat' | null>(null);

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

  // Sidebar resize
  const handleSidebarResize = useCallback((delta: number) => {
    setResizing('sidebar');
    setLayout((prev) => ({
      ...prev,
      sidebarWidth: Math.max(180, Math.min(500, prev.sidebarWidth + delta)),
    }));
  }, []);

  // Chat resize (drag left = wider chat, so negate delta)
  const handleChatResize = useCallback((delta: number) => {
    setResizing('chat');
    setLayout((prev) => ({
      ...prev,
      chatWidth: Math.max(280, Math.min(800, prev.chatWidth - delta)),
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
    setLayout((prev) => {
      saveLayout(prev);
      return prev;
    });
  }, []);

  // Double-click on handle resets to default
  const handleSidebarReset = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, sidebarWidth: 260 };
      saveLayout(next);
      return next;
    });
  }, []);

  const handleChatReset = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, chatWidth: 440 };
      saveLayout(next);
      return next;
    });
  }, []);

  const sidebarStyle = sidebarCollapsed
    ? undefined
    : { width: layout.sidebarWidth };

  return (
    <div className="app-layout">
      <div
        className={`sidebar-wrapper`}
        style={sidebarStyle}
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
            className={`chat-pane-wrapper ${resizing === 'chat' ? 'resizing' : ''}`}
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
            <h2>DFS Chat UI</h2>
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
