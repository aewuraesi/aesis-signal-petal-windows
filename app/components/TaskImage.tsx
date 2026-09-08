/* eslint-disable @next/next/no-img-element -- see below */
/* A stored screenshot, drawn as a plain <img>.

   next/image exists to resize and cache images fetched over the network. These are
   data URLs held in this browser's own storage: there is nothing to fetch, nothing to
   cache, and no remote loader that could read them. It is also why the rule is turned
   off here, in a five-line component, rather than anywhere near the page. */

type TaskImageProps = { src: string; alt: string; className?: string };

export default function TaskImage({ src, alt, className }: TaskImageProps) {
  return <img className={className} src={src} alt={alt}/>;
}
