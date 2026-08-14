"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";

type Status = string;
type Entry = { id: string; at: string; text: string; author: string };
type Profile = { name: string; role: string };
type StatusDraft = { id: string; name: string; color: string; original?: string; kind?: "new" | "ongoing" | "terminal" };
type Issue = {
  id: string; title: string; details: string; owner: string; action: string;
  expected: string; createdAt: string; completedAt?: string; status: Status; outcome: string; updates: Entry[];
};

const defaultStatuses: Status[] = ["New", "Ongoing", "Waiting on dev", "Investigating", "Blocked", "Pending Monitoring", "Awaiting approval", "Resolved"];
const defaultStatusColors: Record<string, string> = {
  New: "#715391", Ongoing: "#647a3e", "Waiting on dev": "#9b6519", Investigating: "#a03e74",
  Blocked: "#bd415e", "Pending Monitoring": "#407d78", "Awaiting approval": "#41658e", Resolved: "#4f7b54", Closed: "#4f7b54",
};
const themes = [
  ["rose", "Rose quartz"], ["lilac", "Lilac haze"], ["peach", "Peach fizz"], ["blush", "Blush bloom"], ["berry", "Berry luxe"],
  ["ocean", "Ocean slate"], ["forest", "Forest moss"], ["navy", "Midnight navy"], ["sand", "Desert sand"], ["graphite", "Graphite"],
] as const;
const seed: Issue[] = [
  { id: "seed-1", title: "Checkout API latency spike", details: "p95 latency increased after the morning deploy. Watching the payments dependency.", owner: "Maya Chen", action: "Comparing traces and rolling back the feature flag if confirmed.", expected: "2026-08-13T16:30", createdAt: "2026-08-13T11:10", status: "Investigating", outcome: "", updates: [{ id: "u1", at: "2026-08-13T11:10", author: "You", text: "Opened incident bridge and shared dashboard links." }, { id: "u2", at: "2026-08-13T12:05", author: "Maya Chen", text: "Trace points to a connection-pool regression; testing a flag rollback." }] },
  { id: "seed-2", title: "Kafka consumer lag", details: "Lag is building in the customer-events consumer group.", owner: "Jordan Lee", action: "Increasing partition concurrency and checking dead-letter volume.", expected: "2026-08-13T14:00", createdAt: "2026-08-13T09:25", status: "Waiting on dev", outcome: "", updates: [{ id: "u3", at: "2026-08-13T09:25", author: "You", text: "Captured consumer metrics and assigned follow-up." }] },
  { id: "seed-3", title: "Certificate renewal runbook", details: "Document and validate the renewal sequence before the next rotation.", owner: "You", action: "Drafting the runbook and scheduling a staging dry run.", expected: "2026-08-15T15:00", createdAt: "2026-08-12T15:40", status: "Pending Monitoring", outcome: "", updates: [{ id: "u4", at: "2026-08-12T15:40", author: "You", text: "Added expiry monitoring to the weekly review." }] },
];

