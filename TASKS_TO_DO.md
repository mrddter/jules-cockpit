# Piano di Sviluppo: Jules Telegram Cockpit

Questo documento delinea in modo dettagliato ed esaustivo tutte le fasi di sviluppo per trasformare il progetto Cloudflare Workers esistente (`aria-trading`) in un "Cockpit" basato su Telegram per interfacciarsi con l'ecosistema Jules.

---

## Fase 1: Pulizia e Setup Iniziale dell'Infrastruttura
L'obiettivo di questa fase è prendere la base del progetto e ripulirla completamente dalla logica precedente (trading bot) mantenendo solo lo scheletro dell'applicazione Cloudflare Workers + Hono + D1.

- [ ] Clonare il repository di base.
- [ ] Rimuovere tutte le cartelle e i file non necessari in `src/` (es. `binance`, `hyperliquid`, `trading`, `sentiment`, `ingestion`, `wavespeed`, `exchange`).
- [ ] Rimuovere file di test obsoleti, cartelle come `backtest/`, e file markdown vecchi (es. `TRADING-BOT-GUIDE.md`).
- [ ] Mantenere lo scheletro in `src/index.ts` (entrypoint di Hono) e il client base `src/telegram/bot.ts`.
- [ ] Modificare `package.json` rinominando il progetto (es. `"name": "jules-telegram-cockpit"`).
- [ ] Aggiornare `wrangler.toml` rinominando il progetto, settando i secret previsti: `TELEGRAM_BOT_TOKEN`, `JULES_API_KEY`, `TELEGRAM_SUPERGROUP_ID`. Configurare il binding per D1 (`[[d1_databases]]`).
- [ ] Riscrivere completamente `schema.sql` per definire le seguenti tabelle:
  - `users_whitelist`: `user_id` (TEXT, PK), `username` (TEXT), `first_name` (TEXT).
  - `repositories`: `repo_name` (TEXT, PK), `telegram_topic_id` (TEXT).
  - `sessions`: `jules_session_id` (TEXT, PK), `telegram_topic_id` (TEXT), `status` (TEXT, es. 'active' o 'archived'), `created_at` (DATETIME), `updated_at` (DATETIME).
- [ ] Aggiungere gli indici necessari nel database (es. su `sessions.telegram_topic_id` e `sessions.status`).

## Fase 2: Gestione Sicurezza e Whitelist su Telegram
L'obiettivo è rendere il supergruppo Telegram e il bot completamente inaccessibili e inoperabili da utenti non autorizzati.

- [ ] Scrivere uno script SQL (es. `seed.sql`) per inserire gli ID Telegram degli amministratori nella tabella `users_whitelist`. Questo andrà eseguito in fase di deploy (`wrangler d1 execute`).
- [ ] Nel webhook Telegram (`src/index.ts`), implementare un middleware o controllo logico: estrarre `from.id` da qualsiasi update in arrivo (`message` o `callback_query`).
- [ ] Interrogare la tabella `users_whitelist` tramite D1. Se l'utente non è presente, **ignorare totalmente** la richiesta e restituire 200 OK (o 403, ma senza inviare messaggi su Telegram).
- [ ] Intercettare l'evento `new_chat_members` (quando qualcuno entra o viene aggiunto al supergruppo Telegram).
- [ ] Per ogni utente in `new_chat_members` (ignorando il bot stesso), verificare se l'ID è nella whitelist.
- [ ] Se l'utente non è in whitelist, utilizzare il metodo `banChatMember` delle API di Telegram per espellerlo (kick) immediatamente dal gruppo per preservare la privacy.

