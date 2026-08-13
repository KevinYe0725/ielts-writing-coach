import { describe, expect, it } from "vitest";

import {
  isAllowlistEligibleLocalAddress,
  isPrivateAddress,
  validateProviderBaseUrl,
} from "./ssrf";

describe("custom provider SSRF policy", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.100.100.200",
    "127.0.0.1",
    "168.63.129.16",
    "169.254.169.254",
    "172.20.0.1",
    "192.168.1.10",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts globally routable address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("permits only the exact explicitly allowlisted local endpoint", async () => {
    const result = await validateProviderBaseUrl("http://127.0.0.1:11434/v1", [
      "http://127.0.0.1:11434/v1/",
    ]);
    expect(result.allowlistedLocal).toBe(true);
    expect(result.resolvedAddresses).toEqual(["127.0.0.1"]);

    await expect(
      validateProviderBaseUrl("http://127.0.0.1:11434/other", [
        "http://127.0.0.1:11434/v1",
      ]),
    ).rejects.toThrow("exact local URL");
    await expect(
      validateProviderBaseUrl("http://127.0.0.1:11435/v1", [
        "http://127.0.0.1:11434/v1",
      ]),
    ).rejects.toThrow("exact local URL");
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.10",
    "::1",
    "fc00::1",
    "fd12:3456::1",
  ])(
    "recognizes an eligible explicitly configured local address %s",
    (address) => {
      expect(isAllowlistEligibleLocalAddress(address)).toBe(true);
    },
  );

  it.each([
    "0.0.0.0",
    "100.100.100.200",
    "168.63.129.16",
    "169.254.169.254",
    "1.1.1.1",
    "fe80::1",
    "2001:db8::1",
    "2606:4700:4700::1111",
  ])(
    "never treats metadata, link-local, public, or special address %s as a local model",
    (address) => {
      expect(isAllowlistEligibleLocalAddress(address)).toBe(false);
    },
  );

  it("rejects metadata and public HTTP targets even when exactly allowlisted", async () => {
    for (const address of ["169.254.169.254", "168.63.129.16", "1.1.1.1"]) {
      const value = `http://${address}/v1`;
      await expect(validateProviderBaseUrl(value, [value])).rejects.toThrow(
        "metadata, link-local, public, and special-purpose",
      );
    }
  });

  it("rejects HTTP without a local allowlist entry", async () => {
    await expect(
      validateProviderBaseUrl("http://127.0.0.1:11434/v1"),
    ).rejects.toThrow("HTTPS");
  });

  it("rejects credentials and non-HTTP protocols before resolving", async () => {
    const resolver = async () => [{ address: "1.1.1.1", family: 4 as const }];
    await expect(
      validateProviderBaseUrl(
        "https://user:secret@provider.example/v1",
        [],
        resolver,
      ),
    ).rejects.toThrow("credentials");
    await expect(
      validateProviderBaseUrl("file:///etc/passwd", [], resolver),
    ).rejects.toThrow("HTTPS");
  });

  it("rejects private metadata or mixed DNS answers", async () => {
    await expect(
      validateProviderBaseUrl("https://provider.example/v1", [], async () => [
        { address: "169.254.169.254", family: 4 },
      ]),
    ).rejects.toThrow(
      "private, loopback, link-local, metadata, or special-purpose",
    );

    await expect(
      validateProviderBaseUrl("https://provider.example/v1", [], async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "10.0.0.2", family: 4 },
      ]),
    ).rejects.toThrow(
      "private, loopback, link-local, metadata, or special-purpose",
    );
  });

  it("rejects empty, malformed, or family-mismatched resolver output", async () => {
    await expect(
      validateProviderBaseUrl(
        "https://provider.example/v1",
        [],
        async () => [],
      ),
    ).rejects.toThrow("did not resolve");
    await expect(
      validateProviderBaseUrl("https://provider.example/v1", [], async () => [
        { address: "not-an-address", family: 4 },
        { address: "1.1.1.1", family: 6 },
      ]),
    ).rejects.toThrow("did not resolve");
  });

  it("deduplicates a validated resolution set", async () => {
    const result = await validateProviderBaseUrl(
      "https://provider.example/v1",
      [],
      async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "1.1.1.1", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ],
    );
    expect(result.resolvedAddresses).toEqual([
      "1.1.1.1",
      "2606:4700:4700::1111",
    ]);
  });
});
