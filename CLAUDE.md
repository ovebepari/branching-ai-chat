# CLAUDE.md — Project Guide for AI Agents

This file provides context for AI agents (Claude, Gemini, etc.) working on this codebase.

## What This Project Is

DFS Chat UI is a branching conversation tree interface. Users create "projects" and each message becomes a node in a visual tree. Any node can be forked to explore different conversation directions. AI responses are streamed via Google Antigravity (`agy` CLI).

## Tech Stack

- **Frontend**: React 19 + TypeScript, Vite, React Flow, Zustand, react-markdown
- **Backend**: Express.js + better-sqlite3 (single file: `dfs-chat.db`)
- **AI**: Antigravity CLI (`agy`) — spawned as subprocess, streams NDJSON, converted to SSE
- **Styling**: Vanilla CSS with design tokens in `src/index.css`

## Key Commands

```bash
npm run dev      # Vite frontend dev server (port 5173)
npm run server   # Express backend (port 3001)
npm run build    # Production build
npx tsc --noEmit # Type check
```

## Architecture Overview

### State Management
- **Zustand store** (`src/store/useTreeStore.ts`): Central state — projects, nodes, provider config. Optimistic in-memory updates, async DB writes.
- **Provider config** saved to `localStorage` (not DB).
- **Project/node data** saved to SQLite via REST API.

### AI Flow
1. User types in ChatPane → `addNode()` creates tree node
2. `streamQuery()` dispatches to provider (agy/gemini/openrouter/ollama/mock)
3. For agy: `POST /api/agy/query` → Express spawns `agy -p '<query>' --output-format stream-json`
4. agy outputs NDJSON → server extracts `text_delta` → sends as SSE → React appends chunks
5. On completion, response persisted to SQLite via `persistNodeResponse()`

### Antigravity Session Model
- **One agy session per project** — `agy_conversation_id` stored in `projects` table
- First message creates a new agy session; subsequent messages use `--conversation <id>`
- Session can be reset via `POST /api/agy/session/:projectId/reset`

### Tree Context
When submitting a message, the system walks up from the active node to root, collecting all prompt/response pairs to build conversation history. This means:
- Linear chats work like normal (each node has one child)
- Branched chats only include the selected path's context

## Directory Structure

```
server/
  db.ts              # SQLite schema, prepared statements, dbApi export
  index.ts           # Express routes (projects, nodes, agy streaming)

src/
  store/useTreeStore.ts   # Zustand — all state logic
  services/api.ts         # AI provider streaming (agy, gemini, openrouter, ollama, mock)
  services/db.ts          # Frontend REST client (thin fetch wrappers)
  components/
    Sidebar.tsx           # Project list, rename, status
    TreeCanvas.tsx        # React Flow graph
    TreeNode.tsx          # Custom node with hover actions
    ChatPane.tsx          # Thread view + input + streaming
    ChatMessage.tsx       # Markdown renderer
    SettingsModal.tsx     # Provider/model selection
  types/index.ts          # TreeNode, Project, ProviderConfig types
  index.css               # Design system (CSS custom properties)
```

## Important Patterns

### Adding a New Provider
1. Add type to `ProviderType` union in `src/types/index.ts`
2. Create `streamXxx()` function in `src/services/api.ts`
3. Add case to `streamQuery()` dispatcher
4. Add to `PROVIDER_OPTIONS`, `DEFAULT_MODELS`, `MODEL_OPTIONS` in `SettingsModal.tsx`
5. Add label to status map in `Sidebar.tsx`

### Database Migrations
The `server/db.ts` file uses `ALTER TABLE` with try/catch for additive schema changes. Existing columns are safe; new columns get added on startup.

### CSS Design Tokens
All visual styling uses CSS custom properties defined in `:root` at the top of `src/index.css`. Avoid hardcoded colors/sizes — use `var(--token-name)` instead.

## Gotchas

- **agy binary path**: Server uses absolute path `$HOME/.local/bin/agy`. If agy is installed elsewhere, update `server/index.ts`.
- **`req.on('close')` vs `res.on('close')`**: For SSE endpoints, use `res.on('close')` — `req.on('close')` fires prematurely with Express.
- **React Flow v12**: Uses strict generics — `Node<data, type>` and `Edge<data>` require explicit type params.
- **Vite proxy**: `/api/*` routes are proxied to `localhost:3001` via `vite.config.ts`.
- **No auth**: No authentication. Intended for local/single-user use.

## Performance Rules (CRITICAL)

### No unnecessary re-renders
- **NEVER use `useState` for UI state that changes on mouse move, hover, or character input** — use CSS-only solutions (`:hover`, `:focus`), `useRef`, or uncontrolled components
- **NEVER call store methods inside selectors**: `useTreeStore((s) => s.getActiveProject())` creates new objects every render. Use `useTreeStore((s) => s.projects.find(p => p.id === s.activeProjectId))` instead
- **NEVER destructure the full store**: `useTreeStore()` subscribes to ALL state. Always use individual selectors: `useTreeStore((s) => s.specificField)`
- **Wrap heavy components in `React.memo`** — especially ChatMessage (markdown/KaTeX), Sidebar, and any component receiving props
- **Use `useMemo` for expensive computations** — thread building, message list rendering, layout calculations
- **Use `useCallback` for all handlers** passed as props or used in effects

### Input fields
- **Chat textarea must be uncontrolled** — use `useRef` for value, not `useState`. The `value` prop causes re-renders on every keystroke which re-renders the entire message list
- Auto-resize textarea height directly via DOM in the `onChange` handler, not via `useEffect`

### Zustand store selectors
- Functions (actions) are stable references — selecting `(s) => s.addNode` is fine
- Primitive values are compared by value — selecting `(s) => s.activeProjectId` is fine
- Objects/arrays from `.find()` return the same reference if unchanged — this is fine
- **Calling a function inside a selector** `(s) => s.someMethod()` always returns a new reference — AVOID

### CSS animations & transitions
- Prefer CSS transitions over JS-driven animations
- Use `transition` on specific properties, not `all`
- Hover/focus effects should be pure CSS — no React state

## Git Workflow

- **Commit after every tiny feature** — don't batch multiple unrelated changes
- **Detailed commit messages** — include what changed, why, and which files were affected
- Format: short summary line, then bullet points with specifics
- Commit even small fixes (typos, color tweaks, border changes) individually
