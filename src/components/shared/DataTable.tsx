/**
 * DataTable — reusable sortable + filterable data table for PureQL.
 * Used in DataPreview (main view) and MiniPreview (bottom panes).
 *
 * Key design: column header menus use position:fixed so they always
 * render above the viewport regardless of overflow:hidden ancestors.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, X, Check,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
export type FilterOp =
  | "contains" | "not_contains"
  | "equals"   | "not_equals"
  | "starts_with" | "ends_with"
  | "gt" | "gte" | "lt" | "lte"
  | "not_empty" | "is_empty";

export interface ColumnFilter { op: FilterOp; value: string }
export type SortDir = "asc" | "desc" | null;
export interface SortState { col: string; dir: SortDir }

const OPS: { id: FilterOp; label: string; numeric?: boolean; noValue?: boolean }[] = [
  { id: "contains",     label: "Contains" },
  { id: "not_contains", label: "Does not contain" },
  { id: "equals",       label: "= Equals" },
  { id: "not_equals",   label: "≠ Not equals" },
  { id: "starts_with",  label: "Starts with" },
  { id: "ends_with",    label: "Ends with" },
  { id: "gt",           label: "> Greater than",    numeric: true },
  { id: "gte",          label: "≥ Greater or equal", numeric: true },
  { id: "lt",           label: "< Less than",        numeric: true },
  { id: "lte",          label: "≤ Less or equal",    numeric: true },
  { id: "not_empty",    label: "Not empty",  noValue: true },
  { id: "is_empty",     label: "Is empty",   noValue: true },
];

export function applyFilter(cellVal: unknown, f: ColumnFilter): boolean {
  const raw = cellVal == null ? "" : String(cellVal);
  const v   = f.value.trim();
  switch (f.op) {
    case "contains":     return raw.toLowerCase().includes(v.toLowerCase());
    case "not_contains": return !raw.toLowerCase().includes(v.toLowerCase());
    case "equals":       return raw.toLowerCase() === v.toLowerCase();
    case "not_equals":   return raw.toLowerCase() !== v.toLowerCase();
    case "starts_with":  return raw.toLowerCase().startsWith(v.toLowerCase());
    case "ends_with":    return raw.toLowerCase().endsWith(v.toLowerCase());
    case "gt":  { const n = parseFloat(raw); return !isNaN(n) && n >  parseFloat(v); }
    case "gte": { const n = parseFloat(raw); return !isNaN(n) && n >= parseFloat(v); }
    case "lt":  { const n = parseFloat(raw); return !isNaN(n) && n <  parseFloat(v); }
    case "lte": { const n = parseFloat(raw); return !isNaN(n) && n <= parseFloat(v); }
    case "not_empty": return raw.trim() !== "";
    case "is_empty":  return raw.trim() === "";
    default: return true;
  }
}

export function applySort(
  rows: Record<string, unknown>[],
  sort: SortState | null
): Record<string, unknown>[] {
  if (!sort?.dir) return rows;
  const { col, dir } = sort;
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col];
    const an = parseFloat(String(av ?? "")), bn = parseFloat(String(bv ?? ""));
    const cmp = !isNaN(an) && !isNaN(bn)
      ? an - bn
      : String(av ?? "").localeCompare(String(bv ?? ""));
    return dir === "asc" ? cmp : -cmp;
  });
}

/* ── ColumnHeaderMenu ────────────────────────────────────────────────────── */
interface ColMenuProps {
  col:      string;
  filter:   ColumnFilter | null;
  sort:     SortDir;
  onFilter: (f: ColumnFilter | null) => void;
  onSort:   (dir: SortDir) => void;
  compact?: boolean; // smaller text for mini tables
}

