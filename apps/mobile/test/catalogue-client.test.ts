import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apiBaseUrl, imageBaseUrl } from "../src/api/config.ts";
import { resolveCatalogueImage } from "../src/api/images.ts";
import { stockLabel } from "../src/catalogue/display.ts";

describe("catalogue client configuration", () => {
  it("uses the Android emulator host instead of localhost", () => {
    assert.equal(
      apiBaseUrl({ configured: undefined, platform: "android", appEnv: "development" }),
      "http://10.0.2.2:3000",
    );
    assert.equal(apiBaseUrl({ configured: "  ", platform: "android", appEnv: "development" }), "http://10.0.2.2:3000");
  });

  it("uses loopback for local iOS and web", () => {
    assert.equal(apiBaseUrl({ configured: undefined, platform: "ios", appEnv: "development" }), "http://127.0.0.1:3000");
    assert.equal(apiBaseUrl({ configured: undefined, platform: "web", appEnv: "development" }), "http://127.0.0.1:3000");
  });

  it("requires an explicit production URL and rejects credentials", () => {
    assert.throws(
      () => apiBaseUrl({ configured: undefined, platform: "android", appEnv: "production" }),
      /EXPO_PUBLIC_API_BASE_URL/,
    );
    assert.throws(() => apiBaseUrl({ configured: "http://user:secret@example.com", platform: "ios", appEnv: "development" }));
    assert.equal(
      apiBaseUrl({ configured: "https://api.example.com/v1", platform: "android", appEnv: "production" }),
      "https://api.example.com",
    );
  });

  it("resolves only safe image paths against the configured base", () => {
    assert.equal(resolveCatalogueImage("/catalog/toor-dal/primary.jpg", null), null);
    assert.equal(imageBaseUrl(undefined), null);
    assert.equal(
      resolveCatalogueImage("/catalog/toor-dal/primary.jpg", "https://images.example.com"),
      "https://images.example.com/catalog/toor-dal/primary.jpg",
    );
    assert.equal(resolveCatalogueImage("/catalog/../secret.jpg", "https://images.example.com"), null);
    assert.equal(resolveCatalogueImage("javascript:alert(1)", "https://images.example.com"), null);
    assert.equal(
      resolveCatalogueImage("https://evil.example/photo.jpg", "https://images.example.com"),
      null,
    );
    assert.equal(
      resolveCatalogueImage("https://images.example.com/catalog/milk.jpg", "https://images.example.com"),
      "https://images.example.com/catalog/milk.jpg",
    );
  });

  it("labels zero stock as not purchasable", () => {
    assert.equal(stockLabel({ quantity: 0, purchasable: false }), "Out of stock");
    assert.equal(stockLabel({ quantity: 40, purchasable: true }), "40 in stock");
  });
});
