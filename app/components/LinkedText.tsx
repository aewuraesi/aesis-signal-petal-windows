import { Fragment } from "react";
import { splitLinks } from "../links";

/* Written text with its links made clickable, and nothing else changed.

   `noopener noreferrer` on every one: these are addresses the writer pasted from a
   log or a ticket, and the new tab should not be handed a reference back to the app. */
export default function LinkedText({ text }: { text: string }) {
  const parts = splitLinks(text);
  if (parts.length === 1 && parts[0].kind === "text") return <>{text}</>;
  return <>{parts.map((part, index) => part.kind === "link"
    ? <a key={index} className="in-text-link" href={part.value} target="_blank" rel="noopener noreferrer">{part.value}</a>
    : <Fragment key={index}>{part.value}</Fragment>)}</>;
}
