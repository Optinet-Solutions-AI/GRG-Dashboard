import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageToggle, parseGridLanguage } from "./LanguageToggle";

describe("parseGridLanguage", () => {
  it("defaults to Arabic — that is the tracked set", () => {
    for (const v of [undefined, "", "fr", "AR", "arabic"]) expect(parseGridLanguage(v)).toBe("ar");
  });
  it("switches to English only on an exact match", () => {
    expect(parseGridLanguage("en")).toBe("en");
  });
});

describe("LanguageToggle", () => {
  it("keeps the selected site in both links so switching language doesn't switch site", () => {
    render(<LanguageToggle site="abc" current="ar" counts={{ ar: 89, en: 0 }} />);
    expect(screen.getByRole("link", { name: /Arabic/ }).getAttribute("href")).toBe("/ranking?site=abc");
    expect(screen.getByRole("link", { name: /English/ }).getAttribute("href")).toBe("/ranking?site=abc&lang=en");
  });

  it("omits lang=ar so the default URL stays clean", () => {
    render(<LanguageToggle current="en" counts={{ ar: 89, en: 0 }} />);
    expect(screen.getByRole("link", { name: /Arabic/ }).getAttribute("href")).toBe("/ranking");
  });

  it("marks the active tab for assistive tech", () => {
    render(<LanguageToggle current="en" counts={{ ar: 89, en: 0 }} />);
    expect(screen.getByRole("link", { name: /English/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Arabic/ })).not.toHaveAttribute("aria-current");
  });

  it("shows how many keywords each side has, including zero English", () => {
    render(<LanguageToggle current="ar" counts={{ ar: 89, en: 0 }} />);
    expect(screen.getByText("89")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });
});
