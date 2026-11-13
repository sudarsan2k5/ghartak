import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tileTint, washes } from "../src/theme/tints.ts";

describe("category tile tints", () => {
  it("cycles through the four washes so neighbours differ", () => {
    const first = [0, 1, 2, 3].map(tileTint);
    assert.deepEqual(first, [washes.aisleWash, washes.receiptWash, washes.paymentWash, washes.mapGround]);
    assert.equal(tileTint(4), washes.aisleWash);
    for (let index = 0; index < 12; index += 1) {
      assert.notEqual(tileTint(index), tileTint(index + 1));
    }
  });

  it("falls back to the first wash for odd input", () => {
    assert.equal(tileTint(-1), washes.mapGround);
    assert.equal(tileTint(Number.NaN), washes.aisleWash);
  });
});
