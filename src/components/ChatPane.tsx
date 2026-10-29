import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { streamQuery, generateLabel } from '../services/api';
import { ChatMessage } from './ChatMessage';
import {
  MessageSquare, GitBranch, Minimize2, ArrowUp, Download,
  Star, Copy, ArrowUpToLine, GitBranchPlus, Trash2, Check,
  ChevronDown,
} from 'lucide-react';

export function ChatPane() {
  // Use stable primitive selectors — no new objects created per store change
  const activeProjectId = useTreeStore((s) => s.activeProjectId);
  const project = useTreeStore((s) => {
    const p = s.projects.find((p) => p.id === s.activeProjectId);
    return p; // same reference if store hasn't changed the project
  });
  const addNode = useTreeStore((s) => s.addNode);
  const appendNodeResponse = useTreeStore((s) => s.appendNodeResponse);
  const setNodeStatus = useTreeStore((s) => s.setNodeStatus);
  const setNodeLabel = useTreeStore((s) => s.setNodeLabel);
  const updateNodeResponse = useTreeStore((s) => s.updateNodeResponse);
  const persistNodeResponse = useTreeStore((s) => s.persistNodeResponse);
  const compressBranch = useTreeStore((s) => s.compressBranch);
  const getThreadHistory = useTreeStore((s) => s.getThreadHistory);
  const getAncestorChain = useTreeStore((s) => s.getAncestorChain);
  const toggleBookmark = useTreeStore((s) => s.toggleBookmark);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const setActiveNode = useTreeStore((s) => s.setActiveNode);
  const setNodeUsage = useTreeStore((s) => s.setNodeUsage);
  const provider = useTreeStore((s) => s.provider);
  const projects = useTreeStore((s) => s.projects);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);

  const inputRef = useRef('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeNodeId = project?.activeNodeId;
  const activeNode = activeNodeId ? project?.nodes[activeNodeId] : null;

  const prevActiveNodeIdRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Build the thread: ancestor chain messages
  const thread = activeNodeId ? getAncestorChain(activeNodeId) : [];

  // Scroll behavior: scroll to the active node's message on node click,
  // scroll to bottom only during streaming
  useEffect(() => {
    const nodeChanged = activeNodeId !== prevActiveNodeIdRef.current;
    prevActiveNodeIdRef.current = activeNodeId || null;

    if (nodeChanged && activeNodeId) {
      // Node was clicked — scroll to that node's message at the top
      const nodeEl = document.querySelector(`[data-node-id="${activeNodeId}"]`);
      if (nodeEl) {
        nodeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // Fallback: scroll to top of messages
        messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (activeNode?.status === 'streaming') {
      // During streaming — keep scrolled to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread, activeNodeId, activeNode?.response, activeNode?.status]);

  // Auto-resize textarea (via ref, no re-render)
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value;
    e.target.style.height = '24px';
    e.target.style.height = e.target.scrollHeight + 'px';
  }, []);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Listen for branch-from-node event to auto-focus input
  useEffect(() => {
    const handler = () => {
      textareaRef.current?.focus();
      textareaRef.current?.setAttribute('placeholder', 'Type to branch from this node…');
    };
    window.addEventListener('branch-from-node', handler);
    return () => window.removeEventListener('branch-from-node', handler);
  }, []);

  const showToast = (msg: string) => setToast(msg);

  const handleSubmit = useCallback(async () => {
    const query = inputRef.current.trim();
    if (!query || isStreaming) return;

    // Collect history from active node's ancestor chain
    const history = activeNodeId ? getThreadHistory(activeNodeId) : [];

    // Create a new child node under the active node
    const newNodeId = await addNode(query, activeNodeId || null);
    if (!newNodeId) return;

    inputRef.current = '';
    if (textareaRef.current) { textareaRef.current.value = ''; textareaRef.current.style.height = '24px'; }
    setIsStreaming(true);
    setNodeStatus(newNodeId, 'streaming');

    // Generate a concise label
    const label = generateLabel(query);
    setNodeLabel(newNodeId, label);

    try {
      await streamQuery({
        history,
        query,
        provider,
        projectId: project?.id,
        onChunk: (chunk) => {
          appendNodeResponse(newNodeId, chunk);
        },
        onDone: (usage) => {
          setNodeStatus(newNodeId, 'complete');
          if (usage) {
            setNodeUsage(newNodeId, usage.tokensIn, usage.tokensOut);
          }
          setIsStreaming(false);
          persistNodeResponse(newNodeId);
        },
        onError: (err) => {
          appendNodeResponse(newNodeId, `\n\n**Error:** ${err.message}`);
          setNodeStatus(newNodeId, 'error');
          setIsStreaming(false);
          persistNodeResponse(newNodeId);
        },
      });
    } catch (err) {
      setNodeStatus(newNodeId, 'error');
      setIsStreaming(false);
    }
  }, [isStreaming, activeNodeId, provider, addNode, appendNodeResponse, setNodeStatus, setNodeLabel, getThreadHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCompress = useCallback(() => {
    if (!activeNodeId || !activeNode) return;
    const childCount = activeNode.children.length;
    if (childCount === 0) return;

    // Simple compression: summarize children's prompts
    const childSummaries = activeNode.children
      .map((cid) => project?.nodes[cid]?.prompt || '')
      .filter(Boolean)
      .map((p, i) => `${i + 1}. ${p.slice(0, 80)}`)
      .join('\n');

    const summary = `## 📦 Compressed Branch\n\n**Original sub-topics (${childCount}):**\n${childSummaries}\n\n*This branch was compressed to reduce clutter. The detailed conversation was archived.*`;
    compressBranch(activeNodeId, summary);
  }, [activeNodeId, activeNode, project?.nodes, compressBranch]);

  // Export thread as Markdown
  const handleExport = useCallback(() => {
    if (thread.length === 0) return;

    const projectName = project?.name || 'Untitled';
    const lines: string[] = [
      `# ${projectName}`,
      `> Exported from DFS Chat UI · ${new Date().toLocaleString()}`,
      `> Branch depth: ${thread.length} nodes`,
      '',
    ];

    for (const node of thread) {
      lines.push(`## 🧑 User`);
      lines.push('');
      lines.push(node.prompt);
      lines.push('');
      if (node.response) {
        lines.push(`## 🤖 AI`);
        lines.push('');
        lines.push(node.response);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_thread.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Thread exported as Markdown');
  }, [thread, project?.name]);

  // Depth indicator
  const depth = thread.length;
  const hasChildren = activeNode?.children && activeNode.children.length > 0;

  // Memoize message list to avoid re-rendering on input changes
  const messageElements = useMemo(() => thread.map((node, index) => (
    <div key={node.id} data-node-id={node.id}>
      <ChatMessage
        role="user"
        text={node.prompt}
        nodeId={node.id}
        label={node.label}
        createdAt={node.createdAt}
        depth={index + 1}
        branchCount={node.children.length}
        bookmarked={node.bookmarked}
        status={node.status}
      />
      {(node.response || node.status === 'streaming') && (
        <ChatMessage
          role="model"
          text={node.response}
          nodeId={node.id}
          isStreaming={node.status === 'streaming'}
        />
      )}
    </div>
  )), [thread]);

  return (
    <div className="chat-pane">


      <div className="chat-messages" ref={messagesContainerRef}>
        {thread.length === 0 && !activeNode && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <MessageSquare size={22} />
            </div>
            <h3>Start a conversation</h3>
            <p>
              Type a message below to create the first node in your tree.
              You can branch off any node later.
            </p>
          </div>
        )}

        {depth > 1 && (
          <div className="chat-branch-indicator">
            <GitBranch size={12} />
            Thread path: {thread.map((n, i) => (
              <span key={n.id}>
                {i > 0 && ' → '}
                {n.label.slice(0, 20)}
              </span>
            ))}
          </div>
        )}

        {messageElements}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="chat-input-card">
          {/* Textarea area */}
          <textarea
            ref={textareaRef}
            className="chat-input"
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              activeNode
                ? 'Branch from this node…'
                : 'Do anything…'
            }
            rows={1}
            disabled={isStreaming}
          />

          {/* Bottom toolbar */}
          <div className="chat-input-toolbar">
            <div className="chat-input-toolbar-left">
              <select
                className="chat-project-select"
                value={activeProjectId || ''}
                onChange={(e) => setActiveProject(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {activeNode && (
                <span className="chat-input-context-pill" title={activeNode.label}>
                  <GitBranch size={12} />
                  <span className="chat-input-context-label">{activeNode.label || 'Node'}</span>
                </span>
              )}
            </div>
            <div className="chat-input-toolbar-right">
              <span className="chat-input-model-badge">
                <ChevronDown size={10} />
                {provider.model || 'default'}
              </span>
              {isStreaming ? (
                <button
                  className="chat-stop-btn"
                  title="Stop"
                >
                  <Minimize2 size={14} />
                </button>
              ) : (
                <button
                  className="chat-send-btn"
                  onClick={handleSubmit}
                  title="Send (Enter)"
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hints */}
        <div className="chat-input-hint">
          <span className="kbd">Enter</span> send · <span className="kbd">Shift+Enter</span> newline
        </div>
      </div>

      {/* Toast notification */}
      <div className={`toast ${toast ? 'visible' : ''}`}>{toast}</div>
    </div>
  );
}
