import { useState, useRef, useEffect, useCallback } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { db } from '../services/db';
import {
  PanelLeftClose,
  PanelLeftOpen,
  FolderTree,
  Plus,
  Trash2,
  Settings,
  Pencil,
  Check,
  X,
  Search,
  Sun,
  Moon,
  Download,
  Upload,
  BarChart3,
} from 'lucide-react';

interface SidebarProps {
  onOpenSettings: () => void;
  onNewProject: () => void;
}

export function Sidebar({ onOpenSettings, onNewProject }: SidebarProps) {
  const {
    projects,
    activeProjectId,
    sidebarCollapsed,
    toggleSidebar,
    setActiveProject,
    deleteProject,
    renameProject,
    importProject,
    provider,
    serverOnline,
    darkMode,
    toggleDarkMode,
  } = useTreeStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [agyStatsData, setAgyStatsData] = useState<any>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleStatusClick = useCallback(async () => {
    if (showStats) {
      setShowStats(false);
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/agy/stats');
      const data = await res.json();
      setAgyStatsData(data);
      setShowStats(true);
    } catch {
      setAgyStatsData({ uptime: '–', totalRequests: 0, activeRequests: 0, totalRetries: 0, errors: 0, totalTokensIn: 0, totalTokensOut: 0, sessionsByProject: {} });
      setShowStats(true);
    }
  }, [showStats]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = (projectId: string, currentName: string) => {
    setRenamingId(projectId);
    setRenameValue(currentName);
  };

  const confirmRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameProject(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') cancelRename();
  };

  const filteredProjects = searchQuery.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const statusLabel = serverOnline
    ? {
        agy: 'Antigravity',
        gemini: 'Gemini API',
        openrouter: 'OpenRouter',
        ollama: 'Ollama (Local)',
        mock: 'Mock (Dev)',
      }[provider.type]
    : 'Server offline';

  const statusClass = !serverOnline ? 'offline' : provider.type === 'mock' ? 'mock' : 'online';

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <FolderTree size={14} />
          </div>
          {!sidebarCollapsed && <span>Branch Chat</span>}
        </div>
        <button className="sidebar-toggle" onClick={toggleSidebar} title="Toggle sidebar">
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {!sidebarCollapsed && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Projects</div>
          </div>

          {/* Search */}
          <div className="sidebar-search">
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
              <input
                className="sidebar-search-input"
                placeholder="Search projects…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 30 }}
              />
            </div>
          </div>

          <div className="sidebar-projects">
            <div className="sidebar-section" style={{ paddingTop: 0 }}>
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className={`project-item ${project.id === activeProjectId ? 'active' : ''}`}
                  onClick={() => {
                    if (renamingId !== project.id) setActiveProject(project.id);
                  }}
                  onDoubleClick={() => startRename(project.id, project.name)}
                >
                  <FolderTree size={14} style={{ flexShrink: 0 }} />

                  {renamingId === project.id ? (
                    <div className="project-rename-row" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={renameInputRef}
                        className="project-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={confirmRename}
                      />
                      <button className="project-rename-btn confirm" onClick={confirmRename} title="Save">
                        <Check size={12} />
                      </button>
                      <button className="project-rename-btn cancel" onClick={cancelRename} title="Cancel">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {project.name}
                      </span>
                      <div className="project-item-actions">
                        <button
                          className="project-item-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(project.id, project.name);
                          }}
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          className="project-item-action-btn danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(project.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {filteredProjects.length === 0 && searchQuery && (
                <div style={{ padding: 'var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                  No projects match "{searchQuery}"
                </div>
              )}

              <button className="new-project-btn" onClick={onNewProject}>
                <Plus size={14} />
                New Chat Session
                <span className="kbd" style={{ marginLeft: 'auto' }}>⌘N</span>
              </button>
            </div>
          </div>

          <div className="sidebar-bottom">
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <button
                className="theme-toggle-btn"
                style={{ flex: 1 }}
                onClick={async () => {
                  if (!activeProjectId) return;
                  const data = await db.exportProject(activeProjectId);
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const p = projects.find((p) => p.id === activeProjectId);
                  a.download = `${(p?.name || 'project').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!activeProjectId}
                title="Export active project as JSON"
              >
                <Download size={14} /> Export
              </button>
              <button
                className="theme-toggle-btn"
                style={{ flex: 1 }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = async (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    try {
                      const data = JSON.parse(text);
                      await importProject(data);
                    } catch {
                      alert('Invalid project JSON file');
                    }
                  };
                  input.click();
                }}
                title="Import project from JSON"
              >
                <Upload size={14} /> Import
              </button>
            </div>
            <button className="theme-toggle-btn" onClick={toggleDarkMode}>
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
              {darkMode ? 'Light Mode' : 'Dark Mode'}
              <span className="kbd" style={{ marginLeft: 'auto' }}>⌘D</span>
            </button>
            <button className="sidebar-settings-btn" onClick={onOpenSettings}>
              <Settings size={14} />
              Settings
            </button>
            <div
              className={`sidebar-status ${showStats ? 'active' : ''}`}
              onClick={handleStatusClick}
              style={{ cursor: 'pointer' }}
              title="Click for agy stats"
            >
              <span className={`status-dot ${statusClass}`} />
              <span>{statusLabel}</span>
              {serverOnline && provider.model && provider.type !== 'mock' && (
                <span style={{ opacity: 0.6 }}>· {provider.model}</span>
              )}
            </div>

            {/* Stats popover */}
            {showStats && agyStatsData && (
              <div className="sidebar-stats-panel">
                <div className="stats-panel-header">
                  <span><BarChart3 size={12} /> Agy Status</span>
                  <button className="stats-panel-close" onClick={() => setShowStats(false)}>
                    <X size={12} />
                  </button>
                </div>
                <div className="stats-panel-grid">
                  <div className="stats-item">
                    <span className="stats-label">Uptime</span>
                    <span className="stats-value">{agyStatsData.uptime}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Requests</span>
                    <span className="stats-value">{agyStatsData.totalRequests}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Active</span>
                    <span className="stats-value">{agyStatsData.activeRequests}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Retries</span>
                    <span className="stats-value">{agyStatsData.totalRetries}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Errors</span>
                    <span className="stats-value error">{agyStatsData.errors}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Tokens In</span>
                    <span className="stats-value">{(agyStatsData.totalTokensIn || 0).toLocaleString()}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Tokens Out</span>
                    <span className="stats-value">{(agyStatsData.totalTokensOut || 0).toLocaleString()}</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-label">Provider</span>
                    <span className="stats-value">{provider.type}</span>
                  </div>
                </div>

                {agyStatsData.sessionsByProject && Object.keys(agyStatsData.sessionsByProject).length > 0 && (
                  <>
                    <div className="stats-panel-divider" />
                    <div className="stats-panel-subheader">Sessions</div>
                    {Object.entries(agyStatsData.sessionsByProject).map(([pid, sess]: [string, any]) => {
                      const proj = projects.find(p => p.id === pid);
                      return (
                        <div key={pid} className="stats-session-row">
                          <span className="stats-session-name">{proj?.name || pid.slice(0, 8)}</span>
                          <span className="stats-session-meta">
                            {sess.requestCount} req · {sess.lastModel}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}

                <div className="stats-panel-divider" />
                <div className="stats-panel-footer">
                  {projects.length} projects · {Object.keys(projects.reduce((acc: any, p) => {
                    const nodes = (p as any).nodes;
                    return { ...acc, ...(typeof nodes === 'object' ? nodes : {}) };
                  }, {})).length || '–'} total nodes
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
