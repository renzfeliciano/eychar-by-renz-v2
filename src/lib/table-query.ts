export type ParsedTableQuery = {
  q?: string;
  sort?: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads q/sort/dir/page/pageSize off a page's searchParams — the same
    URL-driven filtering convention already used for People's employmentType
    filter and Events' month nav, extended to search/sort/pagination.
    `prefix` namespaces the keys (e.g. "assignment" -> assignmentSort,
    assignmentDir, ...) so a page with more than one independent table
    doesn't have them fight over the same q/sort/page params. */
export function parseTableQuery(
  searchParams: Record<string, string | string[] | undefined>,
  defaultSort?: string,
  prefix = "",
): ParsedTableQuery {
  const key = (name: string) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  const page = Math.max(1, Number(firstValue(searchParams[key("page")])) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(firstValue(searchParams[key("pageSize")])) || 10));
  const dir = firstValue(searchParams[key("dir")]) === "desc" ? "desc" : "asc";
  return {
    q: firstValue(searchParams[key("q")]) || undefined,
    sort: firstValue(searchParams[key("sort")]) || defaultSort,
    dir,
    page,
    pageSize,
  };
}

/**
 * Filters, sorts, and paginates an already-fetched rows array server-side.
 * Rows arrive from a domain service already scoped to the organization —
 * this only narrows what's shown, the same way an in-memory `.filter()` on
 * a fetched roster already worked before search existed.
 */
export function applyTableQuery<T>(
  rows: T[],
  query: ParsedTableQuery,
  options: {
    searchFields: (row: T) => (string | null | undefined)[];
    sortValues?: Record<string, (row: T) => string | number | Date | null | undefined>;
  },
): { rows: T[]; total: number } {
  let filtered = rows;

  if (query.q) {
    const needle = query.q.toLowerCase();
    filtered = filtered.filter((row) => options.searchFields(row).some((field) => field?.toLowerCase().includes(needle)));
  }

  const total = filtered.length;

  const sortValue = query.sort ? options.sortValues?.[query.sort] : undefined;
  if (sortValue) {
    filtered = [...filtered].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return query.dir === "desc" ? -cmp : cmp;
    });
  }

  const start = (query.page - 1) * query.pageSize;
  const pageRows = filtered.slice(start, start + query.pageSize);
  return { rows: pageRows, total };
}

/** Builds an href that keeps every current searchParam except the ones being
    changed. `prefix` matches the one passed to `parseTableQuery` for the
    same table. */
export function buildTableHref(
  basePath: string,
  currentParams: Record<string, string | string[] | undefined>,
  changes: Record<string, string | number | undefined>,
  prefix = "",
): string {
  const key = (name: string) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  const params = new URLSearchParams();
  for (const [paramKey, value] of Object.entries(currentParams)) {
    const v = firstValue(value);
    if (v) params.set(paramKey, v);
  }
  for (const [changeKey, value] of Object.entries(changes)) {
    const paramKey = key(changeKey);
    if (value === undefined) params.delete(paramKey);
    else params.set(paramKey, String(value));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
