import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import TypeChip from "../components/TypeChip";
import {
  AlertIcon,
  ImageIcon,
  RefreshIcon,
  SpinnerIcon,
  UsersIcon,
  ClipboardIcon,
  PackageIcon,
  SearchIcon,
} from "../components/Icons";
import { supabase, photoUrls } from "../lib/supabase";
import { formatDate, todayISO, monthStartISO, PART_STATUS_LABELS } from "../lib/format";

const defaultFilters = () => ({
  projectId: "",
  leadId: "",
  from: monthStartISO(), // default: from the start of the current month
  to: todayISO(),
});

export default function ManagerDashboard() {
  const [projects, setProjects] = useState([]);
  const [leads, setLeads] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [typeFilter, setTypeFilter] = useState(""); // '', 'report', 'part', 'exception'
  const [search, setSearch] = useState("");
  const [reports, setReports] = useState(null);
  const [partOrders, setPartOrders] = useState(null);
  const [exceptions, setExceptions] = useState(null);
  const [stats, setStats] = useState({
    today: null,
    todayExceptions: null,
    pendingExceptions: null,
    pendingParts: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [thumbUrls, setThumbUrls] = useState({});

  const loadMeta = useCallback(async () => {
    // "Reports today" counts by submission time (created_at), not report_date —
    // a backdated report filed today still came in today from the manager's view.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [
      projRes,
      leadRes,
      todayRes,
      todayExceptionsRes,
      pendingRes,
      pendingPartsRes,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("team_leads")
        .select("id, name")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfToday.toISOString()),
      supabase
        .from("exception_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfToday.toISOString()),
      supabase
        .from("exception_logs")
        .select("id", { count: "exact", head: true })
        .neq("status", "approved"),
      supabase
        .from("part_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    setProjects(projRes.data || []);
    setLeads(leadRes.data || []);
    setStats({
      today: todayRes.count ?? 0,
      todayExceptions: todayExceptionsRes.count ?? 0,
      pendingExceptions: pendingRes.count ?? 0,
      pendingParts: pendingPartsRes.count ?? 0,
    });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let reportsQ = supabase
        .from("reports")
        .select(
          "id, report_no, report_date, workers_count, issues, created_at, projects(name), team_leads(name), report_photos(id, storage_path, sort_order)",
        )
        .order("report_date", { ascending: false })
        .limit(200);
      if (filters.projectId) reportsQ = reportsQ.eq("project_id", filters.projectId);
      if (filters.leadId) reportsQ = reportsQ.eq("team_lead_id", filters.leadId);
      if (filters.from) reportsQ = reportsQ.gte("report_date", filters.from);
      if (filters.to) reportsQ = reportsQ.lte("report_date", filters.to);

      let partsQ = supabase
        .from("part_orders")
        .select(
          "id, status, created_at, projects(name, clients(name)), team_leads(name), part_requests(id, quantity, catalog_item_id, other_description, catalog_items(name))",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (filters.projectId) partsQ = partsQ.eq("project_id", filters.projectId);
      if (filters.leadId) partsQ = partsQ.eq("team_lead_id", filters.leadId);
      if (filters.from) partsQ = partsQ.gte("created_at", filters.from);
      if (filters.to) partsQ = partsQ.lte("created_at", `${filters.to}T23:59:59`);

      let excQ = supabase
        .from("exception_logs")
        .select(
          "id, exception_no, billable_days, status, work_date, projects(name, clients(name)), team_leads(name)",
        )
        .order("work_date", { ascending: false })
        .limit(200);
      if (filters.projectId) excQ = excQ.eq("project_id", filters.projectId);
      if (filters.leadId) excQ = excQ.eq("team_lead_id", filters.leadId);
      if (filters.from) excQ = excQ.gte("work_date", filters.from);
      if (filters.to) excQ = excQ.lte("work_date", filters.to);

      const [{ data: rpts, error: rErr }, { data: orders, error: pErr }, { data: excs, error: eErr }] =
        await Promise.all([reportsQ, partsQ, excQ]);
      if (rErr) throw rErr;
      if (pErr) throw pErr;
      if (eErr) throw eErr;
      setReports(rpts || []);
      setPartOrders(orders || []);
      setExceptions(excs || []);
    } catch {
      setError("טעינת הדוחות נכשלה — נסו לרענן");
      setReports([]);
      setPartOrders([]);
      setExceptions([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!reports?.length) return;
    const paths = reports.map(firstThumbPath).filter(Boolean);
    if (!paths.length) return;
    let cancelled = false;
    photoUrls(paths).then((map) => {
      if (!cancelled) setThumbUrls(map);
    });
    return () => {
      cancelled = true;
    };
  }, [reports]);

  function refresh() {
    loadMeta();
    loadItems();
  }

  function firstThumbPath(r) {
    const sorted = [...(r.report_photos || [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    return sorted[0]?.storage_path || null;
  }

  const items = reports === null ? null : [
    ...(reports || []).map((r) => ({ type: "report", ts: r.report_date, record: r })),
    ...(partOrders || []).map((o) => ({ type: "part", ts: o.created_at, record: o })),
    ...(exceptions || []).map((e) => ({ type: "exception", ts: e.work_date, record: e })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const typeFilteredItems = !items ? null : typeFilter ? items.filter((i) => i.type === typeFilter) : items;

  const q = search.trim();
  const visibleItems = !typeFilteredItems
    ? null
    : !q
      ? typeFilteredItems
      : typeFilteredItems.filter((i) => {
          const r = i.record;
          const project = r.projects?.name || "";
          const client = r.projects?.clients?.name || "";
          const lead = r.team_leads?.name || "";
          const no = i.type === "report" ? r.report_no : i.type === "exception" ? r.exception_no : "";
          const haystack = `${project} ${client} ${lead} #${no ?? ""} ${no ?? ""}`;
          return haystack.includes(q);
        });

  return (
    <div className="min-h-dvh manager-desktop">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-black">לוח דוחות</h1>
          <button
            className="btn btn-ghost text-sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshIcon size={18} className={loading ? "spin" : ""} />
            רענון
          </button>
        </div>

        {/* Status row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setTypeFilter((t) => (t === "report" ? "" : "report"))}
            aria-pressed={typeFilter === "report"}
            className={`card p-4 flex items-center gap-4 text-start transition-colors duration-200 ${
              typeFilter === "report" ? "border-accent ring-2 ring-accent/30" : "hover:border-accent"
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
              <ClipboardIcon size={24} />
            </span>
            <div>
              <p className="text-3xl font-black leading-none">
                {stats.today ?? "—"}
              </p>
              <p className="text-sm text-primary mt-1">דוחות היום</p>
            </div>
          </button>
          <Link
            to="/manager/parts"
            className="card p-4 flex items-center gap-4 hover:border-accent transition-colors duration-200"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
              <PackageIcon size={24} />
            </span>
            <div>
              <p className="text-3xl font-black leading-none text-accent">
                {stats.pendingParts ?? "—"}
              </p>
              <p className="text-sm text-primary mt-1">חלקים ממתינים</p>
            </div>
          </Link>
          <Link
            to="/manager/exceptions"
            className="card p-4 flex items-center gap-4 hover:border-accent transition-colors duration-200"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
              <AlertIcon size={24} />
            </span>
            <div>
              <p className="text-3xl font-black leading-none text-accent">
                {stats.todayExceptions ?? "—"}
              </p>
              <p className="text-sm text-primary mt-1">אישורי עבודה נוספת היום</p>
              <p className="text-xs text-primary mt-0.5">
                {stats.pendingExceptions ?? "—"} ממתינות לחתימת לקוח
              </p>
            </div>
          </Link>
        </div>

        {/* Filters */}
        <div className="card mt-4 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="sm:col-span-1">
            <label className="label !text-xs" htmlFor="f-project">
              פרויקט
            </label>
            <select
              id="f-project"
              className="input !min-h-[48px]"
              value={filters.projectId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, projectId: e.target.value }))
              }
            >
              <option value="">כל הפרויקטים</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="label !text-xs" htmlFor="f-lead">
              ראש צוות
            </label>
            <select
              id="f-lead"
              className="input !min-h-[48px]"
              value={filters.leadId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, leadId: e.target.value }))
              }
            >
              <option value="">כל ראשי הצוות</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label !text-xs" htmlFor="f-from">
              מתאריך
            </label>
            <input
              id="f-from"
              type="date"
              className="input !min-h-[48px] w-full min-w-0"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
            />
          </div>
          <div className="min-w-0">
            <label className="label !text-xs" htmlFor="f-to">
              עד תאריך
            </label>
            <input
              id="f-to"
              type="date"
              className="input !min-h-[48px] w-full min-w-0"
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
            />
          </div>
          <button
            className="btn btn-ghost !min-h-[48px] sm:col-span-2 lg:col-span-1"
            onClick={() => setFilters(defaultFilters())}
          >
            איפוס מסננים
          </button>
        </div>

        {error && (
          <div className="card border-destructive/40 bg-red-50 p-4 mt-4 text-destructive font-medium">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="relative mt-4">
          <SearchIcon
            size={18}
            className="absolute top-1/2 -translate-y-1/2 start-3 text-primary pointer-events-none"
          />
          <input
            type="text"
            className="input !ps-10"
            placeholder="חיפוש דוח לפי פרויקט, ראש צוות, תאריך או מספר דוח..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Merged reports / parts / exceptions list */}
        {visibleItems === null ? (
          <div className="flex justify-center py-12 text-primary">
            <SpinnerIcon size={32} />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="card p-10 mt-4 text-center text-primary">
            <ClipboardIcon size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-bold text-foreground">לא נמצאו דוחות</p>
            <p className="text-sm mt-1">
              {q
                ? "נסו חיפוש אחר"
                : "נסו להרחיב את טווח התאריכים או לאפס את המסננים"}
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {visibleItems.map((item) => {
              if (item.type === "report") {
                const r = item.record;
                return (
                  <li key={`report-${r.id}`}>
                    <Link
                      to={`/manager/report/${r.id}`}
                      className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold truncate">{r.projects?.name || "פרויקט"}</span>
                          {r.report_no != null && <span className="text-xs text-primary">#{r.report_no}</span>}
                        </div>
                        <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                          <span>{r.team_leads?.name}</span>
                          <span className="inline-flex items-center gap-1">
                            <UsersIcon size={15} />
                            {r.workers_count}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon size={15} />
                            {r.report_photos?.length || 0}
                          </span>
                          {r.issues && (
                            <span className="text-destructive inline-flex items-center gap-1 font-bold" title="דווחה בעיה באתר">
                              <AlertIcon size={15} />
                              בעיה
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <TypeChip type="report" />
                        <span className="text-sm text-primary">{formatDate(r.report_date)}</span>
                      </div>
                    </Link>
                  </li>
                );
              }

              if (item.type === "part") {
                const o = item.record;
                const lines = o.part_requests || [];
                const summary =
                  lines.length === 1
                    ? lines[0].catalog_items?.name || lines[0].other_description
                    : `${lines.length} פריטים`;
                return (
                  <li key={`part-${o.id}`}>
                    <Link
                      to="/manager/parts"
                      className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold truncate">{o.projects?.name || "פרויקט"}</span>
                          {o.projects?.clients?.name && (
                            <span className="text-xs text-primary">· {o.projects.clients.name}</span>
                          )}
                        </div>
                        <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                          <span>{o.team_leads?.name}</span>
                          <span>{summary}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <TypeChip type="part" />
                          <StatusBadge status={o.status} labels={PART_STATUS_LABELS} />
                        </div>
                        <span className="text-sm text-primary">{formatDate(o.created_at)}</span>
                      </div>
                    </Link>
                  </li>
                );
              }

              const ex = item.record;
              return (
                <li key={`exception-${ex.id}`}>
                  <Link
                    to={`/manager/exceptions/${ex.id}`}
                    className="card flex items-center gap-4 p-3.5 hover:border-accent transition-colors duration-200"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate">{ex.projects?.name || "פרויקט"}</span>
                        {ex.exception_no != null && <span className="text-xs text-primary">#{ex.exception_no}</span>}
                      </div>
                      <p className="text-sm text-primary mt-1 flex items-center gap-3 flex-wrap">
                        <span>{ex.team_leads?.name}</span>
                        <span>{Number(ex.billable_days)} ימי חיוב</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <TypeChip type="exception" />
                        <StatusBadge status={ex.status} />
                      </div>
                      <span className="text-sm text-primary">{formatDate(ex.work_date)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
