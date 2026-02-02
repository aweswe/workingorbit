// Project Architecture Memory - Source of truth for all agents
export interface ProjectArchitecture {
    framework: 'nextjs-app-router' | 'nextjs-pages' | 'vite-react' | 'remix';
    language: 'typescript' | 'javascript';
    styling: 'tailwind' | 'css-modules' | 'styled-components';
    alias: string;
    backend: 'supabase' | 'prisma' | 'firebase' | 'none';
    componentStyle: 'atomic' | 'feature-based';
}

// UI Plan Schema
export interface UIPlan {
    components: {
        ui: string[];       // Reusable primitives: Button, Input, Card
        sections: string[]; // Page sections: Hero, Features, Pricing
        layout: string[];   // Layout components: Navbar, Footer, Sidebar
    };
    pages: string[];      // Pages to generate: Home, About, Dashboard
    theme: {
        primaryColor?: string;
        style?: 'minimal' | 'glassmorphism' | 'neumorphism' | 'gradient';
    };
}

// Database Plan Schema
export interface DBPlan {
    tables: Record<string, TableSchema>;
}

export interface TableSchema {
    columns: Record<string, ColumnType>;
    relations?: Record<string, Relation>;
}

export type ColumnType =
    | 'uuid'
    | 'text'
    | 'int'
    | 'boolean'
    | 'timestamp'
    | 'json';

export interface Relation {
    table: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
    foreignKey: string;
}

// API Plan Schema
export interface APIPlan {
    endpoints: Record<string, APIEndpoint>;
}

export interface APIEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    input?: Record<string, string>;
    output?: Record<string, string>;
    auth?: boolean;
}

// Combined Project Plan
export interface ProjectPlan {
    architecture: ProjectArchitecture;
    ui: UIPlan;
    db?: DBPlan;
    api?: APIPlan;
    dependencies: string[];
}

// Default architecture for new projects
export const DEFAULT_ARCHITECTURE: ProjectArchitecture = {
    framework: 'vite-react',
    language: 'typescript',
    styling: 'tailwind',
    alias: '@/',
    backend: 'none',
    componentStyle: 'atomic',
};
