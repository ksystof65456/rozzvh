import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Check, Clock3, Coffee, LoaderCircle, MessageCircle, Phone, RefreshCw, Send, UsersRound, X } from 'lucide-react';
import { type Profile } from '@/lib/friends';
import {
  cancelFriendEvent,
  listFriendEvents,
  proposeFriendEvent,
  respondToFriendEvent,
  type FriendEvent,
  type FriendEventType,
} from '@/lib/friend-events';
import './friend-events-dialog.css';

type FriendEventsDialogProps = {
  userId: string;
  friends: Profile[];
  onClose: () => void;
};

const EVENT_TYPES: { value: FriendEventType; label: string; icon: typeof Coffee }[] = [
  { value: 'lunch', label: 'Oběd', icon: Coffee },
  { value: 'phone_call', label: 'Telefonát', icon: Phone },
  { value: 'other', label: 'Jiné', icon: MessageCircle },
];

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/(friend_events|schema cache|does not exist|permission denied)/i.test(message)) {
    return 'Databáze pro jednorázová setkání není připravená. Spusťte aktuální soubor supabase/schema.sql v Supabase SQL Editoru.';
  }
  if (/network|fetch|timeout/i.test(message)) return 'Nepodařilo se připojit. Zkontrolujte internet a zkuste to znovu.';
  return message || 'Něco se nepodařilo. Zkuste to prosím znovu.';
}

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Čas není dostupný';
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function typeLabel(type: FriendEventType) {
  return EVENT_TYPES.find((item) => item.value === type)?.label ?? 'Setkání';
}

function personName(profile: Profile | undefined) {
  return profile?.display_name?.trim() || (profile?.username ? `@${profile.username}` : 'Přítel');
}

function statusLabel(event: FriendEvent, userId: string) {
  if (event.status === 'accepted') return 'Domluveno';
  if (event.status === 'declined') return 'Odmítnuto';
  if (event.status === 'cancelled') return 'Zrušeno';
  return event.proposer_id === userId ? 'Čeká na odpověď' : 'Čeká na vás';
}

