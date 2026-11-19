import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  Monitor,
  DoorOpen,
  Settings,
  Crown,
  Plus,
  Minus,
  Maximize,
  Minimize,
  Hand,
  Crosshair,
  RotateCw,
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
  objectCells,
  fitsRoom,
  objectColors,
  type Room,
  type Workspace,
  type LabObject,
  type Attribute,
  type History,
  type Note,
} from "../../lib/model";
import type { Api } from "../../lib/api";
import { toView, fromView } from "./view";
const landscapeQuery =
  "(orientation: landscape) and (max-height: 560px) and (hover: none)";
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
  appearanceShortcut,
}: {
  room: Room;
  workspace: Workspace;
  userId: string;
  service: Api;
  fail: (s: string) => void;
  onReload: () => Promise<void>;
  appearanceShortcut: ReactNode;
}) {
  const [room, setRoom] = useState(initial),
    [selected, setSelected] = useState<string>(),
    [tool, setTool] = useState<LabObject["kind"] | "select">("select"),
    [zoom, setZoom] = useState(1),
    [saveState, setSaveState] = useState<
      "saved" | "saving" | "pending" | "error"
    >("saved"),
    [panel, setPanel] = useState<"attributes" | "notes" | "shared" | "room">(
      "attributes",
    ),
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
  const [turn, setTurn] = useState(0);
  const [viewReady, setViewReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(
    () => matchMedia(landscapeQuery).matches,
  );
  useEffect(() => {
    const query = matchMedia(landscapeQuery);
    const sync = () => setLandscape(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const [pan, setPan] = useState(false);
  const [panning, setPanning] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const scroll = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const spaceHeld = useRef(false);
  const centerPending = useRef(false);
  const roomCameraInitialized = useRef(false);
  const turnWrites = useRef(Promise.resolve());
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const skipClick = useRef(false);
  const resizeDrag = useRef<typeof size>(undefined);
  const dragged = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const cells = useMemo(
    () =>
      new Map(
        room.objects.flatMap((o) =>
          objectCells(o).map((key) => [key, o] as const),
        ),
      ),
    [room.objects],
  );
  const manage = canManageRoom(w.role, room, userId),
    object = room.objects.find((o) => o.id === selected),
    sharedNotes = object?.attributes.find(
      (a) => a.name === "Notas compartilhadas",
    ),
    cell = Math.round(68 * zoom);
  const viewWidth = turn % 2 ? room.height : room.width;
  const viewHeight = turn % 2 ? room.width : room.height;
  const preview = size && object ? { ...object, ...size } : undefined;
  function viewArea(o: LabObject) {
    const a = toView(o, room.width, room.height, turn);
    const b = toView(
      { x: o.x + (o.width ?? 1) - 1, y: o.y + (o.height ?? 1) - 1 },
      room.width,
      room.height,
      turn,
    );
    return {
      gridColumn: `${Math.max(1, Math.min(a.x, b.x))} / ${Math.min(viewWidth, Math.max(a.x, b.x)) + 1}`,
      gridRow: `${Math.max(1, Math.min(a.y, b.y))} / ${Math.min(viewHeight, Math.max(a.y, b.y)) + 1}`,
    };
  }

  useEffect(() => {
    let active = true;
    service
      .roomTurn(initial.id, userId)
      .then((value) => {
        if (active) {
          setTurn(value);
          setViewReady(true);
        }
      })
      .catch((error) => {
        if (active) fail(String(error));
      });
    return () => {
      active = false;
    };
  }, [initial.id, userId, service]);

  function orient(value: number) {
    setTurn(value);
    turnWrites.current = turnWrites.current
      .then(() => service.saveRoomTurn(initial.id, userId, value))
      .catch((error) => {
        if (mounted.current) fail(String(error));
      });
  }

  useEffect(() => {
    function change() {
      setFullscreen(document.fullscreenElement === document.documentElement);
    }
    function key(event: KeyboardEvent) {
      if (
        !event.defaultPrevented &&
        event.code === "Escape" &&
        !document.fullscreenElement &&
        !document.querySelector('[role="dialog"]')
      )
        setFullscreen(false);
      if (
        event.code !== "Space" ||
        !scroll.current?.contains(document.activeElement)
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button,input,textarea,select,a,[contenteditable]")
      )
        return;
      spaceHeld.current = true;
      event.preventDefault();
    }
    function release() {
      spaceHeld.current = false;
    }
    document.addEventListener("fullscreenchange", change);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", release);
      if (document.fullscreenElement === document.documentElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (fullscreen && !document.fullscreenElement) setFullscreen(false);
      else if (fullscreen) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreen(!fullscreen);
    }
  }

  function centerMap() {
    const canvas = scroll.current,
      map = grid.current;
    if (!canvas || !map) return;
    const master = room.objects
      .filter((o) => o.kind === "master")
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const focus = master
      ? toView(
          {
            x: master.x + ((master.width ?? 1) - 1) / 2,
            y: master.y + ((master.height ?? 1) - 1) / 2,
          },
          room.width,
          room.height,
          turn,
        )
      : { x: (viewWidth + 1) / 2, y: (viewHeight + 1) / 2 };
    const outer = canvas.getBoundingClientRect(),
      inner = map.getBoundingClientRect();
    canvas.scrollBy(
      inner.left - outer.left + (focus.x - 0.5) * cell - canvas.clientWidth / 2,
      inner.top - outer.top + (focus.y - 0.5) * cell - canvas.clientHeight / 2,
    );
  }

  useEffect(() => {
    if (!roomCameraInitialized.current) {
      roomCameraInitialized.current = true;
      if (scroll.current)
        scroll.current.scrollTo(
          Math.max(0, scroll.current.clientWidth / 2 - 45),
          Math.max(0, scroll.current.clientHeight / 2 - 20),
        );
    }
    if (centerPending.current) {
      centerPending.current = false;
      centerMap();
    }
  }, [zoom]);

  function canPlace(candidate: LabObject) {
    return (
      fitsRoom(candidate, room.width, room.height) &&
      objectCells(candidate).every(
        (key) => !cells.has(key) || cells.get(key)?.id === candidate.id,
      )
    );
  }

  function place(candidate: LabObject, label: string) {
    if (failed.current) return false;
    if (!manage || !canPlace(candidate)) {
      fail("A área precisa estar livre e dentro da grade.");
      return false;
    }
    update(
      {
        ...current.current,
        objects: current.current.objects.map((o) =>
          o.id === candidate.id
            ? {
                ...o,
                x: candidate.x,
                y: candidate.y,
                width: candidate.width,
                height: candidate.height,
              }
            : o,
        ),
      },
      label,
      true,
    );
    setSelected(candidate.id);
    return true;
  }

  function pointAt(clientX: number, clientY: number) {
    const rect = grid.current!.getBoundingClientRect();
    return fromView(
      {
        x: Math.floor((clientX - rect.left) / cell) + 1,
        y: Math.floor((clientY - rect.top) / cell) + 1,
      },
      room.width,
      room.height,
      turn,
    );
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary && event.pointerType === "touch") return;
    if (
      event.button !== 1 &&
      event.button !== 2 &&
      event.pointerType !== "touch" &&
      !(event.button === 0 && (pan || spaceHeld.current))
    )
      return;
    const canvas = event.currentTarget;
    skipClick.current = false;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: canvas.scrollLeft,
      top: canvas.scrollTop,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType !== "touch") event.preventDefault();
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 5) return;
    start.moved = true;
    setPanning(true);
    event.currentTarget.scrollTo(start.left - dx, start.top - dy);
  }

  function endPan(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    setPanning(false);
    skipClick.current = true;
    if (
      !start.moved &&
      event.pointerType === "touch" &&
      !pan &&
      event.type === "pointerup"
    ) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (target?.closest(".room-grid")) {
        const point = pointAt(event.clientX, event.clientY);
        clickCell(point.x, point.y);
      }
    }
    requestAnimationFrame(() => {
      skipClick.current = false;
    });
  }

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
    setSize(undefined);
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
    const occupied = cells.get(`${x}:${y}`);
    if (move && object) {
      if (place({ ...object, x, y }, "Objeto movido")) setMove(false);
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
      setPanel("attributes");
    } else {
      setSelected(undefined);
      setPanel("attributes");
    }
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
    <main
      className={`editor-page ${fullscreen ? "editor-fullscreen" : ""} ${landscape ? "editor-landscape" : ""} ${fullscreen || landscape ? "editor-floating" : ""} ${object || panel === "notes" || panel === "room" ? "has-properties" : ""}`}
    >
      <div className="editor-heading" role="region" aria-label="Ações da sala">
        <div className="room-heading-title">
          <Link className="back-link" to={`/w/${w.id}`}>
            <ArrowLeft size={14} />
            <span className="sr-only">Todas as salas</span>
          </Link>
          <div className="row">
            <h1 title={room.name}>{room.name}</h1>
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
        </div>
        <div className="row wrap room-heading-actions">
          <span className={`save-indicator ${saveState}`} role="status">
            {saveState === "saving" ? (
              <LoaderCircle size={14} className="spin" />
            ) : saveState === "error" ? (
              <Circle size={10} />
            ) : (
              <Check size={14} />
            )}
            <span className={landscape ? "sr-only" : undefined}>
              {
                {
                  saved: "Tudo salvo",
                  saving: "Salvando…",
                  pending: "Alterações pendentes",
                  error: "Erro ao salvar",
                }[saveState]
              }
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label="Exportar"
            onClick={exportRoom}
          >
            <Download size={15} />
            <span className="hide-small">Exportar</span>
          </Button>
          {w.role !== "public" && (
            <Button
              size="sm"
              variant="outline"
              aria-label="Histórico"
              onClick={loadHistory}
            >
              <HistoryIcon size={15} />
              <span className="hide-small">Histórico</span>
            </Button>
          )}
          {appearanceShortcut}
          <Button
            size="sm"
            aria-label="Salvar"
            onClick={() => void flush()}
            disabled={
              saveState === "saved" ||
              saveState === "saving" ||
              saveState === "error"
            }
          >
            <Save size={15} />
            <span className="save-button-label">Salvar</span>
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
              {manage && !object && (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Detalhes da sala"
                  aria-label="Detalhes da sala"
                  onClick={() =>
                    setPanel(panel === "attributes" ? "room" : "attributes")
                  }
                >
                  <Settings size={16} />
                </Button>
              )}
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
                  aria-label="Dimensões da sala"
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
          <div
            ref={scroll}
            className={`canvas-scroll ${pan ? "pan-tool" : ""} ${panning ? "panning" : ""}`}
            tabIndex={0}
            aria-label="Área do mapa. Use as setas para deslocar."
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              const dx =
                e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
              const dy =
                e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
              if (dx || dy) {
                e.preventDefault();
                e.currentTarget.scrollBy(dx * cell, dy * cell);
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onAuxClick={(e) => e.preventDefault()}
            onClickCapture={(e) => {
              if (skipClick.current || (pan && e.detail > 0))
                e.stopPropagation();
            }}
            onDragStartCapture={(e) => {
              if (gesture.current || pan || spaceHeld.current)
                e.preventDefault();
            }}
          >
            <div className="map-wrap room-map" style={{ width: "max-content" }}>
              <div
                className="coordinate-row"
                aria-hidden="true"
                style={{
                  gridTemplateColumns: `repeat(${viewWidth},${cell}px)`,
                }}
              >
                {Array.from({ length: viewWidth }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
              <div className="map-and-axis">
                <div
                  className="coordinate-col"
                  aria-hidden="true"
                  style={{
                    width: cell,
                    marginLeft: -cell,
                    gridTemplateRows: `repeat(${viewHeight},${cell}px)`,
                  }}
                >
                  {Array.from({ length: viewHeight }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
                <div
                  ref={grid}
                  className={`room-grid ${move ? "moving" : ""} ${zoom < 0.7 ? "map-compact" : ""}`}
                  style={{
                    gridTemplateColumns: `repeat(${viewWidth},${cell}px)`,
                    gridTemplateRows: `repeat(${viewHeight},${cell}px)`,
                  }}
                  role="group"
                  aria-label={`Mapa da sala ${room.name}`}
                  onDragOver={(e) => {
                    if (dragged.current) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    const origin = dragged.current;
                    if (!origin || !manage) return;
                    e.preventDefault();
                    const candidate = current.current.objects.find(
                      (o) => o.id === origin.id,
                    );
                    if (!candidate) return;
                    const point = pointAt(e.clientX, e.clientY);
                    if (
                      place(
                        {
                          ...candidate,
                          x: point.x - origin.dx,
                          y: point.y - origin.dy,
                        },
                        "Objeto movido",
                      )
                    )
                      setPanel("attributes");
                  }}
                >
                  {Array.from({ length: viewWidth * viewHeight }, (_, i) => {
                    const vx = (i % viewWidth) + 1,
                      vy = Math.floor(i / viewWidth) + 1;
                    const { x, y } = fromView(
                      { x: vx, y: vy },
                      room.width,
                      room.height,
                      turn,
                    );
                    const occupied = cells.has(`${x}:${y}`);
                    return occupied ? (
                      <div
                        key={i}
                        style={{ gridColumn: vx, gridRow: vy }}
                        className="map-tile"
                      />
                    ) : (
                      <button
                        key={i}
                        style={{ gridColumn: vx, gridRow: vy }}
                        className="map-tile grid-cell"
                        aria-label={`Célula vazia, coluna ${x}, linha ${y}`}
                        onClick={() => clickCell(x, y)}
                      >
                        <Plus className="cell-add" size={17} />
                      </button>
                    );
                  })}
                  {room.objects.map((o) => {
                    return (
                      <div
                        key={o.id}
                        className="map-object"
                        style={viewArea(o)}
                      >
                        <button
                          className={`grid-cell occupied ${o.color} ${o.id === selected ? "selected" : ""}`}
                          aria-label={`${identifier(o)}, coluna ${o.x}, linha ${o.y}`}
                          aria-pressed={o.id === selected}
                          draggable={manage && !pan}
                          onDragStart={(e) => {
                            const point = pointAt(e.clientX, e.clientY);
                            dragged.current = {
                              id: o.id,
                              dx: point.x - o.x,
                              dy: point.y - o.y,
                            };
                            e.dataTransfer.setData("text/plain", o.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            dragged.current = null;
                          }}
                          onClick={(e) => {
                            const point =
                              e.detail > 0 ? pointAt(e.clientX, e.clientY) : o;
                            clickCell(point.x, point.y);
                          }}
                        >
                          <ObjectIcon
                            o={o}
                            size={
                              zoom < 0.7
                                ? 15
                                : Math.min(28, Math.round(23 * zoom))
                            }
                          />
                          {zoom >= 0.7 && <span>{identifier(o)}</span>}
                        </button>
                        {zoom < 0.7 && (
                          <span
                            aria-hidden="true"
                            className="compact-object-label"
                          >
                            {identifier(o)}
                          </span>
                        )}
                        {manage && o.id === selected && !pan && !move && (
                          <button
                            className={`resize-handle corner-${turn}`}
                            type="button"
                            title="Arraste para redimensionar"
                            aria-label="Redimensionar objeto"
                            onClick={(e) => {
                              if (e.detail === 0) {
                                setPanel("attributes");
                                requestAnimationFrame(() =>
                                  document
                                    .getElementById("object-width")
                                    ?.focus(),
                                );
                              }
                            }}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              resizeDrag.current = {
                                width: o.width ?? 1,
                                height: o.height ?? 1,
                              };
                            }}
                            onPointerMove={(e) => {
                              if (!resizeDrag.current) return;
                              const point = pointAt(e.clientX, e.clientY);
                              resizeDrag.current = {
                                width: Math.max(1, point.x - o.x + 1),
                                height: Math.max(1, point.y - o.y + 1),
                              };
                              setSize(resizeDrag.current);
                            }}
                            onPointerCancel={() => {
                              resizeDrag.current = undefined;
                              setSize(undefined);
                            }}
                            onPointerUp={() => {
                              const next = resizeDrag.current;
                              resizeDrag.current = undefined;
                              setSize(undefined);
                              if (
                                next &&
                                (next.width !== (o.width ?? 1) ||
                                  next.height !== (o.height ?? 1))
                              )
                                place(
                                  { ...o, ...next },
                                  "Objeto redimensionado",
                                );
                            }}
                          >
                            <span aria-hidden="true">↘</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {preview && (
                    <div
                      aria-hidden="true"
                      className={`size-preview ${canPlace(preview) ? "" : "invalid-preview"}`}
                      style={viewArea(preview)}
                    />
                  )}
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
            <span className="row tiny muted canvas-hint">
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
              <button
                title="Centralizar e restaurar zoom"
                aria-label="Centralizar e restaurar zoom"
                onClick={() => {
                  if (zoom === 1) centerMap();
                  else {
                    centerPending.current = true;
                    setZoom(1);
                  }
                }}
              >
                <Crosshair size={16} />
              </button>
              <button
                title="Girar à esquerda"
                aria-label="Girar à esquerda"
                disabled={!viewReady}
                onClick={() => orient((turn + 3) % 4)}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title="Restaurar orientação"
                aria-label="Restaurar orientação"
                disabled={!viewReady || turn === 0}
                onClick={() => orient(0)}
              >
                {turn * 90}°
              </button>
              <button
                title="Girar à direita"
                aria-label="Girar à direita"
                disabled={!viewReady}
                onClick={() => orient((turn + 1) % 4)}
              >
                <RotateCw size={16} />
              </button>
              <button
                title="Mover mapa"
                aria-label="Mover mapa"
                aria-pressed={pan}
                onClick={() => setPan(!pan)}
              >
                <Hand size={16} />
              </button>
              <button
                title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
                aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          </footer>
        </section>
        <aside
          className={`properties ${selected || panel === "notes" || panel === "room" ? "properties-open" : ""} ${move ? "moving-panel" : ""}`}
        >
          <div className="properties-top">
            <h3>{object ? "Detalhes do objeto" : "Detalhes da sala"}</h3>
            <Button
              className="close-properties"
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
          {sharedNotes && (
            <Button
              className="shared-notes-action"
              size="sm"
              variant={panel === "shared" ? "default" : "outline"}
              aria-pressed={panel === "shared"}
              onClick={() =>
                setPanel(panel === "shared" ? "attributes" : "shared")
              }
            >
              <FileText size={16} /> Notas compartilhadas
            </Button>
          )}
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
            {panel !== "notes" ? (
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
                      <span className="eyebrow">
                        {panel === "shared"
                          ? "Notas do objeto"
                          : "Atributos compartilhados"}
                      </span>
                      {manage && panel === "attributes" && (
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
                    {object.attributes
                      .filter((a) =>
                        panel === "shared"
                          ? a.id === sharedNotes?.id
                          : a.id !== sharedNotes?.id,
                      )
                      .map((a) => (
                        <div className="attribute" key={a.id}>
                          <div className="row between">
                            {a.type === "list" ? (
                              <span
                                className="attribute-label"
                                id={`attr-${a.id}-label`}
                              >
                                {a.name}
                              </span>
                            ) : (
                              <label htmlFor={`attr-${a.id}`}>{a.name}</label>
                            )}
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
                                name={`attr-${a.id}-visibility`}
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
                                <option value="teacher">
                                  Visível: docente
                                </option>
                                <option value="admin">
                                  Visível: administrativo
                                </option>
                              </select>
                              <select
                                name={`attr-${a.id}-edit-role`}
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
                                  if (
                                    confirm(`Excluir o atributo “${a.name}”?`)
                                  )
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
                    {manage && panel === "attributes" && (
                      <>
                        <div className="property-divider" />
                        <label>
                          Ícone
                          <select
                            name="object_icon"
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
                        <label>
                          Cor do objeto
                          <select
                            name="object_color"
                            value={object.color}
                            onChange={(e) =>
                              patchObject((o) => ({
                                ...o,
                                color: e.target.value as LabObject["color"],
                              }))
                            }
                          >
                            {Object.entries(objectColors).map(([key, name]) => (
                              <option key={key} value={key}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={object.color === "gray"}
                          onClick={() =>
                            patchObject((o) => ({ ...o, color: "gray" }))
                          }
                        >
                          Restaurar cor padrão
                        </Button>
                        <form
                          className="object-size"
                          key={`${object.id}:${object.width}:${object.height}`}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const data = new FormData(e.currentTarget);
                            const footprint = {
                              width: Number(data.get("width")),
                              height: Number(data.get("height")),
                            };
                            if (
                              place(
                                { ...object, ...footprint },
                                "Objeto redimensionado",
                              )
                            )
                              setSize(undefined);
                          }}
                          onChange={(e) => {
                            const data = new FormData(e.currentTarget);
                            const width = Math.floor(Number(data.get("width"))),
                              height = Math.floor(Number(data.get("height")));
                            setSize(
                              width >= 1 && height >= 1
                                ? { width, height }
                                : undefined,
                            );
                          }}
                        >
                          <div className="row">
                            <label>
                              Largura
                              <input
                                id="object-width"
                                name="width"
                                type="number"
                                min={1}
                                max={room.width}
                                required
                                defaultValue={object.width ?? 1}
                              />
                            </label>
                            <label>
                              Altura
                              <input
                                name="height"
                                type="number"
                                min={1}
                                max={room.height}
                                required
                                defaultValue={object.height ?? 1}
                              />
                            </label>
                          </div>
                          {size && !canPlace({ ...object, ...size }) && (
                            <p role="status" className="tiny">
                              Área ocupada ou fora da grade.
                            </p>
                          )}
                          <Button size="sm" variant="outline">
                            Aplicar tamanho
                          </Button>
                        </form>
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
                    name="note_scope"
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
                    name="note_text"
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
      <div
        className="list-attribute"
        role="group"
        aria-labelledby={`attr-${a.id}-label`}
      >
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
                      name={`attr-${a.id}-item-${i}-${k}`}
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
                  name={`attr-${a.id}-item-${i}`}
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
