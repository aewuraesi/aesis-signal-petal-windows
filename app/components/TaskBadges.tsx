import type { CSSProperties } from "react";
import type { Issue, Status } from "../backup";
import { statusClass } from "../tasks";

export default function TaskBadges({ issue, statusColors, overtaken = false }: { issue: Issue; statusColors: Record<Status, string>; overtaken?: boolean }) {
  const style = { "--status-color": statusColors[issue.status] || "#7a5aa6" } as CSSProperties;
  return <>
    <span className={statusClass(issue.status)} style={style}>{issue.status}</span>
    {issue.priority && issue.priority !== "medium" && <span className={`priority-chip priority-${issue.priority}`}>{issue.priority}</span>}
    {issue.category && <span className="category-chip">{issue.category}</span>}
    {issue.project && <span className="category-chip">{issue.project}</span>}
    {issue.service && <span className="category-chip">{issue.service}</span>}
    {(issue.tags ?? []).slice(0, 3).map(tag => <span className="category-chip" key={tag}>#{tag}</span>)}
    {/* This round's date passed and the next one has already opened. Saying so is the
        point: without it the list just shows two of the same thing. */}
    {overtaken && <span className="overtaken-chip">still open from last round</span>}
  </>;
}