export function FriendEventsDialog({ userId, friends, onClose }: FriendEventsDialogProps) {
  const [events, setEvents] = useState<FriendEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [inviteeId, setInviteeId] = useState(friends[0]?.user_id ?? '');
  const [eventType, setEventType] = useState<FriendEventType>('lunch');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [formError, setFormError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);

  const incoming = useMemo(
    () => events.filter((event) => event.status === 'proposed' && event.invitee_id === userId),
    [events, userId],
  );
  const outgoing = useMemo(
    () => events.filter((event) => event.status === 'proposed' && event.proposer_id === userId),
    [events, userId],
  );
  const accepted = useMemo(
    () => events.filter((event) => event.status === 'accepted'),
    [events],
  );
  const history = useMemo(
    () => events.filter((event) => event.status === 'declined' || event.status === 'cancelled'),
    [events],
  );

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true);
    setLoadError('');
    try {
      setEvents(await listFriendEvents(userId));
    } catch (error) {
      setLoadError(messageFor(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(true);
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [userId, onClose]);

  useEffect(() => {
    if (!inviteeId && friends.length > 0) setInviteeId(friends[0].user_id);
  }, [friends, inviteeId]);

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setActionError('');
    setSuccess('');
    const cleanTitle = title.trim();
    if (!inviteeId || !friends.some((friend) => friend.user_id === inviteeId)) {
      setFormError('Vyberte přítele, kterému chcete návrh poslat.');
      return;
    }
    if (!cleanTitle || cleanTitle.length > 60) {
      setFormError('Název musí mít 1 až 60 znaků.');
      return;
    }
    const selectedDate = new Date(startsAt);
    if (!startsAt || Number.isNaN(selectedDate.getTime()) || selectedDate.getTime() <= Date.now()) {
      setFormError('Vyberte datum a čas v budoucnosti.');
      return;
    }
    setSending(true);
    try {
      await proposeFriendEvent(userId, {
        invitee_id: inviteeId,
        title: cleanTitle,
        description: description.trim() || null,
        event_type: eventType,
        starts_at: selectedDate.toISOString(),
      });
      setTitle('');
      setDescription('');
      setStartsAt('');
      setSuccess('Návrh byl odeslán.');
      await refresh();
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setSending(false);
    }
  }

  async function runEventAction(eventId: string, operation: () => Promise<void>, message: string) {
    setBusyId(eventId);
    setActionError('');
    setSuccess('');
    try {
      await operation();
      setSuccess(message);
      await refresh();
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setBusyId(null);
    }
  }

  function renderEvent(event: FriendEvent, group: 'incoming' | 'outgoing' | 'accepted' | 'history') {
    const isIncoming = group === 'incoming';
    const isCancelable = event.status === 'proposed' || event.status === 'accepted';
    const TypeIcon = EVENT_TYPES.find((item) => item.value === event.event_type)?.icon ?? CalendarClock;
    const other = personName(event.other);
    return (
      <article className={`fe-event fe-event--${event.status}`} key={event.id}>
        <div className="fe-event-mark" aria-hidden="true"><TypeIcon size={18} /></div>
        <div className="fe-event-main">
          <div className="fe-event-topline">
            <span className="fe-type-label">{typeLabel(event.event_type)}</span>
            <span className={`fe-status fe-status--${event.status}`}>{statusLabel(event, userId)}</span>
          </div>
          <h4>{event.title}</h4>
          <p className="fe-event-meta"><Clock3 size={14} aria-hidden="true" />{formatDate(event.starts_at)}</p>
          <p className="fe-event-person">
            {group === 'incoming' ? `Od: ${other}` : group === 'outgoing' ? `Pro: ${other}` : `S: ${other}`}
          </p>
          {event.description && <p className="fe-event-note">{event.description}</p>}
          {(isIncoming || isCancelable) && (
            <div className="fe-event-actions">
              {isIncoming && <>
                <button
                  type="button"
                  className="fe-button fe-button--accept"
                  disabled={busyId === event.id}
                  onClick={() => void runEventAction(event.id, () => respondToFriendEvent(userId, event.id, 'accepted'), 'Setkání je domluveno.')}
                ><Check size={15} /> Přijmout</button>
                <button
                  type="button"
                  className="fe-button fe-button--quiet"
                  disabled={busyId === event.id}
                  onClick={() => void runEventAction(event.id, () => respondToFriendEvent(userId, event.id, 'declined'), 'Návrh byl odmítnut.')}
                >Odmítnout</button>
              </>}
              {isCancelable && <button
                type="button"
                className="fe-button fe-button--cancel"
                disabled={busyId === event.id}
                onClick={() => void runEventAction(event.id, () => cancelFriendEvent(userId, event.id), 'Setkání bylo zrušeno.')}
              >Zrušit</button>}
              {busyId === event.id && <span className="fe-inline-busy" role="status"><LoaderCircle size={14} /> Ukládám</span>}
            </div>
          )}
        </div>
      </article>
    );
  }

  const minDateTime = localDateTime(new Date(Date.now() + 60_000));

  return (
    <div
      className="fe-backdrop"
      data-testid="friend-events-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="fe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fe-dialog-title"
        tabIndex={-1}
        data-testid="friend-events-dialog"
      >
        <header className="fe-header">
          <div className="fe-header-copy">
            <p className="fe-eyebrow">ČAS SPOLU</p>
            <h2 id="fe-dialog-title">Domluvte se.</h2>
            <p>Navrhněte chvíli, která se hodí vám oběma.</p>
          </div>
          <div className="fe-header-art" aria-hidden="true"><CalendarClock size={25} /><span /></div>
          <button className="fe-close" type="button" aria-label="Zavřít domluvy" onClick={onClose}><X size={19} /></button>
        </header>

        {(actionError || success) && (
          <div className={`fe-feedback ${actionError ? 'fe-feedback--error' : 'fe-feedback--success'}`} role={actionError ? 'alert' : 'status'}>
            {actionError || success}
            {actionError && <button type="button" onClick={() => setActionError('')} aria-label="Zavřít chybovou zprávu"><X size={14} /></button>}
          </div>
        )}

        <div className="fe-layout">
          <section className="fe-compose" aria-labelledby="fe-compose-title">
            <div className="fe-section-heading">
              <span className="fe-section-index">01</span>
              <div><h3 id="fe-compose-title">Navrhnout setkání</h3><p>Pošlete příteli pozvánku.</p></div>
            </div>
            {friends.length === 0 ? (
              <div className="fe-no-friends"><UsersRound size={19} /><p>Nemáte zatím žádné přátele, kterým byste mohli napsat.</p></div>
            ) : (
              <form className="fe-form" onSubmit={(event) => void submitProposal(event)} noValidate>
                <label htmlFor="fe-invitee">Komu</label>
                <select id="fe-invitee" value={inviteeId} onChange={(event) => setInviteeId(event.target.value)} disabled={sending}>
                  {friends.map((friend) => <option value={friend.user_id} key={friend.user_id}>{personName(friend)} · @{friend.username}</option>)}
                </select>

                <span className="fe-field-label">Co podniknete</span>
                <div className="fe-kind-picker" role="group" aria-label="Typ setkání">
                  {EVENT_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      type="button"
                      key={value}
                      className={`fe-kind-option${eventType === value ? ' is-selected' : ''}`}
                      aria-pressed={eventType === value}
                      onClick={() => setEventType(value)}
                      disabled={sending}
                    ><Icon size={15} /><span>{label}</span></button>
                  ))}
                </div>

                <label htmlFor="fe-title">Název</label>
                <div className="fe-input-wrap">
                  <input id="fe-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder="Třeba oběd po přednášce" required disabled={sending} />
                  <span className="fe-character-count" aria-live="polite">{title.length}/60</span>
                </div>

                <label htmlFor="fe-starts">Kdy</label>
                <input id="fe-starts" type="datetime-local" value={startsAt} min={minDateTime} onChange={(event) => setStartsAt(event.target.value)} required disabled={sending} />
                <label htmlFor="fe-note">Poznámka <span className="fe-optional">nepovinné</span></label>
                <textarea id="fe-note" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} rows={2} placeholder="Místo nebo pár slov navíc…" disabled={sending} />
                <div className="fe-form-bottom">
                  <span>{description.length}/240</span>
                  <button className="fe-send-button" type="submit" disabled={sending || friends.length === 0}>
                    {sending ? <LoaderCircle size={16} className="fe-spin" /> : <Send size={15} />}
                    {sending ? 'Odesílám…' : 'Poslat návrh'}
                  </button>
                </div>
                {formError && <p className="fe-form-error" role="alert">{formError}</p>}
              </form>
            )}
          </section>

          <section className="fe-plans" aria-labelledby="fe-plans-title">
            <div className="fe-section-heading fe-plans-heading">
              <span className="fe-section-index">02</span>
              <div><h3 id="fe-plans-title">Vaše domluvy</h3><p>Návrhy i potvrzená setkání.</p></div>
              {!loading && !loadError && <span className="fe-total-count">{events.length}</span>}
            </div>
            {loadError && (
              <div className="fe-load-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => void refresh(true)}><RefreshCw size={14} /> Zkusit znovu</button></div>
            )}
            {loading ? (
              <div className="fe-skeleton-list" role="status" aria-label="Načítám domluvy"><i /><i /><i /></div>
            ) : !loadError && events.length === 0 ? (
              <div className="fe-empty"><span className="fe-empty-mark"><CalendarClock size={20} /></span><h4>Zatím tu nic není.</h4><p>Jakmile někomu pošlete návrh nebo vám přijde pozvánka, objeví se tady.</p></div>
            ) : !loadError ? (
              <div className="fe-event-groups">
                {incoming.length > 0 && <section className="fe-event-group" aria-labelledby="fe-incoming-title"><h4 id="fe-incoming-title">Čeká na vaši odpověď <span>{incoming.length}</span></h4>{incoming.map((item) => renderEvent(item, 'incoming'))}</section>}
                {outgoing.length > 0 && <section className="fe-event-group" aria-labelledby="fe-outgoing-title"><h4 id="fe-outgoing-title">Odeslané návrhy <span>{outgoing.length}</span></h4>{outgoing.map((item) => renderEvent(item, 'outgoing'))}</section>}
                {accepted.length > 0 && <section className="fe-event-group" aria-labelledby="fe-accepted-title"><h4 id="fe-accepted-title">Potvrzená setkání <span>{accepted.length}</span></h4>{accepted.map((item) => renderEvent(item, 'accepted'))}</section>}
                {history.length > 0 && <details className="fe-history"><summary>Uzavřené návrhy <span>{history.length}</span></summary>{history.map((item) => renderEvent(item, 'history'))}</details>}
              </div>
            ) : null}
          </section>
        </div>
        <footer className="fe-footer"><span>Vaše domluvy vidí pouze jejich účastníci.</span><button type="button" onClick={onClose}>Hotovo</button></footer>
      </section>
    </div>
  );
}

export default FriendEventsDialog;
