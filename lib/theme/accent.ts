export type AccentThemeId = 'indigo' | 'blue' | 'teal' | 'rose' | 'amber'

export interface AccentTheme {
  id: AccentThemeId
  label: string
  /** OKLCH hue angle used in light mode (and dark mode, unless darkHue is set). */
  hue: number
  /** Optional override hue for dark mode, when it needs a slight shift to stay legible. */
  darkHue?: number
}

export const ACCENT_THEMES: AccentTheme[] = [
  { id: 'indigo', label: 'Indigo', hue: 275, darkHue: 278 },
  { id: 'blue', label: 'Blue', hue: 232 },
  { id: 'teal', label: 'Teal', hue: 195 },
  { id: 'rose', label: 'Rose', hue: 350 },
  { id: 'amber', label: 'Amber', hue: 45 },
]

export const DEFAULT_ACCENT_THEME: AccentThemeId = 'indigo'
export const ACCENT_STORAGE_KEY = 'beacon-accent-theme'

type AccentMode = 'light' | 'dark'

// Lightness/chroma tuned per mode for contrast; only hue varies between presets.
const ACCENT_LC: Record<AccentMode, { beacon: string; beaconForeground: string; ring: string }> = {
  light: { beacon: '0.51 0.19', beaconForeground: '0.985 0.005', ring: '0.62 0.12' },
  dark: { beacon: '0.74 0.13', beaconForeground: '0.18 0.04', ring: '0.65 0.12' },
}

export function getAccentTheme(id: string | undefined | null): AccentTheme {
  return ACCENT_THEMES.find((theme) => theme.id === id) ?? ACCENT_THEMES[0]
}

export function getAccentHue(theme: AccentTheme, mode: AccentMode): number {
  return mode === 'dark' ? (theme.darkHue ?? theme.hue) : theme.hue
}

export function buildAccentVars(theme: AccentTheme, mode: AccentMode): Record<string, string> {
  const hue = getAccentHue(theme, mode)
  const lc = ACCENT_LC[mode]
  const beacon = `oklch(${lc.beacon} ${hue})`
  const beaconForeground = `oklch(${lc.beaconForeground} ${hue})`
  const ring = `oklch(${lc.ring} ${hue})`
  return {
    '--beacon': beacon,
    '--beacon-foreground': beaconForeground,
    '--ring': ring,
    '--sidebar-primary': beacon,
    '--sidebar-primary-foreground': beaconForeground,
    '--sidebar-ring': ring,
  }
}

/** Swatch color for menus/pickers — a representative mid-tone for the hue. */
export function getAccentSwatch(theme: AccentTheme): string {
  return `oklch(0.6 0.17 ${theme.hue})`
}

// Applies the stored accent choice before paint so there's no flash of the default color.
// Mirrors next-themes' own resolution logic (localStorage 'theme' + prefers-color-scheme).
export function getAccentBootstrapScript(): string {
  const hues = Object.fromEntries(
    ACCENT_THEMES.map((theme) => [theme.id, { light: theme.hue, dark: theme.darkHue ?? theme.hue }]),
  )
  const lc = ACCENT_LC
  return `(function(){try{
var hues=${JSON.stringify(hues)};
var lc=${JSON.stringify(lc)};
var id=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)})||${JSON.stringify(DEFAULT_ACCENT_THEME)};
var pair=hues[id]||hues[${JSON.stringify(DEFAULT_ACCENT_THEME)}];
var storedTheme=localStorage.getItem('theme');
var dark=storedTheme==='dark'||(storedTheme!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var mode=dark?'dark':'light';
var hue=pair[mode];
var vals=lc[mode];
var beacon='oklch('+vals.beacon+' '+hue+')';
var bf='oklch('+vals.beaconForeground+' '+hue+')';
var ring='oklch('+vals.ring+' '+hue+')';
var s=document.documentElement.style;
s.setProperty('--beacon',beacon);
s.setProperty('--beacon-foreground',bf);
s.setProperty('--ring',ring);
s.setProperty('--sidebar-primary',beacon);
s.setProperty('--sidebar-primary-foreground',bf);
s.setProperty('--sidebar-ring',ring);
}catch(e){}})();`
}
