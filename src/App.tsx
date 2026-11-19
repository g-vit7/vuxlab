import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Boxes,
  Plus,
  ArrowUpRight,
  LayoutGrid,
  Settings,
  LogOut,
  Lock,
  LockOpen,
  Users,
  ArrowLeft,
  Monitor,
  DoorOpen,
  Upload,
  Check,
  ShieldCheck,
  ChevronRight,
  Search,
  FlaskConical,
  Copy,
  Trash2,
  NotebookPen,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { supabase } from "./lib/supabase";
import { api, type Api } from "./lib/api";
import { DEMO_USER } from "./lib/demo";
import {
  importRoom,
  roles,
  type Workspace,
  type Room,
  type Role,
  type Member,
} from "./lib/model";
import { localAppearance, type Appearance } from "./lib/appearance";
import {
  AppearanceFields,
  AppearanceShortcut,
} from "./components/AppearanceControls";
import Editor from "./features/editor/Editor";
import WorkspaceNotes from "./components/WorkspaceNotes";
import PersonalNotes from "./features/notes/PersonalNotes";
export default function App() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null),
    [loading, setLoading] = useState(!!supabase),
    [isDemo, setDemo] = useState(sessionStorage.getItem("vuxlab-demo") === "1");
  const [appearance, setAppearance] = useState(localAppearance);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [error, setError] = useState("");
  const [spaces, setSpaces] = useState<Workspace[]>([]);
  const [sidebar, setSidebar] = useState(
    () => window.innerWidth >= 1200 && window.innerHeight >= 720,
  );
  const [freeSidebar, setFreeSidebar] = useState(
    () => localStorage.getItem("vuxlab-sidebar") === "free",
  );
  const [displayName, setDisplayName] = useState("");
  const navigate = useNavigate(),
    location = useLocation();
  const service = useMemo(() => api(isDemo), [isDemo]);
  const activeId = location.pathname.split("/")[2];
  const active = spaces.find((w) => w.id === activeId);
  const userId = isDemo ? DEMO_USER : (user?.id ?? "");
  const inEditor = /^\/w\/[^/]+\/sala\/[^/]+/.test(location.pathname);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      document.documentElement.dataset.theme = appearance.theme;
      document.documentElement.classList.toggle(
        "dark",
        appearance.mode === "dark" ||
          (appearance.mode === "system" && system.matches),
      );
    }
    apply();
    system.addEventListener("change", apply);
    return () => system.removeEventListener("change", apply);
  }, [appearance]);
  useEffect(() => {
    if (!user && !isDemo) return;
    let active = true;
    setAppearanceBusy(true);
    service
      .appearance(userId)
      .then((value) => {
        if (active) setAppearance(value);
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setAppearanceBusy(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, isDemo, service]);
  async function changeAppearance(next: Appearance) {
    setAppearanceBusy(true);
    try {
      await service.saveAppearance(userId, next);
      setAppearance(next);
    } catch (error) {
      setError(message(error));
    } finally {
      setAppearanceBusy(false);
    }
  }
  const navigation = useRef<HTMLDivElement>(null);
  function leaveNavigation(next: EventTarget | null) {
    if (
      freeSidebar &&
      !(next instanceof Node && navigation.current?.contains(next))
    ) {
      if (navigation.current?.querySelector(":hover")) return;
      setSidebar(false);
    }
  }
  const appearanceShortcut = (
    <AppearanceShortcut
      appearance={appearance}
      busy={appearanceBusy}
      onChange={changeAppearance}
    />
  );
  const menuControls = (
    <div
      className="nav-controls"
      role="group"
      aria-label="Controles do menu lateral"
      onPointerLeave={(event) => {
        if (
          event.pointerType === "mouse" &&
          !document
            .getElementById("main-sidebar")
            ?.contains(document.activeElement)
        )
          leaveNavigation(event.relatedTarget);
      }}
      onBlur={(event) => leaveNavigation(event.relatedTarget)}
    >
      <Button
        size="icon"
        variant="ghost"
        aria-controls="main-sidebar"
        aria-expanded={sidebar}
        aria-label={sidebar ? "Recolher menu" : "Abrir menu"}
        onClick={() => setSidebar(!sidebar)}
      >
        <ChevronRight
          className={sidebar ? "sidebar-arrow-open" : ""}
          size={19}
        />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-pressed={freeSidebar}
        title={freeSidebar ? "Modo Livre" : "Modo Travado"}
        aria-label={
          freeSidebar
            ? "Modo Livre. Ativar Modo Travado"
            : "Modo Travado. Ativar Modo Livre"
        }
        onClick={() => {
          localStorage.setItem(
            "vuxlab-sidebar",
            freeSidebar ? "locked" : "free",
          );
          if (!freeSidebar) setSidebar(false);
          setFreeSidebar(!freeSidebar);
        }}
      >
        {freeSidebar ? <LockOpen size={16} /> : <Lock size={16} />}
      </Button>
    </div>
  );
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setUser(data.session?.user || null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user || null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setDisplayName("");
    if (!user && !isDemo) return;
    let cancelled = false;
    service
      .profile()
      .then((name) => {
        if (!cancelled) setDisplayName(name);
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isDemo, service]);
  async function refresh() {
    try {
      setSpaces(await service.workspaces());
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    if (user || isDemo) void refresh();
  }, [user?.id, isDemo]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 10000);
    return () => clearTimeout(t);
  }, [error]);
  if (loading)
    return (
      <div className="full-center">
        <FlaskConical className="spin" />
        Carregando seu espaço…
      </div>
    );
  if (!user && !isDemo)
    return (
      <Auth
        onDemo={() => {
          sessionStorage.setItem("vuxlab-demo", "1");
          setDemo(true);
        }}
      />
    );
  return (
    <div
      className={`shell ${inEditor ? "room-shell" : ""} ${freeSidebar ? "sidebar-free" : ""} ${sidebar ? "sidebar-expanded" : ""}`}
    >
      {sidebar && (
        <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />
      )}
      <div className="sidebar-navigation" ref={navigation}>
        {freeSidebar && !sidebar && (
          <div
            className="sidebar-edge"
            aria-hidden="true"
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setSidebar(true);
            }}
          />
        )}
        {menuControls}
        <aside
          id="main-sidebar"
          className={`sidebar ${sidebar ? "is-open" : ""}`}
          inert={!sidebar}
          onPointerLeave={(event) => {
            if (
              event.pointerType === "mouse" &&
              !event.currentTarget.contains(document.activeElement)
            )
              leaveNavigation(event.relatedTarget);
          }}
          onBlur={(event) => leaveNavigation(event.relatedTarget)}
        >
          <Link className="brand" to="/">
            <div className="brand-mark">
              <Boxes size={25} />
            </div>
            vuxlab<span className="brand-dot">.</span>
          </Link>
          <div className="sidebar-section">SEU AMBIENTE</div>
          <Link
            className={`nav-item ${location.pathname === "/" ? "active" : ""}`}
            to="/"
            onClick={() => setSidebar(false)}
          >
            <LayoutGrid size={18} />
            Workspaces
          </Link>
          <div className="sidebar-section">
            WORKSPACES <span>{spaces.length}</span>
          </div>
          {spaces.map((w) => (
            <Link
              onClick={() => setSidebar(false)}
              className={`nav-item ${w.id === activeId ? "active" : ""}`}
              key={w.id}
              to={`/w/${w.id}`}
            >
              <span className="workspace-initial">{w.name[0]}</span>
              <span className="ellipsis">{w.name}</span>
              <ChevronRight size={14} />
            </Link>
          ))}
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <ShieldCheck size={20} />
              <strong>Um lugar para cada coisa.</strong>
              <p>Organize seus espaços e trabalhe junto com sua equipe.</p>
            </div>
            <Link
              to="/notas"
              className={`nav-item ${location.pathname === "/notas" ? "active" : ""}`}
              onClick={() => setSidebar(false)}
            >
              <NotebookPen size={18} />
              Minhas notas
            </Link>
            <Link
              to="/conta"
              className="nav-item"
              onClick={() => setSidebar(false)}
            >
              <Settings size={18} />
              Minha conta
            </Link>
            <button
              className="nav-item"
              onClick={async () => {
                if (isDemo) {
                  sessionStorage.removeItem("vuxlab-demo");
                  setDemo(false);
                } else await supabase!.auth.signOut();
                navigate("/");
              }}
            >
              <LogOut size={18} />
              Sair
            </button>
            <div className="profile">
              <span className="avatar">
                {(displayName?.[0] || user?.email?.[0] || "V").toUpperCase()}
              </span>
              <div>
                <strong>
                  {displayName || user?.email?.split("@")[0] || "Sua conta"}
                </strong>
                <small>
                  {isDemo ? "Dados salvos neste navegador" : "Sua conta Vuxlab"}
                </small>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <div className="main-shell">
        <header className="topbar" hidden={inEditor}>
          <div className="row">
            <span className="muted">Meu ambiente</span>
            {active && (
              <>
                <ChevronRight size={14} />
                <strong>{active.name}</strong>
              </>
            )}
          </div>
          <div className="row">
            {isDemo && (
              <span className="badge demo-badge">Demonstração local</span>
            )}
            {appearanceShortcut}
            <span className="avatar small">
              {(displayName?.[0] || user?.email?.[0] || "V").toUpperCase()}
            </span>
          </div>
        </header>
        {error && (
          <div role="alert" className="toast">
            {error}
            <button aria-label="Fechar aviso" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <WorkspaceList
                spaces={spaces}
                service={service}
                refresh={refresh}
                fail={setError}
              />
            }
          />
          <Route
            path="/w/:wid/*"
            element={
              active ? (
                <WorkspacePage
                  workspace={active}
                  service={service}
                  userId={isDemo ? DEMO_USER : user!.id}
                  fail={setError}
                  isDemo={isDemo}
                  refreshSpaces={refresh}
                  appearanceShortcut={appearanceShortcut}
                />
              ) : (
                <div className="page empty">
                  <h2>Workspace indisponível</h2>
                  <p>
                    Acesso restrito aos membros. Se recebeu um convite, abra o
                    link completo.
                  </p>
                  <Link to="/">Voltar aos Workspaces</Link>
                </div>
              )
            }
          />
          <Route
            path="/convite/:token"
            element={
              <Invite
                service={service}
                refresh={refresh}
                isDemo={isDemo}
                fail={setError}
              />
            }
          />
          <Route
            path="/notas"
            element={
              <PersonalNotes
                service={service}
                spaces={spaces}
                fail={setError}
              />
            }
          />
          <Route
            path="/conta"
            element={
              <Account
                isDemo={isDemo}
                email={user?.email}
                fail={setError}
                service={service}
                displayName={displayName}
                onNameChange={setDisplayName}
                appearance={appearance}
                appearanceBusy={appearanceBusy}
                onAppearanceChange={changeAppearance}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
export function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
function Auth({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "password">(
      location.hash.includes("type=recovery") ? "password" : "login",
    ),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState("");
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "PASSWORD_RECOVERY") setMode("password");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setInfo("");
    const f = new FormData(e.currentTarget);
    try {
      if (!supabase)
        throw Error(
          "Supabase não configurado. Você pode explorar a demonstração abaixo.",
        );
      const email = String(f.get("email") || ""),
        password = String(f.get("password") || "");
      let result;
      if (mode === "login")
        result = await supabase.auth.signInWithPassword({ email, password });
      else if (mode === "signup")
        result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
      else if (mode === "reset")
        result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/conta",
        });
      else result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setInfo(
        mode === "signup"
          ? "Confira seu e-mail para confirmar o cadastro."
          : mode === "reset"
            ? "Se o e-mail estiver cadastrado, você receberá o link."
            : "Senha atualizada.",
      );
    } catch (e) {
      setInfo(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Boxes />
          </div>
          vuxlab.
        </Link>
        <span className="eyebrow light">
          ESPAÇO PARA ORGANIZAR. LIBERDADE PARA ENSINAR.
        </span>
        <h1>
          Seu laboratório.
          <br />
          Tudo no lugar.
        </h1>
        <p>
          Mapeie espaços, acompanhe equipamentos e compartilhe o que importa com
          sua equipe.
        </p>
        <div className="auth-grid">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className={i % 5 === 0 ? "lit" : ""}>
              {i % 7 === 0 ? <DoorOpen /> : <Monitor />}
            </div>
          ))}
        </div>
        <small>Feito para os espaços onde o conhecimento acontece.</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">BEM-VINDO AO VUXLAB</span>
          <h2>
            {mode === "signup"
              ? "Crie sua conta"
              : mode === "reset"
                ? "Recupere seu acesso"
                : mode === "password"
                  ? "Defina sua nova senha"
                  : "Bom ter você por aqui."}
          </h2>
          <p className="muted">
            {mode === "signup"
              ? "Seu próximo espaço começa aqui."
              : "Entre para acessar seus Workspaces."}
          </p>
          <form onSubmit={submit}>
            {mode !== "password" && (
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="voce@escola.edu.br"
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Senha
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="Pelo menos 8 caracteres"
                />
              </label>
            )}
            {info && (
              <p role="status" className="notice">
                {info}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy
                ? "Aguarde…"
                : mode === "login"
                  ? "Entrar na minha conta"
                  : mode === "signup"
                    ? "Criar conta"
                    : mode === "reset"
                      ? "Enviar link"
                      : "Atualizar senha"}
              <ArrowUpRight size={17} />
            </Button>
          </form>
          <div className="row between">
            <button
              className="text-button"
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup" ? "Já tenho uma conta" : "Criar uma conta"}
            </button>
            <button
              className="text-button"
              onClick={() => setMode(mode === "reset" ? "login" : "reset")}
            >
              {mode === "reset" ? "Voltar ao login" : "Esqueci minha senha"}
            </button>
          </div>
          <div className="divider">
            <span>CONHEÇA ANTES DE ENTRAR</span>
          </div>
          <Button variant="outline" onClick={onDemo}>
            Explorar demonstração
            <ArrowUpRight size={16} />
          </Button>
          <p className="tiny muted">
            A demonstração usa dados fictícios e persiste apenas neste
            navegador. Não representa uma sessão autenticada.
          </p>
        </div>
      </section>
    </div>
  );
}
function WorkspaceList({
  spaces,
  service,
  refresh,
  fail,
}: {
  spaces: Workspace[];
  service: Api;
  refresh: () => Promise<void>;
  fail: (s: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU PONTO DE PARTIDA</span>
          <h1>
            Seus Workspaces<span className="accent">.</span>
          </h1>
          <p className="muted">Cada espaço organizado. Sua equipe conectada.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={17} />
          Novo Workspace
        </Button>
      </div>
      <div className="intro-strip">
        <div className="intro-icon">
          <Boxes size={28} />
        </div>
        <div>
          <strong>Grandes ideias precisam de um bom espaço.</strong>
          <p>
            Escolha um Workspace para gerenciar salas, objetos e informações.
          </p>
        </div>
        <div className="strip-grid">
          <Monitor />
          <Monitor />
          <DoorOpen />
        </div>
      </div>
      <div className="section-heading">
        <h3>
          Meus Workspaces <span className="count">{spaces.length}</span>
        </h3>
        <span className="muted tiny">Compartilhados com sua equipe</span>
      </div>
      <div className="workspace-cards">
        {spaces.map((w) => (
          <Link to={`/w/${w.id}`} className="workspace-card" key={w.id}>
            <div className="row between">
              <div className="workspace-logo">
                <FlaskConical size={26} />
              </div>
              <span className="badge">{roles[w.role]}</span>
            </div>
            <h2>{w.name}</h2>
            <p className="muted">Salas, equipamentos e pessoas em sintonia.</p>
            <div className="card-footer">
              Abrir Workspace <ArrowUpRight size={19} />
            </div>
          </Link>
        ))}
        <button className="new-card" onClick={() => setOpen(true)}>
          <span>
            <Plus size={25} />
          </span>
          <strong>Um novo espaço</strong>
          <small>Crie e organize do seu jeito</small>
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="Novo Workspace">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const id = await service.createWorkspace(
                String(f.get("name")).trim(),
              );
              await refresh();
              setOpen(false);
              navigate(`/w/${id}`);
            } catch (e) {
              fail(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nome do Workspace
            <input
              autoFocus
              name="name"
              required
              maxLength={100}
              placeholder="Ex.: Escola Horizonte"
            />
          </label>
          <Button disabled={busy}>Criar Workspace</Button>
        </form>
      </Dialog>
    </main>
  );
}
function WorkspacePage({
  workspace: w,
  appearanceShortcut,
  service,
  userId,
  fail,
  isDemo,
  refreshSpaces,
}: {
  workspace: Workspace;
  appearanceShortcut: ReactNode;
  service: Api;
  userId: string;
  fail: (s: string) => void;
  isDemo: boolean;
  refreshSpaces: () => Promise<void>;
}) {
  const [rooms, setRooms] = useState<Room[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false);
  const params = useParams(),
    navigate = useNavigate();
  const path = params["*"] || "";
  const roomId = path.startsWith("sala/") ? path.split("/")[1] : undefined;
  async function refresh() {
    try {
      setLoadError("");
      setRooms(await service.rooms(w.id));
    } catch (e) {
      setLoadError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [w.id]);
  if (path === "membros")
    return (
      <Members
        w={w}
        service={service}
        fail={fail}
        isDemo={isDemo}
        refreshSpaces={refreshSpaces}
      />
    );
  if (loading) return <div className="page empty">Carregando salas…</div>;
  if (loadError)
    return (
      <div className="page empty">
        <p role="alert">{loadError}</p>
        <Button onClick={refresh}>Tentar novamente</Button>
      </div>
    );
  if (roomId) {
    const room = rooms.find((r) => r.id === roomId);
    return room ? (
      <Editor
        key={room.id}
        room={room}
        workspace={w}
        userId={userId}
        service={service}
        fail={fail}
        onReload={refresh}
        appearanceShortcut={appearanceShortcut}
      />
    ) : (
      <div className="page empty">
        Sala indisponível. <Link to={`/w/${w.id}`}>Voltar às salas</Link>
      </div>
    );
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw Error("O arquivo deve ter no máximo 2 MB");
      const r = importRoom(JSON.parse(await file.text()), w.id, userId);
      await service.saveRoom(r, "Sala importada");
      await refresh();
      navigate(`/w/${w.id}/sala/${r.id}`);
    } catch (e) {
      fail(message(e));
    }
  }
  return (
    <main className="page">
      <Link className="back-link" to="/">
        <ArrowLeft size={15} />
        Workspaces
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            WORKSPACE <span className="badge">{roles[w.role]}</span>
          </span>
          <h1>
            {w.name}
            <span className="accent">.</span>
          </h1>
          <p className="muted">
            Uma visão clara dos espaços que você gerencia.
          </p>
        </div>
        <div className="row wrap">
          <WorkspaceNotes workspaceId={w.id} service={service} fail={fail} />
          {w.role === "admin" && (
            <Button variant="outline" asChild>
              <Link to={`/w/${w.id}/membros`}>
                <Users size={17} />
                Membros e convites
              </Link>
            </Button>
          )}
          {w.role !== "public" && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={17} />
              Nova sala
            </Button>
          )}
        </div>
      </div>
      <div className="section-heading">
        <h3>
          Suas salas <span className="count">{rooms.length}</span>
        </h3>
        <div className="row">
          <div className="search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar sala"
              aria-label="Buscar sala"
            />
          </div>
          {w.role !== "public" && (
            <div className="import-control">
              <Button
                variant="outline"
                onClick={() =>
                  document.getElementById("room-import-file")?.click()
                }
              >
                <Upload size={16} />
                Importar JSON
              </Button>
              <input
                id="room-import-file"
                className="room-import-file"
                aria-label="Selecionar sala em JSON"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </div>
      </div>
      <div className="workspace-cards room-cards">
        {rooms
          .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
          .map((r) => (
            <Link
              to={`/w/${w.id}/sala/${r.id}`}
              key={r.id}
              className="room-card"
              title={r.name}
            >
              <div className="room-preview" aria-hidden="true">
                <svg
                  viewBox={`0 0 ${r.width} ${r.height}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <rect
                    width={r.width}
                    height={r.height}
                    rx={Math.min(r.width, r.height) * 0.05}
                    fill="var(--surface)"
                  />
                  {r.objects.map((o) => (
                    <rect
                      key={o.id}
                      x={o.x - 0.85}
                      y={o.y - 0.85}
                      width={0.7}
                      height={0.7}
                      rx={0.12}
                      fill={
                        o.color === "green" ? "var(--green)" : "var(--muted)"
                      }
                    />
                  ))}
                </svg>
              </div>
              <div className="room-card-content">
                <h3>{r.name}</h3>
                <div className="row between muted tiny">
                  <span>
                    {r.objects.length} objetos · {r.width} × {r.height}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
              </div>
            </Link>
          ))}
        {!rooms.length && (
          <div className="empty">
            <LayoutGrid size={36} />
            <h3>Um espaço cheio de possibilidades</h3>
            <p>Crie a primeira sala para começar a mapear.</p>
          </div>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Criar sala"
        description="Defina o tamanho da grade. Você poderá ajustar depois."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const r: Room = {
                id: crypto.randomUUID(),
                workspace_id: w.id,
                owner_id: userId,
                name: String(f.get("name")).trim(),
                width: Number(f.get("width")),
                height: Number(f.get("height")),
                version: 0,
                objects: [],
              };
              await service.saveRoom(r, "Sala criada");
              await refresh();
              setOpen(false);
              navigate(`/w/${w.id}/sala/${r.id}`);
            } catch (e) {
              fail(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nome
            <input
              required
              maxLength={100}
              name="name"
              placeholder="Laboratório 01"
            />
          </label>
          <div className="form-grid">
            <label>
              Largura (X)
              <input
                name="width"
                type="number"
                min={1}
                max={100}
                defaultValue={8}
                required
              />
            </label>
            <label>
              Altura (Y)
              <input
                name="height"
                type="number"
                min={1}
                max={100}
                defaultValue={8}
                required
              />
            </label>
          </div>
          <Button disabled={busy}>
            <Plus size={16} />
            Criar sala
          </Button>
        </form>
      </Dialog>
    </main>
  );
}
function Members({
  w,
  service,
  fail,
  isDemo,
  refreshSpaces,
}: {
  w: Workspace;
  service: Api;
  fail: (s: string) => void;
  isDemo: boolean;
  refreshSpaces: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Awaited<ReturnType<Api["invites"]>>>([]),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState("");
  async function refresh() {
    try {
      setMembers(await service.members(w.id));
      if (w.role === "admin") setInvites(await service.invites(w.id));
    } catch (e) {
      fail(message(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, [w.id]);
  if (w.role !== "admin")
    return (
      <div className="page empty">
        Apenas administradores podem gerenciar o Workspace.
      </div>
    );
  return (
    <main className="page narrow">
      <Link className="back-link" to={`/w/${w.id}`}>
        <ArrowLeft size={15} />
        Voltar às salas
      </Link>
      <h1>
        Membros e convites<span className="accent">.</span>
      </h1>
      <p className="muted">
        Acesso seguro, de acordo com o papel de cada pessoa.
      </p>
      {isDemo && (
        <p className="notice">
          Convites e alterações de acesso estão disponíveis com Supabase
          conectado.
        </p>
      )}
      <section className="panel">
        <h3>Configurações do Workspace</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await service.renameWorkspace(
                w.id,
                String(new FormData(e.currentTarget).get("name")).trim(),
              );
              await refreshSpaces();
              setInfo("Nome atualizado.");
            } catch (e) {
              fail(message(e));
            }
          }}
        >
          <label>
            Nome
            <input name="name" defaultValue={w.name} maxLength={100} required />
          </label>
          <Button variant="outline">Salvar nome</Button>
        </form>
      </section>
      <section className="panel">
        <h3>Pessoas neste Workspace</h3>
        {members.map((m) => (
          <div className="member-row" key={m.user_id}>
            <span className="avatar">
              <Users size={18} />
            </span>
            <div className="member-id">
              <strong>
                {m.display_name ||
                  m.email ||
                  (isDemo ? "Você · demonstração" : m.user_id.slice(0, 8))}
              </strong>
              <small>{roles[m.role]}</small>
            </div>
            <select
              aria-label={`Papel de ${m.user_id}`}
              value={m.role}
              disabled={isDemo}
              onChange={async (e) => {
                try {
                  await service.setMember(
                    w.id,
                    m.user_id,
                    e.target.value as Role,
                  );
                  await refresh();
                  await refreshSpaces();
                } catch (e) {
                  fail(message(e));
                }
              }}
            >
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              disabled={isDemo}
              aria-label="Remover membro"
              onClick={async () => {
                if (!confirm("Remover este membro do Workspace?")) return;
                try {
                  await service.setMember(w.id, m.user_id, null);
                  await refresh();
                  await refreshSpaces();
                } catch (e) {
                  fail(message(e));
                }
              }}
            >
              <Trash2 size={17} />
            </Button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h3>Convidar por link</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              const token = await service.invite(
                w.id,
                f.get("role") as Role,
                Number(f.get("hours")),
                Number(f.get("uses")),
              );
              setLink(`${location.origin}/convite/${token}`);
              await refresh();
            } catch (e) {
              fail(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Papel
              <select name="role">
                {Object.entries(roles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Validade (horas)
              <input
                name="hours"
                type="number"
                min={1}
                max={720}
                defaultValue={72}
                required
              />
            </label>
            <label>
              Limite de usos
              <input
                name="uses"
                type="number"
                min={1}
                max={1000}
                defaultValue={1}
                required
              />
            </label>
          </div>
          <Button disabled={busy || isDemo}>Gerar convite</Button>
        </form>
        {link && (
          <div className="notice">
            <p>Copie agora. O token não poderá ser consultado novamente.</p>
            <input readOnly value={link} aria-label="Link de convite" />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setInfo("Link copiado.");
                } catch {
                  setInfo("Selecione o campo e copie o link manualmente.");
                }
              }}
            >
              <Copy size={16} />
              Copiar
            </Button>
          </div>
        )}
        {invites.map((i) => (
          <div className="member-row" key={i.id}>
            <div className="grow">
              <strong>{roles[i.role]}</strong>
              <p className="tiny muted">
                {i.uses}/{i.max_uses} usos · até{" "}
                {new Date(i.expires_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await service.revokeInvite(i.id);
                  await refresh();
                } catch (e) {
                  fail(message(e));
                }
              }}
            >
              Revogar
            </Button>
          </div>
        ))}
      </section>
      {info && <p role="status">{info}</p>}
    </main>
  );
}
function Invite({
  service,
  refresh,
  isDemo,
  fail,
}: {
  service: Api;
  refresh: () => Promise<void>;
  isDemo: boolean;
  fail: (s: string) => void;
}) {
  const { token } = useParams(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className="page empty">
      <Users size={38} />
      <h1>Um espaço espera por você.</h1>
      <p>Aceite o convite para participar do Workspace.</p>
      <Button
        disabled={busy || isDemo}
        onClick={async () => {
          setBusy(true);
          try {
            const id = await service.acceptInvite(token!);
            await refresh();
            navigate(`/w/${id}`);
          } catch (e) {
            fail(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Aceitar convite
      </Button>
      {isDemo && (
        <p>Saia da demonstração e entre com sua conta para aceitar.</p>
      )}
    </div>
  );
}
function Account({
  isDemo,
  email,
  fail,
  service,
  displayName,
  onNameChange,
  appearance,
  appearanceBusy,
  onAppearanceChange,
}: {
  service: Api;
  displayName: string;
  onNameChange: (name: string) => void;
  appearance: Appearance;
  appearanceBusy: boolean;
  onAppearanceChange: (next: Appearance) => Promise<void>;
  isDemo: boolean;
  email?: string;
  fail: (s: string) => void;
}) {
  const [info, setInfo] = useState("");
  const [profileInfo, setProfileInfo] = useState("");
  const [name, setName] = useState(displayName),
    [profileBusy, setProfileBusy] = useState(false);
  useEffect(() => setName(displayName), [displayName]);
  return (
    <main className="page narrow">
      <span className="eyebrow">PREFERÊNCIAS PESSOAIS</span>
      <h1>
        Minha conta<span className="accent">.</span>
      </h1>
      <section className="panel">
        <h3>Seu perfil</h3>
        <p className="muted tiny">
          Escolha como seu nome aparece no Vuxlab. Seu e-mail de acesso
          permanece o mesmo.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setProfileBusy(true);
            try {
              await service.saveProfile(name);
              onNameChange(name.trim());
              setProfileInfo("Nome atualizado.");
            } catch (e) {
              fail(message(e));
            } finally {
              setProfileBusy(false);
            }
          }}
        >
          <label>
            Nome de usuário
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              autoComplete="nickname"
              placeholder="Como você quer ser chamado?"
            />
          </label>
          <Button disabled={profileBusy || !name.trim()}>
            {profileBusy ? "Salvando…" : "Salvar nome"}
          </Button>
        </form>
        {profileInfo && (
          <p role="status" className="notice">
            {profileInfo}
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Aparência</h3>
        <AppearanceFields
          appearance={appearance}
          busy={appearanceBusy}
          onChange={onAppearanceChange}
        />
      </section>
      <section className="panel">
        <h3>Seu acesso</h3>
        <p className="muted">{isDemo ? "Demonstração local" : email}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isDemo) return;
            const { error } = await supabase!.auth.updateUser({
              password: String(new FormData(e.currentTarget).get("password")),
            });
            if (error) fail(error.message);
            else setInfo("Senha atualizada.");
            e.currentTarget?.reset();
          }}
        >
          <label>
            Nova senha
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <Button disabled={isDemo}>
            <Check size={16} />
            Atualizar senha
          </Button>
        </form>
        {info && <p role="status">{info}</p>}
      </section>
    </main>
  );
}
