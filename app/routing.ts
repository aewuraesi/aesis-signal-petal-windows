/* Where you are, in the address bar.

   A task already had its own address - /tasks/<id> - because a route file exists for
   it. The screens do not have route files, so a refresh on the diary served the app
   at "/" and dropped you back on the dashboard. Putting the screen in the HASH is
   what makes it survive a reload without needing a route file per screen, and it
   works the same whether this is served from a local machine or a static host.

   Sections REPLACE rather than push: switching tabs is not a journey, and stacking
   every tab click would bury the one thing the back button is genuinely wanted for -
   closing an open task, which /tasks/<id> already handles by pushing. */

export const SECTIONS = ["dashboard", "calendar", "metrics", "diary", "review", "settings"] as const;
export type Section = (typeof SECTIONS)[number];

const isSection = (value: string): value is Section => (SECTIONS as readonly string[]).includes(value);

/** The screen a hash names, or null when it names nothing this app knows. */
export const sectionFromHash = (hash: string): Section | null => {
  const name = hash.replace(/^#\/?/, "").trim().toLowerCase();
  return isSection(name) ? name : null;
};

/* The dashboard is the app's front door, so it gets the bare address rather than
   "#dashboard" - a link someone shares should be the short one. */
export const hashForSection = (section: Section) => (section === "dashboard" ? "" : `#${section}`);
