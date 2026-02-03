import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore: Deno library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert React/TypeScript code generator. You create beautiful, functional UI components using React and Tailwind CSS.

CRITICAL RULES:
1. Output EXACTLY ONE component with EXACTLY ONE "export default" statement
2. The component MUST be a valid React functional component
3. Use ONLY inline Tailwind CSS classes for styling
4. Do NOT use any external imports except React hooks (useState, useEffect, etc.)
5. The component should be self-contained and runnable in a Sandpack environment
6. Use modern, beautiful UI patterns with gradients, shadows, hover effects
7. Make the UI responsive and visually appealing
8. Include realistic placeholder content/data

FORBIDDEN PATTERNS (NEVER USE THESE):
- NEVER use <details> or <summary> tags
- NEVER duplicate the component definition
- NEVER include multiple "export default" statements
- NEVER use malformed JSX or unclosed tags
- NEVER use external dependencies like lucide-react, @radix-ui

SVG ICONS:
When you need icons, use simple, valid inline SVGs like:
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
</svg>

OUTPUT FORMAT:
Your response MUST follow this exact format:

EXPLANATION:
[Brief 1-2 sentence description of what you built]

\`\`\`tsx
[Your complete React component code here - ONLY ONE COMPONENT WITH ONE export default]
\`\`\`

FEATURES:
- [Feature 1]
- [Feature 2]
- [Feature 3]

VALIDATION CHECKLIST (verify before responding):
✓ Only ONE component definition
✓ Only ONE "export default" at the END
✓ All JSX tags properly closed
✓ No <details> or <summary> tags
✓ Valid TypeScript/React syntax`;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RequestBody {
  prompt: string;
  conversationHistory?: Message[];
  errorContext?: string;
  retryCount?: number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, conversationHistory = [], errorContext, retryCount = 0 }: RequestBody = await req.json();

    // @ts-ignore: Deno namespace
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory.slice(-10));
    }

    if (errorContext && retryCount > 0) {
      messages.push({
        role: 'user',
        content: `The previous code had an error. Please fix it.

ERROR:
${errorContext}

Original request: ${prompt}

Please provide a corrected version. Remember: ONLY ONE component, ONLY ONE export default.`
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    console.log(`Generating code for prompt: ${prompt.substring(0, 100)}...`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', errorText);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Extract code from the response
    const codeMatch = content.match(/```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/);
    let code = codeMatch ? codeMatch[1].trim() : null;

    // Post-processing: Fix common issues
    if (code) {
      // Remove duplicate component definitions
      const exportDefaultCount = (code.match(/export default/g) || []).length;
      if (exportDefaultCount > 1) {
        // Keep only the first component definition
        const firstExportIndex = code.indexOf('export default');
        const secondExportIndex = code.indexOf('export default', firstExportIndex + 1);
        if (secondExportIndex > -1) {
          code = code.substring(0, secondExportIndex).trim();
        }
      }

      // Remove malformed tags
      code = code.replace(/<\/details>/g, '');
      code = code.replace(/<details>/g, '');
      code = code.replace(/<summary[^>]*>.*?<\/summary>/g, '');
    }

    // Extract explanation
    const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)(?=```|FEATURES:|$)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';

    // Extract features
    const featuresMatch = content.match(/FEATURES:\s*([\s\S]*?)$/i);
    const featuresText = featuresMatch ? featuresMatch[1].trim() : '';
    const features = featuresText
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-'))
      .map((line: string) => line.replace(/^-\s*/, '').trim());

    console.log('Code extracted:', code ? 'Yes' : 'No');

    return new Response(
      JSON.stringify({
        success: true,
        content,
        code,
        explanation,
        features,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('Error in generate-code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
