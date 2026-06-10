"use client";

import { useState } from "react";

type Row = Record<string, string | number | null>;

const MAIN_COLS: { key: string; label: string; w: string }[] = [
  { key: "group_name",       label: "Group",       w: "4rem"  },
  { key: "url",              label: "URL",          w: "15rem" },
  { key: "indexed_gsc",      label: "Indexed GSC",  w: "6.5rem"},
  { key: "permalink",        label: "Permalink",    w: "10rem" },
  { key: "status",           label: "Status",       w: "4rem"  },
  { key: "lang",             label: "Lang",         w: "3rem"  },
  { key: "dir",              label: "Dir",          w: "3rem"  },
  { key: "title",            label: "Title",        w: "14rem" },
  { key: "meta_description", label: "Meta Desc",    w: "14rem" },
];

const DETAIL_GROUPS: { heading: string; fields: { key: string; label: string }[] }[] = [
  {
    heading: "Meta",
    fields: [
      { key: "en_equivalent",    label: "EN Equivalent" },
      { key: "title_length",     label: "Title Length"  },
      { key: "meta_length",      label: "Meta Length"   },
      { key: "canonical",        label: "Canonical"     },
    ],
  },
  {
    heading: "Headings",
    fields: [
      { key: "h1_count", label: "H1 Count" },
      { key: "h1",       label: "H1"       },
      { key: "h2_count", label: "H2 Count" },
      { key: "h2_list",  label: "H2 List"  },
      { key: "h3_count", label: "H3 Count" },
      { key: "h3_list",  label: "H3 List"  },
    ],
  },
  {
    heading: "Images",
    fields: [
      { key: "images_total",       label: "Total"       },
      { key: "images_with_alt",    label: "With Alt"    },
      { key: "images_decorative",  label: "Decorative"  },
      { key: "images_missing_alt", label: "Missing Alt" },
      { key: "missing_alt_srcs",   label: "Missing Alt Srcs" },
    ],
  },
  {
    heading: "Issues",
    fields: [
      { key: "seo_issues",          label: "SEO Issues"      },
      { key: "ar_alignment_issues", label: "AR Alignment"    },
    ],
  },
];

const TABLE_W = MAIN_COLS.reduce((s, c) => s + parseFloat(c.w) * 16, 0) + 36; // +36 for chevron col

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DetailPanel({ row }: { row: Row }) {
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {DETAIL_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {group.heading}
          </p>
          <dl className="space-y-1.5">
            {group.fields.map(({ key, label }) => {
              const val = String(row[key] ?? "");
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <dt className="text-[10px] text-slate-400">{label}</dt>
                  <dd
                    className={`break-words text-xs ${val ? "text-slate-700" : "text-slate-300"}`}
                    title={val || undefined}
                  >
                    {val || "—"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function QaPageTable({ rows }: { rows: Row[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="table-fixed text-xs" style={{ width: TABLE_W }}>
        <colgroup>
          <col style={{ width: "2.25rem" }} />
          {MAIN_COLS.map((c) => (
            <col key={c.key} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 bg-slate-50">
          <tr className="border-b border-slate-200">
            <th className="w-9" />
            {MAIN_COLS.map((col) => (
              <th
                key={col.key}
                className="overflow-hidden px-2.5 py-2 text-left font-medium text-slate-500"
              >
                <div className="truncate">{col.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const id = String(row.id ?? i);
            const isOpen = expanded.has(id);
            return (
              <>
                <tr
                  key={id}
                  onClick={() => toggle(id)}
                  className={`cursor-pointer border-b border-slate-100 transition-colors ${
                    isOpen
                      ? "bg-blue-50/60 hover:bg-blue-50"
                      : "hover:bg-slate-50/80"
                  }`}
                >
                  {/* Chevron */}
                  <td className="px-2 py-1.5 text-slate-400">
                    <ChevronIcon open={isOpen} />
                  </td>
                  {MAIN_COLS.map((col) => {
                    const val = String(row[col.key] ?? "");
                    const isUrl = col.key === "url" && val.startsWith("http");
                    return (
                      <td
                        key={col.key}
                        className="overflow-hidden px-2.5 py-1.5 align-middle"
                        title={val || undefined}
                        onClick={isUrl ? (e) => e.stopPropagation() : undefined}
                      >
                        {isUrl ? (
                          <div className="truncate">
                            <a
                              href={val}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {val}
                            </a>
                          </div>
                        ) : (
                          <div className={`truncate ${val ? "text-slate-700" : "text-slate-300"}`}>
                            {val || "—"}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {isOpen ? (
                  <tr key={`${id}-detail`} className="border-b border-slate-200 bg-slate-50/50">
                    <td colSpan={MAIN_COLS.length + 1} className="p-0">
                      <DetailPanel row={row} />
                    </td>
                  </tr>
                ) : null}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
