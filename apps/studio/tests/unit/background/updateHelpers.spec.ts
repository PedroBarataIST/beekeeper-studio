import {
  buildBasePayload,
  DOWNLOAD_PAGE_URL,
  getManualUpdateReason,
  isMajorUpdate,
  normalizeReleaseNotes,
  sanitizeErrorMessage,
} from "@/background/updateHelpers";
import type { UpdateInfo } from "electron-updater";

describe("getManualUpdateReason", () => {
  const base = {
    isPortable: "" as const,
    isSnap: "" as const,
    isLinux: false,
    isAppImage: false,
  };

  it("returns null for a normal Windows install", () => {
    expect(getManualUpdateReason(base)).toBeNull();
  });

  it("returns null for AppImage Linux", () => {
    expect(
      getManualUpdateReason({ ...base, isLinux: true, isAppImage: true })
    ).toBeNull();
  });

  it("returns 'portable' when the build is portable", () => {
    expect(
      getManualUpdateReason({ ...base, isPortable: "C:/portable" })
    ).toBe("portable");
  });

  it("portable wins over snap and linux-package", () => {
    expect(
      getManualUpdateReason({
        isPortable: "C:/portable",
        isSnap: "/snap/foo",
        isLinux: true,
        isAppImage: false,
      })
    ).toBe("portable");
  });

  it("returns 'snap' on a snap install", () => {
    expect(
      getManualUpdateReason({
        ...base,
        isLinux: true,
        isSnap: "/snap/beekeeper",
      })
    ).toBe("snap");
  });

  it("returns 'linux-package' for non-AppImage non-snap Linux (deb/rpm)", () => {
    expect(
      getManualUpdateReason({ ...base, isLinux: true })
    ).toBe("linux-package");
  });
});

describe("sanitizeErrorMessage", () => {
  it("returns the message of an Error instance", () => {
    expect(sanitizeErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("redacts POSIX absolute paths", () => {
    expect(
      sanitizeErrorMessage(new Error("Failed reading /Users/alice/.config/x"))
    ).toBe("Failed reading <path>");
  });

  it("redacts Windows absolute paths", () => {
    expect(
      sanitizeErrorMessage(
        new Error("Failed: C:\\Users\\alice\\AppData\\Local\\x")
      )
    ).toBe("Failed: <path>");
  });

  it("truncates very long messages to 240 chars", () => {
    const long = "x".repeat(500);
    expect(sanitizeErrorMessage(new Error(long)).length).toBe(240);
  });

  it("falls back to 'Unknown error' for nullish input", () => {
    expect(sanitizeErrorMessage(null)).toBe("Unknown error");
    expect(sanitizeErrorMessage(undefined)).toBe("Unknown error");
  });

  it("stringifies non-Error values", () => {
    expect(sanitizeErrorMessage("plain")).toBe("plain");
    expect(sanitizeErrorMessage(42)).toBe("42");
  });
});

describe("isMajorUpdate", () => {
  it("returns true when the major bumps", () => {
    expect(isMajorUpdate("6.0.0", 5)).toBe(true);
  });

  it("returns false for a minor bump", () => {
    expect(isMajorUpdate("5.8.0", 5)).toBe(false);
  });

  it("returns false for a patch bump", () => {
    expect(isMajorUpdate("5.7.4", 5)).toBe(false);
  });

  it("returns false for a downgrade", () => {
    expect(isMajorUpdate("4.9.0", 5)).toBe(false);
  });

  it("handles 'v' prefix", () => {
    expect(isMajorUpdate("v6.0.0", 5)).toBe(true);
  });

  it("returns false for garbage input", () => {
    expect(isMajorUpdate("not-a-version", 5)).toBe(false);
  });
});

describe("normalizeReleaseNotes", () => {
  it("returns '' for null/undefined", () => {
    expect(normalizeReleaseNotes(null as never)).toBe("");
    expect(normalizeReleaseNotes(undefined as never)).toBe("");
  });

  it("returns a string as-is", () => {
    expect(normalizeReleaseNotes("# 5.8\n\n- foo")).toBe("# 5.8\n\n- foo");
  });

  it("joins an array of release-note entries", () => {
    const notes = [
      { version: "5.7.1", note: "first" },
      { version: "5.8.0", note: "second" },
    ] as never;
    expect(normalizeReleaseNotes(notes)).toBe("first\n\nsecond");
  });

  it("skips entries with empty notes", () => {
    const notes = [
      { version: "5.7.1", note: "" },
      { version: "5.8.0", note: "kept" },
    ] as never;
    expect(normalizeReleaseNotes(notes)).toBe("kept");
  });
});

describe("buildBasePayload", () => {
  const info = {
    version: "6.0.0",
    releaseDate: "2026-05-25T00:00:00Z",
    releaseNotes: "# 6.0\n\n- bumped major",
  } as UpdateInfo;

  it("uses DOWNLOAD_PAGE_URL", () => {
    const payload = buildBasePayload(info, "5.7.3", 5);
    expect(payload.downloadUrl).toBe(DOWNLOAD_PAGE_URL);
  });

  it("computes isMajor against the supplied currentMajor", () => {
    expect(buildBasePayload(info, "5.7.3", 5).isMajor).toBe(true);
    expect(buildBasePayload(info, "6.0.0", 6).isMajor).toBe(false);
  });

  it("carries through version, currentVersion, releaseDate, releaseNotes", () => {
    const payload = buildBasePayload(info, "5.7.3", 5);
    expect(payload).toEqual({
      version: "6.0.0",
      currentVersion: "5.7.3",
      isMajor: true,
      releaseNotes: "# 6.0\n\n- bumped major",
      releaseDate: "2026-05-25T00:00:00Z",
      downloadUrl: DOWNLOAD_PAGE_URL,
    });
  });

  it("normalises array-style releaseNotes", () => {
    const arrayInfo = {
      ...info,
      releaseNotes: [
        { version: "5.7.4", note: "patch" },
        { version: "6.0.0", note: "major" },
      ],
    } as UpdateInfo;
    expect(buildBasePayload(arrayInfo, "5.7.3", 5).releaseNotes).toBe(
      "patch\n\nmajor"
    );
  });
});
