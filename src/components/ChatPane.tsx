import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTreeStore } from '../store/useTreeStore';
import { streamQuery, generateLabel } from '../services/api';
import type { ImageAttachment } from '../services/api';
import { ChatMessage } from './ChatMessage';
import {
  MessageSquare, GitBranch, ArrowUp,
  ImagePlus, X, Bot, Sparkles, Square,
} from 'lucide-react';
import type { ProviderType } from '../types';
import { MessageGroup } from '@/components/ui/message';
import { Marker, MarkerIcon, MarkerContent } from '@/components/ui/marker';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

const MODEL_OPTIONS: Partial<Record<ProviderType, Array<{ value: string; label: string }>>> = {
  agy: [
    { value: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { value: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    { value: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' },
    { value: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  openrouter: [
    { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)' },
    { value: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro Preview' },
    { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  ],
};

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
  const setProvider = useTreeStore((s) => s.setProvider);
  const projects = useTreeStore((s) => s.projects);
  const setActiveProject = useTreeStore((s) => s.setActiveProject);

  const inputRef = useRef('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Process image files into base64 attachments
  const processImageFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setAttachedImages((prev) => [
          ...prev,
          { data: dataUrl, mimeType: file.type, preview: dataUrl },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Handle paste — intercept images from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      processImageFiles(imageFiles);
    }
  }, [processImageFiles]);

  // Handle file input change (upload button)
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processImageFiles(e.target.files);
      e.target.value = ''; // reset so same file can be re-selected
    }
  }, [processImageFiles]);

  // Remove an attached image
  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
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
    if ((!query && attachedImages.length === 0) || isStreaming) return;

    // Collect history from active node's ancestor chain
    const history = activeNodeId ? getThreadHistory(activeNodeId) : [];

    // Build display label — indicate images if present
    const displayQuery = query || `[${attachedImages.length} image${attachedImages.length > 1 ? 's' : ''}]`;

    // Capture image previews for the node
    const imagePreviews = attachedImages.map((img) => img.preview || img.data);

    // Create a new child node under the active node
    const newNodeId = await addNode(displayQuery, activeNodeId || null, imagePreviews.length > 0 ? imagePreviews : undefined);
    if (!newNodeId) return;

    // Capture images before clearing state
    const imagesToSend = [...attachedImages];

    inputRef.current = '';
    if (textareaRef.current) { textareaRef.current.value = ''; textareaRef.current.style.height = '24px'; }
    setAttachedImages([]);
    setIsStreaming(true);
    setNodeStatus(newNodeId, 'streaming');

    // Generate a concise label
    const label = generateLabel(displayQuery);
    setNodeLabel(newNodeId, label);

    try {
      await streamQuery({
        history,
        query: displayQuery,
        provider,
        projectId: project?.id,
        images: imagesToSend.length > 0 ? imagesToSend : undefined,
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
  }, [isStreaming, activeNodeId, provider, attachedImages, addNode, appendNodeResponse, setNodeStatus, setNodeLabel, getThreadHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Depth indicator
  const depth = thread.length;

  // Memoize message list to avoid re-rendering on input changes
  const messageElements = useMemo(() => thread.map((node, index) => (
    <div key={node.id} data-node-id={node.id} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 space-y-4">
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
        images={node.images}
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
    <div className="flex flex-col h-full w-full min-w-0 bg-background">
      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain scroll-smooth px-6 py-8"
        ref={messagesContainerRef}
      >
        <div className="w-full min-w-0">
        {thread.length === 0 && !activeNode && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Start a conversation
              </h3>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                Type a message below to create the first node in your tree.
                You can branch off any node later.
              </p>
            </div>
          </div>
        )}

        {depth > 1 && (
          <Marker variant="separator" className="mb-4">
            <MarkerIcon>
              <GitBranch size={12} />
            </MarkerIcon>
            <MarkerContent>
              <span className="text-xs">
                Thread path: {thread.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && ' → '}
                    <span className="font-medium">{n.label.slice(0, 20)}</span>
                  </span>
                ))}
              </span>
            </MarkerContent>
          </Marker>
        )}

        <MessageGroup className="gap-8">
          {messageElements}
        </MessageGroup>

        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm px-6 py-3">
        <div className="w-full">
          <div className="rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md focus-within:border-ring/40">
            {/* Image preview strip */}
            {attachedImages.length > 0 && (
              <div className="flex gap-2 flex-wrap px-3 pt-3">
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative group/preview">
                    <img
                      src={img.preview}
                      alt={`Attachment ${i + 1}`}
                      className="h-16 w-16 rounded-lg object-cover border border-border"
                    />
                    <button
                      className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover/preview:opacity-100 transition-opacity shadow-sm"
                      onClick={() => removeImage(i)}
                      title="Remove"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className="w-full resize-none border-0 bg-transparent px-4 py-3 text-[0.875rem] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 font-sans"
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                activeNode
                  ? 'Branch from this node…'
                  : 'Ask anything…'
              }
              rows={1}
              disabled={isStreaming}
              style={{ minHeight: '24px', maxHeight: '160px' }}
            />

            {/* Hidden file input for upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  disabled={isStreaming}
                >
                  <ImagePlus size={15} />
                </button>

                <select
                  className="h-7 rounded-lg border-0 bg-muted/50 px-2 text-xs text-muted-foreground hover:bg-muted cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                  value={activeProjectId || ''}
                  onChange={(e) => setActiveProject(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {activeNode && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <GitBranch size={10} />
                    <span className="truncate max-w-[100px]">{activeNode.label || 'Node'}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {MODEL_OPTIONS[provider.type] ? (
                  <select
                    className="h-7 rounded-lg border-0 bg-muted/50 px-2 text-xs text-muted-foreground hover:bg-muted cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                    value={provider.model || ''}
                    onChange={(e) => setProvider({ ...provider, model: e.target.value })}
                  >
                    {MODEL_OPTIONS[provider.type]!.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {provider.model || provider.type}
                  </span>
                )}

                {isStreaming ? (
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    className="rounded-full"
                    title="Stop"
                  >
                    <Square size={12} />
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    className="rounded-full"
                    onClick={handleSubmit}
                    title="Send (Enter)"
                  >
                    <ArrowUp size={14} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      <div className={cn(
        "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium shadow-lg transition-all duration-300",
        toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}>
        {toast}
      </div>
    </div>
  );
}
