import { useEffect, useState, useCallback, useRef } from 'react';
import { useTreeStore } from './store/useTreeStore';
import { TopBar } from './components/TopBar';
import { TreeCanvas } from './components/TreeCanvas';
import { ChatPane } from './components/ChatPane';
import { HomePage } from './components/HomePage';
import { SettingsModal } from './components/SettingsModal';
import { NodeSearch } from './components/NodeSearch';
import { ResizeHandle } from './components/ResizeHandle';

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
  const toggleDarkMode = useTreeStore((s) => s.toggleDarkMode);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);
  const getActiveProject = useTreeStore((s) => s.getActiveProject);

  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [layout, setLayout] = useState<LayoutSizes>(loadLayout);

  const chatRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutSizes>(layout);
  layoutRef.current = layout;

  // Capture URL params once at init
  const initUrlParams = useRef(new URLSearchParams(window.location.search));
  const [restored, setRestored] = useState(false);

  // Load projects on mount — pass URL project_id for atomic restore
  useEffect(() => {
    const urlProjectId = initUrlParams.current.get('project_id');
    loadProjects(urlProjectId || undefined).then(() => {
      setRestored(true);
    });
  }, [loadProjects]);

  // Sync activeProjectId + activeNodeId → URL (skip until restore is done)
  const activeNodeId = getActiveProject()?.activeNodeId;
  useEffect(() => {
    if (!restored) return;

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
  }, [activeProjectId, activeNodeId, restored]);

  const handleNewProject = useCallback(async () => {
    const name = `Project ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    await createProject(name);
  }, [createProject]);

  // Go home: clear active project
  const goHome = useCallback(() => {
    setActiveProject(null);
  }, [setActiveProject]);

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
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNewProject, toggleDarkMode, showSettings, showSearch]);

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

  // STATE: no activeProjectId → homepage, activeProjectId → chat + canvas
  const isHome = !activeProjectId;

  return (
    <div className="app-layout">
      {isHome ? (
        /* Homepage: full screen, no chat, no canvas */
        <HomePage onOpenSettings={() => setShowSettings(true)} />
      ) : (
        /* Project view: chat pane + canvas pane (TopBar inside canvas) */
        <div className="app-body">
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
