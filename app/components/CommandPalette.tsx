import { Fragment, type KeyboardEvent, type ReactNode } from "react";

export type CommandItem = { key: string; group: string; icon: ReactNode; hint: string; label: string; run: () => void };

type CommandPaletteProps = {
  query: string;
  items: CommandItem[];
  cursor: number;
  onQueryChange: (value: string) => void;
  onCursorChange: (index: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
};

export default function CommandPalette({ query, items, cursor, onQueryChange, onCursorChange, onKeyDown, onClose }: CommandPaletteProps) {
  return <div className="modal-backdrop command-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="command-search"><span>⌕</span><input data-autofocus value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={onKeyDown} placeholder="Search commands, tasks, or reflections…" aria-label="Search commands"/><kbd>Esc</kbd></div>
      <div className="command-results">{items.map((item, index) => <Fragment key={item.key}>{(index === 0 || items[index - 1].group !== item.group) && <p>{item.group}</p>}<button type="button" className={index === cursor ? "is-active" : ""} ref={node => { if (index === cursor) node?.scrollIntoView({ block: "nearest" }); }} onMouseEnter={() => onCursorChange(index)} onClick={item.run}><span className={item.group === "REFLECTIONS" ? "command-mood" : ""}>{item.icon}</span><strong>{item.label}</strong>{item.group === "QUICK ACTIONS" ? <kbd>{item.hint}</kbd> : <small>{item.hint}</small>}</button></Fragment>)}{!items.length && <div className="command-empty">No command, task, or reflection matches “{query}”.</div>}</div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span>Shortcut <kbd>⌘ K</kbd> or <kbd>/</kbd></span></footer>
    </section>
  </div>;
}
