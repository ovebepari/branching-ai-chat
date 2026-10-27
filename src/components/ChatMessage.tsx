import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useTreeStore } from '../store/useTreeStore';

interface ChatMessageProps {
  role: 'user' | 'model';
  text: string;
  nodeId: string;
  isStreaming?: boolean;
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
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export function ChatMessage({ role, text, nodeId, isStreaming }: ChatMessageProps) {
  return (
    <div className={`chat-message ${role}`}>
      <div className="chat-message-role">
        {role === 'user' ? 'You' : 'AI'}
      </div>
      <div className="chat-message-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const isInline = !className;
              if (isInline) {
                return <code className={className} {...props}>{children}</code>;
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
}
