import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Monitor,
  DoorOpen,
  Settings,
  Crown,
  Plus,
  Minus,
  Maximize,
  ArrowLeft,
  Download,
  History as HistoryIcon,
  Save,
  Check,
  LoaderCircle,
  X,
  Lock,
  Trash2,
  Move,
  RotateCcw,
  MousePointer2,
  Circle,
  Pencil,
  Router,
  Printer,
  Server,
  Wifi,
  Projector,
  Armchair,
  Square,
  Info,
  FileText,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import {
  canManageRoom,
  canEditAttribute,
  freshObject,
  identifier,
  resizeRoom,
  roomSchema,
  type Room,
  type Workspace,
  type LabObject,
  type Attribute,
  type History,
  type Note,
} from "../../lib/model";
import type { Api } from "../../lib/api";
const icons: Record<string, typeof Monitor> = {
  Monitor,
  DoorOpen,
  Settings,
  Router,
  Printer,
  Server,
  Wifi,
  Projector,
  Armchair,
  Square,
};
function ObjectIcon({ o, size = 24 }: { o: LabObject; size?: number }) {
  const Icon = icons[o.icon] || Settings;
  return (
    <span className="object-icon">
      <Icon size={size} />
      {o.kind === "master" && <Crown className="crown" size={11} />}
    </span>
  );
}
export default function Editor({
  room: initial,
  workspace: w,
  userId,
  service,
  fail,
  onReload,
}: {
  room: Room;
  workspace: Workspace;
  userId: string;
  service: Api;
  fail: (s: string) => void;
  onReload: () => Promise<void>;
}) {
  const [room, setRoom] = useState(initial),
    [selected, setSelected] = useState<string>(),
    [tool, setTool] = useState<LabObject["kind"] | "select">("select"),
    [zoom, setZoom] = useState(1),
    [saveState, setSaveState] = useState<
      "saved" | "saving" | "pending" | "error"
    >("saved"),
    [panel, setPanel] = useState<"attributes" | "notes">("attributes"),
    [showHistory, setShowHistory] = useState(false),
    [history, setHistory] = useState<History[]>([]),
    [resize, setResize] = useState(false),
    [resized, setResized] = useState<ReturnType<typeof resizeRoom>>(),
    [notes, setNotes] = useState<Note[]>([]),
    [noteText, setNoteText] = useState(""),
    [noteId, setNoteId] = useState<string>(),
    [noteScope, setNoteScope] = useState<"workspace" | "room" | "object">(
      "room",
    ),
    [move, setMove] = useState(false),
    [attrOpen, setAttrOpen] = useState(false),
    [rename, setRename] = useState(false),
    [busy, setBusy] = useState(false);
  const version = useRef(initial.version),
    current = useRef(initial),
    pending = useRef<{
      r: Room;
      label: string;
      confirm: boolean;
      attribute?: string;
    } | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    queue = useRef(Promise.resolve()),
    failed = useRef(false),
    mounted = useRef(true);
  const cells = new Map(room.objects.map((o) => [`${o.x}:${o.y}`, o]));
  const manage = canManageRoom(w.role, room, userId),
    object = room.objects.find((o) => o.id === selected),
    cell = Math.round(68 * zoom);
  useEffect(() => {
    current.current = initial;
    version.current = initial.version;
    setRoom(initial);
    failed.current = false;
    setSaveState("saved");
  }, [initial]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, []);
  async function reload() {
    if (pending.current || saveState === "error") {
      if (
        !confirm("Recarregar e descartar alterações locais ainda não salvas?")
      )
        return;
    }
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    await queue.current;
    await onReload();
  }
  function flush() {
    if (timer.current) clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return queue.current;
    pending.current = null;
    queue.current = queue.current.then(async () => {
      if (failed.current) return;
      mounted.current && setSaveState("saving");
      try {
        roomSchema.parse(next.r);
        let v;
        if (next.attribute) {
          const a = next.r.objects
            .flatMap((o) => o.attributes)
            .find((a) => a.id === next.attribute)!;
          v = await service.saveAttribute(a.id, a.value, version.current);
        } else
          v = await service.saveRoom(
            { ...next.r, version: version.current },
            next.label,
            next.confirm,
          );
        version.current = v;
        if (mounted.current) {
          setRoom((r) => ({ ...r, version: v }));
          setSaveState(pending.current ? "pending" : "saved");
        }
      } catch (e) {
        failed.current = true;
        if (mounted.current) setSaveState("error");
        fail(e instanceof Error ? e.message : String(e));
      }
    });
    return queue.current;
  }
  function update(
    next: Room,
    label: string,
    immediate = false,
    confirmDelete = false,
    attribute?: string,
  ) {
    if (failed.current) return;
    if (pending.current?.attribute && pending.current.attribute !== attribute)
      void flush();
    current.current = next;
    setRoom(next);
    pending.current = { r: next, label, confirm: confirmDelete, attribute };
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void flush();
    else timer.current = setTimeout(flush, 650);
  }
  function patchObject(
    fn: (o: LabObject) => LabObject,
    label = "Objeto atualizado",
    immediate = true,
  ) {
    if (!object) return;
    update(
      {
        ...current.current,
        objects: current.current.objects.map((o) =>
          o.id === object.id ? fn(o) : o,
        ),
      },
      label,
      immediate,
    );
  }
  function patchAttr(a: Attribute, value: Attribute["value"]) {
    if (!object) return;
    const next = {
      ...current.current,
      objects: current.current.objects.map((o) =>
        o.id === object.id
          ? {
              ...o,
              attributes: o.attributes.map((x) =>
                x.id === a.id ? { ...x, value } : x,
              ),
            }
          : o,
      ),
    };
    update(
      next,
      "Atributo atualizado",
      false,
      false,
      manage ? undefined : a.id,
    );
  }
  async function getNotes() {
    try {
      setNotes(await service.notes(w.id));
    } catch (e) {
      fail(String(e));
    }
  }
  useEffect(() => {
    void getNotes();
  }, [w.id]);
  useEffect(() => {
    setNoteId(undefined);
    setNoteText("");
    if (!selected && noteScope === "object") setNoteScope("room");
  }, [selected]);
  const scopedNotes = notes.filter((n) =>
    noteScope === "workspace"
      ? !n.room_id
      : noteScope === "room"
        ? n.room_id === room.id && !n.object_id
        : n.object_id === selected,
  );
  function clickCell(x: number, y: number) {
    const occupied = current.current.objects.find(
      (o) => o.x === x && o.y === y,
    );
    if (move && object) {
      if (occupied && occupied.id !== object.id) {
        fail("Esta célula já está ocupada.");
        return;
      }
      patchObject((o) => ({ ...o, x, y }), "Objeto movido");
      setMove(false);
      return;
    }
    if (occupied) {
      setSelected(occupied.id);
      setPanel("attributes");
      setNoteId(undefined);
      setNoteText("");
      return;
    }
    if (manage && tool !== "select") {
      const o = freshObject(tool, x, y);
      update(
        { ...current.current, objects: [...current.current.objects, o] },
        "Objeto adicionado",
        true,
      );
      setSelected(o.id);
    } else setSelected(undefined);
  }
  async function loadHistory() {
    await flush();
    try {
      setHistory(await service.history(w.id));
      setShowHistory(true);
    } catch (e) {
      fail(String(e));
    }
  }
  function exportRoom() {
    const { name, width, height, objects } = current.current;
    const blob = new Blob(
        [JSON.stringify({ name, width, height, objects }, null, 2)],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `vuxlab-${room.name.replace(/[^a-z0-9]/gi, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="editor-page">
      <div className="editor-heading">
        <div>
          <Link className="back-link" to={`/w/${w.id}`}>
            <ArrowLeft size={14} />
            Todas as salas
          </Link>
          <div className="row">
            <h1>{room.name}</h1>
            {manage && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setRename(true)}
                aria-label="Renomear sala"
              >
                <Pencil size={15} />
              </Button>
            )}
          </div>
          <p className="muted tiny">
            {room.width} × {room.height} células{" "}
            <span className="dot-separator">·</span> {room.objects.length}{" "}
            objetos <span className="dot-separator">·</span>{" "}
            {rolesLabel(w.role)}
          </p>
        </div>
        <div className="row wrap">
          <span className={`save-indicator ${saveState}`} role="status">
            {saveState === "saving" ? (
              <LoaderCircle size={14} className="spin" />
            ) : saveState === "error" ? (
              <Circle size={10} />
            ) : (
              <Check size={14} />
            )}
            {
              {
                saved: "Tudo salvo",
                saving: "Salvando…",
                pending: "Alterações pendentes",
                error: "Erro ao salvar",
              }[saveState]
            }
          </span>
          <Button size="sm" variant="outline" onClick={exportRoom}>
            <Download size={15} />
            <span className="hide-small">Exportar</span>
          </Button>
          {w.role !== "public" && (
            <Button size="sm" variant="outline" onClick={loadHistory}>
              <HistoryIcon size={15} />
              <span className="hide-small">Histórico</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void flush()}
            disabled={
              saveState === "saved" ||
              saveState === "saving" ||
              saveState === "error"
            }
          >
            <Save size={15} />
            Salvar
          </Button>
        </div>
      </div>
      {saveState === "error" && (
        <div className="error-banner">
          O salvamento foi interrompido. Suas alterações locais continuam
          visíveis. <button onClick={reload}>Recarregar dados do banco</button>
        </div>
      )}
      <div className="editor-layout">
        <section className="canvas-section">
          <div className="editor-toolbar">
            <div className="tools">
              <button
                className={tool === "select" ? "tool active" : "tool"}
                title="Selecionar"
                aria-label="Selecionar"
                onClick={() => {
                  setTool("select");
                  setMove(false);
                }}
              >
                <MousePointer2 size={18} />
              </button>
              <span className="toolbar-divider" />
              {manage &&
                (["pc", "master", "door", "other"] as const).map((kind) => (
                  <button
                    className={tool === kind ? "tool active" : "tool"}
                    key={kind}
                    title={
                      {
                        pc: "Adicionar PC",
                        master: "Adicionar PC mestre",
                        door: "Adicionar porta",
                        other: "Adicionar objeto",
                      }[kind]
                    }
                    aria-label={
                      {
                        pc: "Adicionar PC",
                        master: "Adicionar PC mestre",
                        door: "Adicionar porta",
                        other: "Adicionar objeto",
                      }[kind]
                    }
                    onClick={() => {
                      setTool(kind);
                      setMove(false);
                    }}
                  >
                    <ObjectIcon
                      o={
                        {
                          kind,
                          icon:
                            kind === "door"
                              ? "DoorOpen"
                              : kind === "other"
                                ? "Settings"
                                : "Monitor",
                        } as LabObject
                      }
                      size={18}
                    />
                  </button>
                ))}
            </div>
            <div className="row">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPanel("notes")}
                aria-label="Abrir notas particulares"
              >
                <FileText size={16} />
              </Button>
              {manage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setResize(true)}
                >
                  <Maximize size={16} />
                  <span className="hide-small">Dimensões</span>
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={reload}
                aria-label="Recarregar sala"
              >
                <RotateCcw size={15} />
              </Button>
            </div>
          </div>
          <div className="canvas-scroll">
            <div
              className="map-wrap"
              style={{
                width: (room.width + 1) * cell + 60,
                minHeight: (room.height + 1) * cell + 35,
              }}
            >
              <div
                className="coordinate-row"
                style={{
                  gridTemplateColumns: `repeat(${room.width},${cell}px)`,
                  marginLeft: cell,
                }}
              >
                {Array.from({ length: room.width }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <div className="map-and-axis">
                <div
                  className="coordinate-col"
                  style={{
                    width: cell,
                    gridTemplateRows: `repeat(${room.height},${cell}px)`,
                  }}
                >
                  {Array.from({ length: room.height }, (_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <div
                  className={`room-grid ${move ? "moving" : ""}`}
                  style={{
                    gridTemplateColumns: `repeat(${room.width},${cell}px)`,
                    gridTemplateRows: `repeat(${room.height},${cell}px)`,
                  }}
                  role="group"
                  aria-label={`Mapa da sala ${room.name}`}
                >
                  {Array.from({ length: room.width * room.height }, (_, i) => {
                    const x = (i % room.width) + 1,
                      y = Math.floor(i / room.width) + 1,
                      o = cells.get(`${x}:${y}`);
                    return (
                      <button
                        key={`${x}:${y}`}
                        className={`grid-cell ${o ? "occupied " + o.color : ""} ${o?.id === selected ? "selected" : ""}`}
                        aria-label={
                          o
                            ? `${identifier(o)}, coluna ${x}, linha ${y}`
                            : `Célula vazia, coluna ${x}, linha ${y}`
                        }
                        aria-pressed={!!o && o.id === selected}
                        draggable={manage && !!o}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", o!.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (manage) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = o ? "none" : "move";
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!manage) return;
                          const id = e.dataTransfer.getData("text/plain");
                          if (o) {
                            fail("A célula de destino já está ocupada.");
                            return;
                          }
                          if (!current.current.objects.some((a) => a.id === id))
                            return;
                          update(
                            {
                              ...current.current,
                              objects: current.current.objects.map((a) =>
                                a.id === id ? { ...a, x, y } : a,
                              ),
                            },
                            "Objeto movido",
                            true,
                          );
                          setSelected(id);
                        }}
                        onClick={() => clickCell(x, y)}
                      >
                        {o ? (
                          <>
                            <ObjectIcon o={o} size={Math.round(24 * zoom)} />
                            {zoom >= 0.7 && <span>{identifier(o)}</span>}
                          </>
                        ) : (
                          <Plus className="cell-add" size={17} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <footer className="canvas-footer">
            {move && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMove(false)}
              >
                Cancelar movimento
              </Button>
            )}
            <span className="row tiny muted">
              <Info size={14} />
              {move
                ? "Escolha uma célula vazia como destino"
                : tool === "select"
                  ? "Selecione um objeto para ver os detalhes"
                  : "Clique em uma célula vazia para adicionar"}
            </span>
            <div className="row zoom-tools">
              <button
                aria-label="Diminuir zoom"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              >
                <Minus size={15} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Aumentar zoom"
                onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
              >
                <Plus size={15} />
              </button>
              <button aria-label="Restaurar zoom" onClick={() => setZoom(1)}>
                <Maximize size={14} />
              </button>
            </div>
          </footer>
          <div className="canvas-legend">
            <span>
              <span className="legend-cell" />
              Célula vazia
            </span>
            <span>
              <span className="legend-cell gray" />
              Cinza
            </span>
            <span>
              <span className="legend-cell green" />
              Verde
            </span>
            <small>Cores definidas pela equipe</small>
          </div>
        </section>
        <aside
          className={`properties ${selected || panel === "notes" ? "properties-open" : ""} ${move ? "moving-panel" : ""}`}
        >
          <div className="properties-top">
            <h3>{object ? "Detalhes do objeto" : "Detalhes da sala"}</h3>
            <Button
              className="mobile-only"
              variant="ghost"
              size="icon"
              aria-label="Fechar painel"
              onClick={() => {
                setSelected(undefined);
                setPanel("attributes");
              }}
            >
              <X size={18} />
            </Button>
          </div>
          <div className="tabs">
            <button
              className={panel === "attributes" ? "active" : ""}
              onClick={() => setPanel("attributes")}
            >
              Atributos
            </button>
            <button
              className={panel === "notes" ? "active" : ""}
              onClick={() => {
                setPanel("notes");
                void getNotes();
              }}
            >
              <Lock size={13} />
              Minhas notas
            </button>
          </div>
          <div className="properties-scroll">
            {panel === "attributes" ? (
              object ? (
                <>
                  <div className="object-summary">
                    <div className={`large-object-icon ${object.color}`}>
                      <ObjectIcon o={object} size={30} />
                    </div>
                    <div>
                      <h3>{identifier(object)}</h3>
                      <span className="muted tiny">
                        {
                          {
                            pc: "Computador",
                            master: "Computador mestre",
                            door: "Porta",
                            other: "Objeto",
                          }[object.kind]
                        }{" "}
                        · ({object.x}, {object.y})
                      </span>
                    </div>
                  </div>
                  <div className="property-content">
                    <div className="section-heading">
                      <span className="eyebrow">ATRIBUTOS COMPARTILHADOS</span>
                      {manage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Adicionar atributo"
                          onClick={() => setAttrOpen(true)}
                        >
                          <Plus size={16} />
                        </Button>
                      )}
                    </div>
                    {object.attributes.map((a) => (
                      <div className="attribute" key={a.id}>
                        <div className="row between">
                          <label htmlFor={`attr-${a.id}`}>{a.name}</label>
                          {!canEditAttribute(w.role, room, userId, a) && (
                            <Lock size={12} className="muted" />
                          )}
                        </div>
                        <AttributeInput
                          a={a}
                          disabled={
                            !canEditAttribute(w.role, room, userId, a) ||
                            saveState === "error"
                          }
                          onChange={(value) => patchAttr(a, value)}
                        />
                        {manage ? (
                          <div className="attribute-permissions">
                            <select
                              aria-label={`Visibilidade de ${a.name}`}
                              value={a.visibility}
                              onChange={(e) =>
                                patchObject(
                                  (o) => ({
                                    ...o,
                                    attributes: o.attributes.map((x) =>
                                      x.id === a.id
                                        ? {
                                            ...x,
                                            visibility: e.target
                                              .value as Attribute["visibility"],
                                          }
                                        : x,
                                    ),
                                  }),
                                  "Permissão alterada",
                                )
                              }
                            >
                              <option value="public">Visível: público</option>
                              <option value="teacher">Visível: docente</option>
                              <option value="admin">
                                Visível: administrativo
                              </option>
                            </select>
                            <select
                              aria-label={`Edição de ${a.name}`}
                              value={a.edit_role}
                              onChange={(e) =>
                                patchObject(
                                  (o) => ({
                                    ...o,
                                    attributes: o.attributes.map((x) =>
                                      x.id === a.id
                                        ? {
                                            ...x,
                                            edit_role: e.target
                                              .value as Attribute["edit_role"],
                                          }
                                        : x,
                                    ),
                                  }),
                                  "Permissão alterada",
                                )
                              }
                            >
                              <option value="teacher">Edita: docente</option>
                              <option value="admin">
                                Edita: administrador
                              </option>
                            </select>
                            <button
                              aria-label={`Excluir atributo ${a.name}`}
                              onClick={() => {
                                if (confirm(`Excluir o atributo “${a.name}”?`))
                                  patchObject(
                                    (o) => ({
                                      ...o,
                                      attributes: o.attributes.filter(
                                        (x) => x.id !== a.id,
                                      ),
                                    }),
                                    "Atributo excluído",
                                  );
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <small className="tiny muted">
                            {a.visibility === "public"
                              ? "Público"
                              : "Docentes e administradores"}
                          </small>
                        )}
                      </div>
                    ))}
                    {manage && (
                      <>
                        <div className="property-divider" />
                        <label>
                          Ícone
                          <select
                            value={object.icon}
                            onChange={(e) =>
                              patchObject((o) => ({
                                ...o,
                                icon: e.target.value,
                              }))
                            }
                          >
                            {Object.keys(icons).map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </label>
                        <label>Cor do objeto</label>
                        <div className="row">
                          <button
                            className={`color-choice gray ${object.color === "gray" ? "chosen" : ""}`}
                            onClick={() =>
                              patchObject((o) => ({ ...o, color: "gray" }))
                            }
                          >
                            Cinza
                          </button>
                          <button
                            className={`color-choice green ${object.color === "green" ? "chosen" : ""}`}
                            onClick={() =>
                              patchObject((o) => ({ ...o, color: "green" }))
                            }
                          >
                            Verde
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="property-empty">
                  <MousePointer2 size={32} />
                  <h3>Explore seu espaço</h3>
                  <p>
                    Selecione um objeto no mapa para consultar seus atributos.
                  </p>
                  <Button variant="outline" onClick={() => setPanel("notes")}>
                    <FileText size={16} />
                    Notas particulares
                  </Button>
                  {manage && (
                    <Button
                      variant="ghost"
                      className="danger-text"
                      onClick={async () => {
                        if (
                          !confirm(
                            `Excluir a sala “${room.name}”, todos os objetos e notas vinculadas?`,
                          )
                        )
                          return;
                        await flush();
                        if (failed.current) return;
                        try {
                          await service.deleteRoom({
                            ...current.current,
                            version: version.current,
                          });
                          await onReload();
                        } catch (e) {
                          fail(String(e));
                        }
                      }}
                    >
                      <Trash2 size={15} />
                      Excluir sala
                    </Button>
                  )}
                </div>
              )
            ) : (
              <div className="property-content">
                <p className="notice tiny">
                  <Lock size={14} /> Somente você pode acessar estas notas,
                  inclusive em Workspaces administrados por outras pessoas.
                </p>
                <label>
                  Vincular nota a
                  <select
                    value={noteScope}
                    onChange={(e) => {
                      setNoteScope(e.target.value as typeof noteScope);
                      setNoteId(undefined);
                      setNoteText("");
                    }}
                  >
                    <option value="workspace">Workspace</option>
                    <option value="room">Esta sala</option>
                    {object && (
                      <option value="object">{identifier(object)}</option>
                    )}
                  </select>
                </label>
                {scopedNotes.map((n) => (
                  <div className="note-card" key={n.id}>
                    <p>{n.body}</p>
                    <div className="row">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setNoteId(n.id);
                          setNoteText(n.body);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Excluir esta nota particular?")) return;
                          try {
                            await service.deleteNote(n.id);
                            await getNotes();
                          } catch (e) {
                            fail(String(e));
                          }
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))}
                <label>
                  {noteId ? "Editar nota" : "Nova nota"}
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    maxLength={20000}
                    rows={5}
                    placeholder="Uma observação só sua…"
                  />
                </label>
                <Button
                  disabled={
                    !noteText.trim() ||
                    busy ||
                    (noteScope === "object" && !object)
                  }
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await flush();
                      if (failed.current)
                        throw Error(
                          "Resolva o erro de salvamento antes de salvar a nota.",
                        );
                      await service.saveNote(
                        {
                          workspace_id: w.id,
                          room_id: noteScope === "workspace" ? null : room.id,
                          object_id: noteScope === "object" ? selected! : null,
                          body: noteText,
                        },
                        noteId,
                      );
                      setNoteText("");
                      setNoteId(undefined);
                      await getNotes();
                    } catch (e) {
                      fail(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Lock size={14} />
                  Salvar nota
                </Button>
              </div>
            )}
          </div>
          {manage && object && (
            <div
              className="properties-actions"
              aria-label={`Ações de ${identifier(object)}`}
            >
              <Button
                variant="outline"
                disabled={saveState === "error"}
                aria-pressed={move}
                onClick={() => {
                  setMove(!move);
                  setTool("select");
                }}
              >
                <Move size={15} />
                {move ? "Cancelar" : "Mover"}
              </Button>
              <Button
                variant="destructive"
                disabled={saveState === "error"}
                onClick={() => {
                  if (
                    !confirm(
                      `Excluir “${identifier(object)}” e seus atributos? Notas vinculadas também serão excluídas.`,
                    )
                  )
                    return;
                  update(
                    {
                      ...current.current,
                      objects: current.current.objects.filter(
                        (o) => o.id !== object.id,
                      ),
                    },
                    "Objeto excluído",
                    true,
                    true,
                  );
                  setSelected(undefined);
                  setMove(false);
                }}
              >
                <Trash2 size={15} />
                {object.kind === "pc" || object.kind === "master"
                  ? "Excluir computador"
                  : object.kind === "door"
                    ? "Excluir porta"
                    : "Excluir objeto"}
              </Button>
            </div>
          )}
        </aside>
      </div>
      <Dialog
        open={resize}
        onOpenChange={(v) => {
          setResize(v);
          setResized(undefined);
        }}
        title="Redimensionar sala"
        description="A âncora define o canto que mantém sua posição relativa."
      >
        {!resized ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setResized(
                resizeRoom(
                  current.current,
                  Number(f.get("width")),
                  Number(f.get("height")),
                  String(f.get("anchor")),
                ),
              );
            }}
          >
            <div className="form-grid">
              <label>
                Largura
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  name="width"
                  defaultValue={room.width}
                />
              </label>
              <label>
                Altura
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  name="height"
                  defaultValue={room.height}
                />
              </label>
            </div>
            <label>
              Canto de ancoragem
              <select name="anchor">
                <option value="top-left">Superior esquerdo</option>
                <option value="top-right">Superior direito</option>
                <option value="bottom-left">Inferior esquerdo</option>
                <option value="bottom-right">Inferior direito</option>
              </select>
            </label>
            <Button>Revisar alterações</Button>
          </form>
        ) : (
          <div>
            <p>
              Nova grade:{" "}
              <strong>
                {resized.room.width} × {resized.room.height}
              </strong>
            </p>
            {resized.removed.length ? (
              <div className="notice danger-text">
                <strong>
                  {resized.removed.length} objeto(s) serão excluídos:
                </strong>
                <ul>
                  {resized.removed.map((o) => (
                    <li key={o.id}>
                      {identifier(o)} · nova posição ({o.x}, {o.y})
                    </li>
                  ))}
                </ul>
                <p>
                  As notas particulares vinculadas aos objetos serão perdidas e
                  não serão restauradas pelo histórico.
                </p>
              </div>
            ) : (
              <p>Nenhum objeto será excluído.</p>
            )}
            <div className="row">
              <Button variant="outline" onClick={() => setResized(undefined)}>
                Voltar
              </Button>
              <Button
                variant={resized.removed.length ? "destructive" : "default"}
                onClick={() => {
                  update(resized.room, "Sala redimensionada", true, true);
                  setResize(false);
                  setResized(undefined);
                  if (resized.removed.some((o) => o.id === selected))
                    setSelected(undefined);
                }}
              >
                Confirmar{resized.removed.length ? " e excluir objetos" : ""}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        open={showHistory}
        onOpenChange={setShowHistory}
        title="Histórico de alterações"
        description="Reversões verificam as permissões atuais e são bloqueadas se houver alterações posteriores na sala."
      >
        <div className="history-list">
          {!history.length && (
            <p className="muted">Nenhuma alteração registrada.</p>
          )}
          {history.map((h) => (
            <div className="history-item" key={h.id}>
              <div>
                <strong>{h.label}</strong>
                <p className="tiny muted">
                  {new Date(h.created_at).toLocaleString("pt-BR")} ·{" "}
                  {h.actor_id === userId ? "Você" : h.actor_id.slice(0, 8)}
                </p>
                <details>
                  <summary>Ver estados compartilhados</summary>
                  <pre>
                    {JSON.stringify(
                      { antes: h.before, depois: h.after },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  history.some(
                    (x) =>
                      x.room_id === h.room_id &&
                      x.result_version > h.result_version,
                  )
                }
                onClick={async () => {
                  if (
                    !confirm(
                      "Desfazer esta alteração? Notas particulares excluídas não serão restauradas.",
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await service.undo(h.id);
                    setShowHistory(false);
                    await onReload();
                  } catch (e) {
                    fail(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RotateCcw size={13} />
                Desfazer
              </Button>
            </div>
          ))}
        </div>
      </Dialog>
      <Dialog open={attrOpen} onOpenChange={setAttrOpen} title="Novo atributo">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              type = f.get("type") as Attribute["type"];
            patchObject(
              (o) => ({
                ...o,
                attributes: [
                  ...o.attributes,
                  {
                    id: crypto.randomUUID(),
                    name: String(f.get("name")).trim(),
                    type,
                    value:
                      type === "text"
                        ? ""
                        : type === "number"
                          ? 0
                          : type === "boolean"
                            ? false
                            : [],
                    visibility: f.get("visibility") as Attribute["visibility"],
                    edit_role: f.get("edit_role") as Attribute["edit_role"],
                  },
                ],
              }),
              "Atributo criado",
            );
            setAttrOpen(false);
          }}
        >
          <label>
            Nome
            <input name="name" maxLength={100} required />
          </label>
          <label>
            Tipo
            <select name="type">
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="boolean">Booleano</option>
              <option value="list">Lista</option>
            </select>
          </label>
          <label>
            Visibilidade
            <select name="visibility">
              <option value="public">Público</option>
              <option value="teacher">Docente</option>
              <option value="admin">Administrativo</option>
            </select>
          </label>
          <label>
            Permissão de edição
            <select name="edit_role">
              <option value="teacher">Docente</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <Button>Adicionar atributo</Button>
        </form>
      </Dialog>
      <Dialog open={rename} onOpenChange={setRename} title="Renomear sala">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update(
              {
                ...current.current,
                name: String(new FormData(e.currentTarget).get("name")).trim(),
              },
              "Sala renomeada",
              true,
            );
            setRename(false);
          }}
        >
          <label>
            Nome
            <input
              name="name"
              defaultValue={room.name}
              required
              maxLength={100}
            />
          </label>
          <Button>Salvar nome</Button>
        </form>
      </Dialog>
    </main>
  );
}
function rolesLabel(role: string) {
  return role === "admin"
    ? "Administrador"
    : role === "teacher"
      ? "Docente"
      : "Público";
}
function AttributeInput({
  a,
  disabled,
  onChange,
}: {
  a: Attribute;
  disabled: boolean;
  onChange: (v: Attribute["value"]) => void;
}) {
  if (a.type === "boolean")
    return (
      <label className="checkbox-label">
        <input
          id={`attr-${a.id}`}
          type="checkbox"
          checked={!!a.value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {a.value ? "Sim" : "Não"}
      </label>
    );
  if (a.type === "list") {
    const items = Array.isArray(a.value) ? a.value : [];
    const setItem = (i: number, v: Attribute["value"]) =>
      onChange(items.map((item, n) => (n === i ? v : item)));
    return (
      <div className="list-attribute" id={`attr-${a.id}`} aria-label={a.name}>
        {items.length === 0 && <p className="tiny muted">Nenhum registro.</p>}
        {items.map((item, i) => (
          <div className="list-item" key={i}>
            <div className="grow">
              {item !== null &&
              typeof item === "object" &&
              !Array.isArray(item) ? (
                Object.entries(item).map(([k, v]) => (
                  <label key={k}>
                    {k === "nome" ? "Nome" : k === "turma" ? "Turma" : k}
                    <input
                      aria-label={`${a.name}, registro ${i + 1}, ${k}`}
                      disabled={disabled || typeof v === "object"}
                      type={typeof v === "number" ? "number" : "text"}
                      value={
                        typeof v === "object"
                          ? JSON.stringify(v)
                          : String(v ?? "")
                      }
                      onChange={(e) =>
                        setItem(i, {
                          ...item,
                          [k]:
                            typeof v === "number"
                              ? Number(e.target.value)
                              : typeof v === "boolean"
                                ? e.target.value === "true"
                                : e.target.value,
                        })
                      }
                    />
                  </label>
                ))
              ) : (
                <input
                  aria-label={`${a.name}, item ${i + 1}`}
                  disabled={disabled || typeof item === "object"}
                  value={
                    typeof item === "object"
                      ? JSON.stringify(item)
                      : String(item ?? "")
                  }
                  onChange={(e) => setItem(i, e.target.value)}
                />
              )}
            </div>
            {!disabled && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover registro ${i + 1} de ${a.name}`}
                onClick={() => onChange(items.filter((_, n) => n !== i))}
              >
                <X size={13} />
              </Button>
            )}
          </div>
        ))}
        {!disabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange([
                ...items,
                a.name === "Utilizadores" ? { nome: "", turma: "" } : "",
              ])
            }
          >
            <Plus size={13} />
            Adicionar registro
          </Button>
        )}
      </div>
    );
  }
  return (
    <input
      id={`attr-${a.id}`}
      type={a.type === "number" ? "number" : "text"}
      step="any"
      value={String(a.value)}
      disabled={disabled}
      maxLength={a.type === "text" ? 20000 : undefined}
      onChange={(e) => {
        if (a.type === "number") {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            onChange(e.target.valueAsNumber);
        } else onChange(e.target.value);
      }}
    />
  );
}
