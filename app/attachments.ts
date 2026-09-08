/* Images attached to a task, and the limits that keep them affordable.

   Everything in this app lives in one browser's localStorage, which is a handful of
   megabytes for the whole workspace — tasks, diary, check-ins and all. A phone
   screenshot straight off the camera roll is 3 MB on its own and would fill that in
   two. So nothing is ever stored as it arrived: every image is drawn onto a canvas at
   a sane size, re-encoded, and only then kept.

   The numbers below are deliberately conservative. A screenshot of a dashboard or a
   stack trace has to stay READABLE, which is about resolution, not file size — 1600px
   on the long edge holds a full-width graph legibly and costs a fraction of the
   original. */

export const MAX_EDGE = 1600;
export const MAX_ATTACHMENTS_PER_TASK = 10;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
/* After re-encoding, not before: the check that matters is what will be stored. */
export const MAX_STORED_BYTES = 400 * 1024;
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5];

export type PreparedImage = { name: string; dataUrl: string; bytes: number };

/* A data URL's payload is base64, so its stored size is roughly its string length —
   which is the number that actually competes for the browser's quota. */
export const dataUrlBytes = (dataUrl: string) => dataUrl.length * 2;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = url;
  });

/** Downscales and re-encodes an image so it can be stored. Rejects with a plain reason. */
export const prepareImage = async (file: File): Promise<PreparedImage> => {
  if (!file.type.startsWith("image/"))
    throw new Error(`${file.name} is not an image.`);
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser would not let the image be resized.");
  context.drawImage(image, 0, 0, width, height);

  /* PNG screenshots of text re-encode badly as JPEG, so try WebP first where it is
     supported — it keeps sharp edges at a size JPEG cannot match. */
  const types = canvas.toDataURL("image/webp").startsWith("data:image/webp")
    ? ["image/webp", "image/jpeg"]
    : ["image/jpeg"];
  let best = "";
  for (const type of types) {
    for (const quality of QUALITY_STEPS) {
      const candidate = canvas.toDataURL(type, quality);
      if (!best || candidate.length < best.length) best = candidate;
      if (dataUrlBytes(candidate) <= MAX_STORED_BYTES)
        return {
          name: file.name,
          dataUrl: candidate,
          bytes: dataUrlBytes(candidate),
        };
    }
  }
  throw new Error(
    `${file.name} is too detailed to store even after resizing. A cropped screenshot of the part that matters will fit.`,
  );
};
