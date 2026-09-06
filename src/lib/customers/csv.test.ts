import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, toCsv } from "./csv.ts";

describe("csv parser (RECA-529)", () => {
  it("handles quoted fields, embedded commas/newlines, doubled quotes, CRLF and BOM", () => {
    const text =
      '\uFEFFName,Notes,Phone\r\n"Cole, Harriet","Likes ""early"" slots\nand tea",07700 900123\r\nBob,,\r\n';
    const table = parseCsv(text);
    assert.deepEqual(table.headers, ["Name", "Notes", "Phone"]);
    assert.deepEqual(table.rows, [
      ["Cole, Harriet", 'Likes "early" slots\nand tea', "07700 900123"],
      ["Bob", "", ""],
    ]);
    assert.equal(table.delimiter, ",");
  });

  it("sniffs a semicolon delimiter and pads short rows", () => {
    const table = parseCsv("a;b;c\n1;2\n");
    assert.equal(table.delimiter, ";");
    assert.deepEqual(table.rows, [["1", "2", ""]]);
  });

  it("drops blank lines and reads a file with no trailing newline", () => {
    const table = parseCsv("a,b\n\n1,2\n,\n3,4");
    assert.deepEqual(table.rows, [
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ['say "hi"', "x,y"],
        [null, 3],
      ],
    );
    assert.deepEqual(parseCsv(csv).rows, [
      ['say "hi"', "x,y"],
      ["", "3"],
    ]);
  });
});
