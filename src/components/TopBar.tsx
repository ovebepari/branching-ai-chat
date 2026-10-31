import { useState, memo } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { db } from '../services/db';
import {
  FolderTree,
  Settings,
  Sun,
  Moon,
  Download,
  Upload,
  Circle,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';

interface TopBarProps {
  onOpenSettings: () => void;
  onNewProject: () => void;
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground transition-colors",
          "hover:text-foreground hover:bg-accent",
          disabled && "opacity-50 pointer-events-none"
        )}
        onClick={onClick}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{title}</TooltipContent>
    </Tooltip>
  );
}

export const TopBar = memo(function TopBar({ onOpenSettings, onNewProject }: TopBarProps) {
  const projects = useTreeStore((s) => s.projects);
  const activeProjectId = useTreeStore((s) => s.activeProjectId);
  const importProject = useTreeStore((s) => s.importProject);
  const provider = useTreeStore((s) => s.provider);
  const serverOnline = useTreeStore((s) => s.serverOnline);
  const darkMode = useTreeStore((s) => s.darkMode);
  const toggleDarkMode = useTreeStore((s) => s.toggleDarkMode);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <TooltipProvider delay={300}>
      <div className="flex items-center justify-between h-12 px-3 border-b border-border/60 bg-background/80 backdrop-blur-sm">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            onClick={() => setActiveProject(null)}
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary">
              <FolderTree size={13} strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Branch Chat
            </span>
          </button>

          {activeProject && (
            <>
              <span className="text-muted-foreground/30 text-sm">/</span>
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {activeProject.name}
              </span>
            </>
          )}
        </div>

        {/* Right: Status + Actions */}
        <div className="flex items-center gap-1">
          {/* Status indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 mr-1">
            <Circle
              size={6}
              fill={serverOnline ? '#22c55e' : '#ef4444'}
              stroke="none"
            />
            <span className="text-[0.6875rem] text-muted-foreground font-medium">
              {serverOnline ? 'Online' : 'Offline'}
            </span>
            {serverOnline && provider.model && provider.type !== 'mock' && (
              <>
                <span className="text-muted-foreground/30 text-[0.6875rem]">·</span>
                <span className="text-[0.6875rem] text-muted-foreground/70 max-w-[120px] truncate">
                  {provider.model}
                </span>
              </>
            )}
          </div>

          <Separator orientation="vertical" className="h-4 mx-0.5" />

          <IconButton
            title="Export"
            disabled={!activeProjectId}
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
          >
            <Download size={14} />
          </IconButton>

          <IconButton
            title="Import"
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
          >
            <Upload size={14} />
          </IconButton>

          <IconButton
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
            onClick={toggleDarkMode}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </IconButton>

          <IconButton title="Settings" onClick={onOpenSettings}>
            <Settings size={14} />
          </IconButton>
        </div>
      </div>
    </TooltipProvider>
  );
});
