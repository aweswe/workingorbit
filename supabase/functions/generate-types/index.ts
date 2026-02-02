import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TYPE_GENERATOR_PROMPT = `You are a TypeScript type generator. You create type definitions from UI plans.

You output ONLY TypeScript type definitions. No React components. No implementation.

OUTPUT FORMAT:
\`\`\`typescript
// Component Props Types
export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export interface CardProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

// Section Props Types
export interface HeroProps {
  headline: string;
  subheadline?: string;
  ctaText?: string;
  ctaOnClick?: () => void;
}
\`\`\`

RULES:
1. Generate props interface for each component in the plan
2. Use React.ReactNode for children
3. Use optional (?) for non-required props
4. Use union types for variants
5. Include common props: className, style, id
6. Export all interfaces`;

interface UIPlan {
    components: {
        ui: string[];
        sections: string[];
        layout: string[];
    };
}

interface RequestBody {
    plan: {
        ui: UIPlan;
    };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { plan }: RequestBody = await req.json();

        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
        if (!GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured');
        }

        if (!plan?.ui?.components) {
            throw new Error('Invalid plan: missing UI components');
        }

        const allComponents = [
            ...plan.ui.components.ui,
            ...plan.ui.components.sections,
            ...plan.ui.components.layout,
        ];

        console.log(`Generating types for ${allComponents.length} components`);

        const userPrompt = `Generate TypeScript prop interfaces for these components:

UI Components: ${plan.ui.components.ui.join(', ')}
Sections: ${plan.ui.components.sections.join(', ')}
Layout: ${plan.ui.components.layout.join(', ')}

Output only the TypeScript type definitions.`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: TYPE_GENERATOR_PROMPT },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 2048,
                temperature: 0.2,
            }),
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('No content in AI response');
        }

        // Extract TypeScript code
        const codeMatch = content.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
        const types = codeMatch ? codeMatch[1].trim() : content.trim();

        console.log(`Generated ${types.split('export interface').length - 1} types`);

        return new Response(
            JSON.stringify({
                success: true,
                types,
                componentCount: allComponents.length,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: unknown) {
        console.error('Error in generate-types:', error);
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
