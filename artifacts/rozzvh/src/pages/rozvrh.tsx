import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ChevronDown, Clock3, DoorOpen, LoaderCircle, LogOut, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createScheduleItem, deleteScheduleItem, listFriendScheduleItems, listScheduleItems, updateScheduleItem, type ScheduleItem, type ScheduleItemInput } from "@/lib/schedule";
import { FriendsDialog } from "@/components/friends-dialog";
import type { Profile } from "@/lib/friends";

const weekdays = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
const shortDays = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const types = ["Přednáška", "Seminář", "Cvičení", "Laboratoř", "Konzultace", "Jiné"];
const blankForm = { title: "", day: 1, start_time: "08:00", end_time: "09:30", room: "", type: "Přednáška" };

function mondayOf(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value;
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function weekLabel(start: Date) {
  const end = addDays(start, 6);
  const format = (date: Date) => new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short" }).format(date);
  return `${format(start)} – ${format(end)} ${end.getFullYear()}`;
}

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : "";
  if (!text) return fallback;
  if (/invalid login|invalid credentials/i.test(text)) return "E-mail nebo heslo nesouhlasí. Zkontrolujte je a zkuste to znovu.";
  if (/already registered|user already/i.test(text)) return "Tento e-mail už má účet. Zkuste se přihlásit.";
  if (/profiles_username_unique|duplicate key|username.*already/i.test(text)) return "Toto uživatelské jméno už někdo používá. Zvolte jiné.";
  if (/database error saving new user/i.test(text)) return "Profil se nepodařilo vytvořit. Spusťte aktuální SQL skript v Supabase a zkuste registraci znovu.";
  if (/password/i.test(text) && /at least|short|weak/i.test(text)) return "Heslo je příliš krátké. Zvolte alespoň 6 znaků.";
  if (/network|fetch/i.test(text)) return "Nepodařilo se připojit. Zkontrolujte internet a zkuste to znovu.";
  return text;
}

