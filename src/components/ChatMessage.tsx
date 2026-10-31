import { useState, useCallback, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Clock, GitBranch, Star, Hash, Pencil, CheckCircle, Zap, XCircle, Bot, User } from 'lucide-react';
import { MermaidBlock } from './MermaidBlock';
import { useTreeStore } from '../store/useTreeStore';
import { Message, MessageContent, MessageAvatar, MessageHeader, MessageFooter } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from 'cn';

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
  images?: string[];
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
    <div className="overflow-hidden rounded-xl border border-border my-3">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">{language}</span>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            copied
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          onClick={handleCopy}
        >
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
          background: darkMode ? '#1a1a2e' : '#fafafa',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="image-lightbox-overlay" onClick={onClose}>
      <img
        src={src}
        alt="Full size"
        className="image-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function UserCard({ text, nodeId, label, createdAt, depth, branchCount, bookmarked, status, images }: Omit<ChatMessageProps, 'role'>) {
  const [copied, setCopied] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
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
    <Message align="end">
      <MessageContent>
        {/* Header with label + metadata chips */}
        <MessageHeader className="gap-2 justify-end">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {bookmarked && (
              <Star size={11} fill="currentColor" className="text-amber-500" />
            )}
            <span className="text-xs font-semibold text-foreground/80 truncate max-w-[200px]">
              {label || 'Prompt'}
            </span>
            <button
              className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/message:opacity-100"
              onClick={handleEditLabel}
              title="Edit label"
            >
              <Pencil size={10} />
            </button>
          </div>
        </MessageHeader>

        {/* Metadata chips */}
        {(depth || (branchCount !== undefined && branchCount > 0) || status) && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end px-1">
            {depth && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Hash size={9} /> Depth {depth}
              </span>
            )}
            {branchCount !== undefined && branchCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <GitBranch size={9} /> {branchCount} branch{branchCount > 1 ? 'es' : ''}
              </span>
            )}
            {status === 'complete' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={9} /> Done
              </span>
            )}
            {status === 'streaming' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                <Zap size={9} /> Streaming
              </span>
            )}
            {status === 'error' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                <XCircle size={9} /> Error
              </span>
            )}
          </div>
        )}

        {/* Images */}
        {images && images.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-end px-1">
            {images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Attachment ${i + 1}`}
                className="h-20 w-auto rounded-lg border border-border object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightboxSrc(src)}
              />
            ))}
          </div>
        )}

        {/* Message bubble */}
        <Bubble variant="default" align="end">
          <BubbleContent className="text-sm leading-relaxed">
            {text}
          </BubbleContent>
        </Bubble>

        {/* Footer with time + copy */}
        <MessageFooter className="gap-2 justify-end">
          {timeLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock size={9} /> {timeLabel}
            </span>
          )}
          <button
            className={cn(
              "inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 transition-colors",
              copied
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            onClick={handleCopy}
            title="Copy prompt"
          >
            {copied ? <><Check size={9} /> Copied</> : <><Copy size={9} /> Copy</>}
          </button>
        </MessageFooter>
      </MessageContent>

      <MessageAvatar>
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 text-primary">
            <User size={14} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>

      {/* Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </Message>
  );
}

export const ChatMessage = memo(function ChatMessage({ role, text, nodeId, isStreaming, label, createdAt, depth, branchCount, bookmarked, status, images }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <UserCard
        text={text}
        nodeId={nodeId}
        label={label}
        createdAt={createdAt}
        depth={depth}
        branchCount={branchCount}
        bookmarked={bookmarked}
        status={status}
        images={images}
      />
    );
  }

  return (
    <Message align="start">
      <MessageAvatar>
        <Avatar size="sm">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            <Bot size={14} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <Bubble variant="ghost">
          <BubbleContent className="prose-chat max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ className, children, ...props }) {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[0.8125rem] font-mono text-foreground"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  const language = className?.replace('language-', '');
                  if (language === 'mermaid' && !isStreaming) {
                    return <MermaidBlock chart={String(children)} />;
                  }
                  return <CodeBlock className={className}>{String(children)}</CodeBlock>;
                },
                pre({ children }) {
                  return <pre className="!bg-transparent !p-0 !m-0">{children}</pre>;
                },
              }}
            >
              {text}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-primary/60 animate-pulse rounded-sm" />
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
});
