import { useState, useCallback, useRef } from 'react';
import { Message, GenerationState, ProjectFile, CodeBlock, RequestIntent } from '@/types/chat';
import { supabase } from '@/integrations/supabase/client';

const MAX_RETRIES = 3;

// Intent Router - decides between generate (full file) vs edit (patch-based)
function classifyIntent(prompt: string, hasExistingCode: boolean): RequestIntent {
  const editKeywords = [
    'change', 'update', 'make the', 'fix', 'adjust', 'tweak', 'modify',
    'set the', 'turn the', 'make it', 'switch', 'replace', 'remove the',
    'add a', 'add the', 'delete the', 'hide the', 'show the'
  ];
  const generateKeywords = [
    'create', 'build', 'generate', 'design', 'implement', 'make a',
    'make me', 'write a', 'develop', 'construct', 'new'
  ];

  const promptLower = prompt.toLowerCase();

  // Check for explicit edit patterns
  const isEditIntent = editKeywords.some(k => promptLower.includes(k));
  const isGenerateIntent = generateKeywords.some(k => promptLower.includes(k));

  // No existing code = must generate
  if (!hasExistingCode) return 'generate';

  // Clear edit intent
  if (isEditIntent && !isGenerateIntent) return 'edit';

  // Clear generate intent
  if (isGenerateIntent && !isEditIntent) return 'generate';

  // Both or neither - if code exists, prefer edit for shorter prompts
  if (hasExistingCode && prompt.length < 100) return 'edit';

  return 'generate';
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({ status: 'idle' });
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const conversationHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const extractCodeFromResponse = (content: string): string | null => {
    const codeMatch = content.match(/```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : null;
  };

  // Get current code from project files
  const getCurrentCode = (): string | null => {
    const appFile = projectFiles.find(f => f.path === 'App.tsx');
    return appFile?.content || null;
  };

  // Generate code (full file replacement)
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

  // Edit code (patch-based)
  const editCode = async (
    prompt: string,
    currentCode: string
  ): Promise<{ code: string; explanation: string; appliedPatches: string[] }> => {
    const { data, error } = await supabase.functions.invoke('edit-code', {
      body: {
        prompt,
        currentCode,
        filename: 'App.tsx',
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to edit code');
    }

    if (!data.success) {
      throw new Error(data.error || 'Code editing failed');
    }

    return {
      code: data.code,
      explanation: data.explanation || '',
      appliedPatches: data.appliedPatches || [],
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

    // Classify intent
    const currentCode = getCurrentCode();
    const intent = classifyIntent(content, !!currentCode);

    console.log(`Intent classified as: ${intent} (hasCode: ${!!currentCode})`);

    if (intent === 'edit' && currentCode) {
      // Use patch-based editing
      try {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: '🔧 Applying surgical edit...' }
              : msg
          )
        );

        const result = await editCode(content, currentCode);

        if (!result.code) {
          throw new Error('No code returned from edit');
        }

        const codeBlocks: CodeBlock[] = [
          { language: 'tsx', code: result.code, filename: 'App.tsx' }
        ];

        const patchesList = result.appliedPatches.length > 0
          ? '\n\n**Changes applied:**\n' + result.appliedPatches.map(p => `- ${p}`).join('\n')
          : '';

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                ...msg,
                content: result.explanation + patchesList,
                codeBlocks,
                status: 'complete',
              }
              : msg
          )
        );

        setProjectFiles([
          { path: 'App.tsx', content: result.code, language: 'tsx' }
        ]);

        conversationHistoryRef.current.push({ role: 'assistant', content: result.explanation });

        setGenerationState({ status: 'building' });
        await new Promise((r) => setTimeout(r, 500));
        setGenerationState({ status: 'ready' });

        return;
      } catch (error: any) {
        console.error('Edit failed, falling back to generate:', error);
        // Fall through to generate
      }
    }

    // Use full generation (original logic)
    let retryCount = 0;
    let lastError: string | null = null;
    let finalCode: string | null = null;
    let finalContent = '';

    while (retryCount <= MAX_RETRIES) {
      try {
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

        try {
          if (!finalCode.includes('export default')) {
            throw new Error('Component must have a default export');
          }
        } catch (validationError: any) {
          lastError = validationError.message;
          retryCount++;
          continue;
        }

        const codeBlocks: CodeBlock[] = [
          { language: 'tsx', code: finalCode, filename: 'App.tsx' }
        ];

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

        setProjectFiles([
          { path: 'App.tsx', content: finalCode, language: 'tsx' }
        ]);

        conversationHistoryRef.current.push({ role: 'assistant', content: finalContent });

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
  }, [projectFiles]);

  const retryLastGeneration = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
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