function AuthScreen() {
  const { signIn, signUp, status, error: authError } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (!email.trim() || !password) {
      setNotice("Vyplňte e-mail i heslo.");
      return;
    }
    if (isRegister && password.length < 6) {
      setNotice("Heslo musí mít alespoň 6 znaků.");
      return;
    }
    if (isRegister && (!displayName.trim() || displayName.trim().length > 40)) {
      setNotice("Zobrazované jméno musí mít 1–40 znaků.");
      return;
    }
    if (isRegister && !/^[a-z0-9_]{3,24}$/.test(username.trim().toLowerCase())) {
      setNotice("Uživatelské jméno musí mít 3–24 znaků: malá písmena, čísla nebo podtržítko.");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        const hasSession = await signUp(email, password, {
          username: username.trim().toLowerCase(),
          display_name: displayName.trim(),
        });
        if (!hasSession) setNotice("Účet je vytvořený. Potvrďte e-mail z doručené zprávy a potom se přihlaste.");
      } else {
        await signIn(email, password);
      }
    } catch (submitError) {
      setNotice(friendlyError(submitError, "Přihlášení se nepodařilo. Zkuste to znovu."));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <main className="auth-page"><div className="auth-loading" aria-label="Ověřuji přihlášení"><span /><span /><span /></div></main>;
  }

  if (!isSupabaseConfigured || status === "unconfigured") {
    return (
      <main className="auth-page">
        <section className="auth-card setup-card">
          <div className="brand-mark"><CalendarDays size={21} strokeWidth={1.8} /></div>
          <p className="eyebrow">ROZVRH · VÁŠ TÝDEN NA JEDNOM MÍSTĚ</p>
          <h1>Nejdřív připojíme<br />váš účet.</h1>
          <p className="auth-copy">Aplikace čeká na nastavení připojení. Požádejte správce o doplnění Supabase konfigurace.</p>
          <div className="config-note"><span className="config-dot" /> Služba není nakonfigurovaná</div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-topline"><div className="brand-mark"><CalendarDays size={21} strokeWidth={1.8} /></div><span>ROZVRH</span></div>
        <p className="eyebrow">{isRegister ? "NOVÝ ZAČÁTEK" : "VÁŠ TÝDEN, PŘEHLEDNĚ"}</p>
        <h1>{isRegister ? <>Vytvořte si<br />svůj rozvrh.</> : <>Zpátky<br />do rytmu.</>}</h1>
        <p className="auth-copy">{isRegister ? "Založte si účet a mějte výuku vždy po ruce." : "Přihlaste se a podívejte se, co vás tento týden čeká."}</p>
        <form onSubmit={submit} className="auth-form">
          {isRegister && <>
            <label htmlFor="auth-display-name">Zobrazované jméno</label>
            <input id="auth-display-name" data-testid="input-display-name" type="text" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jak vás mají přátelé vidět" required maxLength={40} />
            <label htmlFor="auth-username">Uživatelské jméno</label>
            <input id="auth-username" data-testid="input-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="např. jana_novakova" required minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" />
            <p className="auth-help">Přátelé vás najdou podle uživatelského jména, ne podle e-mailu.</p>
          </>}
          <label htmlFor="auth-email">E-mail</label>
          <input id="auth-email" data-testid="input-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jmeno@univerzita.cz" required />
          <label htmlFor="auth-password">Heslo</label>
          <input id="auth-password" data-testid="input-password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Alespoň 6 znaků" required minLength={isRegister ? 6 : undefined} />
          {(notice || (status === "error" && authError)) && <div className="form-alert" role="alert">{notice || friendlyError(authError, "Ověření přihlášení selhalo.")}</div>}
          <button className="button button-primary auth-submit" data-testid="button-submit-auth" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : null}
            {busy ? "Chvilku…" : isRegister ? "Vytvořit účet" : "Přihlásit se"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
        <div className="auth-switch">
          <span>{isRegister ? "Už účet máte?" : "Ještě nemáte účet?"}</span>
          <button type="button" data-testid="button-switch-auth" onClick={() => { setMode(isRegister ? "login" : "register"); setNotice(""); }}>
            {isRegister ? "Přihlaste se" : "Zaregistrujte se"}
          </button>
        </div>
        <p className="privacy-note">Vaše rozvrhy jsou soukromé a přístupné jen vám.</p>
      </section>
      <aside className="auth-aside" aria-hidden="true">
        <div className="aside-rule" />
        <span className="aside-caption">JEDNODUŠE VÍTE, KAM DÁL.</span>
        <p>Jeden týden.<br /><em>Jasný plán.</em></p>
        <div className="aside-foot">ROZVRH STUDENTA&nbsp; / &nbsp;PŘEHLEDNĚ PO SVÉM</div>
      </aside>
    </main>
  );
}

