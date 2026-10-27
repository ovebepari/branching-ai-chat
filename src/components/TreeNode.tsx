import { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeToolbar, type NodeProps } from '@xyflow/react';
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
  MessageSquare,
  Zap,
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
  const { status, label, isActive, parentId, bookmarked, createdAt, children: childIds, response } = data as any;

  const timeLabel = createdAt ? new Date(createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const statusClass = status || 'idle';
  const childCount = (childIds || []).length;

  // Truncated preview of the response (first ~60 chars)
  const responsePreview = response
    ? response.replace(/[#*_`>\n]/g, '').trim().slice(0, 80) + (response.length > 80 ? '…' : '')
    : '';

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
      {/* NodeToolbar — React Flow's built-in positioned toolbar */}
      <NodeToolbar
        isVisible={isHovered || isActive}
        position={Position.Top}
        offset={8}
        className="tree-node-toolbar"
      >
        <button
          className="tree-node-action-btn"
          title="Branch"
          onClick={(e) => { e.stopPropagation(); handleBranch(); }}
        >
          <GitBranchPlus size={13} />
        </button>
        <button
          className="tree-node-action-btn"
          title="View"
          onClick={(e) => { e.stopPropagation(); handleView(); }}
        >
          <Eye size={13} />
        </button>
        <button
          className="tree-node-action-btn"
          title={copied ? 'Copied!' : 'Copy response'}
          onClick={(e) => { e.stopPropagation(); handleCopyResponse(); }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          className="tree-node-action-btn"
          title="Edit label"
          onClick={(e) => { e.stopPropagation(); handleEditLabel(); }}
        >
          <Pencil size={13} />
        </button>
        <button
          className={`tree-node-action-btn ${bookmarked ? 'active' : ''}`}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          onClick={(e) => { e.stopPropagation(); handleToggleBookmark(); }}
        >
          <Star size={13} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
        {parentId && (
          <button
            className="tree-node-action-btn danger"
            title="Prune"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </NodeToolbar>

      <div
        className={`tree-node ${isActive ? 'selected' : ''} ${statusClass} ${bookmarked ? 'bookmarked' : ''}`}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Handle type="target" position={Position.Top} className="tree-node-handle" />

        {/* Bookmark badge */}
        {bookmarked && (
          <div className="tree-node-bookmark" title="Bookmarked">
            <Star size={10} fill="currentColor" />
          </div>
        )}

        {/* Streaming progress bar */}
        {statusClass === 'streaming' && (
          <div className="tree-node-progress">
            <div className="tree-node-progress-bar" />
          </div>
        )}

        {/* Node content */}
        <div className="tree-node-content">
          <div className="tree-node-label">{label}</div>

          {/* Response preview snippet */}
          {responsePreview && statusClass !== 'streaming' && (
            <div className="tree-node-preview">{responsePreview}</div>
          )}

          {statusClass === 'streaming' && (
            <div className="tree-node-preview streaming-text">
              <Zap size={10} /> Generating response…
            </div>
          )}
        </div>

        {/* Footer: status + meta */}
        <div className="tree-node-footer">
          <div className="tree-node-meta">
            <span className="tree-node-status">
              <span className={`tree-node-status-dot ${statusClass}`} />
              {statusClass === 'streaming' ? 'Streaming…' :
               statusClass === 'complete' ? 'Done' :
               statusClass === 'error' ? 'Error' : 'Pending'}
            </span>
            {timeLabel && <span className="tree-node-time">{timeLabel}</span>}
          </div>

          {/* Badges */}
          <div className="tree-node-badges">
            {childCount > 0 && (
              <span className="tree-node-badge" title={`${childCount} branch${childCount > 1 ? 'es' : ''}`}>
                <GitBranchPlus size={10} /> {childCount}
              </span>
            )}
            {response && (
              <span className="tree-node-badge" title="Has response">
                <MessageSquare size={10} />
              </span>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="tree-node-handle" />
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
