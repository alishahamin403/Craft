import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AuthScreen from "@/components/auth-screen";

describe("AuthScreen", () => {
  it("shows the public home page with Google sign-in in the header", () => {
    render(<AuthScreen isConfigured missingEnv={[]} />);

    expect(
      screen.getByRole("heading", { name: "Turn images into cinematic video" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", "/api/auth/google");
  });
});
