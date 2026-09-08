export type OutboxRecord = {
  id: string;
  channel: "browser" | "email" | "web-push";
  kind: string;
  title: string;
  body: string;
  status: "queued" | "delivered" | "failed";
  queuedAt: number;
  deliveredAt?: number;
  failedAt?: number;
  error?: string;
};

export default function NotificationOutbox({
  records,
}: {
  records: OutboxRecord[];
}) {
  const recent = [...records]
    .sort((a, b) => b.queuedAt - a.queuedAt)
    .slice(0, 8);
  return (
    <section
      className="notification-outbox"
      aria-labelledby="notification-outbox-title"
    >
      <div>
        <h3 id="notification-outbox-title">Notification history</h3>
        <p>
          Local delivery record for this device. No external account is used.
        </p>
      </div>
      {!recent.length ? (
        <p className="empty-outbox">No notification attempts yet.</p>
      ) : (
        <ol>
          {recent.map((record) => (
            <li key={record.id}>
              <span className={`outbox-status is-${record.status}`}>
                {record.status}
              </span>
              <strong>{record.title}</strong>
              <small>
                {new Date(
                  record.deliveredAt ?? record.failedAt ?? record.queuedAt,
                ).toLocaleString()}{" "}
                · {record.channel}
              </small>
              {record.error && <small>{record.error}</small>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
