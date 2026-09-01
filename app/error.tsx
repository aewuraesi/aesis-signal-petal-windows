"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Signal Petal page error", error); }, [error]);
  return <main className="error-page"><section role="alert"><span aria-hidden="true">✦</span><h1>Signal Petal hit a snag.</h1><p>Your saved work is untouched. Try this screen again, or return to the dashboard.</p><div><button type="button" onClick={reset}>Try again</button><Link href="/">Return to dashboard</Link></div>{error.digest && <small>Reference: {error.digest}</small>}</section></main>;
}
