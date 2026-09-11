import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bpsToPercentInput,
  formatVatRate,
  invoiceAllows,
  invoiceBalanceMinor,
  invoiceLinkedRecord,
  isCustomerVisible,
  isInvoiceOverdue,
  isValidNumberPrefix,
  linkedRecordInput,
  nextInvoiceNumberPreview,
  percentInputToBps,
  showsVat,
  sortInvoicesNewestFirst,
  supportsLinkedRecord,
  validateLineDrafts,
  visibleInvoices,
  type InvoiceStatus,
} from "./invoices.ts";

describe("invoiceAllows", () => {
  it("matches the status table: drafts are deleted, numbered invoices voided or redone", () => {
    const table: Record<InvoiceStatus, string[]> = {
      draft: ["edit", "issue", "delete", "pdf"],
      issued: ["send", "markPaid", "void", "redo", "pdf"],
      paid: ["send", "void", "redo", "pdf"],
      void: ["pdf"],
    };
    const actions = ["edit", "issue", "send", "markPaid", "void", "redo", "delete", "pdf"] as const;
    for (const status of Object.keys(table) as InvoiceStatus[]) {
      for (const action of actions) {
        assert.equal(
          invoiceAllows(status, action),
          table[status].includes(action),
          `${status} → ${action}`,
        );
      }
    }
  });

  it("customers see issued, paid and voided invoices but never drafts", () => {
    assert.equal(isCustomerVisible("draft"), false);
    assert.equal(isCustomerVisible("issued"), true);
    assert.equal(isCustomerVisible("paid"), true);
    assert.equal(isCustomerVisible("void"), true);
  });
});

describe("visibleInvoices", () => {
  const list = [
    { id: "a", status: "draft" as const },
    { id: "b", status: "issued" as const },
    { id: "c", status: "void" as const },
    { id: "d", status: "paid" as const },
  ];

  it("hides voided invoices from the day-to-day 'all' view", () => {
    assert.deepEqual(
      visibleInvoices(list, "all").map((i) => i.id),
      ["a", "b", "d"],
    );
  });

  it("shows exactly the chosen status, including void when asked for", () => {
    assert.deepEqual(
      visibleInvoices(list, "void").map((i) => i.id),
      ["c"],
    );
    assert.deepEqual(
      visibleInvoices(list, "draft").map((i) => i.id),
      ["a"],
    );
  });
});

describe("invoiceBalanceMinor", () => {
  it("is total minus paid, clamped at zero", () => {
    assert.equal(invoiceBalanceMinor({ totalMinor: 12000, paidMinor: 0 }), 12000);
    assert.equal(invoiceBalanceMinor({ totalMinor: 12000, paidMinor: 5000 }), 7000);
    assert.equal(invoiceBalanceMinor({ totalMinor: 12000, paidMinor: 15000 }), 0);
  });
});

describe("showsVat", () => {
  it("needs registration and a positive rate, like the PDF", () => {
    assert.equal(showsVat({ taxTreatment: "vat_registered", vatRateBps: 2000 }), true);
    assert.equal(showsVat({ taxTreatment: "vat_registered", vatRateBps: 0 }), false);
    assert.equal(showsVat({ taxTreatment: "vat_registered", vatRateBps: null }), false);
    assert.equal(showsVat({ taxTreatment: "not_vat_registered", vatRateBps: 2000 }), false);
  });

  it("formats rates without trailing noise", () => {
    assert.equal(formatVatRate(2000), "20%");
    assert.equal(formatVatRate(1750), "17.5%");
    assert.equal(formatVatRate(500), "5%");
  });
});

describe("VAT rate input", () => {
  it("round-trips percent text and basis points", () => {
    assert.equal(bpsToPercentInput(2000), "20");
    assert.equal(bpsToPercentInput(1750), "17.5");
    assert.equal(bpsToPercentInput(null), "");
    assert.equal(percentInputToBps("20"), 2000);
    assert.equal(percentInputToBps(" 17.5 "), 1750);
  });

  it("treats blank as no rate and rejects out-of-range values", () => {
    assert.equal(percentInputToBps(""), null);
    assert.equal(percentInputToBps("101"), undefined);
    assert.equal(percentInputToBps("-1"), undefined);
    assert.equal(percentInputToBps("abc"), undefined);
  });
});

describe("number prefix", () => {
  it("accepts the API's charset and length", () => {
    assert.equal(isValidNumberPrefix("INV-"), true);
    assert.equal(isValidNumberPrefix("shine_2026-"), true);
    assert.equal(isValidNumberPrefix(""), true);
    assert.equal(isValidNumberPrefix("INV #"), false);
    assert.equal(isValidNumberPrefix("ABCDEFGHIJKLM"), false);
  });

  it("previews the next number padded to four digits", () => {
    assert.equal(nextInvoiceNumberPreview("INV-"), "INV-0001");
    assert.equal(nextInvoiceNumberPreview(undefined), "INV-0001");
    assert.equal(nextInvoiceNumberPreview("SD", 42), "SD0042");
  });
});

