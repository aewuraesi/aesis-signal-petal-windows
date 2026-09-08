"use client";
import { useEffect, useState } from "react";
import type { Attachment } from "../backup";
import { readAttachment } from "../attachment-store";
import TaskImage from "./TaskImage";

export default function TaskAttachment({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: Attachment;
  onOpen: (src: string) => void;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState(attachment.dataUrl ?? "");
  const isImage = (attachment.mimeType ?? "image/legacy").startsWith("image/");
  useEffect(() => {
    if (attachment.dataUrl || attachment.storage !== "indexeddb") return;
    let objectUrl = "";
    let live = true;
    void readAttachment(attachment.id).then((blob) => {
      if (blob && live) {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      }
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment]);
  return (
    <figure className={isImage ? "" : "document-attachment"}>
      {isImage ? (
        <button
          type="button"
          disabled={!src}
          onClick={() => onOpen(src)}
          aria-label={`Open ${attachment.name}`}
        >
          {src && <TaskImage src={src} alt={attachment.name} />}
        </button>
      ) : (
        <a
          href={src || undefined}
          download={attachment.name}
          aria-disabled={!src}
        >
          <span aria-hidden="true">▤</span>
          <strong>{attachment.name}</strong>
          <small>{Math.max(1, Math.round(attachment.bytes / 1024))} KB</small>
        </a>
      )}
      <figcaption>
        <span title={attachment.name}>{attachment.name}</span>
        <button
          type="button"
          className="image-remove"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
        >
          ×
        </button>
      </figcaption>
    </figure>
  );
}
