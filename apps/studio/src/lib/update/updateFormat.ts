/**
 * Pure formatting helpers for the update notification UI.
 *
 * Extracted from `AutoUpdater.vue` so they can be unit-tested without
 * pulling in Vue, Noty, or Electron.
 */

export type ManualUpdateReason = 'snap' | 'linux-package' | 'portable'

export const MANUAL_REASON_COPY: Record<ManualUpdateReason, string> = {
  snap: 'Snap packages update through the Snap Store.',
  'linux-package': "This Linux package format doesn't support in-app updates.",
  portable: "Portable builds don't support in-app updates.",
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Truncate release notes to a short plain-text preview.
 *
 * Drops empty lines and top-level (`# `) headings, converts bullet markers
 * to `•`, then trims to at most `maxLines` lines and `maxChars` characters.
 */
export function summariseReleaseNotes(
  markdown: string,
  maxLines = 6,
  maxChars = 360
): string {
  if (!markdown) return ''
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('# '))
    .slice(0, maxLines)
    .map((l) => l.replace(/^[-*]\s*/, '• '))
  let text = lines.join('\n')
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd() + '…'
  return text
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let value = bytes
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function releaseTagUrl(version: string): string {
  const tag = version.startsWith('v') ? version : `v${version}`
  return `https://github.com/beekeeper-studio/beekeeper-studio/releases/tag/${tag}`
}
