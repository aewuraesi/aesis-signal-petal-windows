"use client";

import { useId } from "react";

/* ---------------------------------------------------------------------------
   The Signal Petal mark.

   It used to be the ✦ character, set in whatever font each machine happened to
   pick — so its weight, width and optical centring changed per platform — and
   in an app called Signal Petal it read as a sparkle rather than a flower.
   This is five petals around a knocked-out centre, drawn once and reused
   wherever the mark appears.

   The centre is a mask rather than a filled dot so that whatever sits behind
   the mark shows through it: the tile's gradient in the sidebar, the page
   background when the mark sits inline in a heading. One drawing then stays
   correct across all ten themes in both light and dark, with no second colour
   to keep in sync.

   The petals overlap slightly at the base so the flower reads as solid before
   the centre is punched out — which is why this needs a mask and not an
   even-odd fill rule, since even-odd would knock holes in every overlap.
--------------------------------------------------------------------------- */

// Tip at the top, base just past the centre. Rotating it five times sweeps the bloom.
const PETAL = "M12 2.5C16.3 5.4 16.9 10 12 13.3C7.1 10 7.7 5.4 12 2.5Z";
const ANGLES = [0, 72, 144, 216, 288];

export default function Petal({ size = 24, className, label }: { size?: number; className?: string; label?: string }) {
  // Several marks share a page, and duplicate mask ids in one document collide.
  const maskId = `petal-eye-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={`petal-mark ${className ?? ""}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="#fff"/>
        <circle cx="12" cy="12" r="1.85" fill="#000"/>
      </mask>
      <g fill="currentColor" mask={`url(#${maskId})`}>
        {ANGLES.map(angle => <path key={angle} d={PETAL} transform={`rotate(${angle} 12 12)`}/>)}
      </g>
    </svg>
  );
}
