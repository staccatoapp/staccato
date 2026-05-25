import { describe, it, expect } from "vitest";
import { sanitizeTitleForSearch, escapeLuceneTerm } from "./fromSearch.js";

// Characterization tests. sanitizeTitleForSearch strips trailing bracket
// annotations that break MusicBrainz phrase matching; escapeLuceneTerm
// escapes characters with special meaning in Lucene query syntax.

describe("sanitizeTitleForSearch", () => {
  it("strips a trailing square-bracket annotation", () => {
    expect(sanitizeTitleForSearch("Song [Hidden]")).toBe("Song");
  });

  it("strips a trailing parenthetical annotation", () => {
    expect(sanitizeTitleForSearch("Song (Bonus Track)")).toBe("Song");
  });

  it("strips multiple trailing annotations repeatedly", () => {
    expect(sanitizeTitleForSearch("Song [Hidden] (Live)")).toBe("Song");
  });

  it("strips trailing whitespace left after removing an annotation", () => {
    expect(sanitizeTitleForSearch("Song  [Hidden]")).toBe("Song");
  });

  it("does not strip an annotation that is the entire title (returns original)", () => {
    // Never returns empty — falls back to the original value.
    expect(sanitizeTitleForSearch("[Hidden]")).toBe("[Hidden]");
    expect(sanitizeTitleForSearch("(Bonus)")).toBe("(Bonus)");
  });

  it("leaves a title with no annotations unchanged", () => {
    expect(sanitizeTitleForSearch("Normal Title")).toBe("Normal Title");
  });

  it("does not strip mid-title brackets", () => {
    expect(sanitizeTitleForSearch("Song [Edit] Remix")).toBe("Song [Edit] Remix");
  });
});

describe("escapeLuceneTerm", () => {
  it("escapes double quotes", () => {
    expect(escapeLuceneTerm('Title "with" quotes')).toBe('Title \\"with\\" quotes');
  });

  it("escapes backslashes", () => {
    expect(escapeLuceneTerm("path\\to")).toBe("path\\\\to");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeLuceneTerm("plain title")).toBe("plain title");
  });

  it("escapes both backslash and quote together", () => {
    expect(escapeLuceneTerm('back\\and"quote')).toBe('back\\\\and\\"quote');
  });
});
