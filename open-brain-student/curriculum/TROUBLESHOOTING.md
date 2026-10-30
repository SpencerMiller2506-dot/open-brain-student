# Something wrong?

ENGLISH:
There is no support channel for this course — the plan is that you work
through problems with Claude, the same way you built everything else. Open a
conversation with Claude Code or claude.ai, paste this page or a screenshot
of what you're seeing, and ask it to run the fix. This page is organized by
what you're actually SEEING, not by which Level built the thing that broke —
find your symptom below.

SPANISH:
Este curso no tiene canal de soporte — la idea es que resuelvas los
problemas con Claude, igual que construiste todo lo demás. Abre una
conversación con Claude Code o claude.ai, pega esta página o una captura de
pantalla de lo que estás viendo, y pídele que aplique la solución. Esta
página está organizada por lo que en realidad estás VIENDO, no por qué Nivel
construyó lo que se rompió — busca tu síntoma abajo.

---

## "It worked before — now everything errors"

ENGLISH:
**Likely cause: your Supabase project paused itself.** Free-tier Supabase
projects pause after about a week with no real API activity. A paused
project looks exactly like a broken one from the outside — the app can't
reach the database at all.

**Confirm it:** run this with your own project URL and anon key (both are in
`config.js`) —

```
curl -s "https://YOUR-PROJECT.supabase.co/rest/v1/thoughts?select=id&limit=1" \
  -H "apikey: YOUR_ANON_KEY"
```

This is the same shape of request as the keep-alive check-in you set up in
[Level 2, Step 0b](Level-2-Feed.md) — the pg_cron job and the GitHub Actions
workflow both ping this exact endpoint. A live project answers in under a
second — real rows, an empty list, or even a permissions error, it doesn't
matter which, an answer is an answer. A paused one hangs or fails to connect
at all.

**Fix it:**
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and log in
2. Open your organization, find the project — it will be labelled "Paused"
3. Click **Resume project**, confirm

It comes back within a few minutes. Nothing is lost — same database, same
data, same config, same URL. This works for up to a year after a project
paused, which is Supabase's own limit, not this course's; you will not
realistically hit it.

**Reduce how often this happens:** Level 2, Step 0b already set up two
independent pings meant to keep the project active — say so plainly, as
that step does: neither is proven to actually stop a pause, only that a real
request goes out regularly. If it still happens, this page — not those
pings — is the actual fix.

SPANISH:
**Causa probable: tu proyecto de Supabase se pausó solo.** Los proyectos
gratuitos de Supabase se pausan después de una semana más o menos sin
actividad real de API. Un proyecto pausado se ve exactamente igual que uno
roto desde afuera — la app simplemente no puede alcanzar la base de datos.

**Confírmalo:** ejecuta esto con tu propia URL de proyecto y tu anon key
(ambas están en `config.js`) —

```
curl -s "https://YOUR-PROJECT.supabase.co/rest/v1/thoughts?select=id&limit=1" \
  -H "apikey: YOUR_ANON_KEY"
```

Es la misma forma de solicitud que el ping de mantenimiento que configuraste
en el [Nivel 2, Paso 0b](Level-2-Feed.md) — tanto el trabajo de pg_cron como
el flujo de GitHub Actions le pegan a este mismo endpoint. Un proyecto
activo responde en menos de un segundo — filas reales, una lista vacía, o
hasta un error de permisos, no importa cuál, una respuesta es una respuesta.
Uno pausado se queda colgado o directamente no conecta.

**Arréglalo:**
1. Ve a [supabase.com/dashboard](https://supabase.com/dashboard) e inicia sesión
2. Abre tu organización, busca el proyecto — va a decir "Paused"
3. Haz clic en **Resume project**, confirma

Vuelve en unos minutos. No se pierde nada — misma base de datos, mismos
datos, misma configuración, misma URL. Esto funciona hasta un año después de
que un proyecto se pausó, que es el límite propio de Supabase, no de este
curso; no lo vas a alcanzar en la práctica.

**Para que pase menos seguido:** el Nivel 2, Paso 0b ya configuró dos pings
independientes pensados para mantener el proyecto activo — y hay que decirlo
con claridad, tal como lo dice ese mismo paso: ninguno de los dos está
comprobado que de verdad evite una pausa, solo que sale una solicitud real
con regularidad. Si sigue pasando, esta página — no esos pings — es el
arreglo de verdad.

---

## Saving does nothing, or shows an error you don't understand

ENGLISH:
Check, roughly in order of how often each one is the actual cause:

1. **`config.js` still has its placeholder values.** Open it and check for
   `PASTE_YOUR_PROJECT_URL_HERE` or `PASTE_YOUR_ANON_KEY_HERE` — if either
   is still there, the app was never actually connected to a database.
2. **You're not signed in, or your session expired** (from Level 2 onward,
   once a login screen exists). Look at the status dot near the top of the
   app — it should say "Connected to your database," not "Not connected."
   Log out and back in.
