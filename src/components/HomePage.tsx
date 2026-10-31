import { useTreeStore } from '../store/useTreeStore';
import {
  FolderTree,
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Clock,
  Sun,
  Moon,
  Settings,
} from 'lucide-react';
import { cn } from 'cn';

interface HomePageProps {
  onOpenSettings: () => void;
}

export function HomePage({ onOpenSettings }: HomePageProps) {
  const projects = useTreeStore((s) => s.projects);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const createProject = useTreeStore((s) => s.createProject);
  const renameProject = useTreeStore((s) => s.renameProject);
  const deleteProject = useTreeStore((s) => s.deleteProject);
  const darkMode = useTreeStore((s) => s.darkMode);
  const toggleDarkMode = useTreeStore((s) => s.toggleDarkMode);

  const handleProjectClick = async (projectId: string) => {
    await setActiveProject(projectId);
    // Auto-select a node so chat+canvas load
    const loaded = useTreeStore.getState().projects.find((p) => p.id === projectId);
    if (loaded) {
      const nodeId = loaded.activeNodeId || Object.keys(loaded.nodes || {})[0];
      if (nodeId) setActiveNode(nodeId);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Minimal top-right actions */}
      <div className="flex items-center justify-end gap-1 px-4 py-3">
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={toggleDarkMode}
          title={darkMode ? 'Light Mode' : 'Dark Mode'}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Main content — vertically centered */}
      <div className="flex-1 flex items-start justify-center overflow-y-auto px-4 pt-[12vh]">
        <div className="w-full max-w-md">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/8 text-primary mb-5">
              <FolderTree size={24} strokeWidth={1.5} />
            </div>
            <h1
              className="text-2xl font-bold text-foreground tracking-tight mb-2"
              style={{ fontFamily: "'Google Sans', sans-serif" }}
            >
              Branch Chat
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Explore ideas through branching conversations.
              Every response can fork into a new direction.
            </p>
          </div>

          {/* Project cards */}
          {projects.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Your Projects
                </h2>
                <span className="text-[0.6875rem] text-muted-foreground/50">
                  {projects.length} project{projects.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "group flex items-center justify-between gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150",
                      "hover:bg-accent/60 bg-card/50"
                    )}
                    onClick={() => handleProjectClick(p.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                        <MessageSquare size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {p.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground/60 mt-0.5">
                          <Clock size={10} />
                          <span>
                            {p.createdAt
                              ? new Date(p.createdAt).toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })
                              : 'Recently'}
                          </span>
                          {Object.keys(p.nodes || {}).length > 0 && (
                            <>
                              <span>·</span>
                              <span>{Object.keys(p.nodes).length} nodes</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const name = prompt('Rename project:', p.name);
                          if (name?.trim()) renameProject(p.id, name.trim());
                        }}
                        title="Rename"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${p.name}"?`)) deleteProject(p.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New project button */}
          <div className="flex flex-col items-center">
            <button
              className={cn(
                "flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-200",
                "border border-dashed border-border/80 hover:border-primary/40",
                "text-sm font-medium text-muted-foreground hover:text-primary",
                "hover:bg-primary/5"
              )}
              onClick={async () => {
                const name = `Project ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
                await createProject(name);
              }}
            >
              <Plus size={15} />
              New Project
            </button>

            <p className="text-[0.6875rem] text-muted-foreground/40 mt-4">
              <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/60 font-mono text-[0.625rem]">⌘N</kbd>
              {' '}to create a new project
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
