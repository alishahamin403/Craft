import { afterEach, describe, expect, it } from "vitest";

import { getMissingGoogleAuthEnv, getUserFromRequest } from "@/lib/auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("auth", () => {
  it("reports missing Google OAuth environment variables", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    expect(getMissingGoogleAuthEnv()).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "AUTH_SECRET",
    ]);
  });

  it("supports a non-production auth bypass for browser tests", () => {
    process.env.CRAFT_AUTH_BYPASS = "1";
    process.env.CRAFT_AUTH_BYPASS_EMAIL = "playwright@craft.local";

    const user = getUserFromRequest(new Request("http://localhost:3000"));

    expect(user?.id).toBe("bypass:playwright@craft.local");
    expect(user?.email).toBe("playwright@craft.local");
  });
});
