import type { CSSProperties } from "react";
import type { Issue, Status } from "../backup";
import { statusClass } from "../tasks";

export default function TaskBadges({ issue, statusColors }: { issue: Issue; statusColors: Record<Status, string> }) {
  const style = { "--status-color": statusColors[issue.status] || "#7a5aa6" } as CSSProperties;
  return <>
    <span className={statusClass(issue.status)} style={style}>{issue.status}</span>
    {issue.priority && issue.priority !== "medium" && <span className={`priority-chip priority-${issue.priority}`}>{issue.priority}</span>}
    {issue.category && <span className="category-chip">{issue.category}</span>}
  </>;
}
