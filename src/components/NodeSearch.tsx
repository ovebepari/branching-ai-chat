import { useState, useEffect, useRef, useCallback } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { db } from '../services/db';
import { Search, X, Star, MessageSquare } from 'lucide-react';

interface NodeSearchProps {
  onClose: () => void;
}

interface SearchResult {
  id: string;
  label: string;
  prompt: string;
  response: string;
  bookmarked: number;
}

export function NodeSearch({ onClose }: NodeSearchProps) {
  const activeProjectId = useTreeStore((s) => s.activeProjectId);
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const getActiveProject = useTreeStore((s) => s.getActiveProject);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search debounced
  useEffect(() => {
    if (!activeProjectId) return;

    if (showBookmarksOnly && !query.trim()) {
      // Show all bookmarked nodes
      const project = getActiveProject();
      if (project) {
        const bookmarked = Object.values(project.nodes)
          .filter((n) => n.bookmarked)
          .map((n) => ({
            id: n.id,
            label: n.label,
            prompt: n.prompt,
            response: n.response,
            bookmarked: 1,
          }));
        setResults(bookmarked);
      }
      return;
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        let data = await db.searchNodes(activeProjectId, query);
        if (showBookmarksOnly) {
          data = data.filter((r: any) => r.bookmarked);
        }
        setResults(data);
        setSelectedIdx(0);
      } catch {
        setResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, activeProjectId, showBookmarksOnly]);

  const handleSelect = useCallback((nodeId: string) => {
    setActiveNode(nodeId);
    onClose();
  }, [setActiveNode, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      handleSelect(results[selectedIdx].id);
    }
  };

  const highlight = (text: string, q: string) => {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text.slice(0, 100);
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + q.length + 30);
    const before = text.slice(start, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length, end);
    return (
      <>
        {start > 0 && '…'}
        {before}
        <mark style={{ background: 'var(--accent-warning-light)', color: 'var(--text-primary)', borderRadius: '2px', padding: '0 1px' }}>{match}</mark>
        {after}
        {end < text.length && '…'}
      </>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="node-search-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="node-search-header">
          <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="node-search-input"
            placeholder={showBookmarksOnly ? 'Search bookmarked nodes…' : 'Search all nodes…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className={`node-search-filter ${showBookmarksOnly ? 'active' : ''}`}
            onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
            title="Show bookmarks only"
          >
            <Star size={14} fill={showBookmarksOnly ? 'currentColor' : 'none'} />
          </button>
          <button className="node-search-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="node-search-results">
          {results.length === 0 && query.trim() && (
            <div className="node-search-empty">
              No results for "{query}"
            </div>
          )}
          {results.length === 0 && !query.trim() && !showBookmarksOnly && (
            <div className="node-search-empty">
              <Search size={20} style={{ opacity: 0.3 }} />
              <span>Search prompts, responses, and labels</span>
              <span style={{ fontSize: 'var(--text-xs)', opacity: 0.5 }}>Use ↑↓ to navigate, Enter to select</span>
            </div>
          )}
          {results.length === 0 && !query.trim() && showBookmarksOnly && (
            <div className="node-search-empty">
              <Star size={20} style={{ opacity: 0.3 }} />
              <span>No bookmarked nodes</span>
            </div>
          )}
          {results.map((r, idx) => (
            <button
              key={r.id}
              className={`node-search-result ${idx === selectedIdx ? 'selected' : ''}`}
              onClick={() => handleSelect(r.id)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <div className="node-search-result-header">
                <MessageSquare size={12} />
                <span className="node-search-result-label">{r.label}</span>
                {r.bookmarked ? <Star size={10} fill="currentColor" style={{ color: 'var(--accent-warning)' }} /> : null}
              </div>
              <div className="node-search-result-prompt">
                {highlight(r.prompt, query)}
              </div>
              {r.response && query.trim() && r.response.toLowerCase().includes(query.toLowerCase()) && (
                <div className="node-search-result-response">
                  {highlight(r.response, query)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
