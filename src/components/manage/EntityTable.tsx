import type { Entity } from "@/lib/manage/entities";
import { EntityForm } from "./EntityForm";
import { updateEntity, deleteEntity } from "@/lib/manage/actions";

type Row = Record<string, unknown> & { id: string };
type SiteOption = { id: string; display_name: string };

export function EntityTable({
  entity,
  rows,
  siteOptions,
}: {
  entity: Entity;
  rows: Row[];
  siteOptions: SiteOption[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No {entity.label.toLowerCase()} yet. Add one above.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <EntityForm
            fields={entity.fields}
            siteOptions={siteOptions}
            initial={row}
            submitLabel="Save"
            action={updateEntity.bind(null, entity.slug, row.id)}
          />
          <form action={deleteEntity.bind(null, entity.slug, row.id)}>
            <button type="submit" className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              Delete
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
