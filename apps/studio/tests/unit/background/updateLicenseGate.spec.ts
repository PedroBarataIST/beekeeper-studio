import {
  evaluateUpdateLicenseGate,
  setUpdateLicenseGate,
} from "@/background/updateLicenseGate";

describe("updateLicenseGate (community default)", () => {
  // Restore the default no-op gate between tests since the module is a
  // singleton.
  afterEach(() => {
    setUpdateLicenseGate(() => ({ allowed: true }));
  });

  it("defaults to allowing all candidates", async () => {
    const result = await evaluateUpdateLicenseGate({ version: "99.0.0" });
    expect(result.allowed).toBe(true);
  });

  it("uses an injected synchronous gate", async () => {
    setUpdateLicenseGate(() => ({
      allowed: false,
      maxAllowedVersion: { major: 5, minor: 7, patch: 0 },
    }));

    const result = await evaluateUpdateLicenseGate({ version: "6.0.0" });
    expect(result.allowed).toBe(false);
    expect(result.maxAllowedVersion).toEqual({ major: 5, minor: 7, patch: 0 });
  });

  it("uses an injected async gate", async () => {
    setUpdateLicenseGate(async () => ({ allowed: false }));

    const result = await evaluateUpdateLicenseGate({ version: "6.0.0" });
    expect(result.allowed).toBe(false);
  });

  it("forwards the candidate to the gate", async () => {
    const seen: string[] = [];
    setUpdateLicenseGate((candidate) => {
      seen.push(candidate.version);
      return { allowed: true };
    });

    await evaluateUpdateLicenseGate({ version: "1.2.3" });
    await evaluateUpdateLicenseGate({ version: "9.9.9" });
    expect(seen).toEqual(["1.2.3", "9.9.9"]);
  });

  it("fails open if the gate throws", async () => {
    setUpdateLicenseGate(() => {
      throw new Error("kaboom");
    });

    const result = await evaluateUpdateLicenseGate({ version: "6.0.0" });
    expect(result.allowed).toBe(true);
  });

  it("fails open if the async gate rejects", async () => {
    setUpdateLicenseGate(async () => {
      throw new Error("kaboom-async");
    });

    const result = await evaluateUpdateLicenseGate({ version: "6.0.0" });
    expect(result.allowed).toBe(true);
  });
});
