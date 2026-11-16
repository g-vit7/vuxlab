import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="modal-overlay" />
        <D.Content className="modal">
          <div className="row between">
            <D.Title>{title}</D.Title>
            <D.Close className="btn btn-ghost btn-icon" aria-label="Fechar">
              <X size={18} />
            </D.Close>
          </div>
          <D.Description className={description ? "muted" : "sr-only"}>
            {description || title}
          </D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
