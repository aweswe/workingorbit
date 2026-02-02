import { useState, useCallback, useRef } from 'react';
import { Message, GenerationState, ProjectFile, CodeBlock, RequestIntent } from '@/types/chat';
import { ProjectPlan } from '@/types/pipeline';
import { supabase } from '@/integrations/supabase/client';
import { canonicalizeImports } from '@/lib/importCanonicalizer';

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
  const isEditIntent = editKeywords.some(k => promptLower.includes(k));
  const isGenerateIntent = generateKeywords.some(k => promptLower.includes(k));

  if (!hasExistingCode) return 'generate';
  if (isEditIntent && !isGenerateIntent) return 'edit';
  if (isGenerateIntent && !isEditIntent) return 'generate';
  if (hasExistingCode && prompt.length < 100) return 'edit';

  return 'generate';
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({ status: 'idle' });
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [currentPlan, setCurrentPlan] = useState<ProjectPlan | null>(null);
  const conversationHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  // Get current code from project files
  const getCurrentCode = (): string | null => {
    const appFile = projectFiles.find(f => f.path === 'App.tsx');
    return appFile?.content || null;
  };

  // Step 1: Plan the project
  const planProject = async (prompt: string): Promise<ProjectPlan> => {
    const { data, error } = await supabase.functions.invoke('plan-project', {
      body: { prompt },
    });

    if (error || !data.success) {
      throw new Error(data?.error || error?.message || 'Planning failed');
    }

    return data.plan;
  };

  // Step 2: Generate types from plan
  const generateTypes = async (plan: ProjectPlan): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('generate-types', {
      body: { plan },
    });

    if (error || !data.success) {
      throw new Error(data?.error || error?.message || 'Type generation failed');
    }

    return data.types;
  };

  // Step 3: Generate code
  const generateCode = async (
    prompt: string,
    plan?: ProjectPlan,
    errorContext?: string,
    retryCount: number = 0
  ): Promise<{ content: string; code: string | null; explanation: string; features: string[] }> => {
    const { data, error } = await supabase.functions.invoke('generate-code', {
      body: {
        prompt,
        plan,
        conversationHistory: conversationHistoryRef.current,
        errorContext,
        retryCount,
      },
    });

    if (error || !data.success) {
      throw new Error(data?.error || error?.message || 'Code generation failed');
    }

    return {
      content: data.content,
      code: data.code,
      explanation: data.explanation || '',
      features: data.features || [],
    };
  };

  // Step 4: Validate code
  const validateCode = async (code: string, filename: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> => {
    const { data, error } = await supabase.functions.invoke('validate-code', {
      body: { code, filename },
    });

    if (error) {
      console.warn('Validation error:', error);
      return { valid: true, errors: [], warnings: [] };
    }

    return {
      valid: data.valid ?? true,
      errors: data.errors || [],
      warnings: data.warnings || [],
    };
  };

  // Edit code (patch-based)
  const editCode = async (
    prompt: string,
    currentCode: string
  ): Promise<{ code: string; explanation: string; appliedPatches: string[] }> => {
    const { data, error } = await supabase.functions.invoke('edit-code', {
      body: { prompt, currentCode, filename: 'App.tsx' },
    });

    if (error || !data.success) {
      throw new Error(data?.error || error?.message || 'Code editing failed');
    }

    return {
      code: data.code,
      explanation: data.explanation || '',
      appliedPatches: data.appliedPatches || [],
    };
  };

  // Update message helper
  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((msg) => msg.id === id ? { ...msg, ...updates } : msg));
  };

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      status: 'complete',
      timestamp: new Date(),
    };

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
    conversationHistoryRef.current.push({ role: 'user', content });

    const currentCode = getCurrentCode();
    const intent = classifyIntent(content, !!currentCode);

    console.log(`🎯 Intent: ${intent} (hasCode: ${!!currentCode})`);

    try {
      // EDIT FLOW
      if (intent === 'edit' && currentCode) {
        updateMessage(aiMessageId, { content: '🔧 Applying surgical edit...' });

        const result = await editCode(content, currentCode);
        if (!result.code) throw new Error('No code returned from edit');

        // Canonicalize imports
        const canonicalizedCode = canonicalizeImports(result.code);

        // Validate
        const validation = await validateCode(canonicalizedCode, 'App.tsx');
        const validationNote = validation.warnings.length > 0
          ? `\n\n⚠️ Warnings:\n${validation.warnings.map(w => `- ${w}`).join('\n')}`
          : '';

        const patchesList = result.appliedPatches.length > 0
          ? '\n\n**Changes applied:**\n' + result.appliedPatches.map(p => `- ${p}`).join('\n')
          : '';

        updateMessage(aiMessageId, {
          content: result.explanation + patchesList + validationNote,
          codeBlocks: [{ language: 'tsx', code: canonicalizedCode, filename: 'App.tsx' }],
          status: 'complete',
        });

        setProjectFiles([{ path: 'App.tsx', content: canonicalizedCode, language: 'tsx' }]);
        conversationHistoryRef.current.push({ role: 'assistant', content: result.explanation });

        setGenerationState({ status: 'building' });
        await new Promise((r) => setTimeout(r, 500));
        setGenerationState({ status: 'ready' });
        return;
      }

      // GENERATE FLOW (Full Pipeline)
      // Step 1: Planning
      updateMessage(aiMessageId, { content: '📋 Planning project structure...' });
      let plan: ProjectPlan | null = null;
      try {
        plan = await planProject(content);
        setCurrentPlan(plan);
        console.log('📋 Plan created:', plan);
      } catch (planError) {
        console.warn('Planning skipped:', planError);
      }

      // Step 2: Generate types (optional, depends on plan)
      if (plan && plan.ui?.components) {
        updateMessage(aiMessageId, { content: '📝 Generating type definitions...' });
        try {
          const types = await generateTypes(plan);
          console.log('📝 Types generated:', types.substring(0, 200));
        } catch (typeError) {
          console.warn('Type generation skipped:', typeError);
        }
      }

      // Step 3: Generate code with retries
      updateMessage(aiMessageId, { content: '⚡ Generating code...' });

      let retryCount = 0;
      let lastError: string | null = null;
      let finalCode: string | null = null;
      let finalContent = '';
      let features: string[] = [];

      while (retryCount <= MAX_RETRIES) {
        try {
          if (retryCount > 0) {
            updateMessage(aiMessageId, {
              content: `🔄 Fixing error (attempt ${retryCount}/${MAX_RETRIES})...\n\nError: ${lastError}`
            });
            setGenerationState({ status: 'generating', retryCount });
          }

          const result = await generateCode(content, plan || undefined, lastError || undefined, retryCount);
          finalContent = result.explanation || result.content;
          finalCode = result.code;
          features = result.features;

          if (!finalCode) throw new Error('No code was generated');

          // Canonicalize imports
          finalCode = canonicalizeImports(finalCode);

          // Step 4: Validate
          updateMessage(aiMessageId, { content: '✅ Validating code...' });
          const validation = await validateCode(finalCode, 'App.tsx');

          if (!validation.valid && validation.errors.length > 0) {
            lastError = validation.errors.join('; ');
            retryCount++;
            continue;
          }

          // Basic validation
          if (!finalCode.includes('export default')) {
            lastError = 'Component must have a default export';
            retryCount++;
            continue;
          }

          // SUCCESS
          const featuresMarkdown = features.length > 0
            ? '\n\n**Features:**\n' + features.map(f => `- ${f}`).join('\n')
            : '';

          const validationNote = validation.warnings.length > 0
            ? `\n\n⚠️ Warnings:\n${validation.warnings.map(w => `- ${w}`).join('\n')}`
            : '';

          updateMessage(aiMessageId, {
            content: finalContent + featuresMarkdown + validationNote,
            codeBlocks: [{ language: 'tsx', code: finalCode, filename: 'App.tsx' }],
            status: 'complete',
          });

          setProjectFiles([{ path: 'App.tsx', content: finalCode, language: 'tsx' }]);
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

      // All retries failed
      updateMessage(aiMessageId, {
        content: `❌ Failed after ${MAX_RETRIES} attempts.\n\nLast error: ${lastError}\n\nPlease try rephrasing your request.`,
        status: 'error',
      });
      setGenerationState({ status: 'error', error: lastError || 'Generation failed' });

    } catch (error: any) {
      console.error('Pipeline error:', error);
      updateMessage(aiMessageId, {
        content: `❌ Error: ${error.message}`,
        status: 'error',
      });
      setGenerationState({ status: 'error', error: error.message });
    }
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
    currentPlan,
    sendMessage,
    retryLastGeneration,
    isGenerating: generationState.status === 'generating' || generationState.status === 'building',
  };
}