3. **The project is paused.** See the symptom above — a paused project
   makes saving fail the same way it makes everything else fail.

SPANISH:
Revisa, más o menos en el orden de qué tan seguido es la causa real:

1. **`config.js` todavía tiene sus valores de relleno.** Ábrelo y busca
   `PASTE_YOUR_PROJECT_URL_HERE` o `PASTE_YOUR_ANON_KEY_HERE` — si alguno de
   los dos sigue ahí, la app nunca se llegó a conectar de verdad a una base
   de datos.
2. **No has iniciado sesión, o tu sesión expiró** (desde el Nivel 2 en
   adelante, una vez que existe una pantalla de inicio de sesión). Fíjate en
   el punto de estado cerca de la parte superior de la app — debería decir
   "Connected to your database", no "Not connected." Cierra sesión y vuelve
   a entrar.
3. **El proyecto está pausado.** Ve el síntoma de arriba — un proyecto
   pausado hace que guardar falle de la misma forma en que hace fallar todo
   lo demás.

---

## Search comes back empty, or finds the wrong things

ENGLISH:
What this means depends on which Level you last finished:

**Level 2 through 5 — you have keyword search only.** It matches the words
you typed, literally. Searching in different words than you saved won't
find the thought — that's expected at this stage, not a bug. Level 6 is
what fixes it.

**Level 6 or later — you should have search by meaning.** If it's not
finding things it should, the most likely cause is a thought that's missing
its embedding. Confirm it in the Supabase SQL Editor:

```sql
select count(*) from thoughts where embedding is null;
```

A number greater than zero means some thoughts are missing theirs. For a
**brand-new** capture, give it 10–15 seconds first — the embedding is
generated right after saving, not instantly (if it never arrives at all,
see the next symptom below instead). For **older** thoughts, re-run the same
loop from Level 6, Step 5 that called `backfill-embeddings` the first time —
it only ever processes thoughts where `embedding is null`, so running it
again is always safe and picks up exactly where it left off.

If you finished Level 7, the same idea applies to `thought_chunks` — check
`select count(*) from thought_chunks;` (that exact query is how Level 7,
Step 6 has you confirm its own backfill worked) and re-run `backfill-chunks`
from that step if the count looks low for how much you've captured.

SPANISH:
Lo que esto significa depende de qué Nivel terminaste por última vez:

**Nivel 2 al 5 — solo tienes búsqueda por palabra clave.** Coincide con las
palabras exactas que escribiste, literalmente. Buscar con palabras
distintas a las que usaste al guardar no va a encontrar el pensamiento —
eso es lo esperado en esta etapa, no un error. El Nivel 6 es lo que lo
arregla.

**Nivel 6 en adelante — deberías tener búsqueda por significado.** Si no
está encontrando lo que debería, la causa más probable es un pensamiento al
que le falta su embedding. Confírmalo en el SQL Editor de Supabase:

```sql
select count(*) from thoughts where embedding is null;
```

Un número mayor que cero significa que a algunos pensamientos les falta el
suyo. Para una captura **recién hecha**, dale 10–15 segundos primero — el
embedding se genera justo después de guardar, no al instante (si nunca
llega, mejor revisa el siguiente síntoma más abajo). Para pensamientos
**anteriores**, vuelve a correr el mismo ciclo del Nivel 6, Paso 5 que
llamó a `backfill-embeddings` la primera vez — solo procesa pensamientos
donde `embedding is null`, así que correrlo de nuevo siempre es seguro y
retoma exactamente donde se quedó.

Si terminaste el Nivel 7, la misma idea aplica a `thought_chunks` — revisa
`select count(*) from thought_chunks;` (esa misma consulta es cómo el Nivel
7, Paso 6 te hace confirmar que su propio backfill funcionó) y vuelve a
correr `backfill-chunks` de ese paso si el número se ve bajo para todo lo
que has capturado.

---

## Captures never get tags, a category, or a summary

ENGLISH:
This is the enrichment agent from Level 5 not running — and per that
level's own warning, **the symptom is deceptive**: saving still works fine,
nothing looks broken, the columns just silently stay empty.

**The single most common cause** (Level 5, Step 3): the Database Webhook is
missing its Authorization header, so it gets turned away before your
function runs. Check it:

