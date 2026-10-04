import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ChevronDown, LoaderCircle, LogOut, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createScheduleItem, deleteScheduleItem, listFriendScheduleItems, listScheduleItems, updateScheduleItem, type ScheduleItem, type ScheduleItemInput } from "@/lib/schedule";
import { FriendsDialog } from "@/components/friends-dialog";
import { listFriendships, type Profile } from "@/lib/friends";

const weekdays = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];
const types = ["Přednáška", "Seminář", "Cvičení", "Laboratoř", "Konzultace", "Jiné"];
type StartWeekChoice = "this" | "next" | "existing";
const blankForm = {
  title: "",
  day: 1,
  start_time: "08:00",
  end_time: "09:30",
  room: "",
  type: "Přednáška",
  repeat_every_two_weeks: false,
  start_week_choice: "this" as StartWeekChoice,
};

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

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isScheduledThisWeek(item: ScheduleItem, weekStart: Date) {
  if (!item.repeat_every_two_weeks) return true;
  if (!item.starts_week) return false;
  const start = mondayOf(dateFromKey(item.starts_week));
  const weekGap = Math.round((mondayOf(weekStart).getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return weekGap >= 0 && weekGap % 2 === 0;
}

function weekLabel(start: Date) {
  const end = addDays(start, 4);
  const format = (date: Date) => new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short" }).format(date);
  return `${format(start)} – ${format(end)} ${end.getFullYear()}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function arrangeDayItems(items: ScheduleItem[], axisStart: number, axisEnd: number) {
  const laneEnds: number[] = [];
  const events = [...items]
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    .map((item) => {
      const start = timeToMinutes(item.start_time);
      const end = timeToMinutes(item.end_time);
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;

      return {
        item,
        lane,
        left: ((start - axisStart) / (axisEnd - axisStart)) * 100,
        width: ((end - start) / (axisEnd - axisStart)) * 100,
      };
    });

  return { events, laneCount: Math.max(1, laneEnds.length) };
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
  const [form, setForm] = useState(() => {
    const currentWeek = mondayOf(new Date());
    const itemStartWeek = item?.starts_week ?? null;
    const startWeekChoice: StartWeekChoice = !itemStartWeek || itemStartWeek === dateKey(currentWeek)
      ? "this"
      : itemStartWeek === dateKey(addDays(currentWeek, 7)) ? "next" : "existing";
    return {
      ...blankForm,
      ...(item ? {
        title: item.title,
        day: item.day,
        start_time: item.start_time.slice(0, 5),
        end_time: item.end_time.slice(0, 5),
        room: item.room ?? "",
        type: item.type,
      } : {}),
      repeat_every_two_weeks: item?.repeat_every_two_weeks ?? false,
      start_week_choice: startWeekChoice,
    };
  });
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
    const currentWeek = mondayOf(new Date());
    const startsWeek = form.start_week_choice === "existing" && item?.starts_week
      ? item.starts_week
      : dateKey(form.start_week_choice === "next" ? addDays(currentWeek, 7) : currentWeek);
    const input: ScheduleItemInput = {
      title: form.title.trim(),
      day: Number(form.day),
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room.trim() || null,
      type: form.type,
      repeat_every_two_weeks: form.repeat_every_two_weeks,
      starts_week: form.repeat_every_two_weeks ? startsWeek : null,
    };
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
          <label className="repeat-toggle" htmlFor="class-repeat-biweekly">
            <input id="class-repeat-biweekly" data-testid="checkbox-repeat-biweekly" type="checkbox" checked={form.repeat_every_two_weeks} onChange={(event) => update("repeat_every_two_weeks", event.target.checked)} />
            <span>Opakovat každé dva týdny</span>
          </label>
          {form.repeat_every_two_weeks && <fieldset className="repeat-start-options">
            <legend>První týden výuky</legend>
            <label><input type="radio" name="repeat-start-week" data-testid="radio-repeat-start-this" checked={form.start_week_choice === "this"} onChange={() => update("start_week_choice", "this")} /> Tento týden</label>
            <label><input type="radio" name="repeat-start-week" data-testid="radio-repeat-start-next" checked={form.start_week_choice === "next"} onChange={() => update("start_week_choice", "next")} /> Příští týden</label>
            {form.start_week_choice === "existing" && item?.starts_week && <label><input type="radio" name="repeat-start-week" checked readOnly /> Původní začátek · {new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short", year: "numeric" }).format(dateFromKey(item.starts_week))}</label>}
          </fieldset>}
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
  const [itemsByOwner, setItemsByOwner] = useState<Record<string, ScheduleItem[]>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [compareFriendIds, setCompareFriendIds] = useState<string[]>([]);
  const [friendsDialogOpen, setFriendsDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<ScheduleItem | null | undefined>(undefined);
  const [signOutError, setSignOutError] = useState("");
  const isCurrentWeek = weekStart.getTime() === currentMonday.getTime();
  const selectedFriendId = selectedFriend?.user_id ?? null;
  const loadSequence = useRef(0);
  const friendshipSequence = useRef(0);
  const displayedOwnerIds = useMemo(
    () => selectedFriendId ? [selectedFriendId] : [userId, ...compareFriendIds],
    [compareFriendIds, selectedFriendId, userId],
  );

  const loadFriends = useCallback(async () => {
    const sequence = ++friendshipSequence.current;
    setFriendsLoading(true);
    setFriendsError("");
    try {
      const relationships = await listFriendships(userId);
      if (sequence === friendshipSequence.current) {
        const accepted = relationships
          .filter((relationship) => relationship.status === "accepted")
          .map((relationship) => relationship.other);
        const acceptedIds = new Set(accepted.map((friend) => friend.user_id));
        setFriends(accepted);
        setSelectedFriend((current) => current && !accepted.some((friend) => friend.user_id === current.user_id) ? null : current);
        setCompareFriendIds((current) => current.filter((friendId) => acceptedIds.has(friendId)));
      }
    } catch (error) {
      if (sequence === friendshipSequence.current) {
        setFriendsError(friendlyError(error, "Seznam přátel se nepodařilo načíst."));
      }
    } finally {
      if (sequence === friendshipSequence.current) setFriendsLoading(false);
    }
  }, [userId]);

  const loadItems = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const results = await Promise.all(displayedOwnerIds.map(async (ownerId) => {
        try {
          const scheduleItems = ownerId === userId
            ? await listScheduleItems(userId)
            : await listFriendScheduleItems(userId, ownerId);
          return { ownerId, items: scheduleItems, error: "" };
        } catch (error) {
          return { ownerId, items: [], error: friendlyError(error, "Rozvrh se nepodařilo načíst.") };
        }
      }));
      if (sequence === loadSequence.current) {
        setItemsByOwner(Object.fromEntries(results.map((result) => [result.ownerId, result.items])));
        setLoadErrors(Object.fromEntries(results.filter((result) => result.error).map((result) => [result.ownerId, result.error])));
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [displayedOwnerIds, userId]);

  useEffect(() => {
    void loadItems();
    return () => { loadSequence.current += 1; };
  }, [loadItems]);

  useEffect(() => {
    if (!selectedFriendId && compareFriendIds.length === 0) return;
    const interval = window.setInterval(() => { void loadItems(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [compareFriendIds.length, loadItems, selectedFriendId]);

  useEffect(() => {
    void loadFriends();
    const interval = window.setInterval(() => { void loadFriends(); }, 60_000);
    return () => {
      window.clearInterval(interval);
      friendshipSequence.current += 1;
    };
  }, [loadFriends]);

  const schedules = useMemo(() => {
    if (selectedFriend) {
      return [{
        userId: selectedFriend.user_id,
        label: selectedFriend.display_name,
        isOwn: false,
        items: itemsByOwner[selectedFriend.user_id] ?? [],
        error: loadErrors[selectedFriend.user_id],
      }];
    }
    return [
      {
        userId,
        label: "Můj rozvrh",
        isOwn: true,
        items: itemsByOwner[userId] ?? [],
        error: loadErrors[userId],
      },
      ...friends
        .filter((friend) => compareFriendIds.includes(friend.user_id))
        .map((friend) => ({
          userId: friend.user_id,
          label: friend.display_name,
          isOwn: false,
          items: itemsByOwner[friend.user_id] ?? [],
          error: loadErrors[friend.user_id],
        })),
    ];
  }, [compareFriendIds, friends, itemsByOwner, loadErrors, selectedFriend, userId]);
  const weekSchedules = useMemo(() => schedules.map((schedule) => ({
    ...schedule,
    items: schedule.items.filter((item) => item.day >= 1 && item.day <= 5 && isScheduledThisWeek(item, weekStart)),
  })), [schedules, weekStart]);
  const shownItems = useMemo(() => weekSchedules.flatMap((schedule) => schedule.items), [weekSchedules]);
  const hasAnySavedItems = schedules.some((schedule) => schedule.items.some((item) => item.day >= 1 && item.day <= 5));
  const hasScheduleLoadErrors = schedules.some((schedule) => Boolean(schedule.error));
  const primaryLoadError = loadErrors[selectedFriendId ?? userId];

  const timelineBounds = useMemo(() => {
    const starts = shownItems.map((item) => timeToMinutes(item.start_time));
    const ends = shownItems.map((item) => timeToMinutes(item.end_time));
    const startHour = Math.min(7, Math.floor((starts.length ? Math.min(...starts) : 8 * 60) / 60));
    const endHour = Math.max(21, Math.ceil((ends.length ? Math.max(...ends) : 18 * 60) / 60));
    return { start: startHour * 60, end: endHour * 60, startHour, endHour };
  }, [shownItems]);
  const hourMarks = useMemo(
    () => Array.from({ length: timelineBounds.endHour - timelineBounds.startHour }, (_, index) => timelineBounds.startHour + index),
    [timelineBounds],
  );
  const timelineColumns = `96px 132px minmax(${Math.max(560, hourMarks.length * 78)}px, 1fr)`;

  function saveItem(item: ScheduleItem) {
    setItemsByOwner((current) => ({
      ...current,
      [userId]: [...(current[userId] ?? []).filter((existing) => existing.id !== item.id), item]
        .sort((a, b) => a.day - b.day || a.start_time.localeCompare(b.start_time)),
    }));
    setDialogItem(undefined);
  }

  function toggleFriendComparison(friendId: string, shouldCompare: boolean) {
    setSelectedFriend(null);
    setCompareFriendIds((current) => shouldCompare
      ? current.includes(friendId) ? current : [...current, friendId]
      : current.filter((id) => id !== friendId));
  }

  function openFriendSchedule(friend: Profile) {
    setCompareFriendIds([]);
    setSelectedFriend(friend);
  }

  const email = user?.email ?? "";
  const initials = email ? email.slice(0, 1).toLocaleUpperCase("cs-CZ") : "S";
  const isComparing = !selectedFriend && compareFriendIds.length > 0;

  return (
    <div className="app-shell">
      <header className="topbar"><div className="topbar-title">rozvrh<span>.</span></div></header>
      <div className="schedule-layout">
        <aside className="schedule-sidebar" aria-label="Výběr rozvrhu">
          <div className="sidebar-list">
            <span className="sidebar-group-label">VAŠE ROZVRHY</span>
            <button
              type="button"
              data-testid="button-own-schedule"
              className={`sidebar-schedule-option${selectedFriend ? "" : " active"}`}
              aria-pressed={!selectedFriend}
              onClick={() => setSelectedFriend(null)}
            >
              <span className="sidebar-option-icon"><CalendarDays size={17} /></span>
              <span className="sidebar-option-copy"><strong>Můj rozvrh</strong><small>Osobní rozvrh</small></span>
            </button>
            <span className="sidebar-group-label friends-group-label">PŘÁTELÉ</span>
            {friendsLoading && friends.length === 0 && <div className="sidebar-status" role="status">Načítám přátele…</div>}
            {friendsError && <div className="sidebar-error" role="alert"><span>{friendsError}</span><button type="button" onClick={() => void loadFriends()}>Obnovit</button></div>}
            {!friendsLoading && !friendsError && friends.length === 0 && <div className="sidebar-status">Zatím nemáte žádné přátele.</div>}
            {friends.map((friend) => <div className="sidebar-friend-row" key={friend.user_id}>
              <label className="friend-compare-control" title={`Porovnat s rozvrhem ${friend.display_name}`}>
                <input
                  type="checkbox"
                  data-testid={`checkbox-compare-friend-${friend.user_id}`}
                  checked={!selectedFriend && compareFriendIds.includes(friend.user_id)}
                  onChange={(event) => toggleFriendComparison(friend.user_id, event.target.checked)}
                  aria-label={`Porovnat rozvrh s ${friend.display_name}`}
                />
              </label>
              <button
                type="button"
                className={`sidebar-schedule-option friend-option${selectedFriendId === friend.user_id ? " active" : ""}`}
                data-testid={`button-friend-schedule-${friend.user_id}`}
                aria-pressed={selectedFriendId === friend.user_id}
                onClick={() => openFriendSchedule(friend)}
                title={`Zobrazit pouze rozvrh uživatele ${friend.display_name}`}
              >
                <span className="friend-avatar" aria-hidden="true">{friend.display_name.slice(0, 1).toLocaleUpperCase("cs-CZ")}</span>
                <span className="sidebar-option-copy"><strong>{friend.display_name}</strong><small>@{friend.username}</small></span>
              </button>
            </div>)}
            <button type="button" data-testid="button-open-friends" className="sidebar-manage-button" onClick={() => setFriendsDialogOpen(true)}>
              <Users size={16} /><span>Spravovat přátele</span>
            </button>
          </div>
        </aside>
        <main className="schedule-main">
        <section className={`schedule-intro${selectedFriend ? " friend-view-intro" : ""}`}>
          <div>
            <p className="eyebrow">{selectedFriend ? "SDÍLENÝ ROZVRH" : isComparing ? "SROVNÁNÍ ROZVRHŮ" : "OSOBNÍ ROZVRH"}</p>
            <h1>{selectedFriend ? `Rozvrh ${selectedFriend.display_name}` : isComparing ? <>Porovnání<span>.</span></> : <>Váš týden<span>.</span></>}</h1>
            {selectedFriend && <p className="friend-subtitle">@{selectedFriend.username} · sdílí s vámi svůj rozvrh</p>}
            {isComparing && <p className="friend-subtitle">Váš rozvrh a vybraní přátelé, seřazení po dnech.</p>}
          </div>
          <div className="intro-actions">
            <span className="user-avatar" title={email}>{initials}</span>
            <button type="button" className="signout-button" data-testid="button-signout" onClick={async () => { setSignOutError(""); try { await signOut(); } catch { setSignOutError("Odhlášení se nepodařilo. Zkuste to znovu."); } }} aria-label="Odhlásit se"><LogOut size={17} /></button>
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
          <div className="timeline-loading" aria-label="Načítám rozvrh"><div className="skeleton-timeline-row" /><div className="skeleton-timeline-row" /><div className="skeleton-timeline-row" /></div>
        ) : primaryLoadError ? (
          <section className="state-panel error-state"><div className="state-icon"><CalendarDays size={23} /></div><h2>Rozvrh se nepodařilo načíst</h2><p>{primaryLoadError}</p><button type="button" className="button button-soft" data-testid="button-retry-load" onClick={loadItems}>Zkusit znovu</button></section>
        ) : !hasAnySavedItems && !hasScheduleLoadErrors ? (
          <section className="empty-panel">
            <div className="empty-illustration"><div className="empty-paper"><span /><span /><span /></div><div className="empty-orbit"><Plus size={18} /></div></div>
            <p className="eyebrow">{selectedFriend ? "SDÍLENÝ ROZVRH" : isComparing ? "VYBRANÉ ROZVRHY" : "TÝDEN JE ZATÍM VOLNÝ"}</p>
            <h2>{selectedFriend ? "Tento rozvrh je zatím prázdný." : isComparing ? "Zatím tu nejsou žádné hodiny." : "Začněte první hodinou."}</h2>
            <p>{selectedFriend ? `${selectedFriend.display_name} zatím nemá přidané žádné hodiny.` : isComparing ? "Ve vašem ani vybraných rozvrzích zatím nejsou přidané hodiny." : "Přidejte předmět a čas výuky. Váš rozvrh zůstává soukromý."}</p>
            {!selectedFriend && <button type="button" className="button button-primary" data-testid="button-empty-add" onClick={() => setDialogItem(null)}><Plus size={17} /> Přidat první výuku</button>}
          </section>
        ) : (
          <>
            <section className="timeline-scroll" aria-label={`Rozvrh na týden ${weekLabel(weekStart)}`}>
              <div className="timeline-table">
                <div className="timeline-header" style={{ gridTemplateColumns: timelineColumns }}>
                  <div className="timeline-day-label timeline-corner">DEN</div>
                  <div className="timeline-owner-header">ROZVRH</div>
                  <div className="timeline-hours" style={{ gridTemplateColumns: `repeat(${hourMarks.length}, minmax(78px, 1fr))` }}>
                    {hourMarks.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}
                  </div>
                </div>
              {weekdays.map((day, index) => {
                const dayDate = addDays(weekStart, index);
                const isToday = dayDate.toDateString() === new Date().toDateString();
                const daySchedules = weekSchedules.map((schedule, scheduleIndex) => {
                  const dayItems = schedule.items.filter((item) => item.day === index + 1);
                  return {
                    ...schedule,
                    dayItems,
                    scheduleIndex,
                    layout: arrangeDayItems(dayItems, timelineBounds.start, timelineBounds.end),
                  };
                });
                return <div key={day} className="timeline-day-group" style={{ gridTemplateColumns: timelineColumns }}>
                  <div className={`timeline-day-label ${isToday ? "is-today" : ""}`} style={{ gridRow: `span ${daySchedules.length}` }}><span>{day}</span><b>{dayDate.getDate()}</b></div>
                  {daySchedules.map((schedule) => <Fragment key={`${day}-${schedule.userId}`}>
                    <div className="timeline-owner-label" title={schedule.label}>{schedule.isOwn ? "Vy" : schedule.label}</div>
                    <div className="timeline-track" style={{ height: `${Math.max(56, schedule.layout.laneCount * 48 + 8)}px` }}>
                      {hourMarks.map((hour) => <i key={hour} className="timeline-gridline" style={{ left: `${((hour * 60 - timelineBounds.start) / (timelineBounds.end - timelineBounds.start)) * 100}%` }} />)}
                      {schedule.error ? <span className="timeline-empty timeline-track-error" title={schedule.error}>Nelze načíst</span> : schedule.dayItems.length === 0 ? <span className="timeline-empty">Volno</span> : schedule.layout.events.map(({ item, lane, left, width }, itemIndex) => {
                        const eventClass = `timeline-event class-color-${(index + schedule.scheduleIndex + itemIndex) % 4}`;
                        const eventStyle = { left: `${left}%`, width: `${width}%`, top: `${4 + lane * 48}px` };
                        const eventLabel = `${item.title}, ${item.type}, ${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)}${item.room ? `, místnost ${item.room}` : ""}`;
                        const eventContent = <>
                          <span className="timeline-event-time">{item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</span>
                          <strong className="timeline-event-title">{item.title}</strong>
                          <span className="timeline-event-details">{item.type}{item.room ? ` · ${item.room}` : ""}</span>
                          {schedule.isOwn && <Pencil className="timeline-event-edit-icon" size={11} aria-hidden="true" />}
                        </>;
                        return schedule.isOwn
                          ? <button type="button" className={eventClass} key={item.id} data-testid={`card-schedule-item-${item.id}`} style={eventStyle} title={eventLabel} aria-label={`Upravit: ${eventLabel}`} onClick={() => setDialogItem(item)}>{eventContent}</button>
                          : <article className={eventClass} key={item.id} data-testid={`card-schedule-item-${item.id}`} style={eventStyle} title={eventLabel} aria-label={eventLabel}>{eventContent}</article>;
                      })}
                    </div>
                  </Fragment>)}
                </div>;
              })}
              </div>
            </section>
            <div className="schedule-foot"><span><BookOpen size={14} /> Výuky v zobrazených rozvrzích: {shownItems.length}</span><span>Časy jsou v místním čase</span></div>
          </>
        )}
        </main>
      </div>
      {dialogItem !== undefined && <ScheduleForm item={dialogItem} userId={userId} onClose={() => setDialogItem(undefined)} onSaved={saveItem} onDeleted={(id) => { setItemsByOwner((current) => ({ ...current, [userId]: (current[userId] ?? []).filter((item) => item.id !== id) })); setDialogItem(undefined); }} />}
      {friendsDialogOpen && <FriendsDialog userId={userId} onClose={() => { setFriendsDialogOpen(false); void loadFriends(); }} onSelectFriend={(profile) => { openFriendSchedule(profile); setFriendsDialogOpen(false); void loadFriends(); }} onFriendshipRemoved={(friendId) => { if (selectedFriendId === friendId) setSelectedFriend(null); setCompareFriendIds((current) => current.filter((id) => id !== friendId)); void loadFriends(); }} />}
    </div>
  );
}

export default function RozvrhPage() {
  const { status, user } = useAuth();
  if (status === "authenticated" && user?.id) return <ScheduleApp key={user.id} userId={user.id} />;
  return <AuthScreen />;
}