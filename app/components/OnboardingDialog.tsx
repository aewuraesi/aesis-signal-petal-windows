import Petal from "../petal";

type OnboardingDialogProps = {
  step: number;
  onStepChange: (step: number) => void;
  onFinish: (action?: "create" | "check-in") => void;
};

const titles = ["Capture what needs attention", "Give the work a next move", "Let Focus now rank the queue", "Close the day deliberately"];
const descriptions = ["Start with one real issue, handoff, task, or risk you are carrying.", "An owner, current action, and expected update turn a note into something the app can protect.", "Overdue work, missing ETAs, and unclear actions rise automatically—with reversible actions beside them.", "The daily check-in records movement, what can wait, and the capacity tomorrow’s plan should respect."];
const actions = ["Log a signal", "Name the next move", "Work the ranked queue", "Save the daily brief"];
const fields = ["Title · context · owner", "Action · ETA · follow-up people", "Follow up · reschedule · handle", "Movement · boundaries · capacity"];

export default function OnboardingDialog({ step, onStepChange, onFinish }: OnboardingDialogProps) {
  return <div className="modal-backdrop onboarding-backdrop" role="presentation">
    <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <button className="onboarding-skip" type="button" onClick={() => onFinish()}>Skip for now</button>
      <span className="profile-mark"><Petal size={31}/></span><p className="eyebrow">YOUR FIRST SIGNAL LOOP</p>
      <h2 id="onboarding-title">{titles[step]}</h2><p>{descriptions[step]}</p>
      <div className="onboarding-visual"><span>{step + 1}</span><div><strong>{actions[step]}</strong><small>{fields[step]}</small></div></div>
      <div className="onboarding-dots">{titles.map((_, index) => <button key={index} type="button" className={index === step ? "is-current" : ""} aria-label={`Onboarding step ${index + 1}`} onClick={() => onStepChange(index)}/>)}</div>
      <div className="onboarding-actions">{step > 0 && <button className="secondary" type="button" onClick={() => onStepChange(step - 1)}>Back</button>}{step < 3 ? <button className="primary" type="button" onClick={() => onStepChange(step + 1)}>Next</button> : <><button className="secondary" type="button" onClick={() => onFinish("check-in")}>Try the check-in</button><button className="primary" type="button" onClick={() => onFinish("create")}>Log my first signal</button></>}</div>
    </section>
  </div>;
}
