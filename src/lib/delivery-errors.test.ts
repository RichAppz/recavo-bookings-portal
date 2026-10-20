import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliveryFailure } from "./delivery-errors.ts";

const postmarkInactive =
  "The payment reminder could not be sent: email (Postmark delivery failed: You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: . Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.)";

describe("deliveryFailure", () => {
  it("explains a suppressed email address and points at the profile", () => {
    const f = deliveryFailure(postmarkInactive, "Jordan Lee");
    assert.deepEqual(f, {
      message:
        "Emails to Jordan Lee are blocked because an earlier one bounced or was marked as spam. Check their email address, or add a mobile number so it can go by text.",
      checkProfile: true,
    });
  });

  it("covers both channels when email and text both failed", () => {
    const f = deliveryFailure(
      "The reminder could not be sent: email (Postmark delivery failed: hard bounce), text message (no text credits left)",
      "Sam",
    );
    assert.equal(
      f?.message,
      "Emails to Sam are blocked because an earlier one bounced or was marked as spam. You have no text credits left, so it couldn't go by text. Check their contact details on their profile.",
    );
    assert.equal(f?.checkProfile, true);
  });

  it("keeps a generic line for an unknown provider error, without the provider text", () => {
    const f = deliveryFailure("The email could not be sent (timeout)", null);
    assert.equal(f?.message, "The email to this client didn't go through.");
    assert.equal(f?.checkProfile, false);
  });

  it("leaves other refusals to the API's own wording", () => {
    assert.equal(
      deliveryFailure(
        "A payment reminder was sent to this customer a few minutes ago; wait before sending another",
        "Sam",
      ),
      null,
    );
    assert.equal(deliveryFailure("Nothing is outstanding on this booking", "Sam"), null);
    assert.equal(deliveryFailure(undefined, "Sam"), null);
  });
});
