import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv } from "./csv.ts";
import {
  autoMap,
  buildImportRow,
  cleanCell,
  mappingHasName,
  parseYesNo,
  splitFullName,
  TEMPLATE_COLUMNS,
  TEMPLATE_EXAMPLE_ROW,
} from "./import-mapping.ts";

// Header row of a real export from another booking system (Squeegee-style).
const FOREIGN_HEADERS = [
  "ID",
  "Type",
  "Status",
  "First Name",
  "Last Name",
  "Name",
  "Amount Spent",
  "Credit Balance",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Country",
  "Phone Number",
  "Email",
  "Origin",
  "Referral Code",
  "Referrals",
  "Last Completed Job",
  "Custom Data",
  "Notes",
  "Quickbooks Customer ID",
  "Items",
  "Tax Exempt",
  "Receive Reminders",
  "Receive News and Offers",
  "Opted Out",
  "Photo URL",
  "Quickbooks ID",
  "Modified",
  "Created",
  "Created By",
];

describe("import column mapping (RECA-529)", () => {
  it("auto-maps a foreign export by header synonyms and ignores the rest", () => {
    const mapping = autoMap(FOREIGN_HEADERS);
    const byHeader = Object.fromEntries(FOREIGN_HEADERS.map((h, i) => [h, mapping[i]]));
    assert.equal(byHeader["ID"], "externalId");
    assert.equal(byHeader["First Name"], "firstName");
    assert.equal(byHeader["Last Name"], "lastName");
    // "Name" would be fullName, but the split columns exist so it is dropped.
    assert.equal(byHeader["Name"], null);
    assert.equal(byHeader["Address Line 1"], "addressLine1");
    assert.equal(byHeader["City"], "city");
    assert.equal(byHeader["State"], "region");
    assert.equal(byHeader["Postal Code"], "postcode");
    assert.equal(byHeader["Phone Number"], "phone");
    assert.equal(byHeader["Email"], "email");
    assert.equal(byHeader["Notes"], "notes");
    assert.equal(byHeader["Receive Reminders"], "operationalNotifications");
    assert.equal(byHeader["Receive News and Offers"], "marketingConsent");
    // Money, referrals and bookkeeping ids are never imported.
    assert.equal(byHeader["Amount Spent"], null);
    assert.equal(byHeader["Credit Balance"], null);
    assert.equal(byHeader["Quickbooks Customer ID"], null);
    assert.equal(byHeader["Items"], null);
  });

  it("maps every template column to its own target", () => {
    const mapping = autoMap(TEMPLATE_COLUMNS.map((c) => c.header));
    TEMPLATE_COLUMNS.forEach((c, i) => assert.equal(mapping[i], c.target, c.header));
    assert.ok(mappingHasName(mapping));
  });

  it("builds an API row from the template example", () => {
    const mapping = autoMap(TEMPLATE_COLUMNS.map((c) => c.header));
    const row = buildImportRow(TEMPLATE_EXAMPLE_ROW, mapping);
    assert.equal(row.firstName, "Harriet");
    assert.equal(row.lastName, "Cole");
    assert.equal(row.nickname, "Harriet – red Audi");
    assert.equal(row.phone, "07700 900123");
    assert.deepEqual(row.address, {
      line1: "12 High Street",
      line2: null,
      city: "Leeds",
      region: "West Yorkshire",
      postcode: "LS1 1AA",
      country: "GB",
    });
    assert.deepEqual(row.tags, ["VIP", "Audi"]);
    assert.equal(row.marketingConsent, true);
    assert.equal(row.operationalNotifications, true);
    assert.deepEqual(row.vehicle, {
      registration: "AB12 CDE",
      make: "Audi",
      model: "A3",
      year: 2021,
      colour: "Red",
    });
  });

  it("lets the user remap: Last Name → Known as, Items → vehicle model", () => {
    const csv = parseCsv(
      `${FOREIGN_HEADERS.join(",")}\n` +
        `NdD5,person,existing,Joanna,1 series,Joanna 1 series,£0.00,£0.00,,,,,,,+447590333602,,,NdD5,,"01/09/26, 17:17",,,,bmw 1 series,FALSE,TRUE,TRUE,FALSE,,,"01/09/26, 17:17","06/03/26, 9:42",Taylor\n`,
    );
    const mapping = autoMap(csv.headers);
    mapping[csv.headers.indexOf("Last Name")] = "nickname";
    mapping[csv.headers.indexOf("Items")] = "vehicleModel";
    const row = buildImportRow(csv.rows[0]!, mapping);
    assert.equal(row.firstName, "Joanna");
    assert.equal(row.lastName, null);
    assert.equal(row.nickname, "1 series");
    assert.equal(row.phone, "+447590333602");
    assert.equal(row.email, null);
    assert.equal(row.address, null);
    assert.equal(row.externalId, "NdD5");
    assert.equal(row.operationalNotifications, true);
    assert.equal(row.marketingConsent, true);
    assert.deepEqual(row.vehicle, {
      registration: null,
      make: null,
      model: "bmw 1 series",
      year: null,
      colour: null,
    });
    assert.equal(row.tags, undefined);
  });

  it("splits a full name when no first-name column is mapped", () => {
    const mapping = autoMap(["Customer", "Mobile"]);
    assert.equal(mapping[0], "fullName");
    const row = buildImportRow(["Harriet Jane Cole", "07700 900123"], mapping);
    assert.equal(row.firstName, "Harriet");
    assert.equal(row.lastName, "Jane Cole");
    assert.deepEqual(splitFullName("Cher"), { firstName: "Cher", lastName: null });
    assert.deepEqual(splitFullName("  "), { firstName: "", lastName: null });
  });

  it("strips stray surrounding quotes from cell values", () => {
    assert.equal(cleanCell('"Joanna"'), "Joanna");
    assert.equal(cleanCell("“Roy 5 series”"), "Roy 5 series");
    assert.equal(cleanCell("'A3'"), "A3");
    assert.equal(cleanCell('""BMW""'), "BMW");
    assert.equal(cleanCell('Joanna "Jo" Smith'), 'Joanna "Jo" Smith');
    const mapping = autoMap(["First Name", "Known as"]);
    const row = buildImportRow(['"Joanna"', "“1 series”"], mapping);
    assert.equal(row.firstName, "Joanna");
    assert.equal(row.nickname, "1 series");
  });

  it("parses yes/no cells and leaves blanks to the server default", () => {
    assert.equal(parseYesNo("TRUE"), true);
    assert.equal(parseYesNo("yes"), true);
    assert.equal(parseYesNo("1"), true);
    assert.equal(parseYesNo("No"), false);
    assert.equal(parseYesNo("opted out"), false);
    assert.equal(parseYesNo(""), undefined);
    assert.equal(parseYesNo("maybe"), undefined);
  });
});
