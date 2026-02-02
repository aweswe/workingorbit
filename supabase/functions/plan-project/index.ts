import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANNER_SYSTEM_PROMPT = `You are a project planning agent. You analyze user requests and output structured JSON plans.

You NEVER output code. Only JSON plans.

OUTPUT FORMAT (pure JSON, no markdown):
{
  "architecture": {
    "framework": "vite-react",
    "language": "typescript",
    "styling": "tailwind",
    "alias": "@/",
    "backend": "none",
    "componentStyle": "atomic"
  },
  "ui": {
    "components": {
      "ui": ["Button", "Input", "Card"],
      "sections": ["Hero", "Features"],
      "layout": ["Navbar", "Footer"]
    },
    "pages": ["Home"],
    "theme": {
      "primaryColor": "#3B82F6",
      "style": "gradient"
    }
  },
  "dependencies": ["framer-motion"]
}

RULES:
1. Output ONLY valid JSON
2. No markdown, no code fences
3. Analyze the request to determine:
   - What UI components are needed
   - What sections/layouts are required
   - What theme style fits
   - What dependencies might be needed
4. Be specific about component names
5. Include animation library if request mentions "animated" or "dynamic"

DEPENDENCY MAPPING:
- animations/motion → framer-motion
- icons → lucide-react (but prefer inline SVGs)
- forms → react-hook-form
- dates → date-fns
- charts → recharts`;

interface RequestBody {
    prompt: string;
}

interface ProjectPlan {
    architecture: {
        framework: string;
        language: string;
        styling: string;
        alias: string;
        backend: string;
        componentStyle: string;
    };
    ui: {
        components: {
            ui: string[];
            sections: string[];
            layout: string[];
        };
        pages: string[];
        theme: {
            primaryColor?: string;
            style?: string;
        };
    };
    dependencies: string[];
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { prompt }: RequestBody = await req.json();

        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
        if (!GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured');
        }

        console.log(`Planning project for: ${prompt.substring(0, 100)}...`);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
                    { role: 'user', content: `Plan a project for: ${prompt}` },
                ],
                max_tokens: 2048,
                temperature: 0.3,
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

        // Clean up response
        content = content.trim();
        if (content.startsWith('```')) {
            content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        // Parse the plan
        let plan: ProjectPlan;
        try {
            plan = JSON.parse(content);
        } catch (parseError) {
            console.error('Failed to parse plan:', content);
            throw new Error('Failed to parse plan as JSON');
        }

        // Validate required fields
        if (!plan.ui || !plan.ui.components) {
            throw new Error('Invalid plan: missing UI components');
        }

        console.log(`Plan created: ${plan.ui.components.sections?.length || 0} sections`);

        return new Response(
            JSON.stringify({
                success: true,
                plan,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: unknown) {
        console.error('Error in plan-project:', error);
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
