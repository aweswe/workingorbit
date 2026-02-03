import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore: Deno library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANALYZER_SYSTEM_PROMPT = `You are a requirements analyst. Your job is to analyze user prompts for web applications and determine if they are clear enough to generate code.

You must identify:
1. isVague: Is the request too short or missing fundamental details?
2. missingInfo: What key pieces of information are needed? (e.g., data type, target users, specific features, style preferences)
3. assumptions: What would we have to guess if we proceeded now?
4. confidence: A score from 0-100 on how ready we are to generate.

OUTPUT FORMAT (pure JSON, no markdown):
{
  "isVague": boolean,
  "missingInfo": string[],
  "assumptions": string[],
  "confidence": number,
  "explanation": "Brief explanation of why the confidence score was given"
}

EXAMPLES:
- "Create a dashboard" -> { "isVague": true, "missingInfo": ["primary goal", "data types", "key metrics", "target audience"], "assumptions": ["commercial look", "generic data", "no authentication"], "confidence": 30 }
- "Create a todo app with drag-drop and categories" -> { "isVague": false, "missingInfo": ["preferred style"], "assumptions": ["browser local storage for persistence"], "confidence": 85 }`;

interface RequestBody {
    prompt: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { prompt }: RequestBody = await req.json();

        // @ts-ignore: Deno namespace
        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
        if (!GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured');
        }

        console.log(`Analyzing prompt: ${prompt.substring(0, 100)}...`);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    { role: 'system', content: ANALYZER_SYSTEM_PROMPT },
                    { role: 'user', content: `Analyze this request: "${prompt}"` },
                ],
                max_tokens: 1024,
                temperature: 0.2,
                response_format: { type: "json_object" }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', errorText);
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('No content in AI response');
        }

        const analysis = JSON.parse(content);

        return new Response(
            JSON.stringify({
                success: true,
                analysis,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: unknown) {
        console.error('Error in analyze-prompt:', error);
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
