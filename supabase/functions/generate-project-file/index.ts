import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore: Deno library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a Senior Full-Stack Engineer. Your task is to generate the code for a SPECIFIC file as part of a larger project.

CRITICAL INSTRUCTIONS:
1. ONLY generate code for the requested file.
2. Use the provided "Project Context" and "Shared Types" to ensure consistency.
3. Use Tailwind CSS for all styling.
4. Follow the provided imports and exports strictly.
5. If the file is a React component, use functional components and hooks.
6. Ensure the code is production-ready, beautiful, and self-contained within its module boundaries.

OUTPUT FORMAT:
Return your response in this EXACT format:
EXPLANATION:
[Brief description of what this file does]

\`\`\`tsx
[Your code here]
\`\`\`
`;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const {
            filePlan,
            sharedProject,
            contextFiles = [], // Previously generated files (e.g., shared/types.ts)
            prompt
        } = await req.json();

        // @ts-ignore: Deno namespace
        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

        const combinedContext = `
      ORIGINAL PROMPT: ${prompt}
      PROJECT IDENTITY: ${JSON.stringify(sharedProject, null, 2)}
      
      FILE TO GENERATE:
      Path: ${filePlan.path}
      Type: ${filePlan.type}
      Purpose: ${filePlan.purpose}
      Dependencies: ${filePlan.dependencies.join(', ')}
      Expected Exports: ${filePlan.exports.join(', ')}
      
      EXISTING CONTEXT FILES:
      ${contextFiles.map((f: any) => `--- FILE: ${f.path} ---\n${f.content}\n`).join('\n')}
    `;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: combinedContext }
                ],
                temperature: 0.1, // Low temperature for high precision
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Groq API error (${response.status}): ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        const content = data.choices[0].message.content;

        // Extract code
        const codeMatch = content.match(/```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1].trim() : null;

        if (!code) throw new Error("AI failed to generate code block.");

        return new Response(JSON.stringify({ success: true, code, content }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
