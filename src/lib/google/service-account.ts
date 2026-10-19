import { createSign } from "node:crypto";

/**
 * Service-account access tokens, by the JWT assertion flow.
 *
 * The backlinks sheet used to be readable by anyone with the link, which is why the sync
 * could fetch its CSV export with no credentials at all. Keeping a client's working
 * spreadsheet world-readable to feed a dashboard is a poor trade, so the sync can instead
 * identify itself as the service account the sheet is shared with — one address on the
 * share list, nothing public.
 *
 * Hand-rolled rather than pulled from googleapis: this is the whole of it, it has no
 * dependencies to keep current, and the serverless bundle stays small.
 */
export type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const TOKEN_URI = "https://oauth2.googleapis.com/token";

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * The signed JWT that is exchanged for an access token. `iat` is passed in so it can be tested.
 *
 * `subject` is a user in the customer's Workspace to act as, which requires the account to be
 * authorised for domain-wide delegation. It exists because a share list is something people
 * tidy up: the service account was added to the GRG sheet, and removed again three days
 * later, which stopped the backlinks sync dead. Reading as a staff account who already has
 * access puts nothing on the share list to be removed.
 */
export function buildAssertion(account: ServiceAccount, scope: string, iat: number, subject?: string): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: account.token_uri ?? TOKEN_URI,
      iat,
      exp: iat + 3600,
      // Only when impersonating: Google refuses an assertion carrying an empty sub.
      ...(subject ? { sub: subject } : {}),
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key, "base64url");
  return `${header}.${claims}.${signature}`;
}

/**
 * The key file's contents, either as the JSON itself or base64-encoded. Both are accepted
 * because a PEM's newlines survive one hop into a deployment's environment and not the next.
 */
export function readServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  const value = raw?.trim();
  if (!value) return null;
  const json = value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(json) as Partial<ServiceAccount>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is neither JSON nor base64-encoded JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("The service account key is missing client_email or private_key.");
  }
  // Survives being stored with its newlines escaped, which is how it reads back from some hosts.
  const private_key = parsed.private_key.includes("\\n") ? parsed.private_key.replace(/\\n/g, "\n") : parsed.private_key;
  return { client_email: parsed.client_email, private_key, token_uri: parsed.token_uri };
}

export async function mintAccessToken(
  account: ServiceAccount,
  scope: string,
  opts: { fetchImpl?: typeof fetch; now?: number; subject?: string } = {},
): Promise<string> {
  const { fetchImpl = fetch, now = Math.floor(Date.now() / 1000), subject } = opts;
  const res = await fetchImpl(account.token_uri ?? TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(account, scope, now, subject),
    }).toString(),
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Google refused the token request (HTTP ${res.status}): ${body.slice(0, 300)}`);
  const token = (JSON.parse(body) as { access_token?: string }).access_token;
  if (!token) throw new Error("Google's token response carried no access_token.");
  return token;
}
