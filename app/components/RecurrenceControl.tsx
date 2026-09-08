import type { Repeat } from "../backup";

export default function RecurrenceControl({ value, onChange }: { value?: Repeat; onChange: (repeat?: Repeat) => void }) {
  return <div className="field recurrence-field">
    <span>Does this come round again?</span>
    <div className="recurrence-row">
      <select value={value ? "repeat" : "once"} onChange={event => onChange(event.target.value === "repeat" ? { every: 1, unit: "month" } : undefined)}>
        <option value="once">No, it is a one-off</option>
        <option value="repeat">Yes, repeat it</option>
      </select>
      {value && <><label>Every<input aria-label="Repeat every" type="number" min="1" max="999" value={value.every} onChange={event => onChange({ ...value, every: Math.max(1, Number(event.target.value) || 1) })}/></label>
        <select aria-label="Repeat unit" value={value.unit} onChange={event => onChange({ ...value, unit: event.target.value as Repeat["unit"] })}>
          <option value="day">day(s)</option><option value="week">week(s)</option><option value="month">month(s)</option><option value="year">year(s)</option>
        </select></>}
    </div>
    <small>{value ? "The next round follows the due date, so finishing late does not move the rhythm." : ""}</small>
  </div>;
}