## Fase 3: Creazione del Client API per Jules
Creare un modulo centralizzato per comunicare in HTTP con le API di Jules, seguendo le specifiche (https://jules.google/docs/api/reference/).

- [ ] Creare `src/jules/client.ts`.
- [ ] Implementare la classe `JulesClient` che accetta la `JULES_API_KEY`.
- [ ] Implementare il metodo `createSession(repoName: string)` per avviare una sessione chiamando `POST /sessions`.
- [ ] Implementare il metodo `sendActivity(sessionId: string, text: string)` per inviare messaggi chiamando `POST /sessions/{sessionId}/activities`.
- [ ] Implementare il metodo `getActivities(sessionId: string)` chiamando `GET /sessions/{sessionId}/activities`.
- [ ] Implementare i metodi per l'approvazione/rifiuto piani (`POST /sessions/{sessionId}/activities` con type `plan_approval`, payload con `plan_id` e `approved` true/false).
- [ ] Gestire correttamente i Bearer token negli headers per l'autenticazione con Jules.

## Fase 4: Ricezione Webhook Jules (Creazione Automatica Topic)
In questa fase il sistema intercetta l'aggiunta di nuovi repository su Jules e crea le relative "stanze" su Telegram.

- [ ] Implementare una nuova route su Hono in `src/index.ts`: `POST /webhook/jules`.
- [ ] Gestire l'evento relativo a un nuovo repository (es. `repository.added`). Estrarre il nome del repo dal payload.
- [ ] Estendere `src/telegram/bot.ts` aggiungendo il metodo `createForumTopic(chatId, name)` che invoca l'omonima API di Telegram per creare un nuovo Argomento nel Supergruppo (definito da `TELEGRAM_SUPERGROUP_ID`).
- [ ] Alla ricezione del webhook "nuovo repo", chiamare `createForumTopic` assegnando al topic il nome del repository.
- [ ] Salvare nella tabella D1 `repositories` l'associazione tra `repo_name` e `telegram_topic_id` restituito da Telegram.
- [ ] Far inviare al bot un messaggio di benvenuto all'interno del nuovo Topic appena creato.

## Fase 5: Routing dei Comandi Telegram e Gestione Sessioni
Implementare la logica per gestire le sessioni in base al Topic in cui l'utente scrive. Ricorda: 1 Topic = 1 Repo. Massimo 1 Sessione attiva per Topic.

- [ ] Intercettare i messaggi in ingresso dal webhook Telegram e analizzare il comando ricevuto nel `text`.
- [ ] Estrarre il `message_thread_id` (che corrisponde all'ID del Topic). Se mancante, significa che l'utente ha scritto fuori da un topic (nel General) -> ignorare o avvisare.
- [ ] Interrogare D1 (`repositories`) usando il `message_thread_id` per recuperare il nome del repository corrente.
- [ ] Implementare comando `/new`:
  - Controllare se esiste una sessione con `status='active'` per il `telegram_topic_id`.
  - In caso affermativo, bloccare l'azione e avvisare l'utente di usare prima `/close`.
  - In caso negativo, chiamare `JulesClient.createSession(repoName)`.
  - Salvare l'ID sessione restituito in D1 con `status='active'`.
  - Notificare la creazione su Telegram nel Topic.
- [ ] Implementare comando `/close`:
  - Trovare la sessione attiva per il Topic, settare `status='archived'` in D1.
- [ ] Implementare comando `/list`:
  - Estrarre e mostrare a video su Telegram l'elenco delle sessioni `archived` per quel Topic.
- [ ] Implementare comando `/open <id>`:
  - Chiudere eventuali sessioni attive correnti nel Topic.
  - Aggiornare in D1 lo status della sessione `<id>` a `active`.
- [ ] Implementare il semplice inoltro messaggi:
  - Se il messaggio non inizia con `/` ed esiste una sessione attiva per il Topic in cui è stato inviato, inoltrare il testo chiamando `JulesClient.sendActivity()`.

## Fase 6: Ricezione Attività da Jules e Approvazione Piani
Gestire i messaggi "push" in arrivo da Jules e formattarli per Telegram.

- [ ] Estendere la route `POST /webhook/jules`.
- [ ] Gestire l'evento `activity.created` (o equivalente per l'arrivo di nuove attività/messaggi).
- [ ] Estrarre il `session_id` dal payload di Jules.
- [ ] Interrogare D1 (`sessions`) per trovare il `telegram_topic_id` associato a quel `session_id`.
- [ ] Se l'attività è di tipo `message`:
  - Usare il Bot Telegram per inoltrare il testo nel Topic corretto.
- [ ] Se l'attività è di tipo `plan` (richiesta di approvazione piano):
  - Formattare un messaggio Telegram che descriva il piano.
  - Aggiungere una `inline_keyboard` (pulsanti) con due opzioni: "[✅ Approva]" (callback data es. `approve:SESSION_ID:PLAN_ID`) e "[❌ Rifiuta]" (callback data es. `reject:SESSION_ID:PLAN_ID`).
- [ ] Tornare all'handler dei webhook Telegram in `src/index.ts` e gestire l'evento `callback_query` generato dalla pressione del pulsante.
- [ ] Nel gestore del click:
  - Recuperare l'azione e gli ID.
  - Chiamare `JulesClient.approvePlan()` o `rejectPlan()`.
  - Chiamare `editMessageText` di Telegram per rimuovere i pulsanti (così non possono essere premuti due volte) e aggiornare il messaggio con l'esito ("Piano approvato da Utente").

## Fase 7: Comando /fetch per Sincronizzazione Forzata (Optional ma Consigliato)
- [ ] Implementare il comando Telegram `/fetch` (o `/refresh`).
- [ ] Verificare che ci sia una sessione attiva nel Topic.
- [ ] Chiamare `JulesClient.getActivities(session_id)`.
- [ ] Confrontare le attività restituite (opzionale: potresti salvare un cursore in D1 per evitare duplicati, ma per un MVP puoi stamparle le ultime N o fare logging). Formattarle e inviarle su Telegram.

## Fase 8: Documentazione e Deploy Finale
- [ ] Scrivere un `README.md` esaustivo.
- [ ] Documentare come creare il Bot Telegram, come configurare i Topics, e come ottenere l'ID Supergruppo.
- [ ] Documentare il processo per il deploy (`wrangler d1 create`, `wrangler secret put`).
- [ ] Documentare la configurazione dei webhook sia in Telegram che nella UI di Jules.
