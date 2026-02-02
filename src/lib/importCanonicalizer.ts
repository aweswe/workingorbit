/**
 * Import Canonicalizer
 * Rewrites all relative imports to use the @/ alias format
 */

interface ImportRule {
    pattern: RegExp;
    replacement: string;
}

const IMPORT_RULES: ImportRule[] = [
    // Relative component imports
    { pattern: /from\s+['"]\.\/components\//g, replacement: "from '@/components/" },
    { pattern: /from\s+['"]\.\.\/components\//g, replacement: "from '@/components/" },
    { pattern: /from\s+['"]\.\.\/\.\.\/components\//g, replacement: "from '@/components/" },

    // Relative type imports
    { pattern: /from\s+['"]\.\/types\//g, replacement: "from '@/types/" },
    { pattern: /from\s+['"]\.\.\/types\//g, replacement: "from '@/types/" },
    { pattern: /from\s+['"]\.\.\/\.\.\/types\//g, replacement: "from '@/types/" },

    // Relative lib imports
    { pattern: /from\s+['"]\.\/lib\//g, replacement: "from '@/lib/" },
    { pattern: /from\s+['"]\.\.\/lib\//g, replacement: "from '@/lib/" },
    { pattern: /from\s+['"]\.\.\/\.\.\/lib\//g, replacement: "from '@/lib/" },

    // Relative hooks imports
    { pattern: /from\s+['"]\.\/hooks\//g, replacement: "from '@/hooks/" },
    { pattern: /from\s+['"]\.\.\/hooks\//g, replacement: "from '@/hooks/" },
    { pattern: /from\s+['"]\.\.\/\.\.\/hooks\//g, replacement: "from '@/hooks/" },
];

/**
 * Canonicalize imports in code to use @/ alias
 */
export function canonicalizeImports(code: string): string {
    let result = code;

    for (const rule of IMPORT_RULES) {
        result = result.replace(rule.pattern, rule.replacement);
    }

    // Remove .tsx/.ts extensions from imports
    result = result.replace(/from\s+['"](@\/[^'"]+)\.(tsx?)['"]/g, "from '$1'");

    return result;
}

/**
 * Validate all imports use @/ alias
 */
export function validateImports(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        const importMatch = line.match(/import\s+.*from\s+['"](\.\.?\/[^'"]+)['"]/);
        if (importMatch) {
            errors.push(`Line ${index + 1}: Relative import found: ${importMatch[1]}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Extract all import paths from code
 */
export function extractImports(code: string): string[] {
    const imports: string[] = [];
    const regex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = regex.exec(code)) !== null) {
        imports.push(match[1]);
    }

    return imports;
}

/**
 * Check if an import is external (npm package)
 */
export function isExternalImport(importPath: string): boolean {
    return !importPath.startsWith('.') && !importPath.startsWith('@/');
}