describe("validateLineDrafts", () => {
  const good = {
    description: "Full valet",
    quantity: "1",
    unitPrice: "120",
    taxable: true,
    serviceId: null,
  };

  it("converts prices to pence and keeps taxable/serviceId", () => {
    const result = validateLineDrafts([good, { ...good, unitPrice: "£15.50", quantity: "2" }]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.lines[0], {
      description: "Full valet",
      quantity: 1,
      unitPriceMinor: 12000,
      taxable: true,
      serviceId: null,
    });
    assert.equal(result.lines[1]?.unitPriceMinor, 1550);
    assert.equal(result.lines[1]?.quantity, 2);
  });

  it("requires at least one line", () => {
    const result = validateLineDrafts([]);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.form ?? "", /at least one/);
  });

  it("reports per-row problems and leaves valid rows clean", () => {
    const result = validateLineDrafts([
      good,
      { ...good, description: "   ", quantity: "0", unitPrice: "-3" },
      { ...good, quantity: "1.5" },
    ]);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.errors[0], {});
    assert.ok(result.errors[1]?.description);
    assert.ok(result.errors[1]?.quantity);
    assert.ok(result.errors[1]?.unitPrice);
    assert.ok(result.errors[2]?.quantity);
    assert.equal(result.errors[2]?.unitPrice, undefined);
  });

  it("allows a zero price but not a blank one", () => {
    assert.equal(validateLineDrafts([{ ...good, unitPrice: "0" }]).ok, true);
    assert.equal(validateLineDrafts([{ ...good, unitPrice: "" }]).ok, false);
  });
});

describe("isInvoiceOverdue", () => {
  const base = { status: "issued" as const, dueDate: "2026-09-01", totalMinor: 100, paidMinor: 0 };

  it("flags issued, unpaid invoices past their due date", () => {
    assert.equal(isInvoiceOverdue(base, "2026-09-02"), true);
    assert.equal(isInvoiceOverdue(base, "2026-09-01"), false);
    assert.equal(isInvoiceOverdue({ ...base, paidMinor: 100 }, "2026-09-02"), false);
    assert.equal(isInvoiceOverdue({ ...base, status: "paid" }, "2026-09-02"), false);
    assert.equal(isInvoiceOverdue({ ...base, dueDate: null }, "2026-09-02"), false);
  });
});

describe("sortInvoicesNewestFirst", () => {
  it("orders by issue date, falling back to creation for drafts", () => {
    const sorted = sortInvoicesNewestFirst([
      { issueDate: "2026-09-01", createdAt: "2026-08-30T10:00:00Z" },
      { issueDate: null, createdAt: "2026-09-03T10:00:00Z" },
      { issueDate: "2026-09-02", createdAt: "2026-09-02T09:00:00Z" },
      { issueDate: "2026-09-02", createdAt: "2026-09-02T12:00:00Z" },
    ]);
    assert.deepEqual(
      sorted.map((i) => i.createdAt),
      [
        "2026-09-03T10:00:00Z",
        "2026-09-02T12:00:00Z",
        "2026-09-02T09:00:00Z",
        "2026-08-30T10:00:00Z",
      ],
    );
  });
});

describe("linked record on an invoice", () => {
  const vehicle = { label: "Vehicle", value: "AB12 CDE · Ford · Focus" };

  it("reads the snapshot, treating a missing key (older API) as no record", () => {
    assert.deepEqual(invoiceLinkedRecord({ linkedRecord: vehicle }), vehicle);
    assert.equal(invoiceLinkedRecord({ linkedRecord: null }), null);
    assert.equal(invoiceLinkedRecord({}), null);
  });

  it("only offers the editor field when the API sends the key at all", () => {
    assert.equal(supportsLinkedRecord({ linkedRecord: vehicle }), true);
    assert.equal(supportsLinkedRecord({ linkedRecord: null }), true);
    assert.equal(supportsLinkedRecord({}), false);
  });

  it("turns typed text into the PATCH body, clearing on blank", () => {
    assert.deepEqual(linkedRecordInput("Vehicle", "  AB12 CDE · Ford Focus ST "), {
      label: "Vehicle",
      value: "AB12 CDE · Ford Focus ST",
    });
    assert.equal(linkedRecordInput("Vehicle", "   "), null);
    assert.deepEqual(linkedRecordInput("  ", "AB12 CDE"), {
      label: "Reference",
      value: "AB12 CDE",
    });
  });
});
