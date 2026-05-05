# Jules Telegram Cockpit

Questo progetto è un Cloudflare Worker che agisce come "Cockpit" Telegram per interfacciarsi con [Jules](https://jules.google/). Ti permette di gestire le sessioni di Jules direttamente da un Supergruppo Telegram, dove ogni Argomento (Topic) rappresenta un repository diverso.

## Funzionalità

*   **Ricezione Webhook da Jules**: Quando aggiungi un nuovo repository su Jules, il bot crea automaticamente un nuovo Topic Telegram associato al repository.
*   **Sessioni di Chat**: Permette di avviare, chiudere o recuperare sessioni Jules (comandi `/new`, `/close`, `/list`, `/open`).
*   **Sincronizzazione Bidirezionale**: Tutto quello che scrivi in Telegram viene inoltrato a Jules e viceversa.
*   **Approvazione Piani**: Quando Jules propone un piano, ricevi un messaggio con dei pulsanti inline "Approva" o "Rifiuta".
*   **Sicurezza e Whitelist**: Solo gli utenti approvati (configurati nel database) possono interagire. Gli utenti non autorizzati che entrano nel gruppo vengono espulsi (kick).

## Prerequisiti

*   Un account **Cloudflare** (per usare Workers e D1 Database)
*   Un **Bot Telegram** (creato tramite BotFather) con token
*   Una API Key di **Jules**
*   Node.js e npm installati

## Configurazione Iniziale

1.  **Crea un Supergruppo Telegram**:
    *   Crea un nuovo gruppo su Telegram.
    *   Nelle impostazioni del gruppo, abilita i "Topics" (Argomenti).
    *   Aggiungi il tuo Bot Telegram come Amministratore (con permessi per gestire i topic, cancellare messaggi, bannare utenti).
    *   Ottieni l'ID del Supergruppo (es. `-100123456789`).

2.  **Inizializza il progetto**:
    npm install

3.  **Configura Cloudflare D1 (Database)**:
    *   Crea un nuovo database D1 sulla dashboard Cloudflare o via CLI:
        npx wrangler d1 create jules_cockpit_db
    *   Annota il `database_id` restituito e aggiorna il file `wrangler.toml` inserendolo sotto `[[d1_databases]]`.
    *   Inizializza lo schema del database:
        npx wrangler d1 execute DB --local --file=./schema.sql
        (Esegui lo stesso comando senza `--local` per il DB di produzione dopo il deploy).

4.  **Aggiungi il tuo Utente alla Whitelist**:
    *   Modifica il file `seed.sql` inserendo il tuo ID Telegram.
    *   Esegui il file sul database locale e remoto:
        npx wrangler d1 execute DB --local --file=./seed.sql

5.  **Imposta le Variabili d'Ambiente e Secret**:
    *   Nel file `wrangler.toml`, assicurati che l'ambiente sia configurato correttamente.
    *   Imposta i secret tramite Wrangler per l'ambiente di produzione:
        npx wrangler secret put TELEGRAM_BOT_TOKEN
        npx wrangler secret put JULES_API_KEY
        npx wrangler secret put TELEGRAM_SUPERGROUP_ID

## Sviluppo Locale

Avvia il server di sviluppo locale:

npm run dev \&

Puoi usare strumenti come ngrok o Cloudflare Tunnels per esporre il tuo localhost ad internet e testare i Webhook di Telegram e Jules.

## Deploy

Per pubblicare il Worker su Cloudflare:

npm run deploy

## Configurazione Webhooks

*   **Telegram Webhook**: Dopo il deploy, devi dire a Telegram di inviare gli aggiornamenti al tuo Worker. Esegui questa richiesta HTTP (es. dal browser o con curl):
    `https://api.telegram.org/bot<IL_TUO_BOT_TOKEN>/setWebhook?url=https://<NOME_WORKER>.<TUO_SOTTODOMINIO>.workers.dev/webhook/telegram`
*   **Jules Webhook**: Nell'interfaccia di Jules, configura l'endpoint dei webhook in modo che punti a: `https://<NOME_WORKER>.<TUO_SOTTODOMINIO>.workers.dev/webhook/jules`

## Comandi Supportati (Nei Topic Telegram)

*   `/new`: Avvia una nuova sessione con Jules in questo repository.
*   `/close`: Archivia la sessione corrente.
*   `/list`: Mostra le ultime 10 sessioni archiviate per questo repository.
*   `/open <id>`: Riapre e imposta come attiva una vecchia sessione (id).
*   `/fetch`: (o `/refresh`) Sincronizza eventuali aggiornamenti o attività perse dalla sessione attiva.
