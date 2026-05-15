# Documentazione Completa di Jules Telegram Cockpit

Benvenuto nella documentazione ufficiale di Jules Telegram Cockpit. Questo bot è stato progettato come un'applicazione enterprise sicura e performante per l'interazione tra operatori umani e l'agente AI Jules, sfruttando la potenza di Cloudflare Workers.

## 1. Architettura

Il sistema opera al limite della rete (Edge) su **Cloudflare Workers**, garantendo latenza minima a livello globale.

- **Routing:** Hono, un framework web ultraleggero ideale per l'Edge.
- **Persistenza:** Cloudflare D1, un database SQLite distribuito all'edge per memorizzare:
  - Liste di controllo degli accessi (Whitelist).
  - Mapping tra Repository di codice e Topic Telegram.
  - Stato delle sessioni AI in corso.
- **Webhook:** Jules invia webhook al Cockpit che a sua volta li inoltra ai forum Telegram appropriati. Analogamente, gli input degli utenti Telegram vengono inoltrati alle API di Jules.

## 2. Sicurezza (Zero-Trust)

La sicurezza è il principio fondante di questo Cockpit:
- **Middleware Globale:** Nessuna richiesta HTTP proveniente da Telegram raggiunge la logica di business a meno che l'ID dell'utente non sia presente in una tabella `users_whitelist` rigorosamente controllata.
- **Auto-Kick:** Il bot controlla gli ingressi al Supergruppo. Se un utente entra e non è presente nella whitelist, il bot lo espelle (ban) in frazioni di secondo.
- **Isolamento dei Dati:** I dati relativi a un progetto/repository Jules sono confinati esclusivamente in un Topic (Thread) specifico su Telegram, evitando l'incrocio di contesti.

## 3. Gestione delle Sessioni

Una **Sessione** è un canale di comunicazione attivo tra un operatore e l'AI per un dato repository.
- È possibile avere **una sola sessione attiva** per Topic.
- Le sessioni inattive vengono **archiviate**, ma è possibile riaprirle usando il loro ID univoco tramite il comando `/open`.

## 4. Approvazione Piani (Human-in-the-Loop)

Quando l'agente Jules propone un piano di azioni complesse, il Cockpit invia un messaggio formattato con una **Inline Keyboard** in Telegram.
- **Approva / Rifiuta:** Gli operatori possono cliccare sui pulsanti.
- L'esito viene re-inoltrato a Jules in background, permettendo all'AI di procedere con il task o di ricalcolare una strategia, il tutto in modo reattivo e senza ostacoli.
