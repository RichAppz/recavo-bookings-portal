import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOOKING_PAGE,
  THEME_SPECS,
  accentRejection,
  contrastRatio,
  effectiveAccent,
  headerStyle,
  initials,
  normaliseBookingPage,
  presetFromHeaderUrl,
  sectionEnabled,
  textOnAccent,
} from "./client-theme.ts";

describe("accent colour contrast rule", () => {
  it("accepts a colour that reads at 4.5:1 with white or dark text", () => {
    assert.equal(accentRejection("#2d7a5f"), null);
    assert.equal(accentRejection("#111214"), null);
    assert.equal(accentRejection("#ffd166"), null);
  });

  it("rejects a mid-tone that reads badly with both", () => {
    const why = accentRejection("#777777");
    assert.ok(why, "should be rejected");
    assert.match(why, /4\.5:1/);
  });

  it("pairs an accepted accent with the text colour that passed", () => {
    assert.equal(accentRejection("#8a8a8a"), null);
    assert.equal(textOnAccent("#8a8a8a"), "#111214");
    assert.ok(contrastRatio("#8a8a8a", textOnAccent("#8a8a8a")) >= 4.5);
  });

  it("rejects anything that is not #rrggbb", () => {
    assert.match(accentRejection("red") ?? "", /#rrggbb/);
    assert.match(accentRejection("#fff") ?? "", /#rrggbb/);
  });

  it("puts dark text on light accents and white on the rest", () => {
    assert.equal(textOnAccent("#ffd166"), "#111214");
    assert.equal(textOnAccent("#2d7a5f"), "#ffffff");
  });

  it("contrast of black on white is 21:1", () => {
    assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  });
});

describe("effective accent", () => {
  it("falls back to the theme's own accent when none is picked", () => {
    assert.equal(effectiveAccent({ theme: "night", accentColour: null }), THEME_SPECS.night.accent);
  });

  it("uses the business's pick, lower-cased", () => {
    assert.equal(effectiveAccent({ theme: "studio", accentColour: "#3B5BDB" }), "#3b5bdb");
  });

  it("ignores an unusable value rather than painting the page with it", () => {
    assert.equal(
      effectiveAccent({ theme: "studio", accentColour: "blue" }),
      THEME_SPECS.studio.accent,
    );
  });
});

describe("header image", () => {
  it("recognises a preset reference", () => {
    assert.equal(presetFromHeaderUrl("preset:dusk"), "dusk");
    assert.equal(presetFromHeaderUrl("preset:nope"), null);
    assert.equal(presetFromHeaderUrl("https://x/y.jpg"), null);
  });

  it("positions an uploaded photo by its focal point", () => {
    const style = headerStyle({
      theme: "studio",
      headerImageUrl: "https://cdn/h.jpg",
      headerFocalPoint: { x: 30, y: 70 },
    });
    assert.equal(style.backgroundPosition, "30% 70%");
    assert.match(String(style.backgroundImage), /h\.jpg/);
  });

  it("uses the theme gradient when there is no image", () => {
    const style = headerStyle({
      theme: "editorial",
      headerImageUrl: null,
      headerFocalPoint: { x: 50, y: 50 },
    });
    assert.equal(style.backgroundImage, THEME_SPECS.editorial.headerGradient);
  });
});

describe("normaliseBookingPage", () => {
  it("returns the defaults for nothing", () => {
    assert.deepEqual(normaliseBookingPage(null), DEFAULT_BOOKING_PAGE);
  });

  it("keeps the stored section order and turns on nothing the business did not list", () => {
    const page = normaliseBookingPage({
      sections: [
        { key: "location", enabled: true },
        { key: "about", enabled: false },
      ],
    });
    assert.deepEqual(
      page.sections.map((s) => s.key),
      ["location", "about", "reviews", "staff", "gallery"],
    );
    assert.equal(sectionEnabled(page, "location"), true);
    assert.equal(sectionEnabled(page, "reviews"), false);
  });

  it("drops unknown themes and duplicate sections", () => {
    const page = normaliseBookingPage({
      theme: "neon" as never,
      sections: [
        { key: "about", enabled: true },
        { key: "about", enabled: false },
      ],
    });
    assert.equal(page.theme, "studio");
    assert.equal(page.sections.filter((s) => s.key === "about").length, 1);
    assert.equal(sectionEnabled(page, "about"), true);
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    assert.equal(initials("Northside Strength"), "NS");
    assert.equal(initials("Peak"), "PE");
    assert.equal(initials("  "), "?");
  });
});
