import { useRef, useEffect, useState, useCallback } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { streamQuery, generateLabel } from '../services/api';
import { ChatMessage } from './ChatMessage';
import { MessageSquare, GitBranch, Minimize2, ArrowUp, Download } from 'lucide-react';

export function ChatPane() {
  const project = useTreeStore((s) => s.getActiveProject());
  const addNode = useTreeStore((s) => s.addNode);
  const appendNodeResponse = useTreeStore((s) => s.appendNodeResponse);
  const setNodeStatus = useTreeStore((s) => s.setNodeStatus);
  const setNodeLabel = useTreeStore((s) => s.setNodeLabel);
  const updateNodeResponse = useTreeStore((s) => s.updateNodeResponse);
  const persistNodeResponse = useTreeStore((s) => s.persistNodeResponse);
  const compressBranch = useTreeStore((s) => s.compressBranch);
  const getThreadHistory = useTreeStore((s) => s.getThreadHistory);
  const getAncestorChain = useTreeStore((s) => s.getAncestorChain);
  const provider = useTreeStore((s) => s.provider);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeNodeId = project?.activeNodeId;
  const activeNode = activeNodeId ? project?.nodes[activeNodeId] : null;

  // Build the thread: ancestor chain messages
  const thread = activeNodeId ? getAncestorChain(activeNodeId) : [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread, activeNode?.response]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);

  const handleSubmit = useCallback(async () => {
    const query = input.trim();
    if (!query || isStreaming) return;

    // Collect history from active node's ancestor chain
    const history = activeNodeId ? getThreadHistory(activeNodeId) : [];

    // Create a new child node under the active node
    const newNodeId = await addNode(query, activeNodeId || null);
    if (!newNodeId) return;

    setInput('');
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
        onDone: () => {
          setNodeStatus(newNodeId, 'complete');
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
  }, [input, isStreaming, activeNodeId, provider, addNode, appendNodeResponse, setNodeStatus, setNodeLabel, getThreadHistory]);

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

  return (
    <div className="chat-pane">
      <div className="chat-pane-header">
        <div className="chat-pane-header-info">
          <div className="chat-pane-title">
            {activeNode ? activeNode.label : 'Thread'}
          </div>
          <div className="chat-pane-subtitle">
            {activeNode ? `Depth ${depth} · ${activeNode.children.length} branches` : 'Select or create a node'}
          </div>
        </div>
        <div className="chat-pane-header-actions">
          {thread.length > 0 && (
            <button
              className="chat-pane-header-btn export-btn"
              onClick={handleExport}
              title="Export thread as Markdown"
            >
              <Download size={14} /> Export
            </button>
          )}
          {hasChildren && (
            <button
              className="chat-pane-header-btn"
              onClick={handleCompress}
              title="Compress this branch"
            >
              <Minimize2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
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

        {thread.map((node) => (
          <div key={node.id}>
            <ChatMessage role="user" text={node.prompt} nodeId={node.id} />
            {(node.response || node.status === 'streaming') && (
              <ChatMessage
                role="model"
                text={node.response}
                nodeId={node.id}
                isStreaming={node.status === 'streaming'}
              />
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeNode
                ? 'Branch from this node…'
                : 'Start a new conversation…'
            }
            rows={1}
            disabled={isStreaming}
          />
          <button
            className="chat-send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            title="Send (Enter)"
          >
            <ArrowUp size={18} />
          </button>
        </div>
        <div className="chat-input-hint">
          <span className="kbd">Enter</span> send · <span className="kbd">Shift+Enter</span> newline · <span className="kbd">Esc</span> deselect node
        </div>
      </div>

      {/* Toast notification */}
      <div className={`toast ${toast ? 'visible' : ''}`}>{toast}</div>
    </div>
  );
}
