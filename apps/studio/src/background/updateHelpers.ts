import type { UpdateInfo } from 'electron-updater'
import { parseVersion } from '@/common/version'

export const DOWNLOAD_PAGE_URL = 'https://beekeeperstudio.io/get'

/**
 * Reason why the current build can't auto-install an update. When set, the
 * "update-available" event from electron-updater is converted to
 * "manual-update" so the renderer prompts the user to download manually.
 */
export type ManualUpdateReason = 'snap' | 'linux-package' | 'portable'

/** Subset of platform_info needed to determine the manual reason. */
export interface ManualReasonPlatform {
  isPortable: string | boolean
  isSnap: string | boolean
  isLinux: boolean
  isAppImage: boolean
}

export function getManualUpdateReason(
  platform: ManualReasonPlatform
): ManualUpdateReason | null {
  if (platform.isPortable) return 'portable'
  if (platform.isSnap) return 'snap'
  if (platform.isLinux && !platform.isAppImage) return 'linux-package'
  return null
}

/**
 * Strip absolute paths from an error message so we don't leak the user's
 * home directory or local filesystem layout to the renderer / logs.
 */
export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error')
  return raw.replace(/(\/|[A-Z]:\\)[^\s"']+/g, '<path>').slice(0, 240)
}

export function isMajorUpdate(candidate: string, currentMajor: number): boolean {
  try {
    const next = parseVersion(candidate)
    return next.major > currentMajor
  } catch {
    return false
  }
}

/**
 * `UpdateInfo.releaseNotes` from electron-updater can be either a string or an
 * array of `{ version, note }` entries (one per intermediate release). Flatten
 * to a single string for the renderer.
 */
export function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  return notes
    .map((n) =>
      n && typeof n === 'object' && 'note' in n ? String(n.note ?? '') : ''
    )
    .filter(Boolean)
    .join('\n\n')
}

export interface UpdateBasePayload {
  version: string
  currentVersion: string
  isMajor: boolean
  releaseNotes: string
  releaseDate?: string
  downloadUrl: string
}

export function buildBasePayload(
  info: UpdateInfo,
  currentVersion: string,
  currentMajor: number
): UpdateBasePayload {
  return {
    version: info.version,
    currentVersion,
    isMajor: isMajorUpdate(info.version, currentMajor),
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate,
    downloadUrl: DOWNLOAD_PAGE_URL,
  }
}
