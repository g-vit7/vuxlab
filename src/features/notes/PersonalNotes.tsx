import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Api } from "../../lib/api";
import {
  identifier,
  type Note,
  type NoteVisibility,
  type Room,
  type Workspace,
} from "../../lib/model";
import NoteCards, { noteLocalDate, type NoteLocation } from "./NoteCards";

export default function PersonalNotes({
  service,
  spaces,
  userId,
  displayName,
  fail,
}: {
  service: Api;
  spaces: Workspace[];
  userId: string;
  displayName: string;
  fail: (s: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const visibility: NoteVisibility =
    params.get("view") === "shared" ? "shared" : "personal";
  const workspace = params.get("workspace") ?? "";
  const [rooms, setRooms] = useState<Room[]>([]);
  const [data, setData] = useState<{
    visibility: NoteVisibility;
    notes: Note[];
  }>();
  const [roomId, setRoomId] = useState("");
  const [author, setAuthor] = useState("");
  const [date, setDate] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const notes = data?.visibility === visibility ? data.notes : [];
  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    service
      .listNotes(visibility)
      .then((notes) => {
        if (live) setData({ visibility, notes });
      })
      .catch((error) => {
        if (live) {
          setLoadFailed(true);
          fail(String(error));
        }
      });
    return () => {
      live = false;
    };
  }, [service, visibility]);
  useEffect(() => {
    let live = true;
    Promise.all(spaces.map((space) => service.rooms(space.id)))
      .then((sets) => {
        if (live) setRooms(sets.flat());
      })
      .catch((error) => {
        if (live) fail(String(error));
      });
    return () => {
      live = false;
    };
  }, [spaces, service]);

  function navigate(nextView: NoteVisibility, nextWorkspace: string) {
    setRoomId("");
    setAuthor("");
    const next = new URLSearchParams();
    if (nextView === "shared") next.set("view", "shared");
    if (nextWorkspace) next.set("workspace", nextWorkspace);
    setParams(next);
  }
  const workspaceRooms = rooms.filter(
    (room) => !workspace || room.workspace_id === workspace,
  );
  const displayedRooms = workspaceRooms.filter(
    (room) => !roomId || room.id === roomId,
  );
  const availableSpaces = spaces.filter(
    (space) =>
      (!workspace || workspace === space.id) &&
      (!roomId ||
        displayedRooms.some((room) => room.workspace_id === space.id)) &&
      (visibility === "personal" || space.role !== "public"),
  );
  const locations: NoteLocation[] = availableSpaces.flatMap((space) => [
    ...(roomId
      ? []
      : [
          {
            workspace_id: space.id,
            room_id: null,
            object_id: null,
            label: space.name,
          },
        ]),
    ...displayedRooms
      .filter((room) => room.workspace_id === space.id)
      .flatMap((room) => [
        {
          workspace_id: space.id,
          room_id: room.id,
          object_id: null,
          label: `${space.name} › ${room.name}`,
        },
        ...room.objects.map((object) => ({
          workspace_id: space.id,
          room_id: room.id,
          object_id: object.id,
          label: `${space.name} › ${room.name} › ${identifier(object)} (${object.x}, ${object.y})`,
        })),
      ]),
  ]);
  function authorLabel(note: Note) {
    return note.author_id === userId
      ? "Eu"
      : note.author_name || "Autor não informado";
  }
  function locationLabel(note: Note) {
    const room = rooms.find((item) => item.id === note.room_id);
    const object = room?.objects.find((item) => item.id === note.object_id);
    return [
      spaces.find((space) => space.id === note.workspace_id)?.name,
      room?.name,
      object ? identifier(object) : null,
    ]
      .filter(Boolean)
      .join(" › ");
  }
  const inScope = notes.filter(
    (note) =>
      (!workspace || workspace === note.workspace_id) &&
      (!roomId || roomId === note.room_id),
  );
  const authors = new Map(
    inScope.map((note) => [note.author_id ?? "unknown", authorLabel(note)]),
  );
  const filtered = inScope.filter(
    (note) =>
      (!author || author === (note.author_id ?? "unknown")) &&
      (!date ||
        (note.noted_at && noteLocalDate(note.noted_at).slice(0, 10) === date)),
  );
  async function reload() {
    const notes = await service.listNotes(visibility);
    setData({ visibility, notes });
  }

  return (
    <main className="page personal-notes-page">
      <div className="page-heading">
        <h1>
          Notas<span className="accent">.</span>
        </h1>
      </div>
      <div className="tabs notes-tabs" aria-label="Visibilidade das notas">
        <button
          className={visibility === "personal" ? "active" : ""}
          aria-pressed={visibility === "personal"}
          onClick={() => navigate("personal", workspace)}
        >
          Minhas notas
        </button>
        <button
          className={visibility === "shared" ? "active" : ""}
          aria-pressed={visibility === "shared"}
          onClick={() => navigate("shared", workspace)}
        >
          Compartilhadas
        </button>
      </div>
      <div className="note-controls">
        <label>
          Workspace
          <select
            name="workspace_filter"
            value={workspace}
            onChange={(e) => navigate(visibility, e.target.value)}
          >
            <option value="">Todos</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Laboratório
          <select
            name="room_filter"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setAuthor("");
            }}
          >
            <option value="">Todos</option>
            {workspaceRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {!workspace
                  ? ` [${spaces.find((s) => s.id === room.workspace_id)?.name ?? ""}]`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input
            type="date"
            name="note_date_filter"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {visibility === "shared" && (
          <label>
            Autor
            <select
              name="author_filter"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            >
              <option value="">Todos</option>
              {[...authors]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {data?.visibility !== visibility ? (
        <p role="status" className="muted">
          {loadFailed
            ? "Não foi possível carregar as notas."
            : "Carregando notas…"}
        </p>
      ) : (
        <NoteCards
          key={visibility}
          notes={filtered}
          locations={locations}
          authorLabel={(note) =>
            note.author_id === userId ? displayName || "Eu" : authorLabel(note)
          }
          locationLabel={locationLabel}
          fail={fail}
          canEdit={(note) =>
            note.author_id === userId ||
            (visibility === "shared" &&
              spaces.some(
                (space) =>
                  space.id === note.workspace_id && space.role === "admin",
              ))
          }
          onSave={async (draft, id) => {
            await service.saveNote(visibility, draft, id);
            await reload();
          }}
          onResolve={async (id, resolved) => {
            await service.setNoteResolved(visibility, id, resolved);
            await reload();
          }}
          onDelete={async (id) => {
            await service.deleteNote(visibility, id);
            await reload();
          }}
        />
      )}
    </main>
  );
}
