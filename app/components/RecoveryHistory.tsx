import type { RecoveryPoint } from "../recovery";

export default function RecoveryHistory({ points, onRestore }: { points: RecoveryPoint[]; onRestore: (point: RecoveryPoint) => void }) {
  return <div className="recovery-history">
    <div><strong>Automatic recovery history</strong><small>Signal Petal keeps one recovery point per day for the last seven active days in this browser. Downloaded backups remain the safest independent copy.</small></div>
    {points.length ? <div>{points.map(point => <button type="button" className="secondary" key={point.id} onClick={() => onRestore(point)}><span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(point.at))}</span><small>Restore this point</small></button>)}</div> : <small>The first recovery point will appear after your workspace is saved.</small>}
  </div>;
}
