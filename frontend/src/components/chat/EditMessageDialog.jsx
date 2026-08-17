import Modal from "@/components/ui/Modal";
import { CopyPlus, Trash2 } from "lucide-preact";

const EditMessageDialog = ({ removedCount, isPending, onCancel, onCopy, onReplace }) => (
  <Modal isOpen={true} onClose={onCancel} title="Resend edited message">
    <p className="text-theme-text-muted mb-4 text-sm">
      {removedCount === 0
        ? "The edited message will be resent to the current model."
        : `${removedCount} later ${removedCount === 1 ? "message follows" : "messages follow"} this one.`}
    </p>

    <div className="space-y-1">
      <button
        type="button"
        onClick={onCopy}
        disabled={isPending}
        className="text-theme-text-muted hover:bg-theme-surface-strong hover:text-theme-text ease-snappy flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-75 disabled:opacity-50">
        <CopyPlus size={16} className="text-theme-primary mt-0.5 flex-shrink-0" />
        <span>
          <span className="text-theme-text block font-medium">Copy to new chat</span>
          <span className="text-xs">This chat stays as it is; the edit continues in a copy.</span>
        </span>
      </button>

      <button
        type="button"
        onClick={onReplace}
        disabled={isPending}
        className="text-theme-red hover:bg-theme-red/10 ease-snappy flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-75 disabled:opacity-50">
        <Trash2 size={16} className="mt-0.5 flex-shrink-0" />
        <span>
          <span className="block font-medium">Replace in this chat</span>
          <span className="text-theme-text-muted text-xs">
            Everything after this point is permanently deleted.
          </span>
        </span>
      </button>
    </div>
  </Modal>
);

export default EditMessageDialog;
