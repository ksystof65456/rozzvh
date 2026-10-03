# Rozvrh

Česká PWA pro týdenní rozvrh vysokoškoláků. Přihlášení, registrace i rozvrh používají Supabase; aplikace neobsahuje ukázková ani předvyplněná data.

## Supabase

1. V Supabase otevřete **SQL Editor** a spusťte celý soubor [`supabase/schema.sql`](./supabase/schema.sql).
2. V Supabase Authentication nastavte adresu aplikace jako **Site URL** a povolenou **Redirect URL**. Pro GitHub Pages bude mít tvar `https://<účet>.github.io/rozzvh/`.
3. Pro lokální vývoj zkopírujte `.env.example` do `.env.local` a vyplňte `VITE_SUPABASE_URL` a veřejný `VITE_SUPABASE_ANON_KEY` (případně publishable key). Nikdy nepoužívejte `service_role` klíč v klientské aplikaci.

Tabulka `schedule_items` používá dny 1–7 (pondělí–neděle), ukládá čas jako místní čas bez časového pásma a odmítne konec výuky před nebo ve stejnou dobu jako začátek. Rozvrh jiného uživatele lze číst pouze po přijetí žádosti o přátelství; čekající nebo odmítnuté žádosti přístup neposkytují.

Skript také vytvoří profily s jedinečnými uživatelskými jmény, vyhledávání přesné shody bez zveřejnění e-mailu a tabulku žádostí o přátelství. Existující účty dostanou při migraci automatické jméno ve tvaru `student_…`, které lze upravit v aplikaci. Po změně tohoto skriptu jej celý znovu spusťte v Supabase SQL Editoru.

PWA ukládá pro offline spuštění pouze aplikaci a její statické soubory. Rozvrh se vždy načítá z Supabase a vyžaduje připojení k internetu.

## GitHub Pages

Vite používá pro GitHub Pages základní cestu `/rozzvh/`. Ve své GitHub repository přidejte Actions secrets `VITE_SUPABASE_URL` a `VITE_SUPABASE_ANON_KEY`, zapněte Pages s deploymentem přes GitHub Actions a pushněte do větve `main` nebo spusťte workflow ručně. Build nasadí obsah `dist/public`.

Do Supabase Redirect URLs přidejte také lokální vývojovou adresu a produkční adresu Pages. V Supabase může být zapnuté potvrzení e-mailu; v takovém případě se po registraci zobrazí informace o ověření a uživatel se přihlásí po kliknutí na ověřovací odkaz.

## Vývoj

Z kořene workspace:

```sh
pnpm --filter @workspace/rozzvh run dev
pnpm --filter @workspace/rozzvh run typecheck
pnpm --filter @workspace/rozzvh run build
```