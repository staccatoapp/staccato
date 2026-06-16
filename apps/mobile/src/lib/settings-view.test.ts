import {
  formatLastScan,
  instanceHost,
  listenBrainzStatusLabel,
  memberSince,
  roleLabel,
  userInitial,
} from "./settings-view";

describe("settings-view helpers", () => {
  describe("roleLabel", () => {
    it("maps isAdmin to a label", () => {
      expect(roleLabel(true)).toBe("Admin");
      expect(roleLabel(false)).toBe("User");
    });
  });

  describe("instanceHost", () => {
    it("strips the scheme", () => {
      expect(instanceHost("https://music.home.lan")).toBe("music.home.lan");
      expect(instanceHost("http://192.168.1.10:8280")).toBe(
        "192.168.1.10:8280",
      );
    });
  });

  describe("userInitial", () => {
    it("uppercases the first letter", () => {
      expect(userInitial("alex")).toBe("A");
    });
    it("falls back for empty names", () => {
      expect(userInitial("   ")).toBe("?");
      expect(userInitial("")).toBe("?");
    });
  });

  describe("listenBrainzStatusLabel", () => {
    it("reflects the token-set flag", () => {
      expect(listenBrainzStatusLabel(true)).toBe("Connected");
      expect(listenBrainzStatusLabel(false)).toBe("Not connected");
    });
  });

  describe("memberSince", () => {
    it("formats as month + year", () => {
      expect(memberSince(new Date("2025-01-15T00:00:00Z"))).toBe("Jan 2025");
    });
  });

  describe("formatLastScan", () => {
    const now = new Date("2026-06-16T12:00:00Z");

    it("returns Never when there is no completed scan", () => {
      expect(formatLastScan(null, now)).toBe("Never");
    });

    it("returns Just now for very recent scans", () => {
      expect(formatLastScan("2026-06-16T11:59:40Z", now)).toBe("Just now");
    });

    it("formats minutes, hours and days", () => {
      expect(formatLastScan("2026-06-16T11:30:00Z", now)).toBe(
        "30 minutes ago",
      );
      expect(formatLastScan("2026-06-16T11:00:00Z", now)).toBe("1 hour ago");
      expect(formatLastScan("2026-06-16T10:00:00Z", now)).toBe("2 hours ago");
      expect(formatLastScan("2026-06-14T12:00:00Z", now)).toBe("2 days ago");
    });

    it("falls back to an absolute date beyond a week", () => {
      expect(formatLastScan("2026-06-01T12:00:00Z", now)).toBe("Jun 1, 2026");
    });
  });
});
