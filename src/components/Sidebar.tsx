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
  const renameInputRef = useRef<HTMLInputElement>(null);

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
          {!sidebarCollapsed && <span>DFS Chat</span>}
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
                New Project
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
            <div className="sidebar-status">
              <span className={`status-dot ${statusClass}`} />
              <span>{statusLabel}</span>
              {serverOnline && provider.model && provider.type !== 'mock' && (
                <span style={{ opacity: 0.6 }}>· {provider.model}</span>
              )}
            </div>
            <button className="sidebar-settings-btn" onClick={onOpenSettings}>
              <Settings size={14} />
              Settings
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
