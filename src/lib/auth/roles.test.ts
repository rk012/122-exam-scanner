import { describe, expect, it } from "vitest";
import { andrewIdFromEmail, isAllowedGoogleAccount, roleFor } from "./roles";

describe("andrewIdFromEmail", () => {
  it("returns the lowercased local part for andrew addresses", () => {
    expect(andrewIdFromEmail("RishiKum@andrew.cmu.edu")).toBe("rishikum");
    expect(andrewIdFromEmail("foo@ANDREW.CMU.EDU")).toBe("foo");
  });
  it("rejects other domains and malformed input", () => {
    expect(andrewIdFromEmail("foo@cmu.edu")).toBeNull();
    expect(andrewIdFromEmail("foo@gmail.com")).toBeNull();
    expect(andrewIdFromEmail("foo@andrew.cmu.edu.evil.com")).toBeNull();
    expect(andrewIdFromEmail("@andrew.cmu.edu")).toBeNull();
    expect(andrewIdFromEmail("")).toBeNull();
    expect(andrewIdFromEmail(null)).toBeNull();
  });
});

describe("isAllowedGoogleAccount", () => {
  const ok = { email: "foo@andrew.cmu.edu", email_verified: true, hd: "andrew.cmu.edu" };
  it("accepts a verified andrew Workspace account", () => {
    expect(isAllowedGoogleAccount(ok)).toBe(true);
  });
  it("rejects when the hd claim is missing or different", () => {
    expect(isAllowedGoogleAccount({ ...ok, hd: undefined })).toBe(false);
    expect(isAllowedGoogleAccount({ ...ok, hd: "cmu.edu" })).toBe(false);
  });
  it("rejects when the email domain does not match even if hd does", () => {
    expect(isAllowedGoogleAccount({ ...ok, email: "foo@gmail.com" })).toBe(false);
  });
  it("rejects unverified emails", () => {
    expect(isAllowedGoogleAccount({ ...ok, email_verified: false })).toBe(false);
  });
});

describe("roleFor", () => {
  const supers = new Set(["rishikum"]);
  it("is superadmin only for listed IDs, case-insensitively", () => {
    expect(roleFor("rishikum", supers)).toBe("superadmin");
    expect(roleFor("RISHIKUM", supers)).toBe("superadmin");
    expect(roleFor("someone", supers)).toBe("user");
    expect(roleFor("someone", new Set())).toBe("user");
  });
});