1. Supabase dashboard → Database → Webhooks
2. Open `enrich-on-insert`
3. Confirm it has an HTTP header named `Authorization` with value
   `Bearer YOUR_SERVICE_ROLE_KEY`

**If the header is there**, check the function's own logs: Supabase
dashboard → Edge Functions → `enrich-thought` → Logs.

- **Logs are empty** → the webhook isn't reaching the function at all —
  back to the header check above, or confirm the webhook is enabled and
  pointed at the right table and event (INSERT on `thoughts`).
- **Logs show errors** → check `ANTHROPIC_API_KEY` is actually set in
  Supabase → Edge Functions → Secrets (Level 5, Step 1) and that the account
  behind it still has credit.

If you're on Level 6 or later and it's specifically the **embedding** that's
missing while tags/category/summary are fine, the same header requirement
applies to the call from `enrich-thought` to `generate-embedding` — Level 6,
Step 4 warns about this exact symptom directly: "the embeddings silently
never appear and the generate-embedding logs are empty, because it never
ran."

SPANISH:
Esto es el agente de enriquecimiento del Nivel 5 que no está corriendo — y
según la propia advertencia de ese nivel, **el síntoma engaña**: guardar
sigue funcionando bien, nada se ve roto, las columnas simplemente se quedan
vacías en silencio.

**La causa más común, por mucho** (Nivel 5, Paso 3): al Database Webhook le
falta su header de Authorization, así que lo rechazan antes de que tu
función siquiera corra. Revísalo:

1. Panel de Supabase → Database → Webhooks
2. Abre `enrich-on-insert`
3. Confirma que tiene un header HTTP llamado `Authorization` con el valor
   `Bearer YOUR_SERVICE_ROLE_KEY`

**Si el header ya está ahí**, revisa los logs propios de la función: panel
de Supabase → Edge Functions → `enrich-thought` → Logs.

- **Los logs están vacíos** → el webhook ni siquiera está llegando a la
  función — vuelve a revisar el header de arriba, o confirma que el webhook
  está activado y apuntando a la tabla y el evento correctos (INSERT en
  `thoughts`).
- **Los logs muestran errores** → revisa que `ANTHROPIC_API_KEY` de verdad
  esté configurada en Supabase → Edge Functions → Secrets (Nivel 5, Paso 1)
  y que la cuenta detrás todavía tenga crédito.

Si ya vas en el Nivel 6 o más adelante y específicamente falta el
**embedding** mientras que tags/categoría/resumen están bien, el mismo
requisito del header aplica a la llamada de `enrich-thought` hacia
`generate-embedding` — el Nivel 6, Paso 4 advierte exactamente sobre este
síntoma: "the embeddings silently never appear and the generate-embedding
logs are empty, because it never ran."

---

## The Telegram bot has gone quiet

ENGLISH:
Ask Telegram itself what it thinks is happening — it keeps this for you, no
Supabase login needed:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

Read `last_error_message` in the response — it usually names the problem
directly. The most common one: a `401`, meaning `telegram-bot` got deployed
without the `--no-verify-jwt` flag that [Level 3, Step 7](Level-3-Telegram.md)
explains is required — Telegram cannot send a Supabase login token, so
without that flag your function never even runs. Redeploy with it:

```
npx supabase functions deploy telegram-bot --no-verify-jwt
```

If the webhook looks fine but nothing happens for anyone, also check
whether the project is paused — see the first symptom on this page.

SPANISH:
Pregúntale a Telegram mismo qué cree que está pasando — él guarda esto por
ti, no necesitas iniciar sesión en Supabase:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

Lee `last_error_message` en la respuesta — casi siempre nombra el problema
directamente. El más común: un `401`, que significa que `telegram-bot` se
desplegó sin la bandera `--no-verify-jwt` que el [Nivel 3, Paso 7](Level-3-Telegram.md)
explica que es obligatoria — Telegram no puede enviar un token de inicio de
sesión de Supabase, así que sin esa bandera tu función ni siquiera llega a
correr. Vuelve a desplegar con ella:

```
npx supabase functions deploy telegram-bot --no-verify-jwt
```

Si el webhook se ve bien pero no pasa nada para nadie, revisa también si el
proyecto está pausado — ve el primer síntoma de esta página.

---

## None of these match what you're seeing

ENGLISH:
Paste a screenshot or the actual error text into Claude and ask it to
diagnose it live — it can read your logs and your database in a way this
page can't. That is exactly what every Level's rules already tell it to do.

SPANISH:
Pega una captura de pantalla o el texto real del error en Claude y pídele
que lo diagnostique en vivo — puede leer tus logs y tu base de datos de una
forma que esta página no puede. Eso es exactamente lo que las reglas de
cada Nivel ya le dicen que haga.
