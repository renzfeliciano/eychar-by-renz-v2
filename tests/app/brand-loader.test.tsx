// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { BrandLoader } from "@/components/shared/brand-loader";

describe("BrandLoader", () => {
  it("is decorative: hidden from assistive tech, with empty alt text on every image", () => {
    render(<BrandLoader />);

    const loader = screen.getByTestId("brand-loader");
    expect(loader).toHaveAttribute("aria-hidden", "true");
    const images = loader.querySelectorAll("img");
    expect(images).toHaveLength(4);
    images.forEach((img) => expect(img).toHaveAttribute("alt", ""));
  });

  it("carries a theme animation and a reduced-motion still for each theme, all present in /public", () => {
    render(<BrandLoader />);

    const classes = ["bl-light-anim", "bl-dark-anim", "bl-light-still", "bl-dark-still"];
    for (const cls of classes) {
      const img = screen.getByTestId("brand-loader").querySelector(`img.${cls}`);
      expect(img, cls).not.toBeNull();
      const src = decodeURIComponent((img as HTMLImageElement).getAttribute("src") ?? "");
      expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    }
  });

  it("renders at the requested size", () => {
    render(<BrandLoader size={120} />);

    expect(screen.getByTestId("brand-loader")).toHaveStyle({ width: "120px", height: "120px" });
  });
});
