import { useState } from "react";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import {
  noteCategories,
  noteTitle,
  orderNotes,
  type Note,
  type NoteCategory,
  type NoteDraft,
  type NoteScope,
} from "../../lib/model";

export type NoteLocation = NoteScope & { label: string };
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const categoryKeys = Object.keys(noteCategories) as NoteCategory[];

export function noteLocalDate(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type Props = {
  notes: Note[];
  locations: NoteLocation[];
  authorLabel: (note: Note) => string;
  locationLabel?: (note: Note) => string;
  canEdit: (note: Note) => boolean;
  onSave: (draft: NoteDraft, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  fail: (message: string) => void;
};

type DraftState = { note?: Note; date: string };

export default function NoteCards({
  notes,
  locations,
  authorLabel,
  locationLabel,
  canEdit,
  onSave,
  onDelete,
  onResolve,
  fail,
}: Props) {
  const [archive, setArchive] = useState(false);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState<"" | NoteCategory>("");
  const [grouping, setGrouping] = useState<"flat" | "urgency" | "author">(
    "flat",
  );
  const [draft, setDraft] = useState<DraftState>();
  const [busy, setBusy] = useState(false);
  const sorted = orderNotes(notes).filter(
    (note) =>
      note.resolved === archive && (!category || note.category === category),
  );
  const groups = new Map<string, { title?: string; notes: Note[] }>();
  for (const note of sorted) {
    const title =
      grouping === "author"
        ? authorLabel(note)
        : grouping === "urgency" || category
          ? noteCategories[note.category]
          : undefined;
    const key =
      grouping === "author" ? (note.author_id ?? "unknown") : (title ?? "");
    const group = groups.get(key) ?? { title, notes: [] };
    group.notes.push(note);
    groups.set(key, group);
  }

  return (
    <section className="structured-notes" aria-label="Lista de notas">
      <div
        className="tabs notes-tabs note-status-tabs"
        aria-label="Status das notas"
      >
        <button
          type="button"
          className={!archive ? "active" : ""}
          aria-pressed={!archive}
          onClick={() => setArchive(false)}
        >
          Ativas
        </button>
        <button
          type="button"
          className={archive ? "active" : ""}
          aria-pressed={archive}
          onClick={() => setArchive(true)}
        >
          Arquivadas
        </button>
      </div>
      <span className="sr-only" role="status">
        {status}
      </span>
      <div className="note-controls">
        <label>
          Urgência
          <select
            name="note_category_filter"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            <option value="">Todas</option>
            {categoryKeys.map((key) => (
              <option key={key} value={key}>
                {noteCategories[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agrupar por
          <select
            name="note_grouping"
            value={grouping}
            onChange={(e) => setGrouping(e.target.value as typeof grouping)}
          >
            <option value="flat">Sem grupos</option>
            <option value="urgency">Urgência</option>
            <option value="author">Autor</option>
          </select>
        </label>
        {!archive && locations.length > 0 && (
          <Button
            size="sm"
            onClick={() =>
              setDraft({ date: noteLocalDate(new Date().toISOString()) })
            }
          >
            <Plus size={15} /> Nova nota
          </Button>
        )}
      </div>
      {sorted.length === 0 && (
        <p className="muted">
          {archive
            ? "Nenhuma nota arquivada."
            : "Nenhuma nota ativa para exibir."}
        </p>
      )}
      {[...groups].map(([key, group]) => (
        <section className="note-group" key={key}>
          {group.title && <h3>{group.title}</h3>}
          {group.notes.map((note) => (
            <details
              className={`structured-note ${note.category}`}
              key={note.id}
            >
              <summary>
                <span className="sr-only">
                  {noteCategories[note.category]}:{" "}
                </span>
                {note.resolved && <Check size={15} aria-label="Resolvida" />}
                <strong>{noteTitle(note)}</strong>
                {locationLabel && <small>{locationLabel(note)}</small>}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="structured-note-body">
                <p>{note.body}</p>
                <small className="muted">
                  {authorLabel(note)} ·{" "}
                  {note.noted_at
                    ? dateFormat.format(new Date(note.noted_at))
                    : "Data não informada"}
                </small>
                {canEdit(note) && (
                  <div className="row wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        const resolved = !note.resolved;
                        setBusy(true);
                        try {
                          await onResolve(note.id, resolved);
                          setStatus(
                            resolved
                              ? "Nota resolvida e arquivada."
                              : "Nota reaberta.",
                          );
                        } catch (error) {
                          fail(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {note.resolved ? (
                        <>
                          <RotateCcw size={14} /> Reabrir
                        </>
                      ) : (
                        <>
                          <Check size={14} /> Marcar como resolvida
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          note,
                          date: note.noted_at
                            ? noteLocalDate(note.noted_at)
                            : "",
                        })
                      }
                    >
                      <Pencil size={14} /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(`Excluir a nota “${noteTitle(note)}”?`))
                          return;
                        setBusy(true);
                        try {
                          await onDelete(note.id);
                        } catch (error) {
                          fail(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Trash2 size={14} /> Excluir
                    </Button>
                  </div>
                )}
              </div>
            </details>
          ))}
        </section>
      ))}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(undefined);
        }}
        title={draft?.note ? "Editar nota" : "Nova nota"}
      >
        {draft && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const location =
                draft.note ?? locations[Number(data.get("location") || 0)];
              if (!location) return;
              const title = String(data.get("title") ?? "").trim();
              const body = String(data.get("body") ?? "").trim();
              if (!title || !body) {
                fail("Preencha o título e o conteúdo.");
                return;
              }
              const date = String(data.get("noted_at") ?? "");
              setBusy(true);
              try {
                await onSave(
                  {
                    workspace_id: location.workspace_id,
                    room_id: location.room_id,
                    object_id: location.object_id,
                    title,
                    body,
                    category: data.get("category") as NoteCategory,
                    noted_at:
                      date && date !== draft.date
                        ? new Date(date).toISOString()
                        : draft.note
                          ? date
                            ? draft.note.noted_at
                            : null
                          : new Date().toISOString(),
                  },
                  draft.note?.id,
                );
                setDraft(undefined);
              } catch (error) {
                fail(error instanceof Error ? error.message : String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {!draft.note && locations.length > 1 && (
              <label>
                Vincular a
                <select name="location">
                  {locations.map((location, i) => (
                    <option key={i} value={i}>
                      {location.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Título
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={draft.note ? noteTitle(draft.note) : ""}
              />
            </label>
            <label>
              Conteúdo
              <textarea
                name="body"
                rows={5}
                required
                maxLength={Math.max(20000, draft.note?.body.length ?? 0)}
                defaultValue={draft.note?.body}
              />
            </label>
            <label>
              Categoria
              <select
                name="category"
                defaultValue={draft.note?.category ?? "reminder"}
              >
                {[...categoryKeys].reverse().map((key) => (
                  <option key={key} value={key}>
                    {noteCategories[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data e hora
              <input
                name="noted_at"
                type="datetime-local"
                defaultValue={draft.date}
              />
            </label>
            <Button disabled={busy}>
              {busy ? "Salvando…" : "Salvar nota"}
            </Button>
          </form>
        )}
      </Dialog>
    </section>
  );
}
