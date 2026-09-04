/** Shape of the error object Supabase/PostgREST returns. */
type DbError = { code?: string; message?: string };

const UNIQUE_VIOLATION = "23505";

/**
 * seo_scores and health_snapshots both carry UNIQUE (site_id, date), so editing an
 * entry's date onto one the site already uses trips the constraint. Postgres's own
 * wording ("duplicate key value violates unique constraint ...") is meaningless to
 * an admin, so translate just that case and pass everything else through.
 */
export function duplicateDateMessage(error: DbError, label: string): string {
  const isDuplicate =
    error.code === UNIQUE_VIOLATION || /duplicate key value violates unique constraint/i.test(error.message ?? "");
  if (isDuplicate) {
    return `This site already has a ${label} on that date. Edit or delete that one instead.`;
  }
  return error.message ?? `Could not save the ${label}.`;
}
