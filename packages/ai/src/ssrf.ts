import { lookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";

export interface ResolvedProviderAddress {
  address: string;
  family: 4 | 6;
}

export type ProviderAddressResolver = (
  hostname: string,
) => Promise<readonly ResolvedProviderAddress[]>;

export interface SafeBaseUrl {
  url: URL;
  resolvedAddresses: readonly string[];
  resolvedRecords: readonly ResolvedProviderAddress[];
  allowlistedLocal: boolean;
}

export interface PinnedRequestInit {
  method: "GET" | "POST";
  headers?: Headers;
  body?: string;
  signal?: AbortSignal;
}

const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024;
const specialPurposeIpv6 = new BlockList();
specialPurposeIpv6.addSubnet("2001::", 23, "ipv6");
specialPurposeIpv6.addSubnet("2001:db8::", 32, "ipv6");
specialPurposeIpv6.addSubnet("2002::", 16, "ipv6");
specialPurposeIpv6.addSubnet("3fff::", 20, "ipv6");

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  const [a = 0, b = 0, c = 0, d = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 168 && b === 63 && c === 129 && d === 16) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }

  // Public unicast IPv6 is currently allocated from 2000::/3. Failing closed
  // outside that range also blocks loopback, ULA, link-local, multicast,
  // documentation, transition, and other special-purpose address space.
  const firstGroup = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  if (
    !Number.isInteger(firstGroup) ||
    firstGroup < 0x2000 ||
    firstGroup > 0x3fff
  )
    return true;

  // These ranges sit inside 2000::/3 but are transition, benchmarking,
  // documentation, or otherwise special-purpose rather than provider targets.
  return specialPurposeIpv6.check(normalized, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const unscoped = address.split("%")[0] ?? address;
  const family = isIP(unscoped);
  if (family === 4) return isPrivateIpv4(unscoped);
  if (family === 6) return isPrivateIpv6(unscoped);
  return true;
}

/**
 * Addresses that may host an explicitly configured personal local model.
 * Link-local, cloud metadata, carrier-grade NAT, unspecified, multicast,
 * documentation, and public ranges are never eligible for this exception.
 */
export function isAllowlistEligibleLocalAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized.startsWith("::ffff:")) {
    return isAllowlistEligibleLocalAddress(normalized.slice("::ffff:".length));
  }
  const family = isIP(normalized);
  if (family === 4) {
    const [a = -1, b = -1] = normalized.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (family === 6) {
    if (normalized === "::1") return true;
    const firstGroup = Number.parseInt(normalized.split(":")[0] ?? "", 16);
    return Number.isInteger(firstGroup) && (firstGroup & 0xfe00) === 0xfc00;
  }
  return false;
}

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function canonicalBaseUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

const systemAddressResolver: ProviderAddressResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.flatMap((record) => {
    const family = isIP(record.address);
    return family === 4 || family === 6
      ? [{ address: record.address, family }]
      : [];
  });
};

/**
 * Proxy tools with fake-IP mode answer every hostname with special-purpose
 * ranges such as 198.18.0.0/15. When the system resolver only produces such
 * addresses, re-resolve through a fixed encrypted-DNS endpoint and accept the
 * result only when it is non-empty and exclusively public. The pinned
 * connection still uses these validated addresses, so the SSRF guarantee is
 * unchanged; if encrypted DNS is unreachable the original rejection stands.
 */
const DOH_FALLBACK_ENDPOINTS = [
  "https://doh.pub/dns-query",
  "https://dns.alidns.com/dns-query",
];

async function dohResolveFallback(
  hostname: string,
): Promise<ResolvedProviderAddress[]> {
  for (const endpoint of DOH_FALLBACK_ENDPOINTS) {
    for (const type of ["A", "AAAA"]) {
      try {
        const response = await fetch(
          `${endpoint}?name=${encodeURIComponent(hostname)}&type=${type}`,
          {
            headers: { accept: "application/dns-json" },
            signal: AbortSignal.timeout(4_000),
          },
        );
        if (!response.ok) continue;
        const body = (await response.json()) as {
          Answer?: Array<{ type?: number; data?: string }>;
        };
        const records: ResolvedProviderAddress[] = [];
        for (const entry of body.Answer ?? []) {
          if (!entry.data) continue;
          const family = isIP(entry.data);
          if (family !== 4 && family !== 6) continue;
          if (type === "A" && entry.type !== 1) continue;
          if (type === "AAAA" && entry.type !== 28) continue;
          records.push({ address: entry.data, family });
        }
        if (records.length > 0) return records;
      } catch {
        continue;
      }
    }
  }
  return [];
}

