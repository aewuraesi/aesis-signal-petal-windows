import type { Issue } from "../backup";
import { isCompleteStatus } from "../tasks";

export default function TaskActionControls({ issue, onComplete, onDelete, onRestore }: {
  issue: Issue;
  onComplete: (issue: Issue) => void;
  onDelete: (issue: Issue) => void;
  onRestore: (issue: Issue) => void;
}) {
  return <div className="issue-card-actions">
    {issue.archivedAt
      ? <button className="restore-action" type="button" onClick={() => onRestore(issue)}>Restore</button>
      : isCompleteStatus(issue.status)
        ? <span className="completed-tag"><span aria-hidden="true">✓</span> Completed</span>
        : <button className="complete-action" type="button" onClick={() => onComplete(issue)}><span aria-hidden="true">✓</span> Complete</button>}
    <button className="delete-action" type="button" aria-label={`Delete ${issue.title}`} title="Delete task" onClick={() => onDelete(issue)}><span aria-hidden="true">×</span></button>
  </div>;
}
