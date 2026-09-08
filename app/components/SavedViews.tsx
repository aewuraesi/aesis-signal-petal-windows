import { useState } from "react";

export type SavedView = { id: string; name: string; query: string; filter: "All" | "Mine" | "Overdue" | "Archive" };

export default function SavedViews({ views, query, filter, onChange, onApply }: {
  views: SavedView[]; query: string; filter: SavedView["filter"];
  onChange: (views: SavedView[]) => void; onApply: (view: SavedView) => void;
}) {
  const [name, setName] = useState("");
  const save = () => {
    const label = name.trim(); if (!label) return;
    onChange([...views, { id: crypto.randomUUID(), name: label, query: query.trim(), filter }]); setName("");
  };
  return <div className="saved-views">
    <div className="saved-view-list">{views.map(view => <span key={view.id}><button type="button" onClick={() => onApply(view)}>{view.name}</button><button type="button" aria-label={`Delete saved view ${view.name}`} onClick={() => onChange(views.filter(item => item.id !== view.id))}>×</button></span>)}</div>
    <div className="saved-view-create"><input value={name} onChange={event => setName(event.target.value)} placeholder="Name this view" aria-label="Saved view name"/><button className="secondary" type="button" disabled={!name.trim()} onClick={save}>Save current view</button></div>
  </div>;
}
