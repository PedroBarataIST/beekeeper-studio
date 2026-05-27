import type { BksVersion } from '@/lib/license'

/**
 * Result of an update-license-gate check.
 *
 * - `allowed` true → the candidate update may be offered to the user.
 * - `allowed` false → renderer should show the license-block notification.
 */
export interface UpdateLicenseGateResult {
  allowed: boolean
  /** Highest version the user's license entitles them to install. */
  maxAllowedVersion?: BksVersion
  /** When the user's support window ends (paid licenses only). */
  supportUntil?: Date
}

export interface UpdateCandidate {
  /** Semver of the candidate update, e.g. "5.8.0". */
  version: string
}

export type UpdateLicenseGate = (
  candidate: UpdateCandidate
) => Promise<UpdateLicenseGateResult> | UpdateLicenseGateResult

const defaultGate: UpdateLicenseGate = () => ({ allowed: true })

let currentGate: UpdateLicenseGate = defaultGate

/**
 * Replace the default no-op gate. The commercial entrypoint installs the
 * real implementation that consults `LicenseKey.getLicenseStatus()`.
 */
export function setUpdateLicenseGate(gate: UpdateLicenseGate): void {
  currentGate = gate
}

export async function evaluateUpdateLicenseGate(
  candidate: UpdateCandidate
): Promise<UpdateLicenseGateResult> {
  try {
    return await currentGate(candidate)
  } catch {
    // Never block updates because of a gate failure — fail open.
    return { allowed: true }
  }
}
