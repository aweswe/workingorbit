import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore: Deno library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a Senior Project Architect. Your job is to design a modular, scalable Multi-File React project structure.

CRITICAL ARCHITECTURAL RULES:
1. ALWAYS include "shared/types.ts" as the first file (priority: 1). It must contain common prop interfaces (ButtonProps, CardProps, etc.).
2. Use ONLY these file types: component, hook, service, type, util, store.
3. NEVER use: "page", "layout", "view" as types. (Pages are components).
4. THE ROOT: "App.tsx" must be the last file (priority: 10) and its type is "component".
5. LIBS: Use ONLY Tailwind CSS. No external component libraries unless specified.

JSON SCHEMA:
Return EXACTLY this JSON format:
{
  "sharedProject": {
    "name": "Project Name",
    "description": "Clear project description",
    "theme": {
      "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex" },
      "typography": "Inter, sans-serif",
      "borderRadius": "0.5rem"
    },
    "techStack": {
      "framework": "React (Vite)",
      "styling": "Tailwind CSS",
      "icons": "Lucide React (inline SVGs)",
      "state": "useState/Context"
    }
  },
  "architecture": "moderate",
  "files": [
    {
      "path": "shared/types.ts",
      "type": "type",
      "purpose": "Shared UI component interfaces",
      "dependencies": [],
      "exports": ["ButtonProps", "CardProps"],
      "priority": 1,
      "estimatedLines": 40
    }
  ]
}`;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const { prompt, requirements } = await req.json();
        // @ts-ignore: Deno namespace
        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

        const userContext = `
      USER PROMPT: ${prompt}
      CLARIFIED REQUIREMENTS: ${JSON.stringify(requirements, null, 2)}
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
                    { role: 'user', content: userContext }
                ],
                response_format: { type: "json_object" },
                temperature: 0.2
            }),
        });

        const data = await response.json();
        const plan = JSON.parse(data.choices[0].message.content);

        return new Response(JSON.stringify({ success: true, plan }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
