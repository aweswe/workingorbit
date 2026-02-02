import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EDITOR_SYSTEM_PROMPT = `You are a surgical code editor. You NEVER rewrite entire files.
You ONLY output valid JSON with patches.

CRITICAL RULES:
1. Each patch targets ONE specific change
2. Use EXACT search strings (copy from existing code character-by-character)
3. Preserve all formatting, whitespace, and indentation
4. Never touch unrelated code
5. If changing a className, include the full className attribute
6. Output ONLY valid JSON, no markdown or explanation outside JSON

OUTPUT FORMAT (pure JSON, no code fences):
{
  "explanation": "Brief description of what was changed",
  "patches": [
    {
      "file": "App.tsx",
      "operation": "replace",
      "search": "exact string to find",
      "replace": "replacement string"
    }
  ]
}

OPERATIONS:
- "replace": Find search string and replace with replace string
- "insert": Insert replace string after search string
- "delete": Remove the search string entirely`;

interface CodePatch {
    file: string;
    operation: 'replace' | 'insert' | 'delete';
    search: string;
    replace?: string;
}

interface EditorResponse {
    explanation: string;
    patches: CodePatch[];
}

interface RequestBody {
    prompt: string;
    currentCode: string;
    filename?: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { prompt, currentCode, filename = 'App.tsx' }: RequestBody = await req.json();

        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
        if (!GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured');
        }

        const userMessage = `CURRENT CODE in ${filename}:
\`\`\`tsx
${currentCode}
\`\`\`

USER REQUEST: ${prompt}

Output ONLY the JSON patch object. No markdown, no code fences, just pure JSON.`;

        console.log(`Edit request: ${prompt.substring(0, 100)}...`);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: EDITOR_SYSTEM_PROMPT },
                    { role: 'user', content: userMessage },
                ],
                max_tokens: 2048,
                temperature: 0.3, // Lower temperature for more precise edits
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

        // Clean up response - remove markdown code fences if present
        content = content.trim();
        if (content.startsWith('```')) {
            content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        // Parse the JSON response
        let editorResponse: EditorResponse;
        try {
            editorResponse = JSON.parse(content);
        } catch (parseError) {
            console.error('Failed to parse editor response:', content);
            throw new Error('Failed to parse editor response as JSON');
        }

        // Validate patches
        if (!editorResponse.patches || !Array.isArray(editorResponse.patches)) {
            throw new Error('Invalid response: missing patches array');
        }

        // Apply patches to the code
        let updatedCode = currentCode;
        const appliedPatches: string[] = [];
        const errors: string[] = [];

        for (const patch of editorResponse.patches) {
            if (!patch.search) {
                errors.push('Patch missing search string');
                continue;
            }

            const occurrences = (updatedCode.match(new RegExp(escapeRegExp(patch.search), 'g')) || []).length;

            if (occurrences === 0) {
                errors.push(`Search string not found: "${patch.search.substring(0, 50)}..."`);
                continue;
            }

            if (occurrences > 1) {
                errors.push(`Multiple matches found for: "${patch.search.substring(0, 50)}..." - applying first only`);
            }

            switch (patch.operation) {
                case 'replace':
                    updatedCode = updatedCode.replace(patch.search, patch.replace || '');
                    appliedPatches.push(`Replaced: ${patch.search.substring(0, 30)}...`);
                    break;
                case 'insert':
                    updatedCode = updatedCode.replace(patch.search, patch.search + (patch.replace || ''));
                    appliedPatches.push(`Inserted after: ${patch.search.substring(0, 30)}...`);
                    break;
                case 'delete':
                    updatedCode = updatedCode.replace(patch.search, '');
                    appliedPatches.push(`Deleted: ${patch.search.substring(0, 30)}...`);
                    break;
            }
        }

        console.log(`Applied ${appliedPatches.length} patches, ${errors.length} errors`);

        return new Response(
            JSON.stringify({
                success: true,
                explanation: editorResponse.explanation,
                code: updatedCode,
                patches: editorResponse.patches,
                appliedPatches,
                errors,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: unknown) {
        console.error('Error in edit-code:', error);
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

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
