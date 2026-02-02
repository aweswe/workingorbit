import { ChatPanel } from '@/components/chat/ChatPanel';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { useChat } from '@/hooks/useChat';
import { useState, useCallback } from 'react';

const Index = () => {
  const { messages, generationState, projectFiles, sendMessage, retryLastGeneration, isGenerating } = useChat();
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handlePreviewError = useCallback((error: string) => {
    setPreviewError(error);
    console.error('Preview error:', error);
  }, []);

  return (
    <div className="h-screen w-screen grid grid-cols-[480px_1fr] overflow-hidden bg-background">
      {/* Chat Panel */}
      <div className="border-r border-border overflow-hidden">
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          isGenerating={isGenerating}
        />
      </div>

      {/* Preview Panel */}
      <div className="min-w-0 overflow-hidden">
        <PreviewPanel
          files={projectFiles}
          generationState={generationState}
          onRetry={retryLastGeneration}
          onError={handlePreviewError}
        />
      </div>
    </div>
  );
};

export default Index;

