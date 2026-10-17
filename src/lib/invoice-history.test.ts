import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invoiceForMessage,
  isInvoiceMessageTemplate,
  type HistoryInvoice,
} from "./invoice-history.ts";

function inv(id: string, over: Partial<HistoryInvoice> = {}): HistoryInvoice & { id: string } {
  return {
    id,
    number: `INV-${id}`,
    status: "issued",
    sentAt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    ...over,
  };
}

const email = (occurredAt: string | null, templateKey = "invoice_issued") => ({
  templateKey,
  occurredAt,
});

describe("isInvoiceMessageTemplate", () => {
  it("recognises the invoice email and nothing else", () => {
    assert.equal(isInvoiceMessageTemplate("invoice_issued"), true);
    assert.equal(isInvoiceMessageTemplate("invoice_receipt"), false);
    assert.equal(isInvoiceMessageTemplate("reminder"), false);
  });
});

describe("invoiceForMessage", () => {
  it("ignores non-invoice messages, empty lists and drafts", () => {
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z", "reminder"), [inv("a")]), null);
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), []), null);
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), undefined), null);
    assert.equal(
      invoiceForMessage(email("2026-10-01T10:00:00Z"), [inv("d", { status: "draft" })]),
      null,
    );
  });

  it("matches on sentAt when it sits within a couple of minutes of the email", () => {
    const first = inv("1", { sentAt: "2026-10-01T10:00:05Z" });
    const second = inv("2", {
      createdAt: "2026-10-01T09:30:00Z",
      sentAt: "2026-10-02T15:00:00Z",
    });
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), [first, second])?.id, "1");
    assert.equal(invoiceForMessage(email("2026-10-02T14:59:30Z"), [first, second])?.id, "2");
  });

  it("prefers the closest sentAt when two are within tolerance", () => {
    const near = inv("near", { sentAt: "2026-10-01T10:00:10Z" });
    const far = inv("far", { sentAt: "2026-10-01T10:01:30Z" });
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), [far, near])?.id, "near");
  });

  it("falls back to the newest invoice that existed when the email went", () => {
    // A resend moved sentAt on the first invoice, so the original email no longer
    // matches by sentAt; it must still resolve to the invoice that existed at the time.
    const first = inv("1", { createdAt: "2026-10-01T09:00:00Z", sentAt: "2026-10-05T09:00:00Z" });
    const later = inv("2", { createdAt: "2026-10-03T09:00:00Z", sentAt: "2026-10-03T09:00:01Z" });
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), [later, first])?.id, "1");
  });

  it("uses the only sent invoice when nothing else lines up", () => {
    const only = inv("only", { createdAt: "2026-10-09T09:00:00Z", sentAt: null });
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), [only])?.id, "only");
    assert.equal(invoiceForMessage(email(null), [only])?.id, "only");
  });

  it("gives up rather than guess between several candidates with no timing clue", () => {
    const a = inv("a", { createdAt: "2026-10-09T09:00:00Z" });
    const b = inv("b", { createdAt: "2026-10-10T09:00:00Z" });
    assert.equal(invoiceForMessage(email("2026-10-01T10:00:00Z"), [a, b]), null);
    assert.equal(invoiceForMessage(email(null), [a, b]), null);
  });
});
