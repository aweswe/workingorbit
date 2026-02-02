import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert React/TypeScript code generator. You create beautiful, functional UI components using React and Tailwind CSS.

CRITICAL RULES:
1. Always output a single, complete, working React component
2. The component MUST be the default export
3. Use ONLY inline Tailwind CSS classes for styling
4. Do NOT use any external imports except React hooks (useState, useEffect, etc.)
5. The component should be self-contained and runnable in a Sandpack environment
6. Use modern, beautiful UI patterns with gradients, shadows, hover effects
7. Make the UI responsive and visually appealing
8. Include realistic placeholder content/data

OUTPUT FORMAT:
Your response MUST follow this exact format:

EXPLANATION:
[Brief 1-2 sentence description of what you built]

\`\`\`tsx
[Your complete React component code here]
\`\`\`

FEATURES:
- [Feature 1]
- [Feature 2]
- [Feature 3]

NEVER include multiple code blocks. Only ONE code block with the complete component.
NEVER use external dependencies like lucide-react, @radix-ui, etc. Use inline SVGs for icons.
NEVER use import statements except for React.`;

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, conversationHistory = [], errorContext, retryCount = 0 }: RequestBody = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build messages array
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add conversation history for context
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory.slice(-10)); // Last 10 messages for context
    }

    // If this is an error retry, add error context
    if (errorContext && retryCount > 0) {
      messages.push({
        role: 'user',
        content: `The previous code had an error. Please fix it.

ERROR:
${errorContext}

Original request: ${prompt}

Please provide a corrected version that fixes this error. Remember to output ONLY one complete, working component.`
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    console.log(`Generating code for prompt: ${prompt.substring(0, 100)}...`);
    console.log(`Retry count: ${retryCount}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Extract code from the response
    const codeMatch = content.match(/```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : null;

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
    console.log('Explanation:', explanation.substring(0, 100));

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
