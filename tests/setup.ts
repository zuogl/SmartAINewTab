import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// Most integration assertions use the product's Chinese default copy. Pin the
// simulated browser locale so their result does not depend on the host machine.
Object.defineProperty(window.navigator, "language", {
  configurable: true,
  value: "zh-CN",
});
