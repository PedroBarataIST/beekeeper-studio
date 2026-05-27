import {
  MANUAL_REASON_COPY,
  escapeHtml,
  formatBytes,
  releaseTagUrl,
  summariseReleaseNotes,
} from "@/lib/update/updateFormat";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&z</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;z&lt;/a&gt;"
    );
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("escapes & before other characters (no double-encoding)", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});

describe("summariseReleaseNotes", () => {
  it("returns '' for empty input", () => {
    expect(summariseReleaseNotes("")).toBe("");
  });

  it("drops top-level (# ) headings", () => {
    const input = "# Beekeeper Studio 5.8\n\n- feature one";
    expect(summariseReleaseNotes(input)).toBe("• feature one");
  });

  it("trims to maxLines lines", () => {
    const input = Array.from({ length: 20 }, (_, i) => `- line ${i}`).join("\n");
    const out = summariseReleaseNotes(input, 3);
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toBe("• line 0\n• line 1\n• line 2");
  });

  it("trims to maxChars chars with an ellipsis", () => {
    const input = "- " + "a".repeat(500);
    const out = summariseReleaseNotes(input, 6, 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });

  it("keeps non-bullet content", () => {
    const input = "Some intro\n## Subheading\n- a bullet";
    const out = summariseReleaseNotes(input);
    expect(out).toBe("Some intro\n## Subheading\n• a bullet");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [-1, "0 B"],
    [NaN, "0 B"],
    [Infinity, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1.0 MB"],
    [1024 * 1024 * 12.34, "12.3 MB"],
    [1024 * 1024 * 100, "100 MB"],
    [1024 * 1024 * 1024 * 3.5, "3.5 GB"],
  ])("formatBytes(%s) === %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe("releaseTagUrl", () => {
  it("prefixes a 'v' when missing", () => {
    expect(releaseTagUrl("5.8.0")).toBe(
      "https://github.com/beekeeper-studio/beekeeper-studio/releases/tag/v5.8.0"
    );
  });

  it("does not double-prefix when 'v' is already present", () => {
    expect(releaseTagUrl("v5.8.0")).toBe(
      "https://github.com/beekeeper-studio/beekeeper-studio/releases/tag/v5.8.0"
    );
  });
});

describe("MANUAL_REASON_COPY", () => {
  it("covers all three manual-update reasons", () => {
    expect(Object.keys(MANUAL_REASON_COPY).sort()).toEqual(
      ["linux-package", "portable", "snap"].sort()
    );
  });

  it("uses neutral, non-first-person copy", () => {
    for (const text of Object.values(MANUAL_REASON_COPY)) {
      expect(text).not.toMatch(/\bwe\b/i);
      expect(text).not.toMatch(/\bwe'/i);
    }
  });
});
