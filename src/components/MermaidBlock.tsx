import { useEffect, useRef, useState, memo } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTreeStore } from '../store/useTreeStore';

let mermaidInitialized = false;
let idCounter = 0;

function initMermaid(darkMode: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: darkMode ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: 'Inter, system-ui, sans-serif',
    themeVariables: darkMode
      ? {
          primaryColor: '#10B981',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#059669',
          lineColor: '#64748b',
          secondaryColor: '#1e293b',
          tertiaryColor: '#0f172a',
          background: '#1e1e2e',
          mainBkg: '#1e293b',
          nodeBorder: '#059669',
          clusterBkg: '#1e293b',
          titleColor: '#e2e8f0',
          edgeLabelBackground: '#1e293b',
        }
      : {
          primaryColor: '#10B981',
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#059669',
          lineColor: '#94a3b8',
          secondaryColor: '#f1f5f9',
          tertiaryColor: '#e2e8f0',
          background: '#ffffff',
          mainBkg: '#ecfdf5',
          nodeBorder: '#10B981',
          clusterBkg: '#f8fafc',
          titleColor: '#1e293b',
          edgeLabelBackground: '#f8fafc',
        },
  });
  mermaidInitialized = true;
}

interface MermaidBlockProps {
  chart: string;
}

export const MermaidBlock = memo(function MermaidBlock({ chart }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const darkMode = useTreeStore((s) => s.darkMode);
  const idRef = useRef(`mermaid-${Date.now()}-${idCounter++}`);

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      try {
        // Re-initialize mermaid when theme changes
        initMermaid(darkMode);

        const { svg } = await mermaid.render(idRef.current, chart.trim());
        if (!cancelled) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvgContent('');
        }
        // Clean up any error elements mermaid may have inserted
        const errorEl = document.getElementById('d' + idRef.current);
        if (errorEl) errorEl.remove();
      }
    }

    renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart, darkMode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = () => {
    setError(null);
    idRef.current = `mermaid-${Date.now()}-${idCounter++}`;
    // Force re-render by updating state
    setSvgContent('');
    initMermaid(darkMode);
    mermaid
      .render(idRef.current, chart.trim())
      .then(({ svg }) => {
        setSvgContent(svg);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      });
  };

  if (error) {
    return (
      <div className="mermaid-block mermaid-error">
        <div className="mermaid-header">
          <span className="mermaid-header-label">
            <AlertTriangle size={12} /> Mermaid Diagram (Error)
          </span>
          <div className="mermaid-header-actions">
            <button className="mermaid-action-btn" onClick={handleRetry} title="Retry rendering">
              <RefreshCw size={11} /> Retry
            </button>
            <button className={`mermaid-action-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
        </div>
        <div className="mermaid-error-body">
          <p className="mermaid-error-msg">{error}</p>
          <pre className="mermaid-error-source">{chart}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="mermaid-block">
      <div className="mermaid-header">
        <span className="mermaid-header-label">Mermaid Diagram</span>
        <button className={`mermaid-action-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Source</>}
        </button>
      </div>
      <div
        className="mermaid-body"
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    </div>
  );
});
