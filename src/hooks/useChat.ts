import { useState, useCallback, useRef } from 'react';
import { Message, GenerationState, ProjectFile, RequestIntent } from '@/types/chat';
// @ts-ignore: module aliasing
import { ProjectPlan, PromptAnalysis, UserRequirements, Question } from '@/types/pipeline';
import { supabase } from '@/integrations/supabase/client';
// @ts-ignore: module aliasing
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

  // Smart Planner States
  const [pendingAnalysis, setPendingAnalysis] = useState<PromptAnalysis | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [clarifiedRequirements, setClarifiedRequirements] = useState<UserRequirements | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const conversationHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const lastPromptRef = useRef<string>('');

  // Update message helper
  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((msg) => msg.id === id ? { ...msg, ...updates } : msg));
  }, []);

  // API Call Helpers
  const analyzePrompt = async (prompt: string): Promise<{ analysis: PromptAnalysis; questions: Question[]; skipQuestions: boolean }> => {
    const { data, error } = await supabase.functions.invoke('analyze-prompt', {
      body: { prompt, projectId: 'temp-ui-project' },
    });
    if (error) throw new Error(error.message || 'Analysis failed');
    return data;
  };

  const planProject = async (prompt: string): Promise<ProjectPlan> => {
    const { data, error } = await supabase.functions.invoke('plan-project', {
      body: { prompt },
    });
    if (error || !data.success) throw new Error(data?.error || error?.message || 'Planning failed');
    return data.plan;
  };

  const generateTypes = async (plan: ProjectPlan): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('generate-types', {
      body: { plan },
    });
    if (error || !data.success) throw new Error(data?.error || error?.message || 'Type generation failed');
    return data.types;
  };

  const generateProjectFile = async (
    filePlan: any,
    sharedProject: any,
    contextFiles: ProjectFile[],
    prompt: string
  ): Promise<{ code: string; content: string }> => {
    const { data, error } = await supabase.functions.invoke('generate-project-file', {
      body: { filePlan, sharedProject, contextFiles, prompt },
    });
    if (error || !data.success) throw new Error(data?.error || error?.message || `Failed to generate ${filePlan.path}`);
    return data;
  };

  const validateCode = async (code: string, filename: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> => {
    const { data, error } = await supabase.functions.invoke('validate-code', {
      body: { code, filename },
    });
    if (error) return { valid: true, errors: [], warnings: [] };
    return {
      valid: data.valid ?? true,
      errors: data.errors || [],
      warnings: data.warnings || [],
    };
  };

  const editCodeSnippet = async (
    prompt: string,
    currentCode: string
  ): Promise<{ code: string; explanation: string; appliedPatches: string[] }> => {
    const { data, error } = await supabase.functions.invoke('edit-code', {
      body: { prompt, currentCode, filename: 'App.tsx' },
    });
    if (error || !data.success) throw new Error(data?.error || error?.message || 'Code editing failed');
    return {
      code: data.code,
      explanation: data.explanation || '',
      appliedPatches: data.appliedPatches || [],
    };
  };

  const getCurrentCode = (): string | null => {
    const appFile = projectFiles.find(f => f.path === 'App.tsx');
    return appFile?.content || null;
  };

  // Main Generation Pipeline
  const runGenerationPipeline = useCallback(async (prompt: string, aiMessageId: string, requirements?: UserRequirements) => {
    try {
      setGenerationState({ status: 'generating' });

      // Step 1: Planning
      updateMessage(aiMessageId, { content: '📋 Designing project architecture...' });
      const plan = await planProject(prompt);
      setCurrentPlan(plan);

      if (!plan.files || plan.files.length === 0) {
        throw new Error('Planner failed to generate a file list');
      }

      // Step 2: Sequential Multi-File Generation
      const generatedFiles: ProjectFile[] = [];
      const sortedFiles = [...plan.files].sort((a, b) => a.priority - b.priority);

      let currentFileIndex = 0;
      const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> => {
        try {
          return await fn();
        } catch (error) {
          if (retries <= 0) throw error;
          await new Promise(resolve => setTimeout(resolve, delay));
          return withRetry(fn, retries - 1, delay * 2);
        }
      };

      for (const filePlan of sortedFiles) {
        currentFileIndex++;
        const progress = `🏗️ Building project (${currentFileIndex}/${sortedFiles.length}): \`${filePlan.path}\`...`;
        updateMessage(aiMessageId, {
          content: progress + (generatedFiles.length > 0 ? `\n\nGenerated: ${generatedFiles.map(f => `\`${f.path}\``).join(', ')}` : '')
        });

        // 1. Initial Generation
        const contextFiles = generatedFiles.filter(f =>
          f.path.includes('shared/types') ||
          f.path.includes('types/') ||
          filePlan.dependencies.includes(f.path)
        );

        let { code, content } = await withRetry(() => generateProjectFile(
          filePlan,
          plan.sharedProject,
          contextFiles,
          prompt
        ));

        // 2. Validation & Auto-Healing Loop
        let retryCount = 0;
        const maxRetriesPerFile = 2;

        while (retryCount < maxRetriesPerFile) {
          updateMessage(aiMessageId, {
            content: progress + `\n🔍 Validating \`${filePlan.path}\`...` + (generatedFiles.length > 0 ? `\n\nGenerated: ${generatedFiles.map(f => `\`${f.path}\``).join(', ')}` : '')
          });
          const validation = await validateCode(code, filePlan.path);

          if (validation.valid && validation.errors.length === 0) {
            break; // Code is clean
          }

          // Reparation required
          retryCount++;
          const errorContext = `Found ${validation.errors.length} errors in ${filePlan.path}:\n- ${validation.errors.join('\n- ')}`;
          updateMessage(aiMessageId, {
            content: progress + `\n🔧 Auto-healing \`${filePlan.path}\` (Attempt ${retryCount}/${maxRetriesPerFile})...\n\n${errorContext}` + (generatedFiles.length > 0 ? `\n\nGenerated: ${generatedFiles.map(f => `\`${f.path}\``).join(', ')}` : '')
          });

          const editResult = await editCodeSnippet(
            `Fix the following errors in the code for ${filePlan.path}:\n${errorContext}\n\nEnsure ALL imports and exports are correct.`,
            code
          );
          code = editResult.code;
        }

        const cleanCode = canonicalizeImports(code, filePlan.path);
        const newFile: ProjectFile = {
          path: filePlan.path,
          content: cleanCode,
          language: 'tsx'
        };

        generatedFiles.push(newFile);
        setProjectFiles([...generatedFiles]); // Update UI file tree in real-time

        // Brief pause between files to prevent rate limiting/overload
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final Step: Completion
      const finalExplanation = `✅ Project generated successfully!\n\n**Structure:**\n${sortedFiles.map(f => `- \`${f.path}\`: ${f.purpose}`).join('\n')}`;

      updateMessage(aiMessageId, {
        content: finalExplanation,
        status: 'complete',
      });

      conversationHistoryRef.current.push({ role: 'assistant', content: finalExplanation });
      setGenerationState({ status: 'ready' });

    } catch (error: any) {
      console.error('Generation Pipeline Error:', error);
      updateMessage(aiMessageId, { content: `❌ Error: ${error.message}`, status: 'error' });
      setGenerationState({ status: 'error', error: error.message });
    }
  }, [updateMessage]);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content, status: 'complete', timestamp: new Date() };
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = { id: aiMessageId, role: 'assistant', content: '', status: 'generating', timestamp: new Date() };

    setMessages((prev) => [...prev, userMessage, aiMessage]);
    setGenerationState({ status: 'generating' });
    conversationHistoryRef.current.push({ role: 'user', content });
    lastPromptRef.current = content;

    const currentCode = getCurrentCode();
    const intent = classifyIntent(content, !!currentCode);

    try {
      if (intent === 'generate') {
        updateMessage(aiMessageId, { content: '🔍 Analyzing requirements...' });
        const { analysis, questions, skipQuestions } = await analyzePrompt(content);

        if (!skipQuestions && questions && questions.length > 0) {
          setPendingAnalysis(analysis);
          setPendingQuestions(questions);
          setShowQuestionnaire(true);
          updateMessage(aiMessageId, { content: '❓ I have some questions to clarify your vision. Please check the questionnaire below.' });
          setGenerationState({ status: 'idle' });
          return;
        }
        await runGenerationPipeline(content, aiMessageId);
      } else if (intent === 'edit' && currentCode) {
        updateMessage(aiMessageId, { content: '🔧 Applying surgical edit...' });
        const result = await editCodeSnippet(content, currentCode);
        const code = canonicalizeImports(result.code, 'App.tsx');

        updateMessage(aiMessageId, {
          content: result.explanation + (result.appliedPatches.length ? '\n\n**Changes:**\n' + result.appliedPatches.map(p => `- ${p}`).join('\n') : ''),
          codeBlocks: [{ language: 'tsx', code, filename: 'App.tsx' }],
          status: 'complete',
        });
        setProjectFiles([{ path: 'App.tsx', content: code, language: 'tsx' }]);
        conversationHistoryRef.current.push({ role: 'assistant', content: result.explanation });
        setGenerationState({ status: 'ready' });
      }
    } catch (error: any) {
      updateMessage(aiMessageId, { content: `❌ Error: ${error.message}`, status: 'error' });
      setGenerationState({ status: 'error', error: error.message });
    }
  }, [projectFiles, runGenerationPipeline, updateMessage]);

  const proceedWithRequirements = useCallback(async (requirements: UserRequirements) => {
    setClarifiedRequirements(requirements);
    setShowQuestionnaire(false);
    const aiMessage = messages.find(m => m.status === 'generating' || m.content.includes('questionnaire'));
    const aiMessageId = aiMessage?.id || (Date.now() + 1).toString();

    updateMessage(aiMessageId, { content: '✅ Requirements clarified. Starting generation...', status: 'generating' });
    await runGenerationPipeline(lastPromptRef.current, aiMessageId, requirements);
  }, [messages, runGenerationPipeline, updateMessage]);

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
    activeFilePath,
    setActiveFilePath,
    currentPlan,
    showQuestionnaire,
    pendingQuestions,
    sendMessage,
    proceedWithRequirements,
    skipQuestionnaire: () => setShowQuestionnaire(false),
    retryLastGeneration,
    isGenerating: generationState.status === 'generating' || generationState.status === 'building',
  };
}
