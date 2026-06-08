import "server-only";

export type FieldType = "text" | "number" | "boolean" | "site";
export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: string | number | boolean;
};
export type Entity = {
  slug: string;
  table: string;
  label: string;
  singular: string;
  fields: Field[];
  orderBy: string[];
};

export const ENTITIES: Record<string, Entity> = {
  sites: {
    slug: "sites", table: "sites", label: "Sites", singular: "Site",
    fields: [
      { name: "domain", label: "Domain", type: "text", required: true },
      { name: "display_name", label: "Display name", type: "text", required: true },
      { name: "sort_order", label: "Sort order", type: "number", defaultValue: 0 },
      { name: "active", label: "Active", type: "boolean", defaultValue: true },
    ],
    orderBy: ["sort_order", "domain"],
  },
  keywords: {
    slug: "keywords", table: "keywords", label: "Keywords", singular: "Keyword",
    fields: [
      { name: "text", label: "Keyword", type: "text", required: true },
      { name: "global_volume", label: "Global volume", type: "number" },
      { name: "sort_order", label: "Sort order", type: "number", defaultValue: 0 },
      { name: "active", label: "Active", type: "boolean", defaultValue: true },
    ],
    orderBy: ["sort_order", "text"],
  },
  countries: {
    slug: "countries", table: "countries", label: "Countries", singular: "Country",
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "sort_order", label: "Sort order", type: "number", defaultValue: 0 },
      { name: "active", label: "Active", type: "boolean", defaultValue: true },
    ],
    orderBy: ["sort_order", "code"],
  },
  "pagespeed-urls": {
    slug: "pagespeed-urls", table: "pagespeed_urls", label: "PageSpeed URLs", singular: "PageSpeed URL",
    fields: [
      { name: "site_id", label: "Site", type: "site", required: true },
      { name: "url", label: "URL", type: "text", required: true },
      { name: "label", label: "Label", type: "text" },
      { name: "sort_order", label: "Sort order", type: "number", defaultValue: 0 },
      { name: "active", label: "Active", type: "boolean", defaultValue: true },
    ],
    orderBy: ["sort_order", "url"],
  },
  "qa-pages": {
    slug: "qa-pages", table: "qa_pages", label: "QA Pages", singular: "QA Page",
    fields: [
      { name: "site_id", label: "Site", type: "site", required: true },
      { name: "url", label: "URL", type: "text", required: true },
      { name: "label", label: "Label", type: "text" },
      { name: "sort_order", label: "Sort order", type: "number", defaultValue: 0 },
      { name: "active", label: "Active", type: "boolean", defaultValue: true },
    ],
    orderBy: ["sort_order", "url"],
  },
  "qa-elements": {
    slug: "qa-elements", table: "qa_elements", label: "QA Elements", singular: "QA Element",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "sort_order", label: "Sort order", type: "number", defaultValue: 0 },
    ],
    orderBy: ["sort_order", "name"],
  },
};

export function getEntity(slug: string): Entity | undefined {
  return Object.prototype.hasOwnProperty.call(ENTITIES, slug) ? ENTITIES[slug] : undefined;
}
