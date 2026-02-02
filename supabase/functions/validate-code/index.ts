import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
    code: string;
    filename: string;
}

interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { code, filename }: RequestBody = await req.json();

        if (!code) {
            throw new Error('No code provided');
        }

        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };

        const lines = code.split('\n');

        // Check for common issues
        lines.forEach((line, index) => {
            const lineNum = index + 1;

            // Check for relative imports
            const relativeImport = line.match(/import\s+.*from\s+['"](\.\.?\/[^'"]+)['"]/);
            if (relativeImport) {
                result.warnings.push(`Line ${lineNum}: Relative import should use @/ alias: ${relativeImport[1]}`);
            }

            // Check for missing semicolons on imports
            if (line.match(/^import\s+/) && !line.endsWith(';') && !line.includes('{')) {
                result.warnings.push(`Line ${lineNum}: Import statement may be missing semicolon`);
            }

            // Check for console.log in production code
            if (line.includes('console.log')) {
                result.warnings.push(`Line ${lineNum}: console.log found - remove for production`);
            }

            // Check for any type usage
            if (line.includes(': any') || line.includes('<any>')) {
                result.warnings.push(`Line ${lineNum}: 'any' type found - consider using specific type`);
            }
        });

        // Check for required exports
        if (filename?.endsWith('.tsx')) {
            if (!code.includes('export default') && !code.includes('export function')) {
                result.errors.push('Component file must have a default export');
                result.valid = false;
            }
        }

        // Check for React import in TSX files
        if (filename?.endsWith('.tsx')) {
            if (!code.includes("from 'react'") && !code.includes('from "react"')) {
                // Modern React doesn't require import, but check for JSX
                if (code.includes('<') && code.includes('/>')) {
                    // Has JSX, should be fine with modern React
                }
            }
        }

        // Check for basic syntax issues
        const openBraces = (code.match(/{/g) || []).length;
        const closeBraces = (code.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
            result.errors.push(`Mismatched braces: ${openBraces} opening, ${closeBraces} closing`);
            result.valid = false;
        }

        const openParens = (code.match(/\(/g) || []).length;
        const closeParens = (code.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
            result.errors.push(`Mismatched parentheses: ${openParens} opening, ${closeParens} closing`);
            result.valid = false;
        }

        console.log(`Validation result: ${result.valid ? 'PASS' : 'FAIL'} - ${result.errors.length} errors, ${result.warnings.length} warnings`);

        return new Response(
            JSON.stringify({
                success: true,
                ...result,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: unknown) {
        console.error('Error in validate-code:', error);
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
