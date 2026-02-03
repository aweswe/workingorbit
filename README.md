# 🚀 Orbit

**Orbit** is an experimental AI-powered code generation system inspired by Lovable/Bolt, focused on **single-file React app generation**, **surgical prompt-based editing**, and **incremental evolution of code** instead of destructive rewrites.

Orbit is not just a frontend generator — it is an exploration of **AI-native software engineering**, including planning models, architectural reasoning, component graph construction, and backend orchestration using **Supabase Edge Functions**.

The project is intentionally split into multiple branches to separate a **stable minimal core** from a **highly experimental engine**.

---

## 🌿 Branch Overview

### ✅ `main` — Stable Single-File Generator (Working)

This branch contains the **working production concept** of Orbit.

**Core Characteristics**

- Generates a **single-file React app** (`app.tsx`)
- Prompt-based **surgical edits** (no full rewrites)
- Frontend runs entirely on **mock data**
- Deterministic, repeatable output
- Low error surface
- No backend dependency required

**Primary Use Case**

A Lovable-style clone where:

> Prompt → Working UI → Incremental edits → Still working UI

**Philosophy**

> Keep one file sacred  
> Edit surgically  
> Never destroy working code

---

### 🧪 `dev` — Experimental Engine (Unstable / Research)

This branch contains the **next-generation Orbit engine** and broader AI-native engineering experiments.

**What Is Being Built Here**

- Multi-step **planning model**
- Heavy UI/UX generation
- Component-based output (multi-file projects)
- Architectural reasoning layer
- Dependency graph construction
- Import resolution system
- Supabase integration for:
  - Auth
  - Projects
  - Storage
  - Persistence
- Backend orchestration using **Supabase Edge Functions**
- Agent-style internal roles:
  - Planner
  - UI Designer
  - Component Builder
  - Backend Planner
  - Integrator

**Important**

This branch is intentionally **incomplete**.

Some components are missing.  
Some flows are partially wired.  
Build errors are expected.

This branch prioritizes **exploration and architecture discovery** over stability.

---

## 🧠 Engineering Depth

Orbit is exploring how AI systems can behave more like **software engineers** rather than simple text generators.

Key research areas:

### 1. Planning Before Generation
A model produces a structured plan:
- Pages
- Components
- Data shapes
- State needs
- Backend requirements

### 2. Deterministic Editing
Instead of regenerating everything:
- Locate target region
- Apply patch
- Preserve surrounding code

### 3. File & Component Awareness
Understanding:
- What file owns what responsibility
- What can be safely modified
- What must remain stable

### 4. Supabase Edge Function Architecture
Orbit experiments with using **Supabase Edge Functions** as:

- Generation orchestrators
- Tool routers
- Project state managers
- Streaming response layer

This enables:
- Stateless scaling
- Low-latency execution
- Serverless orchestration

---

## 🛠️ Tech Stack (Current Direction)

**Frontend**
- React
- TypeScript
- Next.js / Vite
- Tailwind

**Backend / Infra (Experimental)**
- Supabase
- Supabase Edge Functions
- Postgres
- Vector embeddings (future)

**AI**
- Large language models
- Diff-based editing
- Planning-first generation

---

## ⚠️ Known Limitations

- No real backend in `main`
- No auth in `main`
- No persistence in `main`
- No component extraction yet
- No streaming generation yet

These are **intentional tradeoffs** to keep the core stable.

---

## 🔜 Next Steps — `main` Branch

The next evolution of the stable branch will focus on **product polish and foundational platform features**:

### 1. Correct Branding & UI Identity
- Replace placeholder branding with **Orbit** identity
- Consistent color system
- Logo usage
- Typography system
- Product-level polish

### 2. Auth Integration
- Supabase Auth
- Email / OAuth providers
- Session handling

### 3. Project Persistence
- Save prompts
- Save generated `app.tsx`
- Load previous projects

### 4. Still Single-File
Even with auth and persistence:

> Code generation remains single-file.

Stability first.

---

## 🧭 Long-Term Direction

- Merge proven ideas from `dev` into `main`
- Gradual transition to multi-file projects
- Component graph awareness
- Backend generation
- Deployable apps

Orbit evolves **bottom-up**, not by big-bang rewrites.

---

## 🧪 Working With Branches

```bash
# Stable
git checkout main

# Experimental
git checkout dev
