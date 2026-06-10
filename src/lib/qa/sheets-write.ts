import "server-only";

const SHEET_ID = "1_DPHN4k7ZWT1indxQXiFdSyanuWz2SLgCC4vx_e2PyU";

type SAKey = { client_email: string; private_key: string };

async function getAccessToken(sa: SAKey): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: iat + 3600,
    iat,
  };
  const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const pld = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${hdr}.${pld}`);
  const sig = signer.sign(sa.private_key, "base64url");
  const jwt = `${hdr}.${pld}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok) throw new Error(`SA auth failed: ${data.error_description ?? data.error}`);
  return data.access_token!;
}

function colLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return String.fromCharCode(65 + Math.floor(index / 26) - 1) + String.fromCharCode(65 + (index % 26));
}

/**
 * Update a single cell in the whole-site audit tab (gid=0 = first sheet).
 * Silently skips if GOOGLE_SHEETS_SA_KEY is not configured.
 */
export async function writeSiteAuditCell(
  sheetRow: number,
  colIndex: number,
  value: string,
): Promise<void> {
  const saKeyJson = process.env.GOOGLE_SHEETS_SA_KEY;
  if (!saKeyJson) return;
  try {
    const sa = JSON.parse(saKeyJson) as SAKey;
    const token = await getAccessToken(sa);
    const cell = `${colLetter(colIndex)}${sheetRow}`;
    const rangeEnc = encodeURIComponent(cell);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${rangeEnc}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: cell, majorDimension: "ROWS", values: [[value]] }),
      },
    );
  } catch (e) {
    // Write-back is best-effort — DB is already saved
    console.error("Sheets write-back failed:", e instanceof Error ? e.message : String(e));
  }
}
