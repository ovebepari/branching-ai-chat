import { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTreeStore } from '../store/useTreeStore';
import {
  GitBranchPlus,
  Eye,
  Trash2,
  Download,
  Copy,
  Check,
  Star,
  Pencil,
} from 'lucide-react';

interface ContextMenuState {
  x: number;
  y: number;
}

export const CustomTreeNode = memo(({ data, id }: NodeProps) => {
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const toggleBookmark = useTreeStore((s) => s.toggleBookmark);
  const setNodeLabel = useTreeStore((s) => s.setNodeLabel);
  const getAncestorChain = useTreeStore((s) => s.getAncestorChain);
  const getActiveProject = useTreeStore((s) => s.getActiveProject);
  const { status, label, isActive, parentId, bookmarked, createdAt } = data as any;

  const timeLabel = createdAt ? new Date(createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copied, setCopied] = useState(false);

  const statusClass = status || 'idle';

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleBranch = useCallback(() => {
    setActiveNode(id);
    setContextMenu(null);
    // Signal ChatPane to focus the input for branching
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('branch-from-node', { detail: { nodeId: id } }));
    }, 50);
  }, [id, setActiveNode]);

  const handleView = useCallback(() => {
    setActiveNode(id);
    setContextMenu(null);
  }, [id, setActiveNode]);

  const handleDelete = useCallback(() => {
    deleteNode(id);
    setContextMenu(null);
  }, [id, deleteNode]);

  const handleToggleBookmark = useCallback(() => {
    toggleBookmark(id);
    setContextMenu(null);
  }, [id, toggleBookmark]);

  const handleCopyResponse = useCallback(() => {
    const project = getActiveProject();
    const node = project?.nodes[id];
    if (node?.response) {
      navigator.clipboard.writeText(node.response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setContextMenu(null);
  }, [id, getActiveProject]);

  const handleEditLabel = useCallback(() => {
    const project = getActiveProject();
    const node = project?.nodes[id];
    const newLabel = prompt('Edit label:', node?.label || '');
    if (newLabel !== null && newLabel.trim()) {
      setNodeLabel(id, newLabel.trim());
    }
    setContextMenu(null);
  }, [id, getActiveProject, setNodeLabel]);

  const handleExportBranch = useCallback(() => {
    const chain = getAncestorChain(id);
    const project = getActiveProject();
    const projectName = project?.name || 'Untitled';
    const lines: string[] = [
      `# ${projectName} — Branch Export`,
      `> ${chain.length} nodes · ${new Date().toLocaleString()}`,
      '',
    ];
    for (const node of chain) {
      lines.push(`## 🧑 User\n\n${node.prompt}\n`);
      if (node.response) {
        lines.push(`## 🤖 AI\n\n${node.response}\n`);
      }
      lines.push('---\n');
    }
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_branch.md`;
    a.click();
    URL.revokeObjectURL(url);
    setContextMenu(null);
  }, [id, getAncestorChain, getActiveProject]);

  return (
    <>
      <div
        className={`tree-node ${isActive ? 'selected' : ''} ${statusClass} ${bookmarked ? 'bookmarked' : ''}`}
        onContextMenu={handleContextMenu}
      >
        <Handle type="target" position={Position.Top} />

        {/* Bookmark star */}
        {bookmarked && (
          <div className="tree-node-bookmark" title="Bookmarked">
            <Star size={10} fill="currentColor" />
          </div>
        )}

        {/* Hover action menu */}
        <div className="tree-node-actions">
          <button
            className="tree-node-action-btn"
            title="View"
            onClick={(e) => { e.stopPropagation(); handleView(); }}
          >
            <Eye size={12} /> View
          </button>
          <button
            className="tree-node-action-btn"
            title={copied ? 'Copied!' : 'Copy response'}
            onClick={(e) => { e.stopPropagation(); handleCopyResponse(); }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            className="tree-node-action-btn"
            title="Edit label"
            onClick={(e) => { e.stopPropagation(); handleEditLabel(); }}
          >
            <Pencil size={12} />
          </button>
          <button
            className={`tree-node-action-btn ${bookmarked ? 'active' : ''}`}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            onClick={(e) => { e.stopPropagation(); handleToggleBookmark(); }}
          >
            <Star size={12} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
          {parentId && (
            <button
              className="tree-node-action-btn danger"
              title="Prune"
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        <div className="tree-node-label">{label}</div>
        <div className="tree-node-meta">
          <span className="tree-node-status">
            <span className={`tree-node-status-dot ${statusClass}`} />
            {statusClass === 'streaming' ? 'Streaming…' :
             statusClass === 'complete' ? 'Done' :
             statusClass === 'error' ? 'Error' : 'Pending'}
          </span>
          {timeLabel && <span className="tree-node-time">{timeLabel}</span>}
        </div>

        <Handle type="source" position={Position.Bottom} />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleBranch}>
            <GitBranchPlus size={14} /> Branch from here
          </button>
          <button className="context-menu-item" onClick={handleView}>
            <Eye size={14} /> View thread
          </button>
          <button className="context-menu-item" onClick={handleToggleBookmark}>
            <Star size={14} fill={bookmarked ? 'currentColor' : 'none'} />
            {bookmarked ? 'Remove bookmark' : 'Bookmark node'}
          </button>
          <button className="context-menu-item" onClick={handleCopyResponse}>
            <Copy size={14} /> Copy response
          </button>
          <button className="context-menu-item" onClick={handleExportBranch}>
            <Download size={14} /> Export branch
          </button>
          {parentId && (
            <>
              <div className="context-menu-separator" />
              <button className="context-menu-item danger" onClick={handleDelete}>
                <Trash2 size={14} /> Prune branch
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
});

CustomTreeNode.displayName = 'CustomTreeNode';
