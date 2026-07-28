import { create } from 'zustand'
import type { TextStyleFields } from '@/types/text'

const STORAGE_KEY = 'freecut:text-templates'

export type TextTemplate = TextStyleFields & {
  id: string
  name: string
}

interface TextTemplatesState {
  templates: TextTemplate[]
}

interface TextTemplatesActions {
  addTemplate: (name: string, style: TextStyleFields) => TextTemplate
  removeTemplate: (id: string) => void
  renameTemplate: (id: string, name: string) => void
}

function loadTemplates(): TextTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as TextTemplate[]
  } catch {}
  return []
}

function saveTemplates(templates: TextTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch {}
}

export const useTextTemplatesStore = create<TextTemplatesState & TextTemplatesActions>(
  (set, get) => ({
    templates: loadTemplates(),

    addTemplate: (name, style) => {
      const template: TextTemplate = {
        id: crypto.randomUUID(),
        name,
        ...style,
      }
      const next = [...get().templates, template]
      set({ templates: next })
      saveTemplates(next)
      return template
    },

    removeTemplate: (id) => {
      const next = get().templates.filter((t) => t.id !== id)
      set({ templates: next })
      saveTemplates(next)
    },

    renameTemplate: (id, name) => {
      const next = get().templates.map((t) => (t.id === id ? { ...t, name } : t))
      set({ templates: next })
      saveTemplates(next)
    },
  }),
)
