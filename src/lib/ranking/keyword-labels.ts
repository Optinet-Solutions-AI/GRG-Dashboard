// English translations for the tracked Arabic ranking keywords.
// Keyed on the exact `keywords.text` strings stored in the DB so lookups match 1:1.
// Unknown keywords fall back to "" (the English cell renders empty) — safe by design.
const KEYWORD_EN: Record<string, string> = {
  "إغلاق صفقات التداول": "Closing trading positions",
  "احتيال منصات التداول": "Trading platform fraud",
  "استرجاع أموال التداول": "Recovering trading funds",
  "استرجاع أموال الفوركس": "Recovering forex funds",
  "استرداد خسائر التداول": "Recovering trading losses",
  "استشارة لاسترداد الأموال": "Fund recovery consultation",
  "التلاعب بصفقات التداول": "Manipulating trading positions",
  "تجميد حساب التداول": "Freezing a trading account",
  "تصفية حساب التداول": "Liquidating a trading account",
  "شكوى ضد شركة تداول": "Complaint against a trading company",
  "علامات نصب التداول": "Signs of a trading scam",
  "عمولة سحب التداول": "Trading withdrawal commission",
  "محامي شركات التداول": "Lawyer for trading companies",
  "مشاكل سحب التداول": "Trading withdrawal problems",
  "وسيط تداول لا يرد": "Unresponsive trading broker",
};

/** English gloss for an Arabic keyword, or "" if untranslated. */
export const keywordEnglish = (keyword: string): string => KEYWORD_EN[keyword] ?? "";