const statusClass = (status: Status) => `status ${status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const isCompleteStatus = (status: Status) => status === "Resolved" || status === "Closed";
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "No ETA";
const isOverdue = (issue: Issue) => !isCompleteStatus(issue.status) && issue.expected && new Date(issue.expected).getTime() < Date.now();
const daysOverdue = (issue: Issue) => Math.max(1, Math.ceil((Date.now() - new Date(issue.expected).getTime()) / 86400000));
const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>(seed);
  const [activeId, setActiveId] = useState<string>(seed[0].id);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showStatusSettings, setShowStatusSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>(defaultStatuses);
  const [statusColors, setStatusColors] = useState<Record<string, string>>(defaultStatusColors);
  const [statusDraft, setStatusDraft] = useState<StatusDraft[]>([]);
  const [statusInput, setStatusInput] = useState("");
  const [statusError, setStatusError] = useState("");
  const [filter, setFilter] = useState<"All" | "Mine" | "Overdue">("All");
  const [section, setSection] = useState<"dashboard" | "calendar" | "metrics">("dashboard");
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 7, 1));
  const [selectedDay, setSelectedDay] = useState<string>("2026-08-13");
  const [theme, setTheme] = useState("rose");
  const [darkMode, setDarkMode] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationState, setNotificationState] = useState("Notifications off");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let loadedIssues = seed;
    const saved = localStorage.getItem("signal-petal-issues");
    if (saved) {
      try { loadedIssues = (JSON.parse(saved) as Issue[]).map(i => ({ ...i, createdAt: i.createdAt || i.updates?.[0]?.at || new Date().toISOString() })); setIssues(loadedIssues); }
      catch { localStorage.removeItem("signal-petal-issues"); }
    }
    const savedStatuses = localStorage.getItem("signal-petal-statuses");
    let loadedStatuses = defaultStatuses;
    if (savedStatuses) {
      try { const parsed = JSON.parse(savedStatuses); if (Array.isArray(parsed)) loadedStatuses = parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map(value => value.trim()); }
      catch { localStorage.removeItem("signal-petal-statuses"); }
    }
    const terminalStatus = loadedStatuses.includes("Closed") && !loadedStatuses.includes("Resolved") ? "Closed" : "Resolved";
    const customStatuses = Array.from(new Set([...loadedStatuses, ...loadedIssues.map(issue => issue.status)].filter(status => !["New", "Ongoing", "Resolved", "Closed"].includes(status))));
    setStatuses(["New", "Ongoing", ...customStatuses, terminalStatus]);
    const savedColors = localStorage.getItem("signal-petal-status-colors");
    if (savedColors) { try { const parsed = JSON.parse(savedColors); if (parsed && typeof parsed === "object") setStatusColors({ ...defaultStatusColors, ...parsed }); } catch { localStorage.removeItem("signal-petal-status-colors"); } }
    const savedProfile = localStorage.getItem("signal-petal-profile");
    if (savedProfile) { try { const parsed = JSON.parse(savedProfile) as Profile; if (parsed.name?.trim() && parsed.role?.trim()) setProfile({ name: parsed.name.trim(), role: parsed.role.trim() }); } catch { localStorage.removeItem("signal-petal-profile"); } }
    setTheme(localStorage.getItem("signal-petal-theme") || "rose"); setDarkMode(localStorage.getItem("signal-petal-dark") === "true"); setHydrated(true); if ("Notification" in window) setNotificationState(Notification.permission === "granted" ? "Reminders on" : "Notifications off");
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-issues", JSON.stringify(issues)); }, [issues, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-statuses", JSON.stringify(statuses)); }, [statuses, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-status-colors", JSON.stringify(statusColors)); }, [statusColors, hydrated]);
  useEffect(() => { if (hydrated) { localStorage.setItem("signal-petal-theme", theme); localStorage.setItem("signal-petal-dark", String(darkMode)); } }, [theme, darkMode, hydrated]);
  useEffect(() => { if (hydrated && profile) { localStorage.setItem("signal-petal-profile", JSON.stringify(profile)); document.title = `${profile.name}'s Signal Petal`; } }, [profile, hydrated]);
  useEffect(() => {
    if (!showDetail && !showCreate && !showStatusSettings && !showDeleteConfirm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDeleteConfirm) setShowDeleteConfirm(false);
        else if (showStatusSettings) setShowStatusSettings(false);
        else if (showCreate) setShowCreate(false);
        else setShowDetail(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [showDetail, showCreate, showStatusSettings, showDeleteConfirm]);
  useEffect(() => {
    const check = () => {
      if ("Notification" in window && Notification.permission === "granted") {
        const due = issues.filter(i => !isCompleteStatus(i.status) && i.expected && new Date(i.expected).getTime() - Date.now() < 60 * 60 * 1000);
        const now = new Date();
        const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        if (due.length && localStorage.getItem("signal-petal-due-hour") !== hourKey) {
          new Notification("Signal Petal follow-up", { body: `${due.length} issue${due.length > 1 ? "s need" : " needs"} attention within the hour.` });
          localStorage.setItem("signal-petal-due-hour", hourKey);
        }
        const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        if (now.getHours() >= 16 && now.getMinutes() >= 30 && localStorage.getItem("signal-petal-check-in-day") !== dayKey) {
          new Notification("Daily SRE check-in", { body: "Take a moment to record today’s progress and outcomes." });
          localStorage.setItem("signal-petal-check-in-day", dayKey);
        }
      }
    };
    const timer = window.setInterval(check, 60000); return () => window.clearInterval(timer);
  }, [issues]);

  const active = issues.find(i => i.id === activeId) ?? issues[0];
  const personalOwner = profile?.name || "You";
  const visible = useMemo(() => issues.filter(i => filter === "Mine" ? i.owner.toLowerCase() === personalOwner.toLowerCase() : filter === "Overdue" ? isOverdue(i) : true), [issues, filter, personalOwner]);
  const openCount = issues.filter(i => !isCompleteStatus(i.status)).length;
  const overdueCount = issues.filter(isOverdue).length;
  const mine = issues.filter(i => i.owner.toLowerCase() === personalOwner.toLowerCase());
  const mineOpen = mine.filter(i => !isCompleteStatus(i.status));
  const mineOverdue = mine.filter(isOverdue);
  const mineResolved = mine.filter(i => isCompleteStatus(i.status));
  const attentionQueue = issues.filter(isOverdue).sort((a, b) => new Date(a.expected).getTime() - new Date(b.expected).getTime());
  const dashboardView = filter === "Mine" ? "mine" : filter === "Overdue" ? "attention" : "overview";
  const pageTitle = section === "calendar" ? "Your work calendar ✦" : section === "metrics" ? "Signals & progress ✦" : filter === "Mine" ? "My actions ✦" : filter === "Overdue" ? "Needs attention" : `Good afternoon, ${profile?.role || "there"} ✦`;
  const pageDescription = section === "calendar" ? "Choose a day to see every task and issue you logged." : section === "metrics" ? "A clear read on delivery pace, follow-through, and where to focus." : filter === "Mine" ? "Your personal action list, separated from the wider team queue." : filter === "Overdue" ? "A focused triage view for work that has passed its expected update." : "A lovely little command center for keeping work moving.";
  const ownerReport = useMemo(() => Object.entries(issues.reduce<Record<string, number>>((map, i) => { if (!isCompleteStatus(i.status)) map[i.owner] = (map[i.owner] || 0) + 1; return map; }, {})).sort((a,b) => b[1]-a[1]), [issues]);
  const calendarDays = useMemo(() => { const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0); return Array.from({ length: start.getDay() + end.getDate() }, (_, i) => i - start.getDay() + 1); }, [calendarMonth]);
  const selectedIssues = issues.filter(i => dayKey(i.createdAt) === selectedDay);
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth);
  const resolvedIssues = issues.filter(i => isCompleteStatus(i.status));
  const completedWithTime = resolvedIssues.filter(i => i.completedAt || i.updates.length);
  const completionHours = completedWithTime.map(i => (new Date(i.completedAt || i.updates[i.updates.length - 1].at).getTime() - new Date(i.createdAt).getTime()) / 3600000).filter(h => h >= 0);
  const averageHours = completionHours.length ? completionHours.reduce((sum, h) => sum + h, 0) / completionHours.length : 0;
  const dueResolved = resolvedIssues.filter(i => i.expected && (i.completedAt || i.updates.length));
  const onTimeCount = dueResolved.filter(i => new Date(i.completedAt || i.updates[i.updates.length - 1].at).getTime() <= new Date(i.expected).getTime()).length;
  const onTimeRate = dueResolved.length ? Math.round((onTimeCount / dueResolved.length) * 100) : 0;
  const health = overdueCount > 0 || (dueResolved.length > 0 && onTimeRate < 80) ? "Needs improvement" : "Looking healthy";
  const appName = profile ? `${profile.name}'s Signal Petal` : "Signal Petal";
  const completionLabel = statuses.find(isCompleteStatus) || "Resolved";
  const statusStyle = (status: Status) => ({ "--status-color": statusColors[status] || "#7a5aa6" } as CSSProperties);

  function updateIssue(patch: Partial<Issue>) { if (!active) return; const completedAt = patch.status && isCompleteStatus(patch.status) && !isCompleteStatus(active.status) ? new Date().toISOString() : patch.status && !isCompleteStatus(patch.status) ? undefined : active.completedAt; setIssues(items => items.map(i => i.id === active.id ? { ...i, ...patch, completedAt } : i)); }
  function deleteIssue() {
    if (!active) return;
    const remaining = issues.filter(i => i.id !== active.id);
    setIssues(remaining);
    setActiveId(remaining[0]?.id ?? "");
    setShowDeleteConfirm(false);
    setShowDetail(false);
  }
  function openStatusSettings() {
    setStatusDraft(statuses.map(name => ({
      id: crypto.randomUUID(), name, original: name, color: statusColors[name] || "#7a5aa6",
      kind: name === "New" ? "new" : name === "Ongoing" ? "ongoing" : isCompleteStatus(name) ? "terminal" : undefined,
    })));
    setStatusInput("");
    setStatusError("");
    setShowStatusSettings(true);
  }
  function addStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = statusInput.trim();
    if (!name) return;
    if (statusDraft.some(item => item.name.trim().toLowerCase() === name.toLowerCase())) return setStatusError("That status already exists.");
    setStatusDraft(items => [...items.slice(0, -1), { id: crypto.randomUUID(), name, color: "#7a5aa6" }, items[items.length - 1]].filter(Boolean) as StatusDraft[]);
    setStatusInput("");
    setStatusError("");
  }
  function saveStatuses() {
    const names = statusDraft.map(item => item.name.trim());
    if (names.some(name => !name)) return setStatusError("Every status needs a name.");
    if (!names.includes("New") || !names.includes("Ongoing") || !names.some(isCompleteStatus)) return setStatusError("New, Ongoing, and Resolved or Closed are required.");
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) return setStatusError("Status names must be unique.");
    const renamed = new Map(statusDraft.filter(item => item.original).map(item => [item.original as string, item.name.trim()]));
    const keptOriginals = new Set(statusDraft.flatMap(item => item.original ? [item.original] : []));
    setIssues(items => items.map(issue => renamed.has(issue.status) ? { ...issue, status: renamed.get(issue.status) as Status } : statuses.includes(issue.status) && !keptOriginals.has(issue.status) ? { ...issue, status: "Ongoing", completedAt: undefined } : issue));
    setStatusColors(Object.fromEntries(statusDraft.map(item => [item.name.trim(), item.color])));
    setStatuses(names);
    setShowStatusSettings(false);
  }
  function addUpdate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get("update") || "").trim(); if (!text || !active) return; updateIssue({ updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text }] }); event.currentTarget.reset(); }
  function addIssue(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const now = new Date().toISOString(); const issue: Issue = { id: crypto.randomUUID(), title: String(form.get("title")), details: String(form.get("details")), owner: String(form.get("owner")) || personalOwner, action: String(form.get("action")), expected: String(form.get("expected")), createdAt: now, status: "New", outcome: "", updates: [{ id: crypto.randomUUID(), at: now, author: personalOwner, text: "Issue logged." }] }; setIssues(items => [issue, ...items]); setActiveId(issue.id); setShowCreate(false); setShowDetail(true); }
  function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); const role = String(form.get("role") || "").trim(); if (name && role) setProfile({ name, role }); }
  async function enableNotifications() { if (!("Notification" in window)) return setNotificationState("Not supported in this browser"); const permission = await Notification.requestPermission(); setNotificationState(permission === "granted" ? "Reminders on" : "Notifications off"); }

  return <main className={`theme-${theme} ${darkMode ? "dark-mode" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div><strong>{appName}</strong><small>{profile?.role || "Personal work companion"}</small></div></div>
      <nav><button className={section === "dashboard" && filter === "All" ? "nav-active" : ""} onClick={() => { setSection("dashboard"); setFilter("All"); }}>⌂ <span>Dashboard</span></button><button className={section === "calendar" ? "nav-active" : ""} onClick={() => setSection("calendar")}>▦ <span>Calendar</span></button><button className={section === "metrics" ? "nav-active" : ""} onClick={() => setSection("metrics")}>◌ <span>Insights</span></button><button className={section === "dashboard" && filter === "Mine" ? "nav-active nav-mine" : ""} onClick={() => { setSection("dashboard"); setFilter("Mine"); }}>♡ <span>My actions</span><em>{mine.length}</em></button><button className={section === "dashboard" && filter === "Overdue" ? "nav-active nav-attention" : ""} onClick={() => { setSection("dashboard"); setFilter("Overdue"); }}>! <span>Needs attention</span><em className="alert-count">{overdueCount}</em></button></nav>
      <div className="sidebar-bottom"><div className="appearance"><label>Appearance<select value={theme} onChange={e => setTheme(e.target.value)}>{themes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="mode-toggle" onClick={() => setDarkMode(value => !value)}>{darkMode ? "☀ Light mode" : "◐ Dark mode"}</button></div><button className="notification-button" onClick={enableNotifications}>◌ {notificationState}</button><p>Data stays privately on this device.</p></div>
    </aside>
    <section className={`workspace ${section === "dashboard" ? `view-${dashboardView}` : ""}`}>
      <header><div><p className="eyebrow">{section === "dashboard" && filter === "Mine" ? "PERSONAL FOCUS" : section === "dashboard" && filter === "Overdue" ? "TRIAGE MODE" : profile ? `${profile.name.toUpperCase()}'S WORKSPACE` : "YOUR WORKSPACE"}</p><h1>{pageTitle}</h1><p className="subhead">{pageDescription}</p></div><div className="header-actions"><button className="secondary" type="button" onClick={openStatusSettings}>⚙ Statuses</button><button className="primary" type="button" onClick={() => setShowCreate(true)}>+ Log an issue</button></div></header>
      {section === "dashboard" && <><section className="metric-row">{filter === "Mine" ? <><article className="personal"><span>My open actions</span><strong>{mineOpen.length}</strong><small>Assigned directly to you</small></article><article className={mineOverdue.length ? "warm" : "good"}><span>My overdue</span><strong>{mineOverdue.length}</strong><small>{mineOverdue.length ? "Needs your follow-up" : "Your work is on track"}</small></article><article><span>My {completionLabel.toLowerCase()}</span><strong>{mineResolved.length}</strong><small>Personal outcomes captured</small></article><article><span>My total</span><strong>{mine.length}</strong><small>Across every status</small></article></> : filter === "Overdue" ? <><article className="urgent"><span>Overdue now</span><strong>{overdueCount}</strong><small>Past expected update</small></article><article className="warm"><span>Oldest delay</span><strong>{attentionQueue.length ? daysOverdue(attentionQueue[0]) : 0}d</strong><small>{attentionQueue.length ? attentionQueue[0].title : "Nothing is overdue"}</small></article><article><span>Owners affected</span><strong>{new Set(attentionQueue.map(i => i.owner)).size}</strong><small>People needing follow-up</small></article><article><span>First move</span><strong>{attentionQueue.length ? "Now" : "Clear"}</strong><small>{attentionQueue.length ? "Start with the oldest item" : "No triage needed"}</small></article></> : <><article><span>Open work</span><strong>{openCount}</strong><small>Across your active issues</small></article><article className="warm"><span>Needs attention</span><strong>{overdueCount}</strong><small>{overdueCount ? "Past its expected update" : "Everything is on track"}</small></article><article><span>{completionLabel}</span><strong>{resolvedIssues.length}</strong><small>Outcomes documented</small></article><article><span>Next check-in</span><strong>Today</strong><small>Daily wrap-up at 4:30 PM</small></article></>}</section>
      <section className="content-grid">
        <div className={`issue-panel issue-panel-${dashboardView}`}><div className="section-heading"><div><p className="eyebrow">{filter === "Mine" ? "PERSONAL QUEUE" : filter === "Overdue" ? "PRIORITY QUEUE" : "WORK QUEUE"}</p><h2>{filter === "All" ? "Issues in motion" : filter === "Mine" ? "What I’m moving forward" : "Follow up, unblock, recover"}</h2></div><div className="filter-pills">{(["All", "Mine", "Overdue"] as const).map(f => <button className={filter === f ? "selected" : ""} onClick={() => setFilter(f)} key={f}>{f}</button>)}</div></div><div className="issue-list">{visible.map(issue => <button key={issue.id} className={`issue-card ${issue.id === activeId ? "active" : ""}`} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><div><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><h3>{issue.title}</h3><p>{issue.action || issue.details}</p></div><div className="issue-meta"><span className={isOverdue(issue) ? "due overdue" : "due"}>{isOverdue(issue) ? "Overdue · " : "Due · "}{dateLabel(issue.expected)}</span><span>{issue.owner}</span></div></button>)}{!visible.length && <div className="empty">{filter === "Mine" ? "Nothing is assigned to you right now." : filter === "Overdue" ? "Nothing needs attention—every active item is on track." : "No issues here—your queue is looking beautifully clear."}</div>}</div></div>
        <aside className={`report-panel report-${dashboardView}`}>{filter === "Mine" ? <><p className="eyebrow">PERSONAL SNAPSHOT</p><h2>Your workload</h2><div className="focus-stat"><span>In progress</span><strong>{mineOpen.length}</strong></div><div className="focus-stat"><span>Overdue</span><strong>{mineOverdue.length}</strong></div><div className="focus-stat"><span>Completed</span><strong>{mineResolved.length}</strong></div><div className="report-divider"/><p className="eyebrow">FOCUS PROMPT</p><p className="report-note">Choose one clear next action, add an update, and keep your personal queue moving.</p></> : filter === "Overdue" ? <><p className="eyebrow">TRIAGE ORDER</p><h2>Oldest first</h2><div className="triage-list">{attentionQueue.slice(0, 3).map((issue, index) => <button key={issue.id} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><em>{index + 1}</em><span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.expected)}</small></span></button>)}{!attentionQueue.length && <p className="report-note">Your priority queue is clear.</p>}</div><div className="report-divider"/><p className="eyebrow">RECOVERY RHYTHM</p><p className="report-note">Confirm the owner, record the next step, and reset the expected update.</p></> : <><p className="eyebrow">AT A GLANCE</p><h2>Workload by owner</h2>{ownerReport.map(([owner,count]) => <div className="owner" key={owner}><div className="avatar">{owner.charAt(0)}</div><span>{owner}</span><strong>{count}</strong></div>)}<div className="report-divider"/><p className="eyebrow">WEEKLY OUTCOMES</p><p className="report-note">{completionLabel} work is retained with its outcome, so your weekly review writes itself.</p></>}</aside>
      </section>
      </>}
      {section === "calendar" && <section className="calendar-layout"><div className="calendar-panel"><div className="calendar-toolbar"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{monthTitle}</h2><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><div className="weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day, index) => { if (day < 1) return <div className="calendar-day blank" key={index}/>; const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const logged = issues.filter(i => dayKey(i.createdAt) === key); return <button key={key} className={`calendar-day ${key === selectedDay ? "chosen" : ""}`} onClick={() => setSelectedDay(key)}><span>{day}</span>{logged.length > 0 && <em>{logged.length} logged</em>}{logged.slice(0,2).map(i => <small key={i.id}>{i.title}</small>)}</button>; })}</div></div><aside className="day-summary"><p className="eyebrow">DAY SUMMARY</p><h2>{new Intl.DateTimeFormat("en", { weekday:"long", month:"long", day:"numeric" }).format(new Date(`${selectedDay}T12:00`))}</h2><p className="summary-count">{selectedIssues.length} issue{selectedIssues.length === 1 ? "" : "s"} logged</p><div className="day-issues">{selectedIssues.map(issue => <button key={issue.id} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.createdAt)}</small></button>)}{!selectedIssues.length && <p className="empty">No work logged for this day.</p>}</div></aside></section>}
      {section === "metrics" && <section className="insights"><div className={`health-card ${health === "Looking healthy" ? "healthy" : "watch"}`}><div><p className="eyebrow">OVERALL SIGNAL</p><h2>{health}</h2><p>{health === "Looking healthy" ? "Follow-ups and completion timing are in a good place." : "A few signals need attention—start with overdue items and slow handoffs."}</p></div><strong>{health === "Looking healthy" ? "✦" : "!"}</strong></div><div className="metric-row insight-metrics"><article><span>Completion rate</span><strong>{issues.length ? Math.round((resolvedIssues.length / issues.length) * 100) : 0}%</strong><small>{resolvedIssues.length} of {issues.length} issues completed</small></article><article className={onTimeRate >= 80 ? "good" : "warm"}><span>On-time completion</span><strong>{dueResolved.length ? `${onTimeRate}%` : "—"}</strong><small>{dueResolved.length ? `${onTimeCount} completed by their ETA` : "Set ETAs to begin tracking"}</small></article><article><span>Avg. completion time</span><strong>{completionHours.length ? `${averageHours.toFixed(1)}h` : "—"}</strong><small>{completionHours.length ? "From logged to completed" : "Complete work to measure"}</small></article><article className={overdueCount ? "warm" : "good"}><span>Currently overdue</span><strong>{overdueCount}</strong><small>{overdueCount ? "Follow up to get back on track" : "No active work is overdue"}</small></article></div><div className="insight-detail"><article><p className="eyebrow">WHAT THIS MEANS</p><h2>Completion timing</h2><div className="progress-track"><span style={{ width: `${Math.max(8, onTimeRate)}%` }}/></div><p>{dueResolved.length ? `${onTimeRate}% of work with a logged ETA was completed on time. ${onTimeRate >= 80 ? "That’s a solid operating rhythm." : "Aim for 80% or higher by checking in before ETAs slip."}` : "Once you complete issues with expected completion times, you’ll see a timing trend here."}</p></article><article><p className="eyebrow">FOCUS NEXT</p><h2>Recommended actions</h2><ul><li>{overdueCount ? `Follow up on ${overdueCount} overdue issue${overdueCount === 1 ? "" : "s"}.` : "Keep your current follow-up rhythm."}</li><li>Capture an outcome whenever work is completed.</li><li>Set an expected update time for clearer delivery signals.</li></ul></article></div></section>}
    </section>
    {showDetail && active && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowDetail(false); }}><section className="detail detail-modal" role="dialog" aria-modal="true" aria-labelledby="issue-detail-title"><button className="close" type="button" aria-label="Close issue details" onClick={() => setShowDetail(false)}>×</button><div className="detail-title"><div><span className={statusClass(active.status)} style={statusStyle(active.status)}>{active.status}</span><h2 id="issue-detail-title">{active.title}</h2><p>{active.details}</p></div><div className="detail-actions"><label>Status<select value={active.status} onChange={e => updateIssue({ status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><button className="delete" type="button" onClick={() => setShowDeleteConfirm(true)}>Delete issue</button></div></div><div className="detail-grid"><div className="field"><span>Responsible</span><input value={active.owner} onChange={e => updateIssue({owner:e.target.value})}/></div><div className="field"><span>Expected update / done</span><input type="datetime-local" value={active.expected} onChange={e => updateIssue({expected:e.target.value})}/></div><div className="field wide"><span>What they’re doing / my current action</span><textarea value={active.action} onChange={e => updateIssue({action:e.target.value})}/></div><div className="field wide"><span>Outcome</span><textarea placeholder="Capture the resolution, learning, or impact…" value={active.outcome} onChange={e => updateIssue({outcome:e.target.value})}/></div></div><div className="timeline"><div className="timeline-heading"><h3>Update timeline</h3><span>{active.updates.length} entries</span></div>{active.updates.map(entry => <div className="timeline-entry" key={entry.id}><div className="timeline-dot"/><div><strong>{entry.author}</strong><time>{dateLabel(entry.at)}</time><p>{entry.text}</p></div></div>)}<form className="update-form" onSubmit={addUpdate}><input name="update" placeholder="Add your update, decision, or next step…" aria-label="New update"/><button className="primary">Add update</button></form></div></section></div>}
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={addIssue}><button className="close" type="button" onClick={() => setShowCreate(false)}>×</button><p className="eyebrow">NEW WORK ITEM</p><h2>Log an issue</h2><label>Issue title<input required name="title" placeholder="What needs attention?"/></label><label>Details<textarea name="details" placeholder="Context, impact, links, and useful clues…"/></label><div className="form-grid"><label>Responsible person<input name="owner" placeholder={personalOwner}/></label><label>Expected update<input name="expected" type="datetime-local"/></label></div><label>Current action<textarea name="action" placeholder="What are they—or you—doing next?"/></label><button className="primary create" type="submit">Create issue</button></form></div>}
    {showStatusSettings && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowStatusSettings(false); }}><section className="modal status-modal" role="dialog" aria-modal="true" aria-labelledby="status-settings-title"><button className="close" type="button" aria-label="Close status settings" onClick={() => setShowStatusSettings(false)}>×</button><p className="eyebrow">WORKFLOW SETTINGS</p><h2 id="status-settings-title">Customize statuses</h2><p className="modal-copy">New, Ongoing, and your completion status stay in the workflow. Choose Resolved or Closed, set colors, and edit or remove every other status. Removed work moves to Ongoing.</p><div className="status-list">{statusDraft.map((item, index) => <div className="status-row" key={item.id}>{item.kind === "terminal" ? <select aria-label="Completion status" value={item.name} onChange={e => { const name = e.target.value; setStatusDraft(items => items.map(draft => draft.id === item.id ? { ...draft, name } : draft)); setStatusError(""); }}><option>Resolved</option><option>Closed</option></select> : <input aria-label={`Status ${index + 1}`} value={item.name} disabled={item.kind === "new" || item.kind === "ongoing"} onChange={e => { const name = e.target.value; setStatusDraft(items => items.map(draft => draft.id === item.id ? { ...draft, name } : draft)); setStatusError(""); }}/>}<input className="status-color" type="color" aria-label={`Color for ${item.name}`} value={item.color} onChange={e => { const color = e.target.value; setStatusDraft(items => items.map(draft => draft.id === item.id ? { ...draft, color } : draft)); }}/>{item.kind ? <span className="status-lock">Required</span> : <button type="button" title="Remove status; matching issues will move to Ongoing" onClick={() => setStatusDraft(items => items.filter(draft => draft.id !== item.id))}>Remove</button>}</div>)}</div><form className="status-add" onSubmit={addStatus}><input value={statusInput} onChange={e => { setStatusInput(e.target.value); setStatusError(""); }} placeholder="Add a new status" aria-label="New status name"/><button className="secondary" type="submit">+ Add</button></form>{statusError && <p className="status-error" role="alert">{statusError}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={() => setShowStatusSettings(false)}>Cancel</button><button className="primary" type="button" onClick={saveStatuses}>Save statuses</button></div></section></div>}
    {showDeleteConfirm && active && <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><span className="confirm-icon">!</span><h2 id="delete-title">Delete this issue?</h2><p id="delete-description">“{active.title}” and its update history will be permanently removed.</p><div className="confirm-actions"><button className="secondary" type="button" autoFocus onClick={() => setShowDeleteConfirm(false)}>Keep issue</button><button className="danger" type="button" onClick={deleteIssue}>Delete issue</button></div></section></div>}
    {hydrated && !profile && <div className="profile-backdrop"><form className="profile-card" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="setup-title"><span className="profile-mark">✦</span><p className="eyebrow">WELCOME TO SIGNAL PETAL</p><h1 id="setup-title">Let&apos;s make this yours.</h1><p>Tell us a little about yourself and we&apos;ll personalize your workspace. This stays only in this browser.</p><label>Your name<input required name="name" autoFocus placeholder="e.g. Aesi"/></label><label>Your role<input required name="role" placeholder="e.g. Site Reliability Engineer"/></label><button className="primary" type="submit">Create my workspace</button></form></div>}
  </main>;
}
