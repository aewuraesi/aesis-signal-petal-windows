import { useEffect, useState } from "react";
import type { Issue } from "../backup";

const tagList = (value: string) => [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];

export function NewTaskOrganizationFields({ professional }: { professional: boolean }) {
  if (!professional) return null;
  return <fieldset className="organization-fields">
    <legend>Organize this work <small>optional</small></legend>
    <label>Category<input name="category" placeholder="e.g. Reliability, Admin"/></label>
    <div className="form-grid">
      <label>Project<input name="project" placeholder="e.g. Checkout refresh"/></label>
      <label>Service or system<input name="service" placeholder="e.g. payments-api"/></label>
    </div>
    <label>Tags <small>separate with commas</small><input name="tags" placeholder="incident, audit, customer"/></label>
  </fieldset>;
}

export default function TaskOrganizationFields({ issue, issues, onChange, onOpen }: {
  issue: Issue;
  issues: Issue[];
  onChange: (changes: Partial<Issue>) => void;
  onOpen: (id: string) => void;
}) {
  const [tags, setTags] = useState((issue.tags ?? []).join(", "));
  useEffect(() => setTags((issue.tags ?? []).join(", ")), [issue.id, issue.tags]);
  const choices = issues.filter(candidate => candidate.id !== issue.id && !candidate.archivedAt);
  const children = issues.filter(candidate => candidate.parentId === issue.id && !candidate.archivedAt);
  const dependencies = (issue.dependencyIds ?? []).map(id => issues.find(candidate => candidate.id === id)).filter((item): item is Issue => Boolean(item));
  const blocked = dependencies.filter(item => item.status !== "Resolved" && item.status !== "Closed");

  return <div className="field wide organization-fields">
    <span>Organize and connect</span>
    <div className="form-grid">
      <label>Project<input value={issue.project ?? ""} onChange={event => onChange({ project: event.target.value })} placeholder="e.g. Checkout refresh"/></label>
      <label>Service or system<input value={issue.service ?? ""} onChange={event => onChange({ service: event.target.value })} placeholder="e.g. payments-api"/></label>
    </div>
    <label>Tags <small>separate with commas</small><input value={tags} onChange={event => setTags(event.target.value)} onBlur={() => onChange({ tags: tagList(tags) })} placeholder="incident, audit, customer"/></label>
    <div className="form-grid">
      <label>Part of
        <select value={issue.parentId ?? ""} onChange={event => onChange({ parentId: event.target.value || undefined })}>
          <option value="">No parent task</option>
          {choices.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
      <label>Waiting for
        <select value="" onChange={event => {
          const id = event.target.value;
          if (id && !(issue.dependencyIds ?? []).includes(id)) onChange({ dependencyIds: [...(issue.dependencyIds ?? []), id] });
        }}>
          <option value="">Add a dependency…</option>
          {choices.filter(candidate => !(issue.dependencyIds ?? []).includes(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
    </div>
    {dependencies.length > 0 && <div className="relation-list" aria-label="Task dependencies">
      {dependencies.map(candidate => <span key={candidate.id} className={blocked.includes(candidate) ? "is-blocking" : ""}>
        <button type="button" onClick={() => onOpen(candidate.id)}>{candidate.title}</button>
        <button type="button" aria-label={`Remove dependency ${candidate.title}`} onClick={() => onChange({ dependencyIds: (issue.dependencyIds ?? []).filter(id => id !== candidate.id) })}>×</button>
      </span>)}
    </div>}
    {blocked.length > 0 && <small className="dependency-warning">Blocked by {blocked.length} unfinished task{blocked.length === 1 ? "" : "s"}.</small>}
    {children.length > 0 && <div className="subtask-list"><small>Subtasks</small>{children.map(child => <button type="button" key={child.id} onClick={() => onOpen(child.id)}><span>{child.title}</span><em>{child.status}</em></button>)}</div>}
  </div>;
}
