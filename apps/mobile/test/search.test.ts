import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addRecentSearch, maxRecentSearches, parseRecentSearches } from "../src/search/recent.ts";

describe("recent searches", () => {
  it("puts the newest term first and drops case-insensitive duplicates", () => {
    assert.deepEqual(addRecentSearch(["milk", "Onion"], "  onion  "), ["onion", "milk"]);
  });

  it("ignores blank and overlong terms and collapses inner spaces", () => {
    assert.deepEqual(addRecentSearch(["milk"], "   "), ["milk"]);
    assert.deepEqual(addRecentSearch(["milk"], "x".repeat(81)), ["milk"]);
    assert.deepEqual(addRecentSearch([], "olive   oil"), ["olive oil"]);
  });

  it("keeps only the most recent terms", () => {
    let list: string[] = [];
    for (let index = 0; index < maxRecentSearches + 3; index += 1) {
      list = addRecentSearch(list, `term ${index}`);
    }
    assert.equal(list.length, maxRecentSearches);
    assert.equal(list[0], `term ${maxRecentSearches + 2}`);
  });

  it("reads stored data defensively", () => {
    assert.deepEqual(parseRecentSearches(null), []);
    assert.deepEqual(parseRecentSearches("not json"), []);
    assert.deepEqual(parseRecentSearches('{"a":1}'), []);
    assert.deepEqual(parseRecentSearches('["milk", 4, "", "oil"]'), ["milk", "oil"]);
  });
});
