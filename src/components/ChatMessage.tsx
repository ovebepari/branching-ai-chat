import { useState, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Clock, GitBranch, Star, Hash, Pencil, CheckCircle, Zap, XCircle } from 'lucide-react';
import { MermaidBlock } from './MermaidBlock';
import { useTreeStore } from '../store/useTreeStore';

interface ChatMessageProps {
  role: 'user' | 'model';
  text: string;
  nodeId: string;
  isStreaming?: boolean;
  // User card metadata
  label?: string;
  createdAt?: number;
  depth?: number;
  branchCount?: number;
  bookmarked?: boolean;
  status?: string;
}

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const darkMode = useTreeStore((s) => s.darkMode);
  const language = className?.replace('language-', '') || 'text';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div>
      <div className="code-block-header">
        <span>{language}</span>
        <button className={`code-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <SyntaxHighlighter
        style={darkMode ? oneDark : oneLight}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.8125rem',
          padding: '0.75rem 1rem',
          background: darkMode ? '#282c34' : '#f8f8f8',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function UserCard({ text, nodeId, label, createdAt, depth, branchCount, bookmarked, status }: Omit<ChatMessageProps, 'role'>) {
  const [copied, setCopied] = useState(false);
  const setNodeLabel = useTreeStore((s) => s.setNodeLabel);
  const getActiveProject = useTreeStore((s) => s.getActiveProject);

  const timeLabel = createdAt
    ? new Date(createdAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const handleEditLabel = useCallback(() => {
    const project = getActiveProject();
    const node = project?.nodes[nodeId];
    const newLabel = prompt('Edit label:', node?.label || '');
    if (newLabel !== null && newLabel.trim()) {
      setNodeLabel(nodeId, newLabel.trim());
    }
  }, [nodeId, getActiveProject, setNodeLabel]);

  return (
    <div className="user-card">
      {/* Card header with label and meta */}
      <div className="user-card-header">
        <div className="user-card-label-row">
          {bookmarked && (
            <span className="user-card-bookmark">
              <Star size={12} fill="currentColor" />
            </span>
          )}
          <span className="user-card-label">{label || 'Prompt'}</span>
          <button className="user-card-edit-btn" onClick={handleEditLabel} title="Edit label">
            <Pencil size={11} />
          </button>
        </div>
        <div className="user-card-meta">
          {depth && (
            <span className="user-card-chip">
              <Hash size={10} /> Depth {depth}
            </span>
          )}
          {branchCount !== undefined && branchCount > 0 && (
            <span className="user-card-chip">
              <GitBranch size={10} /> {branchCount} branch{branchCount > 1 ? 'es' : ''}
            </span>
          )}
          {status === 'complete' && (
            <span className="user-card-chip complete"><CheckCircle size={9} /> Done</span>
          )}
          {status === 'streaming' && (
            <span className="user-card-chip streaming"><Zap size={9} /> Streaming</span>
          )}
          {status === 'error' && (
            <span className="user-card-chip error"><XCircle size={9} /> Error</span>
          )}
        </div>
      </div>

      {/* Card body — the prompt text */}
      <div className="user-card-body">
        {text}
      </div>

      {/* Card footer */}
      <div className="user-card-footer">
        {timeLabel && (
          <span className="user-card-time">
            <Clock size={10} /> {timeLabel}
          </span>
        )}
        <button
          className={`user-card-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          title="Copy prompt"
        >
          {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
      </div>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({ role, text, nodeId, isStreaming, label, createdAt, depth, branchCount, bookmarked, status }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="chat-message user">
        <UserCard
          text={text}
          nodeId={nodeId}
          label={label}
          createdAt={createdAt}
          depth={depth}
          branchCount={branchCount}
          bookmarked={bookmarked}
          status={status}
        />
      </div>
    );
  }

  return (
    <div className={`chat-message ${role}`}>
      <div className="chat-message-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code({ className, children, ...props }) {
              const isInline = !className;
              if (isInline) {
                return <code className={className} {...props}>{children}</code>;
              }
              const language = className?.replace('language-', '');
              if (language === 'mermaid' && !isStreaming) {
                return <MermaidBlock chart={String(children)} />;
              }
              return <CodeBlock className={className}>{String(children)}</CodeBlock>;
            },
            pre({ children }) {
              return <pre>{children}</pre>;
            },
          }}
        >
          {text}
        </ReactMarkdown>
        {isStreaming && <span className="streaming-cursor" />}
      </div>
    </div>
  );
});
