'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT_THEME,
  buildAccentVars,
  getAccentBootstrapScript,
  getAccentTheme,
  type AccentThemeId,
} from '@/lib/theme/accent'

interface AccentThemeContextValue {
  accentId: AccentThemeId
  setAccentId: (id: AccentThemeId) => void
}

const AccentThemeContext = React.createContext<AccentThemeContextValue | null>(null)

export function useAccentTheme() {
  const ctx = React.useContext(AccentThemeContext)
  if (!ctx) throw new Error('useAccentTheme must be used within AccentThemeProvider')
  return ctx
}

export function AccentThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const [accentId, setAccentIdState] = React.useState<AccentThemeId>(DEFAULT_ACCENT_THEME)

  React.useEffect(() => {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    if (stored) setAccentIdState(getAccentTheme(stored).id)
  }, [])

  React.useEffect(() => {
    if (!resolvedTheme) return
    const theme = getAccentTheme(accentId)
    const vars = buildAccentVars(theme, resolvedTheme === 'dark' ? 'dark' : 'light')
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value)
    }
  }, [accentId, resolvedTheme])

  const setAccentId = React.useCallback((id: AccentThemeId) => {
    setAccentIdState(id)
    window.localStorage.setItem(ACCENT_STORAGE_KEY, id)
  }, [])

  const value = React.useMemo(() => ({ accentId, setAccentId }), [accentId, setAccentId])

  return (
    <AccentThemeContext.Provider value={value}>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: getAccentBootstrapScript() }} />
      {children}
    </AccentThemeContext.Provider>
  )
}
