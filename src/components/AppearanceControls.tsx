import { useEffect, useId, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { modes, themes, type Appearance } from "../lib/appearance";
import { Button } from "./ui/button";

type AppearanceProps = {
  appearance: Appearance;
  busy: boolean;
  onChange: (value: Appearance) => Promise<void>;
};

export function AppearanceFields({
  appearance,
  busy,
  onChange,
}: AppearanceProps) {
  return (
    <>
      <label>
        Tema
        <select
          name="theme"
          value={appearance.theme}
          aria-disabled={busy}
          onChange={(event) => {
            if (busy) {
              event.currentTarget.value = appearance.theme;
              return;
            }
            void onChange({
              ...appearance,
              theme: event.target.value as Appearance["theme"],
            });
          }}
        >
          {Object.entries(themes).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Modo
        <select
          name="display_mode"
          value={appearance.mode}
          aria-disabled={busy}
          onChange={(event) => {
            if (busy) {
              event.currentTarget.value = appearance.mode;
              return;
            }
            void onChange({
              ...appearance,
              mode: event.target.value as Appearance["mode"],
            });
          }}
        >
          {Object.entries(modes).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function AppearanceShortcut(props: AppearanceProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      className="appearance-shortcut"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        type="button"
        size="sm"
        variant="outline"
        title="Aparência"
        aria-label="Aparência"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      >
        <Palette size={16} />
        <span className="appearance-label">Aparência</span>
      </Button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Opções de aparência"
          aria-busy={props.busy}
          className="appearance-options"
        >
          <AppearanceFields {...props} />
        </div>
      )}
    </div>
  );
}
