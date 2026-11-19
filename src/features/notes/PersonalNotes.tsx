import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Lock,
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowUpRight,
  NotebookPen,
} from "lucide-react";
import type { Api } from "../../lib/api";
import {
  identifier,
  type Note,
  type Room,
  type Workspace,
} from "../../lib/model";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
export default function PersonalNotes({
  service,
  spaces,
  fail,
}: {
  service: Api;
  spaces: Workspace[];
  fail: (s: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Note>(),
    [text, setText] = useState(""),
    [wid, setWid] = useState(""),
    [rid, setRid] = useState(""),
    [oid, setOid] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const [ns, rs] = await Promise.all([
        service.allNotes(),
        Promise.all(spaces.map((w) => service.rooms(w.id))),
      ]);
      setNotes(ns);
      setRooms(rs.flat());
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [service, spaces]);
  function context(n: Note) {
    const w = spaces.find((w) => w.id === n.workspace_id),
      r = rooms.find((r) => r.id === n.room_id),
      o = r?.objects.find((o) => o.id === n.object_id);
    return [
      w?.name || "Workspace",
      ...(n.room_id ? [r?.name || "Sala"] : []),
      ...(n.object_id ? [o ? identifier(o) : "Objeto"] : []),
    ].join(" / ");
  }
  function start(note?: Note) {
    setEditing(note);
    setText(note?.body || "");
    setWid(note?.workspace_id || filter || spaces[0]?.id || "");
    setRid(note?.room_id || "");
    setOid(note?.object_id || "");
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !wid || !text.trim()) return;
    setBusy(true);
    try {
      await service.saveNote(
        {
          workspace_id: editing?.workspace_id || wid,
          room_id: editing ? editing.room_id : rid || null,
          object_id: editing ? editing.object_id : oid || null,
          body: text.trim(),
        },
        editing?.id,
      );
      setOpen(false);
      await refresh();
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const visible = notes.filter(
    (n) =>
      (!filter || n.workspace_id === filter) &&
      `${n.body} ${context(n)}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <main className="page personal-notes-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU ESPAÇO PARTICULAR</span>
          <h1>
            Minhas notas<span className="accent">.</span>
          </h1>
          <p className="muted">
            Suas anotações de todos os Workspaces, salas e objetos em um só
            lugar.
          </p>
        </div>
        <Button onClick={() => start()} disabled={!spaces.length}>
          <Plus size={17} />
          Nova nota
        </Button>
      </div>
      <p className="notes-privacy">
        <Lock size={15} />
        Somente você pode acessar estas notas. Elas aparecem aqui enquanto você
        tiver acesso ao elemento vinculado.
      </p>
      <div className="notes-filters">
        <div className="search">
          <Search size={16} />
          <input
            name="note_search"
            aria-label="Buscar nas minhas notas"
            placeholder="Buscar nas notas ou no local…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          name="workspace_filter"
          aria-label="Filtrar notas por Workspace"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Todos os Workspaces</option>
          {spaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <span className="muted tiny">{visible.length} nota(s)</span>
      </div>
      {loading ? (
        <div className="empty" role="status">
          Carregando suas notas…
        </div>
      ) : loadError ? (
        <div className="empty">
          <p role="alert">{loadError}</p>
          <Button onClick={refresh}>Tentar novamente</Button>
        </div>
      ) : !visible.length ? (
        <div className="empty">
          <NotebookPen size={34} />
          <h3>
            {query || filter
              ? "Nenhuma nota encontrada"
              : "Um lugar para suas observações"}
          </h3>
          <p>
            {spaces.length
              ? "Crie uma nota e escolha o Workspace, sala ou objeto ao qual ela pertence."
              : "Crie ou participe de um Workspace para começar a anotar."}
          </p>
          {!spaces.length && (
            <Link className="text-button" to="/">
              Ver Workspaces
            </Link>
          )}
        </div>
      ) : (
        <div className="personal-notes-grid">
          {visible.map((n) => (
            <article className="personal-note" key={n.id}>
              <div className="note-context">
                <Lock size={13} />
                <span title={context(n)}>{context(n)}</span>
              </div>
              <p>{n.body}</p>
              <footer>
                <Link
                  to={
                    n.room_id
                      ? `/w/${n.workspace_id}/sala/${n.room_id}`
                      : `/w/${n.workspace_id}`
                  }
                  className="text-button"
                >
                  {n.room_id ? "Abrir sala" : "Abrir Workspace"}
                  <ArrowUpRight size={14} />
                </Link>
                <div className="row">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar nota: ${n.body.slice(0, 40)}`}
                    onClick={() => start(n)}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Excluir nota: ${n.body.slice(0, 40)}`}
                    onClick={async () => {
                      if (!confirm("Excluir esta nota particular?")) return;
                      try {
                        await service.deleteNote(n.id);
                        await refresh();
                      } catch (e) {
                        fail(String(e));
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        title={editing ? "Editar nota particular" : "Nova nota particular"}
        description="A nota fica visível somente para você e permanece vinculada ao local escolhido."
      >
        <form onSubmit={save}>
          {editing ? (
            <p className="notice tiny">{context(editing)}</p>
          ) : (
            <>
              <label>
                Workspace
                <select
                  required
                  name="workspace"
                  value={wid}
                  onChange={(e) => {
                    setWid(e.target.value);
                    setRid("");
                    setOid("");
                  }}
                >
                  {!wid && <option value="">Selecione um Workspace</option>}
                  {spaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sala
                <select
                  name="room"
                  value={rid}
                  onChange={(e) => {
                    setRid(e.target.value);
                    setOid("");
                  }}
                >
                  <option value="">Nota do Workspace</option>
                  {rooms
                    .filter((r) => r.workspace_id === wid)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              {rid && (
                <label>
                  Objeto
                  <select
                    name="object"
                    value={oid}
                    onChange={(e) => setOid(e.target.value)}
                  >
                    <option value="">Nota da sala</option>
                    {rooms
                      .find((r) => r.id === rid)
                      ?.objects.map((o) => (
                        <option key={o.id} value={o.id}>
                          {identifier(o)} · ({o.x}, {o.y})
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label>
            Texto da nota
            <textarea
              autoFocus
              required
              name="body"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={20000}
              rows={6}
              placeholder="O que você quer guardar?"
            />
          </label>
          <Button disabled={busy || !wid || !text.trim()}>
            <Lock size={14} />
            {busy ? "Salvando…" : "Salvar nota"}
          </Button>
        </form>
      </Dialog>
    </main>
  );
}
