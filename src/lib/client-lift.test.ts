import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientLiftFromDraft,
  describeClientLift,
  describeClientLiftChange,
  describeClientLiftForCustomer,
  draftFromClientLift,
  sameClientLift,
} from "./client-lift.ts";

describe("client lift drafts", () => {
  it("round-trips a saved lift into the form and back, trimming blanks to null", () => {
    const draft = draftFromClientLift({ destination: "Train station", notes: null });
    assert.deepEqual(draft, { needed: true, destination: "Train station", notes: "" });
    assert.deepEqual(clientLiftFromDraft({ ...draft, notes: "  " }), {
      destination: "Train station",
      notes: null,
    });
    assert.deepEqual(draftFromClientLift(null), { needed: false, destination: "", notes: "" });
  });

  it("sends null when the toggle is off, whatever was typed", () => {
    assert.equal(clientLiftFromDraft({ needed: false, destination: "Home", notes: "x" }), null);
  });

  it("compares lifts by value", () => {
    assert.equal(sameClientLift(null, null), true);
    assert.equal(sameClientLift(null, { destination: "Home", notes: null }), false);
    assert.equal(
      sameClientLift({ destination: "Home", notes: null }, { destination: "Home", notes: null }),
      true,
    );
    assert.equal(
      sameClientLift({ destination: "Home", notes: "5pm" }, { destination: "Home", notes: null }),
      false,
    );
  });
});

describe("client lift wording", () => {
  it("reads as one detail line for staff", () => {
    assert.equal(
      describeClientLift({ destination: "Train station", notes: "Back at 5pm to collect" }),
      "Drop client at Train station · back at 5pm to collect",
    );
    assert.equal(
      describeClientLift({ destination: "Home — 12 Elm Rd", notes: null }),
      "Drop client at Home — 12 Elm Rd",
    );
    assert.equal(describeClientLift({ destination: null, notes: null }), "Lift needed");
    assert.equal(describeClientLift(null), null);
  });

  it("tells the customer where they are being dropped, in the business's noun", () => {
    assert.equal(
      describeClientLiftForCustomer({ destination: "the station", notes: null }, "Vehicle"),
      "We'll drop you at the station after you drop your vehicle off.",
    );
    assert.equal(describeClientLiftForCustomer({ destination: null, notes: "x" }), null);
    assert.equal(describeClientLiftForCustomer(null), null);
  });

  it("describes a history diff as added, removed, moved or note-only", () => {
    assert.equal(
      describeClientLiftChange(null, { destination: "Train station", notes: null }),
      "Lift added: Train station",
    );
    assert.equal(
      describeClientLiftChange({ destination: "Train station", notes: null }, null),
      "Lift removed: Train station",
    );
    assert.equal(
      describeClientLiftChange(
        { destination: "Train station", notes: null },
        { destination: "Home", notes: null },
      ),
      "Lift: Train station → Home",
    );
    assert.equal(
      describeClientLiftChange(
        { destination: "Home", notes: null },
        { destination: "Home", notes: "Back at 5pm" },
      ),
      "Lift note updated",
    );
    assert.equal(
      describeClientLiftChange(null, { destination: null, notes: null }),
      "Lift added: no destination",
    );
  });
});
