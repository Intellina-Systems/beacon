'use client'

import * as React from 'react'
import { Palette } from 'lucide-react'
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { useAccentTheme } from '@/components/accent-theme-provider'
import { ACCENT_THEMES, getAccentSwatch, type AccentThemeId } from '@/lib/theme/accent'

// Designed to be used as a submenu item inside a DropdownMenu, alongside ThemeToggle.
export function AccentThemeToggle() {
  const { accentId, setAccentId } = useAccentTheme()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <Palette className="h-4 w-4 mr-2" />
        Accent color
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={accentId} onValueChange={(value) => setAccentId(value as AccentThemeId)}>
          {ACCENT_THEMES.map((theme) => (
            <DropdownMenuRadioItem key={theme.id} value={theme.id} className="cursor-pointer">
              <span
                aria-hidden
                className="mr-2 h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: getAccentSwatch(theme) }}
              />
              {theme.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
