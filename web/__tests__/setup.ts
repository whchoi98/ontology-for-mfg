import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement element scrolling; chat pages auto-scroll on
// every message update. (Guarded: some suites run in the node environment.)
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {} as typeof Element.prototype.scrollTo;
}

afterEach(() => {
  cleanup();
});
