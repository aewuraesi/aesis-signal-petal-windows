import TaskImage from "./TaskImage";

export default function ImageViewer({
  name,
  src,
  onClose,
}: {
  name: string;
  src: string;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop image-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        <button
          className="close"
          type="button"
          data-autofocus
          aria-label="Close image"
          onClick={onClose}
        >
          ×
        </button>
        <TaskImage src={src} alt={name} />
        <figcaption>{name}</figcaption>
      </section>
    </div>
  );
}
