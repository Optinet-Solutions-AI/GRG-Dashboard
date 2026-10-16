/**
 * Read one tab of a Google Sheet through the Sheets API, as the service account.
 *
 * The values endpoint addresses a tab by NAME, while every link to a sheet carries its
 * numeric id (`gid`). Names get edited; ids don't. So the configured link stays the single
 * source of truth and the name is looked up from the id on each run — renaming the tab in
 * the sheet can't quietly break the sync.
 */
export type SheetRef = { spreadsheetId: string; gid: number };

/** Pull the file id and tab id out of any Google Sheets link, export or browser form. */
export function extractSheetRef(url: string | undefined | null): SheetRef | null {
  if (!url) return null;
  const id = url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1];
  if (!id) return null;
  const gid = url.match(/[?&#]gid=(\d+)/)?.[1];
  return { spreadsheetId: id, gid: gid ? Number(gid) : 0 };
}

async function getJson(url: string, token: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = await res.text();
  if (!res.ok) {
    // 403 here is almost always the sheet not being shared with the service account, which is
    // the one thing a reader of this error can actually fix.
    throw new Error(`Google Sheets API returned HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body);
}

export async function fetchSheetRows(
  ref: SheetRef,
  token: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<string[][]> {
  const { fetchImpl = fetch } = opts;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ref.spreadsheetId)}`;

  const meta = (await getJson(`${base}?fields=sheets.properties(sheetId,title)`, token, fetchImpl)) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };
  const tabs = (meta.sheets ?? []).map((s) => s.properties).filter((p): p is { sheetId: number; title: string } =>
    typeof p?.sheetId === "number" && typeof p?.title === "string",
  );
  const tab = tabs.find((t) => t.sheetId === ref.gid);
  if (!tab) {
    const names = tabs.map((t) => `${t.title} (gid ${t.sheetId})`).join(", ") || "none";
    throw new Error(`No tab with gid ${ref.gid} in this spreadsheet. Tabs present: ${names}.`);
  }

  const values = (await getJson(
    `${base}/values/${encodeURIComponent(tab.title)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    token,
    fetchImpl,
  )) as { values?: string[][] };

  const rows = values.values ?? [];
  // Google truncates each row at its last filled cell, so a row with empty remarks comes back
  // short. The parser reads fixed positions, so square them off.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")]));
}
