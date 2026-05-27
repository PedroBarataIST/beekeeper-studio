/**
 * Tests for the commercial update license gate.
 *
 * We mock `LicenseKey.getLicenseStatus()` so this spec does not need the
 * full ORM / Electron stack — the gate's job is purely to translate a
 * `LicenseStatus` into an `UpdateLicenseGateResult`.
 */

const mockGetLicenseStatus = jest.fn();

jest.mock("@/common/appdb/models/LicenseKey", () => ({
  LicenseKey: {
    getLicenseStatus: (...args: unknown[]) => mockGetLicenseStatus(...args),
  },
}));

import { commercialUpdateLicenseGate } from "@commercial/backend/updateLicenseGate";

function statusWith(opts: {
  hasLicense?: boolean;
  maxAllowedTag?: string | null;
  supportUntil?: Date | null;
}) {
  const { hasLicense = true, maxAllowedTag = null, supportUntil = null } = opts;
  if (!hasLicense) {
    return { license: undefined, maxAllowedVersion: { major: 0, minor: 0, patch: 0 } };
  }
  return {
    license: {
      maxAllowedAppRelease: maxAllowedTag ? { tagName: maxAllowedTag } : null,
      supportUntil,
    },
    // Mirrors the `LicenseStatus.maxAllowedVersion` getter.
    get maxAllowedVersion() {
      if (!maxAllowedTag) return { major: 0, minor: 0, patch: 0 };
      const cleaned = maxAllowedTag.replace(/^v/, "");
      const [a, b, c] = cleaned.split(".").map((n) => parseInt(n, 10));
      return { major: a, minor: b, patch: c };
    },
  };
}

describe("commercialUpdateLicenseGate", () => {
  beforeEach(() => {
    mockGetLicenseStatus.mockReset();
  });

  it("allows when there is no license at all (community / first install)", async () => {
    mockGetLicenseStatus.mockResolvedValue(statusWith({ hasLicense: false }));

    await expect(
      commercialUpdateLicenseGate({ version: "6.0.0" })
    ).resolves.toEqual({ allowed: true });
  });

  it("allows when the license has no maxAllowedAppRelease (unrestricted)", async () => {
    mockGetLicenseStatus.mockResolvedValue(statusWith({ maxAllowedTag: null }));

    await expect(
      commercialUpdateLicenseGate({ version: "9.9.9" })
    ).resolves.toEqual({ allowed: true });
  });

  it("allows when candidate <= maxAllowedAppRelease", async () => {
    mockGetLicenseStatus.mockResolvedValue(
      statusWith({ maxAllowedTag: "v5.7.0" })
    );

    await expect(
      commercialUpdateLicenseGate({ version: "5.7.0" })
    ).resolves.toEqual({ allowed: true });

    await expect(
      commercialUpdateLicenseGate({ version: "5.6.99" })
    ).resolves.toEqual({ allowed: true });
  });

  it("blocks when candidate > maxAllowedAppRelease and returns the cap", async () => {
    const supportUntil = new Date("2025-12-31T00:00:00Z");
    mockGetLicenseStatus.mockResolvedValue(
      statusWith({ maxAllowedTag: "v5.7.0", supportUntil })
    );

    const result = await commercialUpdateLicenseGate({ version: "6.0.0" });
    expect(result.allowed).toBe(false);
    expect(result.maxAllowedVersion).toEqual({ major: 5, minor: 7, patch: 0 });
    expect(result.supportUntil).toEqual(supportUntil);
  });

  it("blocks a minor bump that exceeds the cap", async () => {
    mockGetLicenseStatus.mockResolvedValue(
      statusWith({ maxAllowedTag: "v5.7.0" })
    );

    const result = await commercialUpdateLicenseGate({ version: "5.8.0" });
    expect(result.allowed).toBe(false);
  });

  it("omits supportUntil when the license does not have one", async () => {
    mockGetLicenseStatus.mockResolvedValue(
      statusWith({ maxAllowedTag: "v5.7.0", supportUntil: null })
    );

    const result = await commercialUpdateLicenseGate({ version: "6.0.0" });
    expect(result.allowed).toBe(false);
    expect(result.supportUntil).toBeUndefined();
  });
});
