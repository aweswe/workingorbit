import { useState, useEffect } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { GenerationState, ProjectFile } from '@/types/chat';
import {
  Monitor,
  Terminal,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Default starter code to show before generation
const DEFAULT_APP_CODE = `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Ready to Build</h1>
        <p className="text-slate-400 max-w-md">
          Describe what you want to create in the chat, and watch your code come to life here.
        </p>
      </div>
    </div>
  );
}`;

const DEFAULT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}`;

interface PreviewPanelProps {
  files: ProjectFile[];
  generationState: GenerationState;
  onRetry?: () => void;
  onError?: (error: string) => void;
}

export function PreviewPanel({
  files,
  generationState,
  onRetry,
  onError
}: PreviewPanelProps) {
  const [showConsole, setShowConsole] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Extract App.tsx content
  const appFile = files.find(f => f.path === 'App.tsx');
  const appCode = appFile?.content || DEFAULT_APP_CODE;

  // Configuration for Sandpack
  const sandpackFiles = {
    '/App.tsx': { code: appCode, active: true },
    '/index.css': { code: DEFAULT_CSS },
  };

  const sandpackOptions = {
    externalResources: [
      'https://cdn.tailwindcss.com',
    ],
    // Ensure we don't show the internal navigator
    showNavigator: false,
    showTabs: false,
  };

  const customSetup = {
    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'lucide-react': '^0.294.0',
      'recharts': '^2.10.3',
    },
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-surface-elevated border-l border-border transition-all duration-300",
        isFullscreen && "fixed inset-0 z-50 border-0"
      )}
    >
      {/* Header Toolbar */}
      <PreviewHeader
        generationState={generationState}
        showConsole={showConsole}
        setShowConsole={setShowConsole}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        onRetry={onRetry}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 w-full relative group">
        <SandpackProvider
          key={appCode} // Force a clean remount on code updates
          template="react-ts"
          theme="dark"
          files={sandpackFiles}
          options={sandpackOptions}
          customSetup={customSetup}
        >
          <SandpackPreviewContent
            showConsole={showConsole}
            onError={onError}
          />
        </SandpackProvider>
      </div>
    </div>
  );
}

// Sub-components for cleaner structure

function PreviewHeader({
  generationState,
  showConsole,
  setShowConsole,
  isFullscreen,
  setIsFullscreen,
  onRetry
}: {
  generationState: GenerationState;
  showConsole: boolean;
  setShowConsole: (v: boolean) => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  onRetry?: () => void;
}) {
  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between bg-surface-elevated/95 backdrop-blur supports-[backdrop-filter]:bg-surface-elevated/60">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-accent/50 text-accent-foreground">
          <Monitor className="w-4 h-4" />
          <span className="text-sm font-medium">Preview</span>
        </div>
        <StatusBadge state={generationState} />
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowConsole(!showConsole)}
          className={cn(
            'p-2 rounded-md transition-all duration-200',
            showConsole
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'hover:bg-accent text-muted-foreground hover:text-foreground'
          )}
          title={showConsole ? "Hide Console" : "Show Console"}
        >
          <Terminal className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {onRetry && generationState.status === 'error' && (
          <button
            onClick={onRetry}
            className="ml-1 p-2 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-200"
            title="Retry Generation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: GenerationState }) {
  const configs = {
    idle: { icon: null, text: 'Ready', className: 'text-muted-foreground' },
    generating: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      text: 'Generating...',
      className: 'text-primary font-medium',
    },
    building: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      text: 'Building...',
      className: 'text-warning font-medium',
    },
    ready: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      text: 'Ready',
      className: 'text-success font-medium',
    },
    error: {
      icon: <AlertCircle className="w-3 h-3" />,
      text: state.retryCount ? `Fixing (${state.retryCount}/3)` : 'Error',
      className: 'text-destructive font-medium',
    },
  };

  const config = configs[state.status];

  return (
    <div className={cn('flex items-center gap-1.5 text-xs transition-colors duration-300', config.className)}>
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
}

function SandpackPreviewContent({
  showConsole,
  onError
}: {
  showConsole: boolean;
  onError?: (error: string) => void;
}) {
  const { sandpack } = useSandpack();

  // Monitor for internal Sandpack errors
  useEffect(() => {
    // Only report fatal errors
    if (sandpack.status === 'idle' && sandpack.error && onError) {
      onError(sandpack.error.message || "An unknown error occurred in the preview");
    }
  }, [sandpack.status, sandpack.error, onError]);

  return (
    <div className="h-full w-full flex flex-col bg-slate-950">
      <div className={cn(
        'w-full transition-all duration-300 ease-in-out',
        showConsole ? 'h-[65%]' : 'h-full'
      )}>
        <SandpackPreview
          showNavigator={false}
          showRefreshButton={true}
          showOpenInCodeSandbox={false}
          className="h-full w-full"
          style={{ height: '100%', width: '100%' }}
        />
      </div>

      {showConsole && (
        <div className="h-[35%] w-full border-t border-border bg-code-bg animate-in slide-in-from-bottom-10 fade-in duration-200">
          <div className="h-full w-full overflow-hidden">
            <SandpackConsole
              style={{ height: '100%', width: '100%' }}
              showHeader
            />
          </div>
        </div>
      )}
    </div>
  );
}
