import { LicenseKey } from '@/common/appdb/models/LicenseKey'
import { isVersionLessThanOrEqual, parseVersion } from '@/common/version'
import type {
  UpdateCandidate,
  UpdateLicenseGate,
  UpdateLicenseGateResult,
} from '@/background/updateLicenseGate'

/**
 * Commercial update gate.
 *
 * Blocks updates whose version exceeds the user's `maxAllowedAppRelease`
 * (their lifetime usage entitlement). The renderer still lets the user
 * download manually — this gate only changes which notification fires.
 */
export const commercialUpdateLicenseGate: UpdateLicenseGate = async (
  candidate: UpdateCandidate
): Promise<UpdateLicenseGateResult> => {
  const status = await LicenseKey.getLicenseStatus()

  // No license, trial, or unrestricted ultimate: nothing to gate.
  if (!status.license) return { allowed: true }
  if (!status.license.maxAllowedAppRelease) return { allowed: true }

  const candidateVersion = parseVersion(candidate.version)
  const maxAllowed = status.maxAllowedVersion

  if (isVersionLessThanOrEqual(candidateVersion, maxAllowed)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    maxAllowedVersion: maxAllowed,
    supportUntil: status.license.supportUntil
      ? new Date(status.license.supportUntil)
      : undefined,
  }
}
