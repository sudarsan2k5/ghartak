import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { discountPercent } from "../src/catalogue/display.ts";
import { locationSubtitle } from "../src/location/placeholder-location.ts";

describe("location subtitle", () => {
  it("shows the placeholder address without an invented eta", () => {
    assert.equal(
      locationSubtitle({ label: "Home", line: "Add your address" }),
      "Home, Add your address",
    );
  });

  it("includes a real eta only when one is provided", () => {
    assert.equal(
      locationSubtitle({ label: "Home", line: "Add your address" }, "  "),
      "Home, Add your address",
    );
    assert.equal(
      locationSubtitle({ label: "Home", line: "Ward 12, Cuttack" }, "12 minutes"),
      "12 minutes · Home, Ward 12, Cuttack",
    );
  });
});

describe("discount label", () => {
  it("shows a whole-percent saving only when MRP is above the price", () => {
    assert.equal(discountPercent(2800, 3000), 6);
    assert.equal(discountPercent(3000, 3000), null);
    assert.equal(discountPercent(3500, 3000), null);
    assert.equal(discountPercent(3000, null), null);
    assert.equal(discountPercent(9999, 10000), null);
  });
});
