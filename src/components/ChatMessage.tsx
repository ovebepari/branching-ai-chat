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
import { Message, MessageContent, MessageAvatar, MessageFooter } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from 'cn';

interface ChatMessageProps {
  role: 'user' | 'model';
  text: string;
  nodeId: string;
  isStreaming?: boolean;
  label?: string;
  createdAt?: number;
  depth?: number;
  branchCount?: number;
  bookmarked?: boolean;
  status?: string;
  images?: string[];
}

/* ── Code block with language header and copy button ── */
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
    <div className="overflow-hidden rounded-xl my-3 max-w-full">
      <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2">
        <span className="text-[0.6875rem] font-mono font-medium tracking-wide text-muted-foreground uppercase">
          {language}
        </span>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[0.6875rem] font-medium transition-all duration-200",
            copied
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
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
          lineHeight: '1.65',
          padding: '1rem 1.25rem',
          background: darkMode ? '#16161e' : '#fafaf9',
          overflowX: 'auto',
          fontFamily: "'Ubuntu Mono', 'JetBrains Mono', monospace",
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

/* ── User message card — right-aligned, compact ── */
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
        {/* Metadata line */}
        <div className="flex items-center gap-2 flex-wrap justify-end px-1">
          {bookmarked && (
            <Star size={11} fill="currentColor" className="text-amber-500" />
          )}
          <span className="text-[0.75rem] font-medium text-foreground/70 tracking-tight truncate max-w-[200px]">
            {label || 'Prompt'}
          </span>
          <button
            className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover/message:opacity-100"
            onClick={handleEditLabel}
            title="Edit label"
          >
            <Pencil size={10} />
          </button>

          {/* Inline metadata chips — only key info */}
          {depth && (
            <span className="inline-flex items-center gap-0.5 text-[0.625rem] font-medium text-muted-foreground/60">
              <Hash size={8} />{depth}
            </span>
          )}
          {branchCount !== undefined && branchCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[0.625rem] font-medium text-muted-foreground/60">
              <GitBranch size={8} />{branchCount}
            </span>
          )}
          {status === 'complete' && (
            <CheckCircle size={10} className="text-emerald-500/70" />
          )}
          {status === 'streaming' && (
            <Zap size={10} className="text-blue-500 animate-pulse" />
          )}
          {status === 'error' && (
            <XCircle size={10} className="text-destructive/70" />
          )}
        </div>

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
          <BubbleContent className="text-[1rem] leading-[1.55] px-4 py-2.5">
            {text}
          </BubbleContent>
        </Bubble>

        {/* Footer */}
        <MessageFooter className="gap-2 justify-end">
          {timeLabel && (
            <span className="text-[0.625rem] text-muted-foreground/60 font-medium tracking-wide">
              {timeLabel}
            </span>
          )}
          <button
            className={cn(
              "inline-flex items-center gap-1 text-[0.625rem] rounded px-1.5 py-0.5 transition-all duration-200",
              copied
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/60"
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
          <AvatarFallback className="bg-primary/8 text-primary">
            <User size={14} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </Message>
  );
}

/* ── Model response — left-aligned, editorial prose ── */
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
          <AvatarFallback className="bg-muted text-muted-foreground">
            <Bot size={14} />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <Bubble variant="ghost">
          <BubbleContent className="prose-chat w-full max-w-full text-base">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ className, children, ...props }) {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code {...props}>
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
              <span className="inline-block w-[3px] h-[1.1em] ml-0.5 bg-foreground/40 animate-pulse rounded-full align-text-bottom" />
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
});
