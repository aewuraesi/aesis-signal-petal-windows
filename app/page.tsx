"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "New" | "Ongoing" | "Waiting on dev" | "Investigating" | "Blocked" | "Pending Monitoring" | "Awaiting approval" | "Resolved";
type Entry = { id: string; at: string; text: string; author: string };
type Issue = {
  id: string; title: string; details: string; owner: string; action: string;
  expected: string; createdAt: string; completedAt?: string; status: Status; outcome: string; updates: Entry[];
};

const statuses: Status[] = ["New", "Ongoing", "Waiting on dev", "Investigating", "Blocked", "Pending Monitoring", "Awaiting approval", "Resolved"];
const themes = [
  ["rose", "Rose quartz"], ["lilac", "Lilac haze"], ["peach", "Peach fizz"], ["blush", "Blush bloom"], ["berry", "Berry luxe"],
  ["ocean", "Ocean slate"], ["forest", "Forest moss"], ["navy", "Midnight navy"], ["sand", "Desert sand"], ["graphite", "Graphite"],
] as const;
const seed: Issue[] = [
  { id: "seed-1", title: "Checkout API latency spike", details: "p95 latency increased after the morning deploy. Watching the payments dependency.", owner: "Maya Chen", action: "Comparing traces and rolling back the feature flag if confirmed.", expected: "2026-08-13T16:30", createdAt: "2026-08-13T11:10", status: "Investigating", outcome: "", updates: [{ id: "u1", at: "2026-08-13T11:10", author: "You", text: "Opened incident bridge and shared dashboard links." }, { id: "u2", at: "2026-08-13T12:05", author: "Maya Chen", text: "Trace points to a connection-pool regression; testing a flag rollback." }] },
  { id: "seed-2", title: "Kafka consumer lag", details: "Lag is building in the customer-events consumer group.", owner: "Jordan Lee", action: "Increasing partition concurrency and checking dead-letter volume.", expected: "2026-08-13T14:00", createdAt: "2026-08-13T09:25", status: "Waiting on dev", outcome: "", updates: [{ id: "u3", at: "2026-08-13T09:25", author: "You", text: "Captured consumer metrics and assigned follow-up." }] },
  { id: "seed-3", title: "Certificate renewal runbook", details: "Document and validate the renewal sequence before the next rotation.", owner: "You", action: "Drafting the runbook and scheduling a staging dry run.", expected: "2026-08-15T15:00", createdAt: "2026-08-12T15:40", status: "Pending Monitoring", outcome: "", updates: [{ id: "u4", at: "2026-08-12T15:40", author: "You", text: "Added expiry monitoring to the weekly review." }] },
];

