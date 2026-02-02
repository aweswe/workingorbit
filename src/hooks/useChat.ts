import { useState, useCallback, useRef } from 'react';
import { Message, GenerationState, ProjectFile, CodeBlock } from '@/types/chat';
import { supabase } from '@/integrations/supabase/client';

const MAX_RETRIES = 3;

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({ status: 'idle' });
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const conversationHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const extractCodeFromResponse = (content: string): string | null => {
    const codeMatch = content.match(/```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : null;
  };

  const generateCode = async (
    prompt: string,
    errorContext?: string,
    retryCount: number = 0
  ): Promise<{ content: string; code: string | null; explanation: string; features: string[] }> => {
    const { data, error } = await supabase.functions.invoke('generate-code', {
      body: {
        prompt,
        conversationHistory: conversationHistoryRef.current,
        errorContext,
        retryCount,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to generate code');
    }

    if (!data.success) {
      throw new Error(data.error || 'Code generation failed');
    }

    return {
      content: data.content,
      code: data.code,
      explanation: data.explanation || '',
      features: data.features || [],
    };
  };

  const sendMessage = useCallback(async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      status: 'complete',
      timestamp: new Date(),
    };

    // Add placeholder AI message
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      status: 'generating',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, aiMessage]);
    setGenerationState({ status: 'generating' });

    // Add to conversation history
    conversationHistoryRef.current.push({ role: 'user', content });

    let retryCount = 0;
    let lastError: string | null = null;
    let finalCode: string | null = null;
    let finalContent = '';

    while (retryCount <= MAX_RETRIES) {
      try {
        // Update status for retries
        if (retryCount > 0) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: `🔄 Fixing error (attempt ${retryCount}/${MAX_RETRIES})...\n\nError: ${lastError}` }
                : msg
            )
          );
          setGenerationState({ status: 'generating', retryCount });
        }

        const result = await generateCode(content, lastError || undefined, retryCount);
        finalContent = result.explanation || result.content;
        finalCode = result.code;

        if (!finalCode) {
          throw new Error('No code was generated');
        }

        // Try to validate the code (basic syntax check)
        try {
          // Basic validation - check for common issues
          if (!finalCode.includes('export default')) {
            throw new Error('Component must have a default export');
          }
        } catch (validationError: any) {
          lastError = validationError.message;
          retryCount++;
          continue;
        }

        // Success! Update messages and files
        const codeBlocks: CodeBlock[] = [
          { language: 'tsx', code: finalCode, filename: 'App.tsx' }
        ];

        // Build features list as markdown
        const featuresMarkdown = result.features.length > 0
          ? '\n\n**Features:**\n' + result.features.map(f => `- ${f}`).join('\n')
          : '';

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  content: finalContent + featuresMarkdown,
                  codeBlocks,
                  status: 'complete',
                }
              : msg
          )
        );

        // Update project files
        setProjectFiles([
          { path: 'App.tsx', content: finalCode, language: 'tsx' }
        ]);

        // Add to conversation history
        conversationHistoryRef.current.push({ role: 'assistant', content: finalContent });

        // Show building state briefly
        setGenerationState({ status: 'building' });
        await new Promise((r) => setTimeout(r, 500));
        setGenerationState({ status: 'ready' });

        return;
      } catch (error: any) {
        console.error(`Generation attempt ${retryCount + 1} failed:`, error);
        lastError = error.message;
        retryCount++;
      }
    }

    // All retries failed
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === aiMessageId
          ? {
              ...msg,
              content: `❌ Failed to generate working code after ${MAX_RETRIES} attempts.\n\nLast error: ${lastError}\n\nPlease try rephrasing your request or providing more details.`,
              status: 'error',
            }
          : msg
      )
    );
    setGenerationState({ status: 'error', error: lastError || 'Generation failed' });
  }, []);

  const retryLastGeneration = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      // Remove the failed AI message
      setMessages((prev) => prev.slice(0, -1));
      sendMessage(lastUserMessage.content);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    generationState,
    projectFiles,
    sendMessage,
    retryLastGeneration,
    isGenerating: generationState.status === 'generating' || generationState.status === 'building',
  };
}
