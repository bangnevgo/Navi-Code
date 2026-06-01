import { create } from 'zustand'

export interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  path: string
  children?: FileNode[]
  language?: string
  content?: string
  isExpanded?: boolean
}

interface FileState {
  fileTree: FileNode[]
  selectedFilePath: string | null
  expandedFolders: Set<string>

  // Actions
  setFileTree: (tree: FileNode[]) => void
  selectFile: (path: string | null) => void
  toggleFolder: (path: string) => void
  expandFolder: (path: string) => void
  collapseFolder: (path: string) => void
  getFileByPath: (path: string) => FileNode | undefined
}

const demoProject: FileNode[] = [
  {
    id: 'root-1',
    name: 'src',
    type: 'folder',
    path: '/src',
    isExpanded: true,
    children: [
      {
        id: 'f-1',
        name: 'app',
        type: 'folder',
        path: '/src/app',
        isExpanded: true,
        children: [
          {
            id: 'f-1-1',
            name: 'page.tsx',
            type: 'file',
            path: '/src/app/page.tsx',
            language: 'typescript',
            content: `import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Welcome to My App</h1>
      <Button variant="default">Get Started</Button>
    </main>
  )
}`,
          },
          {
            id: 'f-1-2',
            name: 'layout.tsx',
            type: 'file',
            path: '/src/app/layout.tsx',
            language: 'typescript',
            content: `import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "My App",
  description: "A Next.js application",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}`,
          },
          {
            id: 'f-1-3',
            name: 'globals.css',
            type: 'file',
            path: '/src/app/globals.css',
            language: 'css',
            content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}`,
          },
        ],
      },
      {
        id: 'f-2',
        name: 'components',
        type: 'folder',
        path: '/src/components',
        children: [
          {
            id: 'f-2-1',
            name: 'Header.tsx',
            type: 'file',
            path: '/src/components/Header.tsx',
            language: 'typescript',
            content: `"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="border-b px-6 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">My App</h2>
        <Button
          variant="ghost"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          Menu
        </Button>
      </div>
    </header>
  )
}`,
          },
          {
            id: 'f-2-2',
            name: 'Footer.tsx',
            type: 'file',
            path: '/src/components/Footer.tsx',
            language: 'typescript',
            content: `export function Footer() {
  return (
    <footer className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
      <p>&copy; 2024 My App. All rights reserved.</p>
    </footer>
  )
}`,
          },
        ],
      },
      {
        id: 'f-3',
        name: 'lib',
        type: 'folder',
        path: '/src/lib',
        children: [
          {
            id: 'f-3-1',
            name: 'utils.ts',
            type: 'file',
            path: '/src/lib/utils.ts',
            language: 'typescript',
            content: `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`,
          },
        ],
      },
    ],
  },
  {
    id: 'root-2',
    name: 'package.json',
    type: 'file',
    path: '/package.json',
    language: 'json',
    content: `{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18",
    "react-dom": "^18"
  }
}`,
  },
  {
    id: 'root-3',
    name: 'tsconfig.json',
    type: 'file',
    path: '/tsconfig.json',
    language: 'json',
    content: `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
  },
  {
    id: 'root-4',
    name: 'README.md',
    type: 'file',
    path: '/README.md',
    language: 'markdown',
    content: `# My App

A modern Next.js application built with TypeScript and Tailwind CSS.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui Components
`,
  },
]

export const useFileStore = create<FileState>((set, get) => ({
  fileTree: demoProject,
  selectedFilePath: null,
  expandedFolders: new Set(['/src', '/src/app']),

  setFileTree: (tree) => set({ fileTree: tree }),

  selectFile: (path) => set({ selectedFilePath: path }),

  toggleFolder: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedFolders)
      if (newExpanded.has(path)) {
        newExpanded.delete(path)
      } else {
        newExpanded.add(path)
      }
      return { expandedFolders: newExpanded }
    }),

  expandFolder: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedFolders)
      newExpanded.add(path)
      return { expandedFolders: newExpanded }
    }),

  collapseFolder: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedFolders)
      newExpanded.delete(path)
      return { expandedFolders: newExpanded }
    }),

  getFileByPath: (path) => {
    const findNode = (nodes: FileNode[]): FileNode | undefined => {
      for (const node of nodes) {
        if (node.path === path) return node
        if (node.children) {
          const found = findNode(node.children)
          if (found) return found
        }
      }
      return undefined
    }
    return findNode(get().fileTree)
  },
}))
