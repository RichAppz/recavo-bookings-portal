import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GUIDES } from "../content/guides/index.ts";
import {
  applyTerminology,
  copy,
  expectedImagePaths,
  guidesFor,
  imageSrc,
  searchGuides,
  validateGuides,
  type Guide,
} from "./guides.ts";

const sample: Guide[] = [
  {
    slug: "add-a-booking",
    title: { personal_training: "Book a session", car_detailing: "Book a job" },
    summary: "How to add one",
    category: "bookings",
    verticals: ["personal_training", "car_detailing"],
    minutes: 2,
    steps: [
      { heading: "Open Create", body: "Tap **Create**.", image: { name: "create", alt: "x" } },
    ],
    keywords: ["appointment"],
  },
  {
    slug: "vehicles",
    title: "Vehicles",
    summary: "Cars",
    category: "clients",
    verticals: ["car_detailing"],
    minutes: 1,
    sharedImages: true,
    steps: [{ heading: "Open", body: "Go", image: { name: "list", alt: "list" } }],
    related: ["add-a-booking"],
  },
];

describe("guides", () => {
  it("the shipped guide set is well-formed", () => {
    assert.deepEqual(validateGuides(GUIDES), []);
    assert.ok(GUIDES.length > 0);
  });

  it("every screenshot a shipped guide refers to exists for both viewports", () => {
    const missing = GUIDES.flatMap(expectedImagePaths).filter(
      (p) => !existsSync(join(process.cwd(), "public", p)),
    );
    assert.deepEqual(missing, []);
  });

  it("picks copy for the vertical with sensible fallbacks", () => {
    assert.equal(copy("same", "car_detailing"), "same");
    assert.equal(copy({ personal_training: "a", car_detailing: "b" }, "car_detailing"), "b");
    assert.equal(copy({ default: "d", car_detailing: "b" }, "personal_training"), "d");
    assert.equal(copy({ car_detailing: "b" }, "personal_training"), "b");
  });

  it("fills business terminology tokens with case and plural", () => {
    const t = {
      staff: "Detailer",
      service: "Job type",
      booking: "Job",
      client: "Customer",
      linkedRecord: "Vehicle",
    };
    assert.equal(applyTerminology("Pick a {service}.", t), "Pick a job.");
    assert.equal(applyTerminology("{Services} and {staffs}", t), "Jobs and detailers");
    assert.equal(applyTerminology("{Record}: {records}", t), "Vehicle: vehicles");
    assert.equal(applyTerminology("{unknown}", t), "{unknown}");
  });

  it("builds image paths per vertical, or shared when the guide says so", () => {
    assert.equal(
      imageSrc(sample[0]!, { name: "create" }, "car_detailing", "mobile"),
      "/guides/car_detailing/add-a-booking/create.mobile.webp",
    );
    assert.equal(
      imageSrc(sample[1]!, { name: "list" }, "car_detailing", "desktop"),
      "/guides/shared/vehicles/list.desktop.webp",
    );
    assert.deepEqual(expectedImagePaths(sample[1]!), [
      "/guides/shared/vehicles/list.desktop.webp",
      "/guides/shared/vehicles/list.mobile.webp",
    ]);
    assert.equal(expectedImagePaths(sample[0]!).length, 4);
  });

  it("filters and searches by vertical", () => {
    assert.equal(guidesFor(sample, "personal_training").length, 1);
    assert.equal(guidesFor(sample, "car_detailing").length, 2);
    assert.equal(searchGuides(sample, "car_detailing", "job").length, 1);
    assert.equal(searchGuides(sample, "personal_training", "job").length, 0);
    assert.equal(searchGuides(sample, "car_detailing", "APPOINTMENT").length, 1);
    assert.equal(searchGuides(sample, "car_detailing", "  ").length, 2);
  });

  it("flags duplicate slugs, bad related links and empty copy", () => {
    const bad: Guide[] = [
      { ...sample[0]!, related: ["nope", "add-a-booking"] },
      { ...sample[0]!, slug: "Add Booking", steps: [] },
      { ...sample[1]!, title: "", minutes: 0 },
    ];
    const problems = validateGuides(bad);
    assert.ok(problems.some((p) => p.includes("does not exist")));
    assert.ok(problems.some((p) => p.includes("related to itself")));
    assert.ok(problems.some((p) => p.includes("not kebab-case")));
    assert.ok(problems.some((p) => p.includes("no steps")));
    assert.ok(problems.some((p) => p.includes("missing title")));
    assert.ok(problems.some((p) => p.includes("minutes")));
  });
});
