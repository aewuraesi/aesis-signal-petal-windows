export type DashboardCard =
  "all" | "mine" | "attention" | "resolved" | "check-in";
export type DashboardPrefs = {
  summary: boolean;
  focus: boolean;
  garden: boolean;
  cardOrder: DashboardCard[];
};
export const defaultDashboardPrefs: DashboardPrefs = {
  summary: true,
  focus: true,
  garden: true,
  cardOrder: ["all", "mine", "attention", "resolved", "check-in"],
};
const cardLabels: Record<DashboardCard, string> = {
  all: "All tasks",
  mine: "My actions",
  attention: "Needs attention",
  resolved: "Completed",
  "check-in": "Next check-in",
};

export default function DashboardPreferences({
  value,
  onChange,
}: {
  value: DashboardPrefs;
  onChange: (value: DashboardPrefs) => void;
}) {
  const choices: Array<["summary" | "focus" | "garden", string, string]> = [
    [
      "summary",
      "Detailed summary cards",
      "Show the second row of counts for the selected dashboard view.",
    ],
    ["focus", "Focus recommendations", "Show the ranked next-move panel."],
    ["garden", "Signal Garden", "Show the daily progress garden."],
  ];
  return (
    <article className="settings-card">
      <p className="eyebrow">DASHBOARD</p>
      <h2>Choose what you see</h2>
      {choices.map(([key, label, help]) => (
        <button
          className="settings-toggle"
          type="button"
          role="switch"
          aria-checked={value[key]}
          key={key}
          onClick={() => onChange({ ...value, [key]: !value[key] })}
        >
          <span>
            <strong>{label}</strong>
            <small>{help}</small>
          </span>
          <span
            className={`switch-track ${value[key] ? "is-on" : ""}`}
            aria-hidden="true"
          />
        </button>
      ))}
      <div className="dashboard-order">
        <strong>Card order</strong>
        <small>Drag the cards into the order you want.</small>
        {value.cardOrder.map((card) => (
          <button
            key={card}
            type="button"
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData("text/plain", card)
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const moved = event.dataTransfer.getData(
                "text/plain",
              ) as DashboardCard;
              if (!value.cardOrder.includes(moved) || moved === card) return;
              const next = value.cardOrder.filter((item) => item !== moved);
              next.splice(next.indexOf(card), 0, moved);
              onChange({ ...value, cardOrder: next });
            }}
          >
            <span aria-hidden="true">☷</span>
            {cardLabels[card]}
          </button>
        ))}
      </div>
    </article>
  );
}
