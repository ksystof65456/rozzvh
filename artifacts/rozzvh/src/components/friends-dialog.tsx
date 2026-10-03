import { useEffect, useState, type ReactNode } from 'react';
import { Check, Clock3, RefreshCw, Search, Send, UserRoundPlus, UsersRound, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import {
  getOwnProfile,
  listFriendships,
  type Profile,
  type FriendConnection,
  removeFriendship,
  requestFriendship,
  respondToFriendship,
  searchProfiles,
  updateOwnProfile,
} from '@/lib/friends';

type FriendsDialogProps = {
  userId: string;
  onClose: () => void;
  onSelectFriend: (profile: Profile) => void;
  onFriendshipRemoved?: (friendId: string) => void;
};

type ProfileFields = { username: string; display_name: string };
type SearchFields = { username: string };

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  if (/profiles_username_unique_idx/i.test(text)) {
    return 'Toto uživatelské jméno už někdo používá.';
  }
  if (/friendships_unique_pair_idx|duplicate key/i.test(text)) {
    return 'Mezi těmito účty už čeká žádost nebo jsou přátelé.';
  }
  if (/profiles|friendships|search_profiles|username_available|schema cache/i.test(text)
    && /does not exist|not found|schema cache|permission|relation|column/i.test(text)) {
    return 'Databáze pro přátele není připravená. Spusťte aktuální soubor supabase/schema.sql v Supabase SQL Editoru.';
  }
  if (/network|fetch/i.test(text)) {
    return 'Nepodařilo se připojit. Zkontrolujte internet a zkuste to znovu.';
  }
  return text || 'Něco se nepodařilo. Zkuste to prosím znovu.';
}

function normalizedUsername(value: string) {
  return value.trim().replace(/^@/, '').toLocaleLowerCase('en-US');
}