function ScheduleForm({ item, onClose, onSaved, onDeleted, userId }: {
  item: ScheduleItem | null;
  onClose: () => void;
  onSaved: (item: ScheduleItem) => void;
  onDeleted: (id: string) => void;
  userId: string;
}) {
  const [form, setForm] = useState({ ...blankForm, ...(item ? { title: item.title, day: item.day, start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5), room: item.room ?? "", type: item.type } : {}) });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (form.end_time <= form.start_time) {
      setError("Konec výuky musí být později než její začátek.");
      return;
    }
    setBusy(true);
    const input: ScheduleItemInput = { ...form, day: Number(form.day), room: form.room.trim() || null, title: form.title.trim() };
    try {
      const result = item
        ? await updateScheduleItem(userId, item.id, input)
        : await createScheduleItem(userId, input);
      onSaved(result);
    } catch (saveError) {
      setError(friendlyError(saveError, "Změnu se nepodařilo uložit. Zkontrolujte připojení a zkuste to znovu."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    setDeleting(true);
    setError("");
    try {
      await deleteScheduleItem(userId, item.id);
      onDeleted(item.id);
    } catch (deleteError) {
      setError(friendlyError(deleteError, "Položku se nepodařilo smazat. Zkuste to znovu."));
      setDeleting(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="item-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-head">
          <div><p className="eyebrow">{item ? "UPRAVIT POLOŽKU" : "NOVÁ POLOŽKA"}</p><h2 id="dialog-title">{item ? "Upravit výuku" : "Přidat do rozvrhu"}</h2></div>
          <button type="button" className="icon-button" aria-label="Zavřít" data-testid="button-close-dialog" onClick={onClose}><X size={19} /></button>
        </div>
        {confirmDelete ? (
          <div className="delete-confirm">
            <div className="delete-symbol"><Trash2 size={20} /></div>
            <h3>Smazat tuto výuku?</h3>
            <p>„{item?.title}“ zmizí z vašeho rozvrhu. Tuto akci nelze vrátit.</p>
            <div className="confirm-actions"><button className="button button-soft" type="button" onClick={() => setConfirmDelete(false)}>Ponechat</button><button className="button button-danger" type="button" onClick={remove} disabled={deleting}>{deleting ? "Mažu…" : "Smazat výuku"}</button></div>
          </div>
        ) : <form className="item-form" onSubmit={submit}>
          <label htmlFor="class-title">Název předmětu</label>
          <input id="class-title" data-testid="input-class-title" value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="např. Dějiny umění" required autoFocus />
          <div className="form-row">
            <div><label htmlFor="class-day">Den</label><div className="select-wrap"><select id="class-day" data-testid="select-class-day" value={form.day} onChange={(event) => update("day", Number(event.target.value))}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select><ChevronDown size={16} /></div></div>
            <div><label htmlFor="class-type">Typ výuky</label><div className="select-wrap"><select id="class-type" data-testid="select-class-type" value={form.type} onChange={(event) => update("type", event.target.value)}>{[...types, ...(types.includes(form.type) ? [] : [form.type])].map((type) => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={16} /></div></div>
          </div>
          <div className="form-row">
            <div><label htmlFor="class-start">Začátek</label><input id="class-start" data-testid="input-start-time" type="time" value={form.start_time} onChange={(event) => update("start_time", event.target.value)} required /></div>
            <div><label htmlFor="class-end">Konec</label><input id="class-end" data-testid="input-end-time" type="time" value={form.end_time} onChange={(event) => update("end_time", event.target.value)} required /></div>
          </div>
          <label htmlFor="class-room">Místnost <span className="optional">nepovinné</span></label>
          <input id="class-room" data-testid="input-class-room" value={form.room} onChange={(event) => update("room", event.target.value)} placeholder="např. B-214" />
          {error && <div className="form-alert" role="alert">{error}</div>}
          <div className="dialog-actions">
            {item && <button className="button button-quiet-danger" type="button" data-testid="button-delete-item" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Smazat</button>}
            <span className="dialog-spacer" />
            <button className="button button-soft" type="button" onClick={onClose} disabled={busy}>Zrušit</button>
            <button className="button button-primary" data-testid="button-save-item" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? "Ukládám…" : item ? "Uložit změny" : "Přidat výuku"}</button>
          </div>
        </form>}
      </section>
    </div>
  );
}

function ScheduleApp({ userId }: { userId: string }) {
  const { signOut, user } = useAuth();
  const currentMonday = useMemo(() => mondayOf(new Date()), []);
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [mobileDay, setMobileDay] = useState((new Date().getDay() + 6) % 7);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [friendsDialogOpen, setFriendsDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<ScheduleItem | null | undefined>(undefined);
  const [signOutError, setSignOutError] = useState("");
  const isCurrentWeek = weekStart.getTime() === currentMonday.getTime();
  const selectedFriendId = selectedFriend?.user_id ?? null;
  const loadSequence = useRef(0);

  const loadItems = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = selectedFriendId
        ? await listFriendScheduleItems(userId, selectedFriendId)
        : await listScheduleItems(userId);
      if (sequence === loadSequence.current) setItems(result);
    } catch (error) {
      if (sequence === loadSequence.current) {
        setLoadError(friendlyError(error, "Rozvrh se nepodařilo načíst. Zkuste to znovu."));
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [selectedFriendId, userId]);

  useEffect(() => {
    setItems([]);
    void loadItems();
    return () => { loadSequence.current += 1; };
  }, [loadItems]);

  useEffect(() => {
    if (!selectedFriendId) return;
    const interval = window.setInterval(() => { void loadItems(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadItems, selectedFriendId]);

  const shownItems = useMemo(() => items.filter((item) => {
    const date = addDays(weekStart, item.day - 1);
    return date >= weekStart && date <= addDays(weekStart, 6);
  }), [items, weekStart]);

  function saveItem(item: ScheduleItem) {
    setItems((current) => [...current.filter((existing) => existing.id !== item.id), item].sort((a, b) => a.day - b.day || a.start_time.localeCompare(b.start_time)));
    setDialogItem(undefined);
  }

  const email = user?.email ?? "";
  const initials = email ? email.slice(0, 1).toLocaleUpperCase("cs-CZ") : "S";

  return (
    <div className="app-shell">
      <header className="topbar"><div className="topbar-title">rozvrh<span>.</span></div></header>
      <main className="schedule-main">
        <section className={`schedule-intro${selectedFriend ? " friend-view-intro" : ""}`}>
          <div>
            <p className="eyebrow">{selectedFriend ? "SDÍLENÝ ROZVRH" : "OSOBNÍ ROZVRH"}</p>
            <h1>{selectedFriend ? `Rozvrh ${selectedFriend.display_name}` : <>Váš týden<span>.</span></>}</h1>
            {selectedFriend && <p className="friend-subtitle">@{selectedFriend.username} · sdílí s vámi svůj rozvrh</p>}
          </div>
          <div className="intro-actions">
            <span className="user-avatar" title={email}>{initials}</span>
            <button type="button" className="signout-button" data-testid="button-signout" onClick={async () => { setSignOutError(""); try { await signOut(); } catch { setSignOutError("Odhlášení se nepodařilo. Zkuste to znovu."); } }} aria-label="Odhlásit se"><LogOut size={17} /></button>
            {selectedFriend && <button type="button" data-testid="button-own-schedule" className="button button-soft own-schedule-button" onClick={() => setSelectedFriend(null)}><ArrowLeft size={15} /><span>Můj rozvrh</span></button>}
            <button type="button" data-testid="button-open-friends" className="button button-soft friends-button" onClick={() => setFriendsDialogOpen(true)}><Users size={16} /><span>Přátelé</span></button>
            {!selectedFriend && <button type="button" data-testid="button-add-item" className="button button-primary add-button" onClick={() => setDialogItem(null)}><Plus size={18} /><span>Přidat výuku</span></button>}
          </div>
        </section>
        <section className="week-toolbar" aria-label="Navigace v týdnech">
          <div className="week-navigation">
            <button type="button" className="icon-button nav-arrow" aria-label="Předchozí týden" data-testid="button-previous-week" onClick={() => setWeekStart((date) => addDays(date, -7))}><ArrowLeft size={17} /></button>
            <div className="week-range"><span className="week-kicker">TÝDEN</span><strong>{weekLabel(weekStart)}</strong></div>
            <button type="button" className="icon-button nav-arrow" aria-label="Následující týden" data-testid="button-next-week" onClick={() => setWeekStart((date) => addDays(date, 7))}><ArrowRight size={17} /></button>
          </div>
          {!isCurrentWeek && <button type="button" data-testid="button-current-week" className="today-button" onClick={() => setWeekStart(currentMonday)}>Dnešní týden</button>}
          {isCurrentWeek && <span className="current-week-tag"><span /> Aktuální týden</span>}
        </section>
        {signOutError && <div className="form-alert page-alert" role="alert">{signOutError}</div>}
        {loading ? (
          <div className="timetable timetable-loading" aria-label="Načítám rozvrh"><div className="skeleton-heading" />{weekdays.map((day) => <div key={day} className="skeleton-column"><i /><i /><i /></div>)}</div>
        ) : loadError ? (
          <section className="state-panel error-state"><div className="state-icon"><CalendarDays size={23} /></div><h2>Rozvrh se nepodařilo načíst</h2><p>{loadError}</p><button type="button" className="button button-soft" data-testid="button-retry-load" onClick={loadItems}>Zkusit znovu</button></section>
        ) : items.length === 0 ? (
          <section className="empty-panel">
            <div className="empty-illustration"><div className="empty-paper"><span /><span /><span /></div><div className="empty-orbit"><Plus size={18} /></div></div>
            <p className="eyebrow">{selectedFriend ? "SDÍLENÝ ROZVRH" : "TÝDEN JE ZATÍM VOLNÝ"}</p>
            <h2>{selectedFriend ? "Tento rozvrh je zatím prázdný." : "Začněte první hodinou."}</h2>
            <p>{selectedFriend ? `${selectedFriend.display_name} zatím nemá přidané žádné hodiny.` : "Přidejte předmět a čas výuky. Váš rozvrh zůstává soukromý."}</p>
            {!selectedFriend && <button type="button" className="button button-primary" data-testid="button-empty-add" onClick={() => setDialogItem(null)}><Plus size={17} /> Přidat první výuku</button>}
          </section>
        ) : (
          <>
            <div className="mobile-day-picker" role="tablist" aria-label="Výběr dne">
              {shortDays.map((day, index) => <button key={day} type="button" role="tab" aria-selected={mobileDay === index} data-testid={`tab-day-${index + 1}`} className={mobileDay === index ? "day-tab active" : "day-tab"} onClick={() => setMobileDay(index)}><span>{day}</span><small>{addDays(weekStart, index).getDate()}</small>{shownItems.some((item) => item.day === index + 1) && <i />}</button>)}
            </div>
            <section className="timetable" aria-label={`Rozvrh na týden ${weekLabel(weekStart)}`}>
              {weekdays.map((day, index) => {
                const dayDate = addDays(weekStart, index);
                const dayItems = shownItems.filter((item) => item.day === index + 1).sort((a, b) => a.start_time.localeCompare(b.start_time));
                const isToday = dayDate.toDateString() === new Date().toDateString();
                return <div key={day} className={`day-column ${mobileDay === index ? "mobile-active" : ""}`}>
                  <div className={`day-heading ${isToday ? "is-today" : ""}`}><span>{weekdays[index]}</span><b>{dayDate.getDate()}</b></div>
                  <div className="day-items">
                    {dayItems.length === 0 ? <div className="day-empty"><span>—</span><span>Volno</span></div> : dayItems.map((item, itemIndex) => <article className={`class-item class-color-${(index + itemIndex) % 4}`} key={item.id} data-testid={`card-schedule-item-${item.id}`}>
                      <div className="class-time"><Clock3 size={12} />{item.start_time.slice(0, 5)}<span>–</span>{item.end_time.slice(0, 5)}</div>
                      <h3>{item.title}</h3>
                      <div className="class-meta"><span>{item.type}</span>{item.room && <span className="room-meta"><DoorOpen size={12} />{item.room}</span>}</div>
                      {!selectedFriend && <button type="button" className="item-edit" aria-label={`Upravit ${item.title}`} data-testid={`button-edit-item-${item.id}`} onClick={() => setDialogItem(item)}><Pencil size={14} /></button>}
                    </article>)}
                  </div>
                </div>;
              })}
            </section>
            <div className="schedule-foot"><span><BookOpen size={14} /> {items.length} {items.length === 1 ? "předmět" : items.length < 5 ? "předměty" : "předmětů"} v rozvrhu</span><span>Časy jsou v místním čase</span></div>
          </>
        )}
      </main>
      {dialogItem !== undefined && <ScheduleForm item={dialogItem} userId={userId} onClose={() => setDialogItem(undefined)} onSaved={saveItem} onDeleted={(id) => { setItems((current) => current.filter((item) => item.id !== id)); setDialogItem(undefined); }} />}
      {friendsDialogOpen && <FriendsDialog userId={userId} onClose={() => setFriendsDialogOpen(false)} onSelectFriend={(profile) => { setSelectedFriend(profile); setFriendsDialogOpen(false); }} onFriendshipRemoved={(friendId) => { if (selectedFriendId === friendId) setSelectedFriend(null); }} />}
    </div>
  );
}

export default function RozvrhPage() {
  const { status, user } = useAuth();
  if (status === "authenticated" && user?.id) return <ScheduleApp key={user.id} userId={user.id} />;
  return <AuthScreen />;
}