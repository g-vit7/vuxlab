import { useEffect, useState } from "react";
import { Lock, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import type { Api } from "../lib/api";
import type { Note } from "../lib/model";
export default function WorkspaceNotes({
  workspaceId,
  service,
  fail,
}: {
  workspaceId: string;
  service: Api;
  fail: (s: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [notes, setNotes] = useState<Note[]>([]),
    [text, setText] = useState(""),
    [id, setId] = useState<string>(),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setNotes((await service.notes(workspaceId)).filter((n) => !n.room_id));
    } catch (e) {
      fail(String(e));
    }
  }
  useEffect(() => {
    if (open) void refresh();
  }, [open, workspaceId]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Lock size={15} />
        Minhas notas
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Notas particulares do Workspace"
        description="Somente você pode ler estas notas. Elas não são incluídas em exportações ou histórico compartilhado."
      >
        {notes.map((n) => (
          <div className="note-card" key={n.id}>
            <p>{n.body}</p>
            <div className="row">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setId(n.id);
                  setText(n.body);
                }}
              >
                <Pencil size={13} />
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Excluir esta nota particular?")) return;
                  try {
                    await service.deleteNote(n.id);
                    if (id === n.id) {
                      setText("");
                      setId(undefined);
                    }
                    await refresh();
                  } catch (e) {
                    fail(String(e));
                  }
                }}
              >
                <Trash2 size={13} />
                Excluir
              </Button>
            </div>
          </div>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await service.saveNote(
                {
                  workspace_id: workspaceId,
                  room_id: null,
                  object_id: null,
                  body: text.trim(),
                },
                id,
              );
              setText("");
              setId(undefined);
              await refresh();
            } catch (e) {
              fail(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {id ? "Editar nota" : "Nova nota"}
            <textarea
              required
              maxLength={20000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </label>
          <div className="row">
            <Button disabled={busy || !text.trim()}>
              <Plus size={14} />
              Salvar nota
            </Button>
            {id && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setId(undefined);
                  setText("");
                }}
              >
                Cancelar edição
              </Button>
            )}
          </div>
        </form>
      </Dialog>
    </>
  );
}