export function FriendsDialog({ userId, onClose, onSelectFriend, onFriendshipRemoved }: FriendsDialogProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Profile[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);

  const profileForm = useForm<ProfileFields>({
    defaultValues: { username: '', display_name: '' },
  });
  const searchForm = useForm<SearchFields>({ defaultValues: { username: '' } });

  async function refresh() {
    setRefreshError('');
    try {
      const [ownProfile, friendships] = await Promise.all([
        getOwnProfile(userId),
        listFriendships(userId),
      ]);
      setProfile(ownProfile);
      setConnections(friendships);
      if (!profileForm.formState.isDirty) {
        profileForm.reset({
          username: ownProfile.username,
          display_name: ownProfile.display_name,
        });
      }
    } catch (error) {
      setRefreshError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [userId]);

  async function runMutation(operation: () => Promise<void>) {
    setBusy(true);
    setActionError('');
    try {
      await operation();
      setRemoveId(null);
      await refresh();
      return true;
    } catch (error) {
      setActionError(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile(values: ProfileFields) {
    setBusy(true);
    setActionError('');
    try {
      const username = normalizedUsername(values.username);
      const display_name = values.display_name.trim();
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        throw new Error('Uživatelské jméno musí mít 3–24 znaků: malá písmena, čísla nebo podtržítko.');
      }
      if (!display_name || display_name.length > 40) {
        throw new Error('Zobrazované jméno musí mít 1–40 znaků.');
      }
      const updated = await updateOwnProfile(userId, { username, display_name });
      setProfile(updated);
      profileForm.reset({ username: updated.username, display_name: updated.display_name });
      await refresh();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitSearch(values: SearchFields) {
    const username = normalizedUsername(values.username);
    setSearchError('');
    setSearchResults(null);
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setSearchError('Zadejte přesné uživatelské jméno (3–24 znaků).');
      return;
    }
    setSearching(true);
    try {
      const results = await searchProfiles(userId, username);
      setSearchResults(results);
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(friend: Profile) {
    const succeeded = await runMutation(() => requestFriendship(userId, friend.user_id));
    if (succeeded) {
      setSearchResults((current) => current?.filter((result) => result.user_id !== friend.user_id) ?? null);
    }
  }

  const incoming = connections.filter((connection) => connection.status === 'pending' && connection.direction === 'incoming');
  const outgoing = connections.filter((connection) => connection.status === 'pending' && connection.direction === 'outgoing');
  const friends = connections.filter((connection) => connection.status === 'accepted' && connection.direction === 'friend');
  const relationshipIds = new Set(connections.map((connection) => connection.other.user_id));

  return (
    <div
      className="friends-backdrop"
      data-testid="friends-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="friends-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-dialog-title"
        data-testid="friends-dialog"
      >
        <header className="friends-dialog-head">
          <div>
            <p className="eyebrow">SPOJENÍ SE SPOLUŽÁKY</p>
            <h2 id="friends-dialog-title">Přátelé</h2>
            <p className="friends-dialog-subtitle">Sdílejte rozvrhy jen s lidmi, které přijmete.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Zavřít přátele" data-testid="close-friends-dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {actionError && <div className="friends-alert" role="alert" data-testid="friends-action-error">{actionError}</div>}
        {refreshError && (
          <div className="friends-alert friends-refresh-error" role="alert" data-testid="friends-load-error">
            <span>{refreshError}</span>
            <button className="button button-soft" type="button" data-testid="retry-friends-load" onClick={() => { setLoading(true); void refresh(); }}>Zkusit znovu</button>
          </div>
        )}

        <div className="friends-dialog-content">
          <section className="friends-profile-panel" aria-labelledby="friends-profile-heading">
            <div className="friends-section-heading">
              <div className="friends-section-icon"><UsersRound size={17} /></div>
              <div>
                <h3 id="friends-profile-heading">Váš profil</h3>
                <p>Ostatní vás najdou přes přesné uživatelské jméno.</p>
              </div>
            </div>
            {loading && !profile ? (
              <div className="friends-skeleton" role="status" aria-label="Načítání profilu"><i /><i /><i /></div>
            ) : profile ? (
              <>
                <div className="friends-share-handle" data-testid="text-own-username">
                  <span>Vaše adresa</span>
                  <strong>@{profile.username}</strong>
                </div>
                <Form {...profileForm}>
                <form className="friends-profile-form" onSubmit={profileForm.handleSubmit(submitProfile)} data-testid="form-edit-profile">
                  <label htmlFor="friends-display-name">Zobrazované jméno</label>
                  <input
                    id="friends-display-name"
                    data-testid="input-display-name"
                    autoComplete="name"
                    maxLength={40}
                    {...profileForm.register('display_name', { required: 'Vyplňte zobrazované jméno.' })}
                  />
                  {profileForm.formState.errors.display_name && <span className="friends-inline-error">{profileForm.formState.errors.display_name.message}</span>}
                  <label htmlFor="friends-username">Uživatelské jméno</label>
                  <div className="friends-handle-input"><span aria-hidden="true">@</span><input
                    id="friends-username"
                    data-testid="input-own-username"
                    autoComplete="username"
                    maxLength={24}
                    {...profileForm.register('username', { required: 'Vyplňte uživatelské jméno.' })}
                  /></div>
                  {profileForm.formState.errors.username && <span className="friends-inline-error">{profileForm.formState.errors.username.message}</span>}
                  <p className="friends-hint">3–24 znaků: malá písmena, čísla a podtržítko.</p>
                  <button className="button button-soft friends-save-button" type="submit" disabled={busy || !profileForm.formState.isDirty} data-testid="save-own-profile">
                    {busy ? 'Ukládám…' : 'Uložit profil'}
                  </button>
                </form>
                </Form>
              </>
            ) : (
              !refreshError && <p className="friends-muted-state" data-testid="empty-own-profile">Profil se nepodařilo načíst.</p>
            )}
          </section>

          <section className="friends-search-panel" aria-labelledby="friends-search-heading">
            <div className="friends-section-heading">
              <div className="friends-section-icon"><UserRoundPlus size={17} /></div>
              <div>
                <h3 id="friends-search-heading">Najít spolužáka</h3>
                <p>Vyhledávání funguje pouze podle přesného @jména.</p>
              </div>
            </div>
            <Form {...searchForm}>
              <FormSearch
                form={searchForm}
                searching={searching}
                onSubmit={submitSearch}
              />
            </Form>
            {searchError && <p className="friends-inline-error" role="alert" data-testid="friends-search-error">{searchError}</p>}
            {searching && <p className="friends-search-status" role="status" data-testid="friends-search-loading">Hledám přesné jméno…</p>}
            {searchResults && !searching && (
              <div className="friends-search-results" data-testid="friends-search-results">
                {searchResults.length === 0 ? (
                  <p className="friends-muted-state" data-testid="empty-search-results">Tomuto jménu nikdo neodpovídá.</p>
                ) : searchResults.map((result) => {
                  const connected = relationshipIds.has(result.user_id);
                  const relationship = connections.find((connection) => connection.other.user_id === result.user_id);
                  const relationshipLabel = relationship?.status === 'accepted'
                    ? 'Již přátelé'
                    : relationship?.direction === 'incoming' ? 'Příchozí žádost' : 'Žádost odeslána';
                  return (
                    <div className="friends-person-row" key={result.user_id} data-testid={`search-result-${result.user_id}`}>
                      <PersonMark name={result.display_name} />
                      <div className="friends-person-copy"><strong>{result.display_name}</strong><span>@{result.username}</span></div>
                      <button
                        className="button button-primary friends-row-action"
                        type="button"
                        disabled={busy || connected}
                        data-testid={`send-friend-request-${result.user_id}`}
                        onClick={() => void sendRequest(result)}
                      >
                        {connected ? relationshipLabel : <><Send size={13} /> Přidat</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="friends-relationships" aria-labelledby="friends-relationships-heading">
            <div className="friends-relationship-title">
              <div className="friends-section-heading">
                <div className="friends-section-icon"><UsersRound size={17} /></div>
                <div>
                  <h3 id="friends-relationships-heading">Vaše spojení</h3>
                  <p>Přijatí přátelé mohou sdílet rozvrh.</p>
                </div>
              </div>
              <div className="friends-relationship-actions">
                <span className="friends-count" data-testid="text-friends-count">{friends.length} {friends.length === 1 ? 'přítel' : friends.length > 1 && friends.length < 5 ? 'přátelé' : 'přátel'}</span>
                <button className="button button-soft friends-refresh-button" type="button" disabled={loading || busy} data-testid="refresh-friends" onClick={() => { setLoading(true); void refresh(); }}>
                  <RefreshCw size={13} /> Obnovit
                </button>
              </div>
            </div>
            {loading && connections.length === 0 ? (
              <div className="friends-list-loading" role="status" data-testid="friends-list-loading"><i /><i /></div>
            ) : (
              <div className="friends-connection-groups">
                <ConnectionGroup
                  title="Příchozí žádosti"
                  empty="Zatím tu žádné příchozí žádosti nejsou."
                  entries={incoming}
                  testId="incoming-requests"
                  renderActions={(entry) => (
                    <>
                      <button className="button button-primary friends-row-action" type="button" disabled={busy} data-testid={`accept-request-${entry.id}`} onClick={() => void runMutation(() => respondToFriendship(userId, entry.id, 'accepted'))}><Check size={13} /> Přijmout</button>
                      <button className="button button-soft friends-row-action" type="button" disabled={busy} data-testid={`decline-request-${entry.id}`} onClick={() => void runMutation(() => respondToFriendship(userId, entry.id, 'declined'))}>Odmítnout</button>
                    </>
                  )}
                />
                <ConnectionGroup
                  title="Odeslané žádosti"
                  empty="Nemáte žádné čekající odeslané žádosti."
                  entries={outgoing}
                  testId="outgoing-requests"
                  renderActions={(entry) => (
                    <button className="button button-soft friends-row-action" type="button" disabled={busy} data-testid={`cancel-request-${entry.id}`} onClick={() => void runMutation(() => removeFriendship(userId, entry.id))}>Zrušit</button>
                  )}
                />
                <ConnectionGroup
                  title="Přátelé"
                  empty="Až přijmete žádost, rozvrh přítele se zobrazí tady."
                  entries={friends}
                  testId="accepted-friends"
                  renderActions={(entry) => (
                    <div className="friends-accepted-actions">
                      {removeId === entry.id ? (
                        <>
                          <button className="button button-danger friends-row-action" type="button" disabled={busy} data-testid={`confirm-remove-friend-${entry.id}`} onClick={() => { void runMutation(() => removeFriendship(userId, entry.id)).then((success) => { if (success) onFriendshipRemoved?.(entry.other.user_id); }); }}>Odebrat</button>
                          <button className="button button-soft friends-row-action" type="button" data-testid={`cancel-remove-friend-${entry.id}`} onClick={() => setRemoveId(null)}>Zpět</button>
                        </>
                      ) : (
                        <>
                          <button className="button button-primary friends-row-action" type="button" data-testid={`select-friend-${entry.id}`} onClick={() => onSelectFriend(entry.other)}>Zobrazit rozvrh</button>
                          <button className="button button-quiet-danger friends-row-action" type="button" disabled={busy} data-testid={`remove-friend-${entry.id}`} onClick={() => setRemoveId(entry.id)}>Odebrat</button>
                        </>
                      )}
                    </div>
                  )}
                />
              </div>
            )}
            {!loading && !refreshError && connections.length === 0 && (
              <div className="friends-empty-note" data-testid="empty-friendships">
                <Clock3 size={16} />
                <span>Vaše žádosti a přátelé se zobrazí na tomto místě.</span>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function FormSearch({
  form,
  searching,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<SearchFields>>;
  searching: boolean;
  onSubmit: (values: SearchFields) => Promise<void>;
}) {
  return (
    <form className="friends-search-form" onSubmit={form.handleSubmit(onSubmit)} data-testid="form-search-friends">
      <label htmlFor="friends-search">Uživatelské jméno</label>
      <div className="friends-search-input">
        <span aria-hidden="true">@</span>
        <input
          id="friends-search"
          type="search"
          placeholder="např. jana_n"
          autoComplete="off"
          aria-label="Přesné uživatelské jméno"
          data-testid="input-friend-search"
          {...form.register('username')}
        />
        <button type="submit" className="friends-search-submit" aria-label="Vyhledat spolužáka" disabled={searching} data-testid="search-friends">
          <Search size={16} />
        </button>
      </div>
    </form>
  );
}

function PersonMark({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('cs');
  return <span className="friends-person-mark" aria-hidden="true">{initials || '•'}</span>;
}

function ConnectionGroup({
  title,
  empty,
  entries,
  testId,
  renderActions,
}: {
  title: string;
  empty: string;
  entries: FriendConnection[];
  testId: string;
  renderActions: (entry: FriendConnection) => ReactNode;
}) {
  return (
    <section className="friends-group" aria-label={title} data-testid={testId}>
      <h4>{title}<span>{entries.length}</span></h4>
      {entries.length ? entries.map((entry) => (
        <div className="friends-person-row" key={entry.id} data-testid={`connection-${entry.id}`}>
          <PersonMark name={entry.other.display_name} />
          <div className="friends-person-copy"><strong>{entry.other.display_name}</strong><span>@{entry.other.username}</span></div>
          <div className="friends-row-actions">{renderActions(entry)}</div>
        </div>
      )) : <p className="friends-group-empty">{empty}</p>}
    </section>
  );
}