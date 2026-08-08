import { describe, expect, it } from "vitest";
import {
  isLoopbackHostname,
  isPublicHostname,
  safePublicHttpUrl,
} from "@/services/networkSecurity";

describe("network destination policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "localhost",
    "router",
    "router.local",
    "router.lan",
    "metadata.google.internal",
    "service.home.arpa",
    "bad_name.example.com",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("rejects non-public destination %s", (hostname) => {
    expect(isPublicHostname(hostname)).toBe(false);
  });

  it.each(["8.8.8.8", "example.com", "2606:4700:4700::1111"])(
    "accepts public destination %s",
    (hostname) => {
      expect(isPublicHostname(hostname)).toBe(true);
    },
  );

  it("rejects credentials and non-HTTP URLs", () => {
    expect(safePublicHttpUrl("https://user:pass@example.com/")).toBeUndefined();
    expect(safePublicHttpUrl("file:///tmp/private")).toBeUndefined();
    expect(safePublicHttpUrl("https://router.internal/admin")).toBeUndefined();
  });

  it("recognizes loopback development hosts", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.1.2.3")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("example.com")).toBe(false);
  });
});
