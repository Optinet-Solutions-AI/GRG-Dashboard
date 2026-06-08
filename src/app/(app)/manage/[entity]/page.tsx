import { notFound } from "next/navigation";
import { getEntity } from "@/lib/manage/entities";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createEntity } from "@/lib/manage/actions";
import { EntityForm } from "@/components/manage/EntityForm";
import { EntityTable } from "@/components/manage/EntityTable";

// The page reads cookies (auth) so it always renders dynamically; unknown slugs are
// handled at runtime by notFound() below, so no generateStaticParams is needed.

export default async function EntityPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity: slug } = await params;
  const entity = getEntity(slug);
  if (!entity) notFound();

  const supabase = await createServerSupabaseClient();
  let query = supabase.from(entity.table).select("*");
  for (const col of entity.orderBy) query = query.order(col);
  const { data: rows, error } = await query;

  const needsSites = entity.fields.some((f) => f.type === "site");
  const siteOptions = needsSites
    ? ((await supabase.from("sites").select("id, display_name").order("display_name")).data ?? [])
    : [];

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">{entity.label}</h1>
      <EntityForm
        fields={entity.fields}
        siteOptions={siteOptions}
        submitLabel={`Add ${entity.singular}`}
        action={createEntity.bind(null, slug)}
        resetOnSuccess
      />
      {error ? (
        <p className="text-sm text-red-600">Could not load {entity.label.toLowerCase()}: {error.message}</p>
      ) : (
        <EntityTable
          entity={entity}
          rows={(rows as ({ id: string } & Record<string, unknown>)[]) ?? []}
          siteOptions={siteOptions}
        />
      )}
    </section>
  );
}
