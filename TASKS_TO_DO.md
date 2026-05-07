# Jules Telegram Cockpit: Enterprise Development Blueprint

Questo documento è la guida definitiva per lo sviluppo di **Jules Telegram Cockpit**. Sei stato assegnato a questo progetto con il ruolo di Lead Developer. L'obiettivo è trasformare un proof-of-concept basato su Cloudflare Workers in un'applicazione di livello enterprise (business digital product B2B/B2C).

## 🚀 1. Onboarding e Contesto Iniziale

**Cos'è il progetto:**
Jules Telegram Cockpit è un'interfaccia (bot Telegram) ad alte prestazioni, sicura e scalabile, che permette agli operatori di interfacciarsi con l'ecosistema "Jules" (un sistema AI autonomo). Il sistema gestisce sessioni multiple, accoppiando repository specifici di Jules a singoli "Topic" all'interno di un Supergruppo Telegram protetto.

**Architettura e Stack Tecnologico:**
*   **Runtime:** Cloudflare Workers (edge computing per latenza minima e scalabilità globale).
*   **Framework Web:** [Hono](https://hono.dev/) (ultraleggero, ottimizzato per l'edge).
*   **Database:** Cloudflare D1 (SQLite distribuito sull'edge).
*   **Linguaggio:** TypeScript (Strict mode obbligatoria).
*   **Integrazioni:** API REST di Telegram Bot, API REST di Jules (`https://jules.googleapis.com/v1alpha/`).

**L'Obiettivo di Business:**
Permettere al team operativo di supervisionare, indirizzare e approvare i task dell'agente AI Jules direttamente da Telegram, senza accedere a dashboard esterne. Il sistema *deve* garantire isolamento dei dati (1 repo = 1 topic), sicurezza totale (solo utenti in whitelist possono interagire) ed UX fluida (utilizzo di inline keyboards per approvare piani).

**Il Mindset Richiesto (Enterprise Grade):**
Non stai scrivendo uno script amatoriale. Ogni riga di codice deve prevedere:
*   **Zero-Trust Security:** Verifica le autorizzazioni ad ogni interazione.
*   **Graceful Error Handling:** Mai far crashare il worker. Cattura, logga e rispondi con cortesia.
*   **Validazione Robusta:** Non fidarti mai dell'input (né da Telegram né da Jules). Usa Zod (o simili) per validare i payload.
*   **Testabilità:** Scrivi codice modulare, isolando la logica di business dai layer di trasporto HTTP.

---

## 🏗️ FASE 1: Infrastruttura, Setup ed Enterprise Standards

### [TSK-1.1] Inizializzazione e Pulizia del Repository
**Obiettivo:** Creare una base di codice pulita, rimuovendo tutto il debito tecnico del POC precedente.
**Dettagli Tecnici:**
*   Rimuovi tutti i file e le directory non necessarie in `src/` (tutto ciò che riguarda `binance`, `trading`, `sentiment`, ecc.).
*   Mantieni solo `src/index.ts` (configurando lo skeleton di Hono) e `src/telegram/bot.ts`.
*   Assicurati che `package.json` rifletta il nuovo nome del progetto (`jules-telegram-cockpit`).
**Dipendenze:** Nessuna. Bloccante per tutti gli altri task.
**Acceptance Criteria:**
*   [x] Il comando `npm run build` o `npx tsc --noEmit` completa senza errori.
*   [x] Nessuna traccia di logica legacy nel codice.

### [TSK-1.2] Configurazione Tooling Enterprise (Linting, Formatting, Testing)
**Obiettivo:** Stabilire e forzare regole di stile e qualità del codice a livello di repository.
**Dettagli Tecnici:**
*   Installa e configura un linter e formatter moderno (si consiglia **Biome**, oppure ESLint + Prettier).
*   Installa **Vitest** per lo unit testing (estremamente performante e compatibile con ESM/TypeScript).
*   Installa **Zod** per la validazione degli schemi.
*   Crea i comandi npm (`lint`, `format`, `test`).
**Dipendenze:** Segue TSK-1.1.
**Acceptance Criteria:**
*   [x] Esecuzione di `npm run lint` passa senza errori.
*   [x] Scritto un test "dummy" in Vitest che dimostra che il test runner funziona correttamente.

### [TSK-1.3] Definizione dello Schema Database D1
**Obiettivo:** Strutturare il database relazionale distribuito per supportare la logica dell'applicazione.
**Dettagli Tecnici:**
*   Aggiorna o riscrivi il file `schema.sql` alla root del progetto.
*   Definisci `users_whitelist`: `user_id` (TEXT, PK), `username` (TEXT), `first_name` (TEXT).
*   Definisci `repositories`: `repo_name` (TEXT, PK), `telegram_topic_id` (TEXT, UNIQUE).
*   Definisci `sessions`: `jules_session_id` (TEXT, PK), `telegram_topic_id` (TEXT, FK su repositories), `status` (TEXT, enum: 'active', 'archived'), `created_at` (DATETIME), `updated_at` (DATETIME).
*   Aggiungi indici per ottimizzare le query (`telegram_topic_id`, `status`).
**Dipendenze:** Segue TSK-1.1.
**Acceptance Criteria:**
*   [x] Il file `schema.sql` contiene SQL valido (dialetto SQLite).
*   [x] Le relazioni e le foreign key (se applicate) o i vincoli logici sono chiari e corretti.

### [TSK-1.4] Binding e Environment Setup
**Obiettivo:** Collegare l'infrastruttura Cloudflare all'applicazione in modo sicuro.
**Dettagli Tecnici:**
*   Aggiorna `wrangler.toml` configurando il binding D1.
*   Dichiara in `wrangler.toml` l'esistenza delle variabili d'ambiente necessarie (senza inserire i valori reali dei secret!): `TELEGRAM_BOT_TOKEN`, `JULES_API_KEY`, `TELEGRAM_SUPERGROUP_ID`.
*   Aggiorna l'interfaccia `Env` in `src/index.ts` per riflettere questi bindings.
**Dipendenze:** Segue TSK-1.3.
**Acceptance Criteria:**
*   [x] L'interfaccia `Env` è rigorosamente tipizzata.
*   [x] Nessun token in chiaro è presente nel repository.

## 🔒 FASE 2: Zero-Trust Security e Gestione Whitelist

### [TSK-2.1] Middleware di Autorizzazione Globale
**Obiettivo:** Bloccare alla radice qualsiasi richiesta Telegram proveniente da utenti non esplicitamente autorizzati.
**Dettagli Tecnici:**
*   Implementa un middleware Hono custom in `src/middlewares/auth.ts`.
*   Il middleware deve intercettare le richieste in arrivo sulla rotta del webhook Telegram.
*   Estrai `from.id` dal body della richiesta (gestendo sia `message` che `callback_query`). Usa Zod per parsare in sicurezza il payload di Telegram.
*   Esegui una query su D1 alla tabella `users_whitelist`.
*   Se l'ID non è presente, droppa la richiesta e ritorna silenziosamente `200 OK` (non rispondere a Telegram per evitare di sprecare API calls e dare feedback ad attaccanti).
**Dipendenze:** Segue TSK-1.4.
**Acceptance Criteria:**
*   [x] Il middleware valida l'utente interrogando il D1.
*   [x] In caso di fallimento, la pipeline di Hono si interrompe senza loggare errori di crash.
*   [x] Scritto unit test (mockando D1) che prova che un utente non in lista riceve 200 ma non passa al controller.

### [TSK-2.2] Auto-Kick degli Intrusi (new_chat_members)
**Obiettivo:** Proteggere il Supergruppo Telegram espellendo automaticamente chiunque entri e non sia nella whitelist.
**Dettagli Tecnici:**
*   Nel router del webhook Telegram, gestisci l'evento `new_chat_members` o `message.new_chat_members`.
*   Per ogni utente nell'array (escluso il bot stesso):
    *   Verifica se l'ID è in `users_whitelist`.
    *   Se assente, istanzia il client Telegram (TSK-1.1/TSK-4.x) e invoca il metodo API di Telegram `banChatMember` o `kickChatMember`.
**Dipendenze:** Segue TSK-2.1.
**Acceptance Criteria:**
*   [x] La logica isola correttamente i nuovi membri dal payload.
*   [x] Invia la chiamata API di espulsione solo per gli utenti non autorizzati.

### [TSK-2.3] Script di Seeding Iniziale
**Obiettivo:** Fornire un modo riproducibile per popolare la whitelist iniziale durante il deployment.
**Dettagli Tecnici:**
*   Crea un file `scripts/seed_admins.sql` che contenga le `INSERT INTO users_whitelist` degli amministratori di base.
*   Documenta nel README il comando per eseguire il seeding (`wrangler d1 execute ...`).
**Dipendenze:** Segue TSK-1.3.
**Acceptance Criteria:**
*   [x] File `seed_admins.sql` creato.
*   [x] Istruzioni inserite nella documentazione.

## 🔌 FASE 3: Sviluppo del Jules API Client

### [TSK-3.1] Setup Strutturale del Client Jules
**Obiettivo:** Incapsulare tutta la comunicazione verso le API di Jules (`https://jules.googleapis.com/v1alpha/`) in una classe o modulo fortement tipizzato.
**Dettagli Tecnici:**
*   Crea `src/jules/client.ts`.
*   Definisci le interfacce TypeScript per i payload e le risposte sulla base della documentazione (Sessions, Activities, Plans).
*   La classe `JulesClient` deve accettare la chiave API (`JULES_API_KEY`) tramite costruttore.
*   Implementa un metodo privato `fetch` che gestisce uniformemente:
    *   L'iniezione dell'header `Authorization: Bearer <API_KEY>`.
    *   L'header `Content-Type: application/json`.
    *   La gestione standardizzata degli errori HTTP (se `!response.ok`, lancia un errore descrittivo parsando il JSON di errore se presente).
**Dipendenze:** Nessuna specifica.
**Acceptance Criteria:**
*   [ ] Modulo esporta la classe/interfaccia `JulesClient`.
*   [ ] Metodo HTTP wrapper centralizzato per gestire auth ed error handling.

### [TSK-3.2] Implementazione Metodi Sessione (Sessions)
**Obiettivo:** Supportare la creazione e la lettura delle sessioni.
**Dettagli Tecnici:**
*   Implementa `createSession(source: string, prompt: string): Promise<Session>`. Esegue una `POST /v1alpha/sessions`. Il body deve includere la proprietà `requirePlanApproval: true` se si vuole approvazione esplicita, e puntare al repository `source`.
*   Implementa `getSession(sessionId: string): Promise<Session>`. Esegue una `GET /v1alpha/sessions/{sessionId}`.
**Dipendenze:** Segue TSK-3.1.
**Acceptance Criteria:**
*   [ ] Tipi per `Session` (id, title, sourceContext) definiti.
*   [ ] I metodi effettuano correttamente le chiamate (dimostrabile tramite unit test con mock fetch).

### [TSK-3.3] Implementazione Metodi Attività (Activities)
**Obiettivo:** Gestire la comunicazione (messaggi e piani) all'interno di una sessione.
**Dettagli Tecnici:**
*   Implementa `sendUserMessage(sessionId: string, message: string): Promise<void>`. Esegue una `POST /v1alpha/sessions/{sessionId}:sendMessage` con body `{ "message": "..." }`.
*   Implementa `approvePlan(sessionId: string): Promise<void>`. Esegue una `POST /v1alpha/sessions/{sessionId}:approvePlan` con un body vuoto o secondo specifica.
*   Implementa `listActivities(sessionId: string, pageSize?: number): Promise<Activity[]>`. Esegue una `GET /v1alpha/sessions/{sessionId}/activities`.
**Dipendenze:** Segue TSK-3.2.
**Acceptance Criteria:**
*   [ ] Tipi per le variazioni di `Activity` (`agentMessaged`, `planGenerated`, `planApproved`, `userMessaged`) rigorosamente definiti tramite Union Types in TypeScript.
*   [ ] Payload formattati correttamente.

## 📡 FASE 4: Ricezione Webhook e Gestione Telegram Topics (1 Repo = 1 Topic)

### [TSK-4.1] Wrapper API Telegram per i Topic
**Obiettivo:** Estendere il client Telegram in `src/telegram/bot.ts` per gestire funzionalità avanzate come i Forum Topics.
**Dettagli Tecnici:**
*   Implementa il metodo `createForumTopic(name: string): Promise<number>`. Questo deve chiamare l'endpoint Telegram `createForumTopic` passando il `TELEGRAM_SUPERGROUP_ID` e restituire l'ID del thread generato.
*   Implementa `sendMessage(threadId: number, text: string, options?: any)`. Aggiungi il supporto per specificare il `message_thread_id` nelle chiamate `sendMessage` per assicurarti che i messaggi finiscano nel sub-topic corretto.
**Dipendenze:** TSK-1.1
**Acceptance Criteria:**
*   [ ] Interfacce Telegram implementate correttamente e validate.

### [TSK-4.2] Route Webhook Jules (Nuovi Repository)
**Obiettivo:** Intercettare gli eventi da Jules quando viene aggiunto un nuovo repository e preparare l'infrastruttura Telegram.
**Dettagli Tecnici:**
*   In `src/index.ts`, esponi una rotta `POST /webhook/jules`.
*   Valida la firma/autenticità del webhook se supportato da Jules (o usa un secret condiviso negli header).
*   Se il payload indica `repository.added` (o evento equivalente):
    *   Estrai il nome del repo.
    *   Chiama `telegram.createForumTopic(repo_name)`.
    *   Salva nel D1, tabella `repositories`: `repo_name` e `telegram_topic_id`.
    *   Invia un messaggio di benvenuto nel Topic tramite Telegram: "🟢 Inizializzazione Cockpit per il repo: `{repo_name}` completata. Usa `/new` per avviare una sessione."
**Dipendenze:** TSK-4.1, TSK-1.3
**Acceptance Criteria:**
*   [ ] Il webhook processa l'evento in modo asincrono per non bloccare Jules.
*   [ ] I dati vengono persistiti correttamente su D1.

## 🔀 FASE 5: Routing Comandi e Macchina a Stati delle Sessioni

### [TSK-5.1] Isolamento Logico del Topic
**Obiettivo:** Assicurare che ogni comando ricevuto da Telegram sia contestualizzato al repository corretto.
**Dettagli Tecnici:**
*   Nel webhook di Telegram, estrai sempre `message_thread_id` (o l'ID del topic).
*   Se l'utente scrive nel gruppo generale (senza thread id), ignora o manda un avviso effimero: "Devi scrivere all'interno di un Topic specifico di un repository".
*   Fai una query su D1 `repositories` usando il `telegram_topic_id` per determinare il `repo_name` su cui operare.
**Dipendenze:** TSK-2.1
**Acceptance Criteria:**
*   [ ] Nessuna azione viene eseguita fuori dai topic dedicati.

### [TSK-5.2] Gestione Comandi del Ciclo di Vita (/new, /close, /list, /open)
**Obiettivo:** Permettere all'utente di comandare l'agente Jules.
**Dettagli Tecnici:** Implementa un router di comandi semplice:
*   **`/new`**:
    *   Controlla se esiste una sessione in D1 con `status='active'` per questo `telegram_topic_id`.
    *   Se sì: Avvisa "C'è già una sessione attiva. Usa `/close` prima".
    *   Se no: Chiama `JulesClient.createSession(repo_name, ...)` (da implementare la logica per catturare un prompt se necessario o un prompt di default). Salva l'ID restituito in D1 in `sessions` come `active`.
*   **`/close`**:
    *   Cerca la sessione attiva per il topic.
    *   Aggiorna lo stato in D1 su `archived`. Avvisa "Sessione archiviata".
*   **`/list`**:
    *   Restituisci su Telegram la lista (ID e date) delle sessioni associate al topic (query su `sessions`).
*   **`/open <session_id>`**:
    *   Archivia l'attuale sessione attiva. Setta `<session_id>` come `active`.
**Dipendenze:** TSK-5.1, TSK-3.2
**Acceptance Criteria:**
*   [ ] L'integrità del database è mantenuta: massimo 1 sessione `active` per `telegram_topic_id`.
*   [ ] I comandi rispondono reattivamente in chat.

### [TSK-5.3] Inoltro Trasparente dei Messaggi (Chat)
**Obiettivo:** Trasformare i normali messaggi di testo nel topic in input per Jules.
**Dettagli Tecnici:**
*   Se il messaggio in arrivo NON è un comando (non inizia con `/`):
    *   Trova la sessione attiva per il topic.
    *   Se non c'è sessione attiva: Avvisa "Nessuna sessione attiva. Crea una con `/new`".
    *   Se presente: Chiama `JulesClient.sendUserMessage(sessionId, text)`. Non bloccare l'invio, esegui in background `c.executionCtx.waitUntil()`.
**Dipendenze:** TSK-5.2, TSK-3.3
**Acceptance Criteria:**
*   [ ] I messaggi vengono inviati alle API di Jules con successo.

## 🔄 FASE 6: Rendering delle Attività e Approvazione Piani

### [TSK-6.1] Polling (o Webhook) delle Activities di Jules
**Obiettivo:** Trasferire gli output di Jules su Telegram.
**Dettagli Tecnici:**
*   Se Jules spinge le attività via Webhook: gestisci gli eventi in `POST /webhook/jules`.
*   *(Se il webhook non invia le activities, dovrai implementare un Cron Job `scheduled` in Cloudflare Workers che fa polling via `JulesClient.listActivities` per ogni sessione attiva, confrontando con le ultime sincronizzate).*
*   Per ogni Activity parsata, esegui il rendering in Telegram.
**Dipendenze:** TSK-3.3, TSK-4.1.
**Acceptance Criteria:**
*   [ ] I messaggi di Jules raggiungono il Topic corretto.

### [TSK-6.2] Rendering Messaggi Agente (agentMessaged)
**Obiettivo:** Mostrare le comunicazioni descrittive dell'agente.
**Dettagli Tecnici:**
*   Quando incontri un'Activity con `agentMessaged`, estrai `agentMessage`.
*   Chiama `telegram.sendMessage(topic_id, "🤖 Jules:\n" + agentMessage)`.
**Dipendenze:** TSK-6.1
**Acceptance Criteria:**
*   [ ] Formattazione MarkdownV2 gestita in sicurezza (facendo escaping dove necessario).

### [TSK-6.3] Gestione Piani (planGenerated) e Inline Keyboards
**Obiettivo:** Gestire la UI di approvazione dei piani proposti dall'AI.
**Dettagli Tecnici:**
*   Quando incontri un `planGenerated`, estrai il piano (step e descrizioni).
*   Formatta un messaggio Telegram dettagliato elencando gli step proposti.
*   Aggiungi un parametro `reply_markup` con una `inline_keyboard`.
*   Inserisci due pulsanti:
    *   `✅ Approva` -> Callback data: `approve_plan:<plan_id>:<session_id>` (Attenzione: Telegram ha un limite di 64 byte sui callback data).
    *   `❌ Rifiuta` -> Callback data: `reject_plan:<plan_id>:<session_id>`.
**Dipendenze:** TSK-6.2.
**Acceptance Criteria:**
*   [ ] Il messaggio con il piano viene inviato con i bottoni corretti.

### [TSK-6.4] Gestione Callback Queries (Approvazione Piani)
**Obiettivo:** Catturare il click dell'utente e comunicare l'esito a Jules.
**Dettagli Tecnici:**
*   Nel router del webhook Telegram, intercetta gli update di tipo `callback_query`.
*   Estrai i dati (`approve_plan:...`).
*   Verifica che l'utente che clicca sia autorizzato (grazie al Middleware in TSK-2.1).
*   Se Approvato: Chiama `JulesClient.approvePlan(session_id)`.
*   Aggiorna il messaggio originale su Telegram (usando `editMessageText` e svuotando la `reply_markup`) in "✅ Piano approvato da {utente}" per evitare double-clicks o click obsoleti.
**Dipendenze:** TSK-6.3, TSK-3.3.
**Acceptance Criteria:**
*   [ ] Il sistema invia con successo il comando di approvazione alle API di Jules.
*   [ ] La UI su Telegram è consistente (il pulsante scompare post-click).

## 🏆 REGOLE D'ORO ENTERPRISE (Per lo Sviluppatore)
Queste regole sono tassative e costituiscono la "Definition of Done" globale per l'intero progetto:

1.  **Strict TypeScript:** Non è mai permesso l'uso di `any`. Usa `unknown` e validatori (Zod) se i payload esterni non sono sicuri. Abilita `strict: true` e `noUncheckedIndexedAccess: true` nel `tsconfig.json`.
2.  **Conventional Commits:** Usa tassativamente lo standard Conventional Commits (es. `feat: aggiunta rotta X`, `fix: risolto bug Y`, `chore: ...`).
3.  **Mai hardcodare i Secrets:** Nessuna API key (`JULES_API_KEY`, `TELEGRAM_BOT_TOKEN`) deve mai esistere nel codice sorgente, né per test. Usa l'oggetto `Env` di Cloudflare.
4.  **Graceful Degradation e API:** Ogni volta che esegui una fetch verso Jules o Telegram, avvolgi in un blocco `try/catch` e gestisci gli errori HTTP (4xx, 5xx) in modo logico senza mandare in crash in worker. Ritorna sempre un JSON valido o una UI chiara all'utente Telegram.
5.  **Performance all'Edge:** Evita dipendenze Node.js pesanti e non supportate da Cloudflare Workers. Usa il runtime nativo di Workers (`fetch`, `crypto`). Ottimizza le chiamate D1 usate nei percorsi critici raggruppandole quando possibile.

---
*Progetto: Jules Telegram Cockpit | Ultimo aggiornamento: Oggi.*
