import { ProjectFile, GenerationState } from '@/types/chat';
import { ProjectPlan } from '@/types/pipeline';
import { FileTree } from './FileTree';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { SandpackProvider } from '@codesandbox/sandpack-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { useProjectExport } from '@/hooks/useProjectExport';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectWorkspaceProps {
    files: ProjectFile[];
    generationState: GenerationState;
    currentPlan: ProjectPlan | null;
    activeFilePath: string | null;
    onFileSelect: (path: string) => void;
    onRetry?: () => void;
    onError?: (error: string) => void;
}

const DEFAULT_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`;

export function ProjectWorkspace({
    files,
    generationState,
    currentPlan,
    activeFilePath,
    onFileSelect,
    onRetry,
    onError
}: ProjectWorkspaceProps) {
    const { exportProject } = useProjectExport();
    const isGenerating = generationState.status === 'generating' || generationState.status === 'building';

    // Convert our file format to Sandpack's format
    const sandpackFiles: Record<string, any> = {
        '/index.css': { code: DEFAULT_CSS, hidden: true },
    };

    files.forEach(file => {
        // Sandpack expects absolute-ish paths starting with /
        const sandpackPath = file.path.startsWith('/') ? file.path : `/${file.path}`;
        sandpackFiles[sandpackPath] = {
            code: file.content,
            active: activeFilePath ? sandpackPath === (activeFilePath.startsWith('/') ? activeFilePath : `/${activeFilePath}`) : file.path === 'App.tsx'
        };
    });

    // Ensure App.tsx exists if not generated yet to avoid Sandpack crashes
    if (!sandpackFiles['/App.tsx']) {
        sandpackFiles['/App.tsx'] = {
            code: `export default function App() { return <div className="p-8 text-slate-400">Project structure is being planned...</div> }`,
            active: true
        };
    }

    return (
        <div className="flex h-full w-full bg-slate-950 overflow-hidden">
            {/* File Explorer Sidebar */}
            <div className="w-64 flex-shrink-0 flex flex-col border-r border-slate-800">
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Explorer</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => exportProject(files, currentPlan)}
                        disabled={files.length === 0 || isGenerating}
                        title="Download Project ZIP"
                    >
                        <Download className="w-4 h-4" />
                    </Button>
                </div>
                <FileTree
                    files={files}
                    activeFilePath={activeFilePath}
                    onFileSelect={onFileSelect}
                    isGenerating={isGenerating}
                    hideHeader={true}
                />
            </div>

            {/* Main Stage (Preview / Editor) */}
            <div className="flex-1 min-w-0 bg-slate-900 flex flex-col relative">
                <SandpackProvider
                    template="react-ts"
                    theme="dark"
                    files={sandpackFiles}
                    options={{
                        externalResources: ['https://cdn.tailwindcss.com'],
                        recompileMode: "immediate",
                    }}
                    customSetup={{
                        dependencies: {
                            'react': '^18.2.0',
                            'react-dom': '^18.2.0',
                            'lucide-react': '^0.294.0',
                            'recharts': '^2.10.3',
                            'framer-motion': '^10.16.4',
                            'clsx': '^2.0.0',
                            'tailwind-merge': '^1.14.0'
                        },
                    }}
                >
                    <PreviewPanel
                        files={files}
                        generationState={generationState}
                        onRetry={onRetry}
                        onError={onError}
                        activeFilePath={activeFilePath}
                    />
                </SandpackProvider>
            </div>
        </div>
    );
}