export async function validateProviderBaseUrl(
  value: string,
  exactLocalAllowlist: readonly string[] = [],
  resolveAddresses: ProviderAddressResolver = systemAddressResolver,
  fallbackResolver: ProviderAddressResolver = dohResolveFallback,
): Promise<SafeBaseUrl> {
  const url = new URL(value);
  if (url.username || url.password)
    throw new Error("Provider URLs cannot contain credentials.");
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Provider URLs must use HTTPS.");
  }

  const canonical = canonicalBaseUrl(value);
  const allowlistedLocal = exactLocalAllowlist.some(
    (entry) => canonicalBaseUrl(entry) === canonical,
  );
  if (url.protocol !== "https:" && !allowlistedLocal) {
    throw new Error(
      "Provider URLs must use HTTPS unless an exact local URL is allowlisted.",
    );
  }

  const hostname = hostnameWithoutBrackets(url.hostname);
  const literalFamily = isIP(hostname);
  const records =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : await resolveAddresses(hostname);
  let resolvedRecords = [
    ...new Map(
      records.flatMap((record) => {
        const address = record.address.split("%")[0] ?? record.address;
        const actualFamily = isIP(address);
        if (
          (actualFamily !== 4 && actualFamily !== 6) ||
          actualFamily !== record.family
        )
          return [];
        return [
          [
            `${actualFamily}:${address}`,
            { address, family: actualFamily },
          ] as const,
        ];
      }),
    ).values(),
  ];

  if (resolvedRecords.length === 0)
    throw new Error("The provider hostname did not resolve.");
  if (
    allowlistedLocal &&
    resolvedRecords.some(
      (record) => !isAllowlistEligibleLocalAddress(record.address),
    )
  ) {
    throw new Error(
      "A local provider allowlist entry may resolve only to loopback, RFC 1918, or IPv6 ULA addresses; metadata, link-local, public, and special-purpose addresses remain blocked.",
    );
  }
  if (
    !allowlistedLocal &&
    resolvedRecords.some((record) => isPrivateAddress(record.address))
  ) {
    // An explicit custom resolver owns its own answer; only the system
    // resolver (or an explicitly injected fallback, used by tests) may be
    // overridden through encrypted DNS.
    const fallbackAllowed =
      resolveAddresses === systemAddressResolver ||
      fallbackResolver !== dohResolveFallback;
    if (literalFamily === 4 || literalFamily === 6 || !fallbackAllowed) {
      throw new Error(
        "The provider URL resolves to a private, loopback, link-local, metadata, or special-purpose address.",
      );
    }
    const fallbackRecords = await fallbackResolver(hostname);
    if (
      fallbackRecords.length === 0 ||
      fallbackRecords.some((record) => isPrivateAddress(record.address))
    ) {
      throw new Error(
        "The provider URL resolves to a private, loopback, link-local, metadata, or special-purpose address. If your proxy tool uses fake-IP mode, add a bypass or direct rule for this domain.",
      );
    }
    resolvedRecords = [
      ...new Map(
        fallbackRecords.map((record) => [
          `${record.family}:${record.address}`,
          record,
        ]),
      ).values(),
    ];
  }

  return {
    url,
    resolvedAddresses: resolvedRecords.map((record) => record.address),
    resolvedRecords,
    allowlistedLocal,
  };
}

function makePinnedLookup(safeBaseUrl: SafeBaseUrl): LookupFunction {
  const expectedHostname = hostnameWithoutBrackets(
    safeBaseUrl.url.hostname,
  ).toLowerCase();
  return (hostname, options: LookupOptions, callback) => {
    if (hostnameWithoutBrackets(hostname).toLowerCase() !== expectedHostname) {
      const error = new Error(
        "The provider request attempted to resolve an unexpected hostname.",
      ) as NodeJS.ErrnoException;
      error.code = "EAI_FAIL";
      callback(error, "", 0);
      return;
    }

    const requestedFamily =
      options.family === 4 || options.family === 6 ? options.family : undefined;
    const candidates = safeBaseUrl.resolvedRecords.filter(
      (record) =>
        requestedFamily === undefined || record.family === requestedFamily,
    );
    if (candidates.length === 0) {
      const error = new Error(
        "No validated provider address matches the requested family.",
      ) as NodeJS.ErrnoException;
      error.code = "EAI_ADDRFAMILY";
      callback(error, "", 0);
      return;
    }

    if (options.all) {
      const all: LookupAddress[] = candidates.map((record) => ({
        address: record.address,
        family: record.family,
      }));
      callback(null, all);
      return;
    }
    const selected = candidates[0]!;
    callback(null, selected.address, selected.family);
  };
}

function assertPinnedEndpoint(safeBaseUrl: SafeBaseUrl, endpoint: URL): void {
  if (endpoint.origin !== safeBaseUrl.url.origin) {
    throw new Error(
      "The provider endpoint must remain on the validated origin.",
    );
  }
  if (endpoint.username || endpoint.password) {
    throw new Error("Provider endpoints cannot contain credentials.");
  }
}

/**
 * Performs a request using only the addresses returned by the validation lookup.
 * The URL hostname remains unchanged, so Host and TLS SNI/certificate checks still
 * use the configured provider name while DNS cannot be rebound after validation.
 */
export function requestPinnedProvider(
  safeBaseUrl: SafeBaseUrl,
  endpoint: URL,
  init: PinnedRequestInit,
): Promise<Response> {
  assertPinnedEndpoint(safeBaseUrl, endpoint);
  const transport = endpoint.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = new Headers(init.headers);

  return new Promise<Response>((resolve, reject) => {
    const request = transport(
      endpoint,
      {
        method: init.method,
        headers: Object.fromEntries(headers.entries()),
        // Never share the global keep-alive pool: a socket established for a
        // separately allowlisted configuration must not bypass this request's
        // validated address set.
        agent: false,
        lookup: makePinnedLookup(safeBaseUrl),
        ...(init.signal === undefined ? {} : { signal: init.signal }),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          reject(new Error("Compatible provider redirects are not allowed."));
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          receivedBytes += buffer.byteLength;
          if (receivedBytes > MAX_PROVIDER_RESPONSE_BYTES) {
            response.destroy(
              new Error(
                "The compatible provider response exceeded the size limit.",
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.once("error", reject);
        response.once("end", () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(name, item);
            } else if (value !== undefined) {
              responseHeaders.set(name, String(value));
            }
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status,
              headers: responseHeaders,
            }),
          );
        });
      },
    );
    request.once("error", reject);
    request.end(init.body);
  });
}
