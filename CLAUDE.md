# NaviCode IDE — CLAUDE.md

## Build & Development

```bash
bun run dev       # Start dev server (port 3000, logs to dev.log)
bun run build     # Production build + standalone copy
bun run start     # Start production server
bun run lint      # Run ESLint
```

## Database (SQLite via Prisma)

```bash
bun x prisma generate   # Generate Prisma Client
bun x prisma db push    # Push schema to SQLite
bun run db:migrate      # Create a new migration
bun run db:reset        # Reset database
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Main page entry
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   └── api/
│       ├── chat/route.ts     # AI chat API
│       ├── editor/cwd/route.ts  # Editor CWD management
│       ├── fs/route.ts       # Filesystem operations
│       ├── models/route.ts   # AI model listing
│       ├── system/route.ts   # System info
│       ├── terminal/route.ts # Terminal execution
│       ├── tools/route.ts    # Agent tools
│       └── web/route.ts      # Web fetch proxy
├── components/
│   ├── chat/                 # ChatPanel, ChatInput, ChatMessage
│   ├── editor/               # CodeEditor (Monaco-styled)
│   ├── file-explorer/        # FileExplorer
│   ├── layout/               # IDELayout (main IDE shell)
│   ├── settings/             # SettingsDialog
│   ├── skills/               # SkillsPanel
│   ├── terminal/             # Terminal (xterm.js)
│   └── ui/                   # Shadcn UI components
├── stores/                   # Zustand stores
│   ├── chat-store.ts         # Chat conversations & messages
│   ├── editor-store.ts       # Editor state, open files, terminal
│   ├── file-store.ts         # File explorer state
│   ├── provider-store.ts     # AI provider configs
│   └── skill-store.ts        # Skills system
├── hooks/                    # React hooks (use-mobile, use-toast)
└── lib/                      # Utilities (utils, db)
prisma/
└── schema.prisma             # SQLite schema (User, Post models)
```

## Architecture Notes

- **Next.js 16** with App Router and Turbopack
- **React 19** with `'use client'` in all interactive components
- **Zustand** for state management (persisted stores)
- **Shadcn UI** + **Radix Primitives** for components
- **Tailwind CSS v4** with `tw-animate-css`
- **Prisma** ORM with **SQLite** database
- **xterm.js** for terminal emulator
- **react-syntax-highlighter** + **react-markdown** for code rendering
- **react-resizable-panels** for IDE layout splitting
- **Framer Motion** for animations

## Key Conventions

- Environment vars in `.env` (copy from `.env.example`)
- `NAVICODE_ROOT` env var sets the workspace root
- API routes are serverless functions under `src/app/api/`
- All UI components use the `@/` path alias
- Chat messages and conversations persist to SQLite via Prisma
- AI providers (OpenAI, Anthropic, etc.) configurable via Settings dialog
- Theme toggling uses a `dark` class on `<html>`
- IDELayout uses `ResizablePanelGroup` for all panel layouts
- Custom events: `navicode-open-folder`, `navicode-saved`, `navicode-run-command`, `navicode-send`