export function ColumnHeaderMenu({ col, filter, sort, onFilter, onSort, compact }: ColMenuProps) {
  const [open, setOpen]     = useState(false);
  const [op,   setOp]       = useState<FilterOp>(filter?.op ?? "contains");
  const [val,  setVal]      = useState(filter?.value ?? "");
  // Position of the dropdown in viewport coordinates
  const [pos,  setPos]      = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Sync local state when filter prop changes externally
  useEffect(() => {
    setOp(filter?.op ?? "contains");
    setVal(filter?.value ?? "");
  }, [filter]);

  const openMenu = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Position below the button, align left, constrain to viewport
    const menuW = 240;
    const left  = Math.min(r.left, window.innerWidth - menuW - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
    setOpen(true);
  }, []);

  // Close on outside click — deferred so the opening click doesn't immediately close it
  useEffect(() => {
    if (!open) return;
    // Use a ref timestamp to ignore clicks that happened before the menu opened
    const openedAt = Date.now();
    const handle = (e: MouseEvent) => {
      // Ignore events from within the first 100ms (the opening click)
      if (Date.now() - openedAt < 100) return;
      const menu = document.getElementById(`col-menu-${col.replace(/[^a-zA-Z0-9]/g, "_")}`);
      if (menu && menu.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    // Small delay so the opening click event doesn't trigger immediate close
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handle);
    }, 10);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handle);
    };
  }, [open, col]);

  // Close on scroll (but not the table scroll itself - only viewport scroll)
  useEffect(() => {
    if (!open) return;
    const handle = () => setOpen(false);
    // Only close on window-level scroll, not scrolling inside the table
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, [open]);

  const opMeta  = OPS.find((o) => o.id === op);
  const needVal = !opMeta?.noValue;
  const hasFilter = filter !== null;

  const handleApply = () => {
    if (!needVal) {
      onFilter({ op, value: "" });
    } else if (val.trim()) {
      onFilter({ op, value: val.trim() });
    } else {
      onFilter(null);
    }
    setOpen(false);
  };

  const handleClear = () => {
    setVal("");
    setOp("contains");
    onFilter(null);
    setOpen(false);
  };

  const fs = compact ? "text-[9px]" : "text-[10px]";

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        className={`flex items-center gap-1 w-full text-left group/hdr ${fs} font-semibold`}
        style={{ color: "var(--text-muted)" }}
      >
        <span className="truncate">{col}</span>
        <span className="ml-auto flex items-center gap-0.5 shrink-0">
          {hasFilter && (
            <span
              title="Filter active"
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
          )}
          {sort === "asc"  && <ArrowUp   className="w-3 h-3" style={{ color: "var(--accent)" }} />}
          {sort === "desc" && <ArrowDown  className="w-3 h-3" style={{ color: "var(--accent)" }} />}
          {!sort && (
            <ChevronDown
              className="w-2.5 h-2.5 opacity-0 group-hover/hdr:opacity-50 transition-opacity"
              style={{ color: "var(--text-faint)" }}
            />
          )}
        </span>
      </button>

      {/* Portal-style fixed dropdown */}
      {open && pos && (
        <div
          id={`col-menu-${col.replace(/[^a-zA-Z0-9]/g, "_")}`}
          style={{
            position: "fixed",
            top:      pos.top,
            left:     pos.left,
            width:    240,
            zIndex:   9999,
            background: "#ffffff",
            border:   "1px solid #e2e8f0",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {/* Sort section */}
          <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8,
            }}>
              Sort
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["asc", "desc", null] as const).map((d) => {
                const active = sort === d;
                return (
                  <button
                    key={String(d)}
                    onClick={() => { onSort(d); setOpen(false); }}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 4, padding: "6px 0",
                      borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: "pointer",
                      border: active ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                      background: active ? "#e0f2fe" : "#f8fafc",
                      color: active ? "#0369a1" : "#64748b",
                      transition: "all 120ms",
                    }}
                  >
                    {d === "asc"  && <><ArrowUp   style={{ width: 11, height: 11 }} />A→Z</>}
                    {d === "desc" && <><ArrowDown  style={{ width: 11, height: 11 }} />Z→A</>}
                    {d === null   && <><ArrowUpDown style={{ width: 11, height: 11 }} />None</>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter section */}
          <div style={{ padding: "10px 12px 12px" }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8,
            }}>
              Filter
            </div>

            {/* Operator select */}
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as FilterOp)}
              style={{
                width: "100%", borderRadius: 8, padding: "6px 8px",
                fontSize: 11, marginBottom: 8,
                border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155",
                outline: "none", cursor: "pointer",
              }}
            >
              {OPS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>

            {/* Value input */}
            {needVal && (
              <input
                type={opMeta?.numeric ? "number" : "text"}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApply()}
                placeholder="Value…"
                autoFocus
                style={{
                  width: "100%", borderRadius: 8, padding: "6px 10px",
                  fontSize: 11, marginBottom: 8, boxSizing: "border-box",
                  border: val ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                  background: val ? "#f0f9ff" : "#f8fafc",
                  color: "#334155", outline: "none",
                }}
              />
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleApply}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 8,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: "#0ea5e9", color: "#ffffff",
                  border: "none", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 4,
                }}
              >
                <Check style={{ width: 12, height: 12 }} />
                Apply
              </button>
              {hasFilter && (
                <button
                  onClick={handleClear}
                  title="Clear filter"
                  style={{
                    padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid #e2e8f0", background: "#f8fafc",
                    color: "#94a3b8", display: "flex", alignItems: "center",
                  }}
                >
                  <X style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── DataTable ───────────────────────────────────────────────────────────── */
export interface DataTableProps {
  rows:    Record<string, unknown>[];
  /** Total rows in the dataset (for display, may be > rows.length) */
  total?:  number;
  compact?: boolean;
  /** Show filter/sort toolbar summary above table */
  showToolbar?: boolean;
}

export function DataTable({ rows, total, compact, showToolbar }: DataTableProps) {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [sort,    setSort]    = useState<SortState | null>(null);

  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const activeFilters = Object.entries(filters);

  const filtered = applySort(
    rows.filter((row) =>
      activeFilters.every(([col, f]) => applyFilter(row[col], f))
    ),
    sort
  );

  const hasFilters = activeFilters.length > 0;
  const hasSort    = sort?.dir != null;
  const fs = compact ? "text-[9px]" : "text-[11px]";

  const clearAll = () => { setFilters({}); setSort(null); };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar summary */}
      {showToolbar && (hasFilters || hasSort) && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0 flex-wrap"
          style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}
        >
          <span className="text-[9px]" style={{ color: "#94a3b8" }}>
            {hasFilters ? `${filtered.length} filtered` : `${filtered.length} rows`}
            {total !== undefined && !hasFilters ? ` / ${total.toLocaleString()} total` : ""}
          </span>
          {hasSort && (
            <span
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: "#e0f2fe", color: "#0369a1" }}
            >
              {sort!.dir === "asc" ? <ArrowUp style={{ width: 10, height: 10 }} /> : <ArrowDown style={{ width: 10, height: 10 }} />}
              {sort!.col}
            </span>
          )}
          {activeFilters.map(([col, f]) => (
            <span
              key={col}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: "#e0f2fe", color: "#0369a1" }}
            >
              {col}: {OPS.find((o) => o.id === f.op)?.label}
              {f.value ? ` "${f.value}"` : ""}
              <button
                onClick={() => setFilters((p) => { const n = {...p}; delete n[col]; return n; })}
                style={{ lineHeight: 0, color: "#0369a1" }}
              >
                <X style={{ width: 10, height: 10 }} />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="text-[9px] ml-auto underline"
            style={{ color: "#0ea5e9" }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {rows.length > 0 ? (
          <table className="w-full border-collapse" style={{ fontSize: compact ? 10 : 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
              <tr>
                <th
                  style={{
                    textAlign: "left", padding: "6px 8px",
                    borderBottom: "1px solid #e2e8f0",
                    background: "#f8fafc", color: "#94a3b8",
                    fontSize: compact ? 9 : 9, fontWeight: 600,
                    width: 32,
                  }}
                >
                  #
                </th>
                {cols.map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: "left", padding: "6px 8px",
                      borderBottom: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      whiteSpace: "nowrap", minWidth: 90,
                      // overflow visible so dropdown isn't clipped by th
                      overflow: "visible",
                    }}
                  >
                    <ColumnHeaderMenu
                      col={col}
                      filter={filters[col] ?? null}
                      sort={sort?.col === col ? sort.dir : null}
                      compact={compact}
                      onFilter={(f) =>
                        setFilters((prev) => {
                          const next = { ...prev };
                          if (f === null) delete next[col]; else next[col] = f;
                          return next;
                        })
                      }
                      onSort={(dir) => setSort(dir ? { col, dir } : null)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={i}
                  style={{ background: i % 2 === 0 ? "#ffffff" : "#fafafa" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafafa")}
                >
                  <td
                    className={fs}
                    style={{ padding: "4px 8px", borderBottom: "1px solid #f1f5f9", color: "#cbd5e1" }}
                  >
                    {i + 1}
                  </td>
                  {cols.map((col) => (
                    <td
                      key={col}
                      className={fs}
                      style={{
                        padding: "4px 8px", borderBottom: "1px solid #f1f5f9",
                        maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", color: "#475569",
                      }}
                      title={row[col] != null ? String(row[col]) : undefined}
                    >
                      {row[col] != null
                        ? String(row[col])
                        : <span style={{ color: "#fca5a5", fontStyle: "italic", fontSize: "0.9em" }}>null</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && hasFilters && (
                <tr>
                  <td
                    colSpan={cols.length + 1}
                    style={{ padding: "24px 16px", textAlign: "center", color: "#94a3b8", fontSize: 11 }}
                  >
                    No rows match current filters.{" "}
                    <button onClick={clearAll} style={{ color: "#0ea5e9", textDecoration: "underline" }}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full text-[11px]" style={{ color: "#94a3b8" }}>
            No data to display
          </div>
        )}
      </div>
    </div>
  );
}