const statusClass = (status: Status) => `status ${status.toLowerCase().replaceAll(" ", "-")}`;
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "No ETA";
const isOverdue = (issue: Issue) => issue.status !== "Resolved" && issue.expected && new Date(issue.expected).getTime() < Date.now();
const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>(seed);
  const [activeId, setActiveId] = useState<string>(seed[0].id);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"All" | "Mine" | "Overdue">("All");
  const [section, setSection] = useState<"dashboard" | "calendar" | "metrics">("dashboard");
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 7, 1));
  const [selectedDay, setSelectedDay] = useState<string>("2026-08-13");
  const [theme, setTheme] = useState("rose");
  const [darkMode, setDarkMode] = useState(false);
  const [notificationState, setNotificationState] = useState("Notifications off");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { const saved = localStorage.getItem("signal-petal-issues"); if (saved) setIssues(JSON.parse(saved).map((i: Issue) => ({ ...i, createdAt: i.createdAt || i.updates?.[0]?.at || new Date().toISOString() }))); setTheme(localStorage.getItem("signal-petal-theme") || "rose"); setDarkMode(localStorage.getItem("signal-petal-dark") === "true"); setHydrated(true); if ("Notification" in window) setNotificationState(Notification.permission === "granted" ? "Reminders on" : "Notifications off"); }, []);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-issues", JSON.stringify(issues)); }, [issues, hydrated]);
  useEffect(() => { if (hydrated) { localStorage.setItem("signal-petal-theme", theme); localStorage.setItem("signal-petal-dark", String(darkMode)); } }, [theme, darkMode, hydrated]);
  useEffect(() => {
    const check = () => {
      if ("Notification" in window && Notification.permission === "granted") {
        const due = issues.filter(i => i.status !== "Resolved" && i.expected && new Date(i.expected).getTime() - Date.now() < 60 * 60 * 1000);
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
  const visible = useMemo(() => issues.filter(i => filter === "Mine" ? i.owner.toLowerCase() === "you" : filter === "Overdue" ? isOverdue(i) : true), [issues, filter]);
  const openCount = issues.filter(i => i.status !== "Resolved").length;
  const overdueCount = issues.filter(isOverdue).length;
  const ownerReport = useMemo(() => Object.entries(issues.reduce<Record<string, number>>((map, i) => { if (i.status !== "Resolved") map[i.owner] = (map[i.owner] || 0) + 1; return map; }, {})).sort((a,b) => b[1]-a[1]), [issues]);
  const calendarDays = useMemo(() => { const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0); return Array.from({ length: start.getDay() + end.getDate() }, (_, i) => i - start.getDay() + 1); }, [calendarMonth]);
  const selectedIssues = issues.filter(i => dayKey(i.createdAt) === selectedDay);
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth);
  const resolvedIssues = issues.filter(i => i.status === "Resolved");
  const completedWithTime = resolvedIssues.filter(i => i.completedAt || i.updates.length);
  const completionHours = completedWithTime.map(i => (new Date(i.completedAt || i.updates[i.updates.length - 1].at).getTime() - new Date(i.createdAt).getTime()) / 3600000).filter(h => h >= 0);
  const averageHours = completionHours.length ? completionHours.reduce((sum, h) => sum + h, 0) / completionHours.length : 0;
  const dueResolved = resolvedIssues.filter(i => i.expected && (i.completedAt || i.updates.length));
  const onTimeCount = dueResolved.filter(i => new Date(i.completedAt || i.updates[i.updates.length - 1].at).getTime() <= new Date(i.expected).getTime()).length;
  const onTimeRate = dueResolved.length ? Math.round((onTimeCount / dueResolved.length) * 100) : 0;
  const health = overdueCount > 0 || (dueResolved.length > 0 && onTimeRate < 80) ? "Needs improvement" : "Looking healthy";

  function updateIssue(patch: Partial<Issue>) { if (!active) return; const completedAt = patch.status === "Resolved" && active.status !== "Resolved" ? new Date().toISOString() : patch.status && patch.status !== "Resolved" ? undefined : active.completedAt; setIssues(items => items.map(i => i.id === active.id ? { ...i, ...patch, completedAt } : i)); }
  function deleteIssue() {
    if (!active || !window.confirm(`Delete “${active.title}”? This cannot be undone.`)) return;
    const remaining = issues.filter(i => i.id !== active.id);
    setIssues(remaining);
    setActiveId(remaining[0]?.id ?? "");
  }
  function addUpdate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get("update") || "").trim(); if (!text || !active) return; updateIssue({ updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: "You", text }] }); event.currentTarget.reset(); }
  function addIssue(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const now = new Date().toISOString(); const issue: Issue = { id: crypto.randomUUID(), title: String(form.get("title")), details: String(form.get("details")), owner: String(form.get("owner")) || "You", action: String(form.get("action")), expected: String(form.get("expected")), createdAt: now, status: "New", outcome: "", updates: [{ id: crypto.randomUUID(), at: now, author: "You", text: "Issue logged." }] }; setIssues(items => [issue, ...items]); setActiveId(issue.id); setShowCreate(false); }
  async function enableNotifications() { if (!("Notification" in window)) return setNotificationState("Not supported in this browser"); const permission = await Notification.requestPermission(); setNotificationState(permission === "granted" ? "Reminders on" : "Notifications off"); }

  return <main className={`theme-${theme} ${darkMode ? "dark-mode" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div><strong>Aesi&apos;s Signal Petal</strong><small>SRE work companion</small></div></div>
      <nav><button className={section === "dashboard" && filter === "All" ? "nav-active" : ""} onClick={() => { setSection("dashboard"); setFilter("All"); }}>⌂ <span>Dashboard</span></button><button className={section === "calendar" ? "nav-active" : ""} onClick={() => setSection("calendar")}>▦ <span>Calendar</span></button><button className={section === "metrics" ? "nav-active" : ""} onClick={() => setSection("metrics")}>◌ <span>Insights</span></button><button onClick={() => { setSection("dashboard"); setFilter("Mine"); }}>♡ <span>My actions</span><em>{issues.filter(i => i.owner === "You").length}</em></button><button onClick={() => { setSection("dashboard"); setFilter("Overdue"); }}>! <span>Needs attention</span><em className="alert-count">{overdueCount}</em></button></nav>
      <div className="sidebar-bottom"><div className="appearance"><label>Appearance<select value={theme} onChange={e => setTheme(e.target.value)}>{themes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="mode-toggle" onClick={() => setDarkMode(value => !value)}>{darkMode ? "☀ Light mode" : "◐ Dark mode"}</button></div><button className="notification-button" onClick={enableNotifications}>◌ {notificationState}</button><p>Data stays privately on this device.</p></div>
    </aside>
    <section className="workspace">
      <header><div><p className="eyebrow">AESI&apos;S WORKSPACE</p><h1>{section === "calendar" ? "Your work calendar ✦" : section === "metrics" ? "Signals & progress ✦" : "Good afternoon, SRE ✦"}</h1><p className="subhead">{section === "calendar" ? "Choose a day to see every task and issue you logged." : section === "metrics" ? "A clear read on delivery pace, follow-through, and where to focus." : "A lovely little command center for keeping work moving."}</p></div><button className="primary" onClick={() => setShowCreate(true)}>+ Log an issue</button></header>
      {section === "dashboard" && <><section className="metric-row"><article><span>Open work</span><strong>{openCount}</strong><small>Across your active issues</small></article><article className="warm"><span>Needs attention</span><strong>{overdueCount}</strong><small>{overdueCount ? "Past its expected update" : "Everything is on track"}</small></article><article><span>Resolved</span><strong>{issues.filter(i => i.status === "Resolved").length}</strong><small>Outcomes documented</small></article><article><span>Next check-in</span><strong>Today</strong><small>Daily wrap-up at 4:30 PM</small></article></section>
      <section className="content-grid">
        <div className="issue-panel"><div className="section-heading"><div><p className="eyebrow">WORK QUEUE</p><h2>{filter === "All" ? "Issues in motion" : filter === "Mine" ? "My actions" : "Needs your follow-up"}</h2></div><div className="filter-pills">{(["All", "Mine", "Overdue"] as const).map(f => <button className={filter === f ? "selected" : ""} onClick={() => setFilter(f)} key={f}>{f}</button>)}</div></div><div className="issue-list">{visible.map(issue => <button key={issue.id} className={`issue-card ${issue.id === activeId ? "active" : ""}`} onClick={() => setActiveId(issue.id)}><div><span className={statusClass(issue.status)}>{issue.status}</span><h3>{issue.title}</h3><p>{issue.action || issue.details}</p></div><div className="issue-meta"><span className={isOverdue(issue) ? "due overdue" : "due"}>{isOverdue(issue) ? "Overdue · " : "Due · "}{dateLabel(issue.expected)}</span><span>{issue.owner}</span></div></button>)}{!visible.length && <div className="empty">No issues here—your queue is looking beautifully clear.</div>}</div></div>
        <aside className="report-panel"><p className="eyebrow">AT A GLANCE</p><h2>Workload by owner</h2>{ownerReport.map(([owner,count]) => <div className="owner" key={owner}><div className="avatar">{owner.charAt(0)}</div><span>{owner}</span><strong>{count}</strong></div>)}<div className="report-divider"/><p className="eyebrow">WEEKLY OUTCOMES</p><p className="report-note">Resolved work is retained with its outcome, so your weekly review writes itself.</p></aside>
      </section>
      {active && <section className="detail"><div className="detail-title"><div><span className={statusClass(active.status)}>{active.status}</span><h2>{active.title}</h2><p>{active.details}</p></div><div className="detail-actions"><label>Status<select value={active.status} onChange={e => updateIssue({ status: e.target.value as Status })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><button className="delete" onClick={deleteIssue}>Delete issue</button></div></div><div className="detail-grid"><div className="field"><span>Responsible</span><input value={active.owner} onChange={e => updateIssue({owner:e.target.value})}/></div><div className="field"><span>Expected update / done</span><input type="datetime-local" value={active.expected} onChange={e => updateIssue({expected:e.target.value})}/></div><div className="field wide"><span>What they’re doing / my current action</span><textarea value={active.action} onChange={e => updateIssue({action:e.target.value})}/></div><div className="field wide"><span>Outcome</span><textarea placeholder="Capture the resolution, learning, or impact…" value={active.outcome} onChange={e => updateIssue({outcome:e.target.value})}/></div></div><div className="timeline"><div className="timeline-heading"><h3>Update timeline</h3><span>{active.updates.length} entries</span></div>{active.updates.map(entry => <div className="timeline-entry" key={entry.id}><div className="timeline-dot"/><div><strong>{entry.author}</strong><time>{dateLabel(entry.at)}</time><p>{entry.text}</p></div></div>)}<form className="update-form" onSubmit={addUpdate}><input name="update" placeholder="Add your update, decision, or next step…" aria-label="New update"/><button className="primary">Add update</button></form></div></section>}</>}
      {section === "calendar" && <section className="calendar-layout"><div className="calendar-panel"><div className="calendar-toolbar"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{monthTitle}</h2><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><div className="weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day, index) => { if (day < 1) return <div className="calendar-day blank" key={index}/>; const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const logged = issues.filter(i => dayKey(i.createdAt) === key); return <button key={key} className={`calendar-day ${key === selectedDay ? "chosen" : ""}`} onClick={() => setSelectedDay(key)}><span>{day}</span>{logged.length > 0 && <em>{logged.length} logged</em>}{logged.slice(0,2).map(i => <small key={i.id}>{i.title}</small>)}</button>; })}</div></div><aside className="day-summary"><p className="eyebrow">DAY SUMMARY</p><h2>{new Intl.DateTimeFormat("en", { weekday:"long", month:"long", day:"numeric" }).format(new Date(`${selectedDay}T12:00`))}</h2><p className="summary-count">{selectedIssues.length} issue{selectedIssues.length === 1 ? "" : "s"} logged</p><div className="day-issues">{selectedIssues.map(issue => <button key={issue.id} onClick={() => { setActiveId(issue.id); setSection("dashboard"); }}><span className={statusClass(issue.status)}>{issue.status}</span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.createdAt)}</small></button>)}{!selectedIssues.length && <p className="empty">No work logged for this day.</p>}</div></aside></section>}
      {section === "metrics" && <section className="insights"><div className={`health-card ${health === "Looking healthy" ? "healthy" : "watch"}`}><div><p className="eyebrow">OVERALL SIGNAL</p><h2>{health}</h2><p>{health === "Looking healthy" ? "Follow-ups and completion timing are in a good place." : "A few signals need attention—start with overdue items and slow handoffs."}</p></div><strong>{health === "Looking healthy" ? "✦" : "!"}</strong></div><div className="metric-row insight-metrics"><article><span>Completion rate</span><strong>{issues.length ? Math.round((resolvedIssues.length / issues.length) * 100) : 0}%</strong><small>{resolvedIssues.length} of {issues.length} issues resolved</small></article><article className={onTimeRate >= 80 ? "good" : "warm"}><span>On-time completion</span><strong>{dueResolved.length ? `${onTimeRate}%` : "—"}</strong><small>{dueResolved.length ? `${onTimeCount} completed by their ETA` : "Set ETAs to begin tracking"}</small></article><article><span>Avg. completion time</span><strong>{completionHours.length ? `${averageHours.toFixed(1)}h` : "—"}</strong><small>{completionHours.length ? "From logged to resolved" : "Resolve work to measure"}</small></article><article className={overdueCount ? "warm" : "good"}><span>Currently overdue</span><strong>{overdueCount}</strong><small>{overdueCount ? "Follow up to get back on track" : "No active work is overdue"}</small></article></div><div className="insight-detail"><article><p className="eyebrow">WHAT THIS MEANS</p><h2>Completion timing</h2><div className="progress-track"><span style={{ width: `${Math.max(8, onTimeRate)}%` }}/></div><p>{dueResolved.length ? `${onTimeRate}% of work with a logged ETA was completed on time. ${onTimeRate >= 80 ? "That’s a solid operating rhythm." : "Aim for 80% or higher by checking in before ETAs slip."}` : "Once you resolve issues with expected completion times, you’ll see a timing trend here."}</p></article><article><p className="eyebrow">FOCUS NEXT</p><h2>Recommended actions</h2><ul><li>{overdueCount ? `Follow up on ${overdueCount} overdue issue${overdueCount === 1 ? "" : "s"}.` : "Keep your current follow-up rhythm."}</li><li>Capture an outcome whenever work is resolved.</li><li>Set an expected update time for clearer delivery signals.</li></ul></article></div></section>}
    </section>
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={addIssue}><button className="close" type="button" onClick={() => setShowCreate(false)}>×</button><p className="eyebrow">NEW WORK ITEM</p><h2>Log an issue</h2><label>Issue title<input required name="title" placeholder="What needs attention?"/></label><label>Details<textarea name="details" placeholder="Context, impact, links, and useful clues…"/></label><div className="form-grid"><label>Responsible person<input name="owner" placeholder="Name or You"/></label><label>Expected update<input name="expected" type="datetime-local"/></label></div><label>Current action<textarea name="action" placeholder="What are they—or you—doing next?"/></label><button className="primary create" type="submit">Create issue</button></form></div>}
  </main>;
}
