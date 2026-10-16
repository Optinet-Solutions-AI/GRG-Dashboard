import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { buildAssertion, readServiceAccount, mintAccessToken } from "./service-account";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const account = {
  client_email: "seo-audit@example.iam.gserviceaccount.com",
  private_key: privateKey,
  token_uri: "https://oauth2.googleapis.com/token",
};

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("buildAssertion", () => {
  it("signs a token request Google can verify with the matching public key", () => {
    const jwt = buildAssertion(account, "https://www.googleapis.com/auth/spreadsheets.readonly", 1_760_000_000);
    const [header, claims, signature] = jwt.split(".");
    const ok = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature, "base64url");
    expect(ok).toBe(true);
  });

  it("asks only for the scope it was given, from the right account, for one hour", () => {
    const jwt = buildAssertion(account, "https://www.googleapis.com/auth/spreadsheets.readonly", 1_760_000_000);
    const [header, claims] = jwt.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_760_000_000,
      exp: 1_760_000_000 + 3600,
    });
  });
});

describe("readServiceAccount", () => {
  it("accepts the key file's JSON as-is", () => {
    const parsed = readServiceAccount(JSON.stringify(account));
    expect(parsed?.client_email).toBe(account.client_email);
  });

  // A PEM has newlines, and pasting one into a deployment's environment variables mangles them
  // often enough that base64 is the form people reach for.
  it("accepts the same JSON base64-encoded, for environments that mangle newlines", () => {
    const parsed = readServiceAccount(Buffer.from(JSON.stringify(account)).toString("base64"));
    expect(parsed?.client_email).toBe(account.client_email);
  });

  it("returns null when nothing is configured, so callers can fall back", () => {
    expect(readServiceAccount(undefined)).toBeNull();
    expect(readServiceAccount("")).toBeNull();
  });

  it("refuses a key that is missing its private half rather than failing at signing time", () => {
    expect(() => readServiceAccount(JSON.stringify({ client_email: "a@b.com" }))).toThrow(/private_key/);
  });
});

describe("mintAccessToken", () => {
  it("exchanges the assertion for an access token", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3599 }), { status: 200 });
    };

    const token = await mintAccessToken(account, "https://www.googleapis.com/auth/spreadsheets.readonly", {
      fetchImpl: fakeFetch as unknown as typeof fetch,
      now: 1_760_000_000,
    });

    expect(token).toBe("ya29.test");
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0].body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
  });

  // Google answers a bad key with 400 and a JSON body. Surfacing that beats a later "no rows".
  it("reports what Google said when the exchange is refused", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }), { status: 400 });
    await expect(
      mintAccessToken(account, "scope", { fetchImpl: fakeFetch as unknown as typeof fetch, now: 1 }),
    ).rejects.toThrow(/invalid_grant|Invalid JWT Signature/);
  });
});
