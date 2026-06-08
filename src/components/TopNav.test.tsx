import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BRAND } from "@/config/brand";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { TopNav } from "./TopNav";

describe("TopNav", () => {
  it("renders brand, email, tabs, and the site selector", () => {
    render(<TopNav userEmail="a@x.com" isAdmin sites={[{ id: "1", display_name: "Site One" }]} />);
    expect(screen.getByText(BRAND.name)).toBeInTheDocument();
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByLabelText(/site/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All sites" })).toBeInTheDocument();
    for (const label of ["Overview", "SEO", "Ranking", "Analytics", "Manage"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});
