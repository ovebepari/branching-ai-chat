import { memo, useState, useEffect, useCallback, useRef } from 'react';
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
  MessageSquare,
  Zap,
  MoreHorizontal,
  ImageIcon,
} from 'lucide-react';

export const CustomTreeNode = memo(({ data, id }: NodeProps) => {
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const toggleBookmark = useTreeStore((s) => s.toggleBookmark);
  const setNodeLabel = useTreeStore((s) => s.setNodeLabel);
  const getAncestorChain = useTreeStore((s) => s.getAncestorChain);
  const getActiveProject = useTreeStore((s) => s.getActiveProject);
  const { status, label, isActive, parentId, bookmarked, createdAt, children: childIds, response, tokensIn, tokensOut, images: nodeImages } = data as any;

  const timeLabel = createdAt ? new Date(createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const statusClass = status || 'idle';
  const childCount = (childIds || []).length;

  // Truncated preview of the response (first ~60 chars)
  const responsePreview = response
    ? response.replace(/[#*_`>\n]/g, '').trim().slice(0, 80) + (response.length > 80 ? '…' : '')
    : '';

  // Close menu on outside click or escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClose = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    // Use capture phase to catch clicks before React Flow swallows them
    window.addEventListener('pointerdown', handleClose, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handleClose, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleBranch = useCallback(() => {
    setActiveNode(id);
    closeMenu();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('branch-from-node', { detail: { nodeId: id } }));
    }, 50);
  }, [id, setActiveNode, closeMenu]);

  const handleView = useCallback(() => {
    setActiveNode(id);
    closeMenu();
  }, [id, setActiveNode, closeMenu]);

  const handleDelete = useCallback(() => {
    deleteNode(id);
    closeMenu();
  }, [id, deleteNode, closeMenu]);

  const handleToggleBookmark = useCallback(() => {
    toggleBookmark(id);
    closeMenu();
  }, [id, toggleBookmark, closeMenu]);

  const handleCopyResponse = useCallback(() => {
    const project = getActiveProject();
    const node = project?.nodes[id];
    if (node?.response) {
      navigator.clipboard.writeText(node.response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    closeMenu();
  }, [id, getActiveProject, closeMenu]);

  const handleEditLabel = useCallback(() => {
    const project = getActiveProject();
    const node = project?.nodes[id];
    const newLabel = prompt('Edit label:', node?.label || '');
    if (newLabel !== null && newLabel.trim()) {
      setNodeLabel(id, newLabel.trim());
    }
    closeMenu();
  }, [id, getActiveProject, setNodeLabel, closeMenu]);

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
    closeMenu();
  }, [id, getAncestorChain, getActiveProject, closeMenu]);

  return (
    <div
      className={`tree-node ${isActive ? 'selected' : ''} ${statusClass} ${bookmarked ? 'bookmarked' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); }}
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

      {/* Three-dot menu button */}
      <div className="tree-node-menu-wrapper" ref={menuRef}>
        <button
          className={`tree-node-dots-btn ${isHovered || menuOpen ? 'visible' : ''}`}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          title="Actions"
        >
          <MoreHorizontal size={14} />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="tree-node-dropdown" onClick={(e) => e.stopPropagation()}>
            <button className="tree-node-dropdown-item" onClick={handleView}>
              <Eye size={14} />
              <span>View thread</span>
            </button>
            <button className="tree-node-dropdown-item" onClick={handleBranch}>
              <GitBranchPlus size={14} />
              <span>Branch from here</span>
            </button>
            <button className="tree-node-dropdown-item" onClick={handleEditLabel}>
              <Pencil size={14} />
              <span>Edit label</span>
            </button>
            <button className="tree-node-dropdown-item" onClick={handleCopyResponse}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy response'}</span>
            </button>
            <button className="tree-node-dropdown-item" onClick={handleToggleBookmark}>
              <Star size={14} fill={bookmarked ? 'currentColor' : 'none'} />
              <span>{bookmarked ? 'Remove bookmark' : 'Bookmark'}</span>
            </button>
            <button className="tree-node-dropdown-item" onClick={handleExportBranch}>
              <Download size={14} />
              <span>Export branch</span>
            </button>
            {parentId && (
              <>
                <div className="tree-node-dropdown-sep" />
                <button className="tree-node-dropdown-item danger" onClick={handleDelete}>
                  <Trash2 size={14} />
                  <span>Prune branch</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

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
          {nodeImages && nodeImages.length > 0 && (
            <span className="tree-node-badge image-badge" title={`${nodeImages.length} image${nodeImages.length > 1 ? 's' : ''}`}>
              <ImageIcon size={10} /> {nodeImages.length}
            </span>
          )}
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

      {/* Token usage row */}
      {(tokensIn || tokensOut) ? (
        <div className="tree-node-tokens">
          <Zap size={9} />
          <span>{(tokensIn || 0).toLocaleString()} tokens in,</span>
          <span>{(tokensOut || 0).toLocaleString()} out</span>
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="tree-node-handle" />
    </div>
  );
});

CustomTreeNode.displayName = 'CustomTreeNode';
