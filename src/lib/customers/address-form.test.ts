import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressToForm, EMPTY_ADDRESS, formToAddress } from "./address-form.ts";

describe("customer address form (RECA-528)", () => {
  it("sends null when every part is blank so the server clears the address", () => {
    assert.equal(formToAddress(EMPTY_ADDRESS), null);
    assert.equal(formToAddress({ ...EMPTY_ADDRESS, city: "   " }), null);
  });

  it("trims parts and nulls the blanks it keeps", () => {
    assert.deepEqual(
      formToAddress({ ...EMPTY_ADDRESS, line1: " 12 High St ", postcode: "LS1 1AA" }),
      {
        line1: "12 High St",
        line2: null,
        city: null,
        region: null,
        postcode: "LS1 1AA",
        country: null,
      },
    );
  });

  it("maps a stored address (or none) back to form strings", () => {
    assert.deepEqual(addressToForm(null), EMPTY_ADDRESS);
    assert.deepEqual(
      addressToForm({
        line1: "1 Lane",
        line2: null,
        city: "Leeds",
        region: null,
        postcode: null,
        country: "GB",
      }),
      { ...EMPTY_ADDRESS, line1: "1 Lane", city: "Leeds", country: "GB" },
    );
  });
});
