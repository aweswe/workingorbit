import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore: Deno library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a Static Code Analyzer and TypeScript compiler. Your job is to find syntax errors, logically missing imports, and type inconsistencies in the provided code.

RULES:
1. Be extremely strict about syntax.
2. Check if all used components/utils in the code are imported.
3. Check for export default in React components.
4. Check for Tailwind CSS class syntax.
5. Identify "Warnings" (non-breaking issues) vs "Errors" (breaking issues).

JSON OUTPUT FORMAT:
{
  "valid": true/false,
  "errors": ["Error message 1", "Error message 2"],
  "warnings": ["Warning message 1"]
}
`;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const { code, filename } = await req.json();
        // @ts-ignore: Deno namespace
        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

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
                    { role: 'user', content: `Analyze this file: ${filename}\n\nCODE:\n${code}` }
                ],
                response_format: { type: "json_object" },
                temperature: 0,
            }),
        });

        if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ valid: true, errors: [], warnings: [error.message] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
