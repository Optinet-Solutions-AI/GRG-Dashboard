import { csvToRows } from "./parse-sheet";
import { readServiceAccount, mintAccessToken } from "@/lib/google/service-account";
import { extractSheetRef, fetchSheetRows } from "@/lib/google/sheets";

/**
 * Read the backlinks tab, by whichever route the deployment is set up for.
 *
 * With a service account key configured the sync reads the sheet as that account, so the
 * file only has to be shared with one address and stays private otherwise. Without one it
 * falls back to fetching the CSV export anonymously, which is how this worked when the
 * sheet was readable by anyone with the link — and which is why a sharing change broke it.
 *
 * Both routes end in the same rows, so the parser neither knows nor cares which ran.
 */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export async function readBacklinkSheetRows(
  cfg: { csvUrl?: string; serviceAccountJson?: string },
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<string[][]> {
  const { fetchImpl = fetch } = opts;
  if (!cfg.csvUrl) throw new Error("BACKLINKS_SHEET_CSV_URL is not set.");

  const account = readServiceAccount(cfg.serviceAccountJson);
  if (account) {
    const ref = extractSheetRef(cfg.csvUrl);
    if (!ref) {
      throw new Error(`BACKLINKS_SHEET_CSV_URL is not a Google spreadsheet link, so there is no spreadsheet to read: ${cfg.csvUrl}`);
    }
    const token = await mintAccessToken(account, SCOPE, { fetchImpl });
    return fetchSheetRows(ref, token, { fetchImpl });
  }

  const res = await fetchImpl(cfg.csvUrl, { cache: "no-store", redirect: "follow" });
  if (!res.ok) {
    // 401 is Google's answer to an anonymous read of a private file. Naming both fixes beats
    // "Sheet fetch failed", which sent the last reader looking for an outage.
    throw new Error(
      `Sheet fetch failed (HTTP ${res.status}). The sheet has to be shared — either with the service account in GOOGLE_SERVICE_ACCOUNT_JSON, or with anyone who has the link.`,
    );
  }
  return csvToRows(await res.text());
}
