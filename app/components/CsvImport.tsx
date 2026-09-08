import { useMemo, useState, type ChangeEvent } from "react";
import { parseCsv, guessColumns, rowsToIssues, COLUMN_FIELDS, type ColumnMap, type ColumnField } from "../csv";
import type { Issue, Lane, Status } from "../backup";

/* Bringing a list of work in from a spreadsheet.

   Three steps, in the order a person actually needs them: show me what you read,
   let me say which column is which, then tell me exactly what will happen. The
   preview is not decoration - a mis-mapped column silently turns owners into
   statuses, and the only moment that is cheap to notice is before importing. */

type CsvImportProps = {
  statuses: Status[];
  defaultOwner: string;
  onImport: (issues: Issue[]) => void;
};

const SAMPLE_ROWS = 4;

export default function CsvImport({ statuses, defaultOwner, onImport }: CsvImportProps) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnMap>({});
  const [lane, setLane] = useState<Lane | "">("");
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState("");

  const rows = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const headings = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  /* The guess stands until the writer overrides something, then their mapping wins. */
  const columns = touched ? mapping : guessColumns(headings);
  const preview = useMemo(
    () => rowsToIssues(bodyRows, columns, { statuses, defaultOwner, lane: lane || undefined }),
    [bodyRows, columns, statuses, defaultOwner, lane],
  );

  const load = (value: string, name: string) => {
    setText(value);
    setFileName(name);
    setTouched(false);
    setMapping({});
    setMessage("");
  };

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try { load(await file.text(), file.name); }
    catch { setMessage("That file could not be read."); }
  }

  function setColumn(field: ColumnField, value: string) {
    setTouched(true);
    setMapping({ ...columns, [field]: value === "" ? undefined : Number(value) });
  }

  function runImport() {
    if (!preview.issues.length) return;
    onImport(preview.issues);
    setText("");
    setFileName("");
    setTouched(false);
    setMapping({});
  }

  return <div className="csv-import">
    <div><strong>Bring in a spreadsheet</strong><small>A .csv from a ticket export, a handover sheet, or anywhere else your work already lives. Nothing is added until you have seen what it read.</small></div>
    <div className="csv-source">
      <label className="file-button">Choose a .csv file<input type="file" accept=".csv,text/csv" onChange={chooseFile}/></label>
      <span>or</span>
      <textarea className="transfer-code" value={text} onChange={event => load(event.target.value, "pasted rows")} placeholder="Paste rows here, headings first" aria-label="Spreadsheet rows to import"/>
    </div>
    {message && <p className="csv-message" role="status">{message}</p>}
    {rows.length > 0 && <>
      <div className="csv-mapping">
        <p className="eyebrow">WHICH COLUMN IS WHICH</p>
        <div className="csv-mapping-grid">{COLUMN_FIELDS.map(({ field, label }) => <label key={field}>{label}{field === "title" && <em> required</em>}
          <select value={columns[field] ?? ""} onChange={event => setColumn(field, event.target.value)}>
            <option value="">Not in this file</option>
            {headings.map((heading, index) => <option key={index} value={index}>{heading.trim() || `Column ${index + 1}`}</option>)}
          </select>
        </label>)}</div>
        <label className="csv-lane">Import everything as
          <select value={lane} onChange={event => setLane(event.target.value as Lane | "")}>
            <option value="">Leave unsorted</option>
            <option value="professional">Professional</option>
            <option value="personal">Personal</option>
          </select>
          <small>Only used for rows where the file does not say. Unsorted work stays out of anything you paste into a work channel.</small>
        </label>
      </div>
      <div className="csv-preview">
        <p className="eyebrow">FIRST {Math.min(SAMPLE_ROWS, preview.issues.length)} OF {preview.issues.length}</p>
        <div className="csv-preview-scroll"><table>
          <thead><tr><th>Title</th><th>Owner</th><th>Status</th><th>Due</th></tr></thead>
          <tbody>{preview.issues.slice(0, SAMPLE_ROWS).map(issue => <tr key={issue.id}>
            <td>{issue.title}</td><td>{issue.owner}</td><td>{issue.status}</td><td>{issue.expected ? issue.expected.replace("T", " ") : "—"}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <div className="csv-actions">
        <small>{preview.issues.length} task{preview.issues.length === 1 ? "" : "s"} ready{preview.skipped.length ? `, ${preview.skipped.length} row${preview.skipped.length === 1 ? "" : "s"} skipped (${[...new Set(preview.skipped.map(item => item.reason))].join("; ")})` : ""}. Matching tasks are updated rather than added a second time.</small>
        <button className="primary" type="button" disabled={!preview.issues.length} onClick={runImport}>Import {preview.issues.length} task{preview.issues.length === 1 ? "" : "s"}{fileName ? ` from ${fileName}` : ""}</button>
      </div>
    </>}
  </div>;
}
