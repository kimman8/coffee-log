# Espresso Log

A shared espresso shot log for two people in one "household". Vite + React 19 + TypeScript, Supabase (Postgres, magic-link auth, row-level security). No backend of our own: the browser talks to Supabase directly, and RLS is the only thing enforcing access.

## Commands

- `npm run dev`: dev server on http://localhost:5173
- `npm run build`: type-check (`tsc -b`) and build. Run it after changes; it's the main check.
- `npm run lint`: oxlint. Two `set-state-in-effect` warnings (data loading on mount in `App.tsx` and `ShotLog.tsx`) are known and accepted.
- No test suite yet.

## Environment and secrets

- `.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `.env.example` has placeholders only.
- `.gitignore` ignores `.env*` except `.env.example`. Never hardcode keys or print `.env.local` values.
- Magic links only work for URLs listed in Supabase → Authentication → URL Configuration (Site URL + Redirect URLs). Add each new deploy URL there.

## Data model

`espresso-log-schema.sql` is the source of truth and has already been applied to the Supabase project by hand. Changing the schema means writing SQL for the user to run in the Supabase SQL editor, then updating that file to match. The app does not run migrations.

- `households` (with `invite_code`), `household_members` (`display_name`), `beans`, `shots`.
- Households are created and joined only through the `create_household` and `join_household` RPCs. Never insert into `households` or `household_members` directly.
- RLS: members read everything in their household; beans are editable by any member; shots are editable and deletable only by the person who pulled them.
- `shots → household_members` is a composite FK `(household_id, user_id)`, which is what lets `select('..., household_members(display_name))` embed who pulled a shot.
- Finishing a bag sets `beans.archived = true`. Beans are never deleted from the UI, so old shots keep their bean name.

## Code map

- `src/supabase.ts`: the single client; throws if env vars are missing.
- `src/types.ts`: hand-written row types (only the columns the app uses). Keep them in sync with the schema.
- `src/format.ts`: number parsing (`num` accepts a comma decimal), ratio, days off roast, day and time labels.
- `src/App.tsx`: session → membership → screen switch, plus the header account menu (invite code, sign out).
- `src/Login.tsx`, `src/HouseholdSetup.tsx`: pre-household screens.
- `src/ShotLog.tsx`: data loading, the shot form (new and edit), the fixed action bar.
- `src/BeanPicker.tsx`: bean tabs, new bag, "Mark finished".
- `src/ShotList.tsx`: recent shots grouped by day.
- `src/index.css`: all styling.

## Behaviour to preserve

- **Default bean** is the bean of the current user's own last shot (not the household's). Chips are ordered by the user's most recent use, then unused beans newest first.
- **Pre-fill:** choosing a bean fills dose and grind from the user's last shot with that bean. A bean with no history keeps the current dose (or the user's last dose with any bean) and clears grind. After logging, the bean stays selected and the form pre-fills again. Never pre-fill while editing.
- **Editing:** tapping your own shot card loads it into the main form. Delete lives in edit mode. Other people's cards aren't tappable.
- **RLS blocks fail silently** (0 rows, no error), so update and delete calls chain `.select('id')` and treat an empty result as a failure. Keep doing this.
- `BeanPicker` renders inside the shot `<form>`, so it must not contain a nested `<form>`; Enter in its inputs is intercepted to save the bean.

## UI conventions

- Plain CSS only, no styling library or component kit, unless the user asks. Colours are CSS variables on `:root` (porcelain, espresso, crema, steel, rule, wash, red) with a `prefers-color-scheme: dark` override; use the tokens rather than new hex values.
- Design direction is "a barista's recipe card": the shot form is three large condensed figures written as a recipe (`18 g in / 36 g out / 28 seconds`), and that is the one bold element. History is a notebook of aligned rows, not cards. Crema is for large type and fills only (it fails contrast as small text).
- Type is Archivo Variable (`@fontsource-variable/archivo/wdth.css`, bundled, no Google Fonts request): `font-stretch: var(--narrow)` for figures, normal width for text.
- Avoid the generic-UI habits this design replaced: ALL-CAPS labels, `A · B · C` meta strings, identical rounded cards with shadows, pill chips, monospace data labels, floating toasts. Confirm actions on the button itself ("Log shot" → "Logged").
- Mobile first: the app is used one-handed next to the machine. Tap targets ≥ 44px, inputs ≥ 16px font (prevents iOS zoom), `inputMode="decimal"` for numbers.
- Keep it minimal: the user prefers small, focused changes and wants a plan approved before larger features.
