import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { db } from '../services/db';
import {
  FolderTree,
  Plus,
  Trash2,
  Settings,
  Pencil,
  Check,
  X,
  Sun,
  Moon,
  Download,
  Upload,
  ChevronDown,
  Search,
  Circle,
} from 'lucide-react';

interface TopBarProps {
  onOpenSettings: () => void;
  onNewProject: () => void;
}

export const TopBar = memo(function TopBar({ onOpenSettings, onNewProject }: TopBarProps) {
  const projects = useTreeStore((s) => s.projects);
  const activeProjectId = useTreeStore((s) => s.activeProjectId);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);
  const deleteProject = useTreeStore((s) => s.deleteProject);
  const renameProject = useTreeStore((s) => s.renameProject);
  const importProject = useTreeStore((s) => s.importProject);
  const provider = useTreeStore((s) => s.provider);
  const serverOnline = useTreeStore((s) => s.serverOnline);
  const darkMode = useTreeStore((s) => s.darkMode);
  const toggleDarkMode = useTreeStore((s) => s.toggleDarkMode);

  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Close menu on outside click
  useEffect(() => {
    if (!projectMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projectMenuOpen]);

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleRenameSubmit = useCallback((id: string) => {
    if (renameValue.trim()) {
      renameProject(id, renameValue.trim());
    }
    setRenamingId(null);
  }, [renameValue, renameProject]);

  const filteredProjects = searchQuery
    ? projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : projects;

  const statusClass = serverOnline ? 'online' : 'offline';
  const statusLabel = serverOnline ? 'Online' : 'Offline';

  return (
    <div className="topbar">
      {/* Left: Logo + Project selector */}
      <div className="topbar-left">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">
            <FolderTree size={14} strokeWidth={2.5} />
          </div>
          <span>Branch Chat</span>
        </div>

        {/* Project dropdown */}
        <div className="topbar-project-selector" ref={menuRef}>
          <button
            className="topbar-project-btn"
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
          >
            <span className="topbar-project-name">
              {activeProject?.name || 'Select project'}
            </span>
            <ChevronDown size={14} strokeWidth={2.5} />
          </button>

          {projectMenuOpen && (
            <div className="topbar-project-menu">
              <div className="topbar-menu-search">
                <Search size={13} strokeWidth={2.5} />
                <input
                  type="text"
                  placeholder="Search projects…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="topbar-menu-list">
                {filteredProjects.map((p) => (
                  <div
                    key={p.id}
                    className={`topbar-menu-item ${p.id === activeProjectId ? 'active' : ''}`}
                  >
                    {renamingId === p.id ? (
                      <div className="topbar-rename-row">
                        <input
                          ref={renameInputRef}
                          className="topbar-rename-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit(p.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={() => handleRenameSubmit(p.id)}
                        />
                      </div>
                    ) : (
                      <>
                        <span
                          className="topbar-menu-item-name"
                          onClick={() => {
                            setActiveProject(p.id);
                            setProjectMenuOpen(false);
                            setSearchQuery('');
                          }}
                        >
                          {p.name}
                        </span>
                        <div className="topbar-menu-item-actions">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(p.id);
                              setRenameValue(p.name);
                            }}
                            title="Rename"
                          >
                            <Pencil size={11} strokeWidth={2.5} />
                          </button>
                          <button
                            className="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete "${p.name}"?`)) {
                                deleteProject(p.id);
                              }
                            }}
                            title="Delete"
                          >
                            <Trash2 size={11} strokeWidth={2.5} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {filteredProjects.length === 0 && (
                  <div className="topbar-menu-empty">No projects found</div>
                )}
              </div>
              <button className="topbar-menu-new" onClick={() => { onNewProject(); setProjectMenuOpen(false); }}>
                <Plus size={13} strokeWidth={2.5} /> New Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="topbar-right">
        <div className="topbar-status">
          <Circle size={7} fill={serverOnline ? '#22c55e' : '#ef4444'} stroke="none" />
          <span>{statusLabel}</span>
          {serverOnline && provider.model && provider.type !== 'mock' && (
            <span className="topbar-status-model">{provider.model}</span>
          )}
        </div>

        <div className="topbar-actions-divider" />

        <button
          className="topbar-action-btn"
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
          title="Export"
        >
          <Download size={15} strokeWidth={2.5} />
        </button>

        <button
          className="topbar-action-btn"
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
          title="Import"
        >
          <Upload size={15} strokeWidth={2.5} />
        </button>

        <button className="topbar-action-btn" onClick={toggleDarkMode} title={darkMode ? 'Light Mode' : 'Dark Mode'}>
          {darkMode ? <Sun size={15} strokeWidth={2.5} /> : <Moon size={15} strokeWidth={2.5} />}
        </button>

        <button className="topbar-action-btn" onClick={onOpenSettings} title="Settings">
          <Settings size={15} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
});
