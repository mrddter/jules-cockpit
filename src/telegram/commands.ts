import { D1Database } from '@cloudflare/workers-types';
import { TelegramBot } from './bot';
import { JulesClient } from '../jules/client';

export async function handleCommand(
  text: string,
  topicId: string,
  userId: number,
  db: D1Database,
  bot: TelegramBot,
  julesClient: JulesClient,
  supergroupId: string
) {
  // Find associated repo
  const repoStmt = db.prepare('SELECT repo_name FROM repositories WHERE telegram_topic_id = ?');
  const repoResult = await repoStmt.bind(topicId).first();

  if (!repoResult) {
      await bot.sendMessage(supergroupId, '❌ Questo topic non è associato a nessun repository.', { message_thread_id: parseInt(topicId) });
      return;
  }

  const repoName = repoResult.repo_name as string;
  const cmd = text.split(' ')[0].toLowerCase();
  const args = text.split(' ').slice(1);

  if (cmd === '/new') {
      // Check if there is already an active session
      const checkStmt = db.prepare('SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?');
      const activeSession = await checkStmt.bind(topicId, 'active').first();

      if (activeSession) {
          await bot.sendMessage(supergroupId, `⚠️ C'è già una sessione attiva (<code>${activeSession.jules_session_id}</code>). Usa /close per chiuderla prima di aprirne una nuova.`, { message_thread_id: parseInt(topicId) });
          return;
      }

      try {
          const session = await julesClient.createSession(repoName);
          const sessionId = session.id; // Adjust based on actual Jules API response

          const insertStmt = db.prepare('INSERT INTO sessions (jules_session_id, telegram_topic_id, status) VALUES (?, ?, ?)');
          await insertStmt.bind(sessionId, topicId, 'active').run();

          await bot.sendMessage(supergroupId, `✅ <b>Nuova sessione avviata!</b>\nID: <code>${sessionId}</code>\nTutto quello che scrivi qui verrà inviato a Jules.`, { message_thread_id: parseInt(topicId) });
      } catch (err: any) {
          await bot.sendMessage(supergroupId, `❌ Errore durante la creazione della sessione: ${err.message}`, { message_thread_id: parseInt(topicId) });
      }

  } else if (cmd === '/close') {
      const checkStmt = db.prepare('SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?');
      const activeSession = await checkStmt.bind(topicId, 'active').first();

      if (!activeSession) {
          await bot.sendMessage(supergroupId, '⚠️ Nessuna sessione attiva in questo topic.', { message_thread_id: parseInt(topicId) });
          return;
      }

      const updateStmt = db.prepare('UPDATE sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE jules_session_id = ?');
      await updateStmt.bind('archived', activeSession.jules_session_id).run();

      await bot.sendMessage(supergroupId, `✅ Sessione <code>${activeSession.jules_session_id}</code> archiviata.\nUsa /new per crearne una nuova o /list per vederle tutte.`, { message_thread_id: parseInt(topicId) });

  } else if (cmd === '/list') {
      const listStmt = db.prepare('SELECT jules_session_id, status, created_at FROM sessions WHERE telegram_topic_id = ? ORDER BY created_at DESC LIMIT 10');
      const { results } = await listStmt.bind(topicId).all();

      if (results.length === 0) {
          await bot.sendMessage(supergroupId, 'Nessuna sessione trovata per questo topic.', { message_thread_id: parseInt(topicId) });
          return;
      }

      let msg = '📋 <b>Ultime sessioni:</b>\n\n';
      results.forEach((row: any) => {
          const statusIcon = row.status === 'active' ? '🟢' : '⚪️';
          msg += `${statusIcon} <code>${row.jules_session_id}</code> (${row.status})\n`;
      });
      msg += '\nUsa <code>/open &lt;id&gt;</code> per riaprire una sessione archiviata.';

      await bot.sendMessage(supergroupId, msg, { message_thread_id: parseInt(topicId) });

  } else if (cmd === '/open') {
      if (args.length === 0) {
          await bot.sendMessage(supergroupId, '⚠️ Specifica l\'ID della sessione: <code>/open &lt;id&gt;</code>', { message_thread_id: parseInt(topicId) });
          return;
      }

      const targetId = args[0];

      // Check if target session exists and belongs to this topic
      const checkTargetStmt = db.prepare('SELECT status FROM sessions WHERE jules_session_id = ? AND telegram_topic_id = ?');
      const targetResult = await checkTargetStmt.bind(targetId, topicId).first();

      if (!targetResult) {
          await bot.sendMessage(supergroupId, '❌ Sessione non trovata o non appartenente a questo topic.', { message_thread_id: parseInt(topicId) });
          return;
      }

      // Archive current active session if any
      const archiveStmt = db.prepare('UPDATE sessions SET status = ? WHERE telegram_topic_id = ? AND status = ?');
      await archiveStmt.bind('archived', topicId, 'active').run();

      // Set target to active
      const activateStmt = db.prepare('UPDATE sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE jules_session_id = ?');
      await activateStmt.bind('active', targetId).run();

      await bot.sendMessage(supergroupId, `✅ Sessione <code>${targetId}</code> riaperta e impostata come attiva.`, { message_thread_id: parseInt(topicId) });

  } else if (cmd === '/fetch' || cmd === '/refresh') {
      const checkStmt = db.prepare('SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?');
      const activeSession = await checkStmt.bind(topicId, 'active').first();

      if (!activeSession) {
          await bot.sendMessage(supergroupId, '⚠️ Nessuna sessione attiva da aggiornare.', { message_thread_id: parseInt(topicId) });
          return;
      }

      try {
          const activities = await julesClient.getActivities(activeSession.jules_session_id as string);
          // Qui in realtà dovremmo tenere traccia dell'ultimo ID attività per non ri-inviare tutto,
          // ma per semplicità informiamo che il fetch è completato
          await bot.sendMessage(supergroupId, `🔄 Fetch completato. Trovate ${activities.length} attività totali nella sessione. (L'integrazione completa dei messaggi persi va gestita con uno state cursor).`, { message_thread_id: parseInt(topicId) });
      } catch (err: any) {
          await bot.sendMessage(supergroupId, `❌ Errore durante il fetch: ${err.message}`, { message_thread_id: parseInt(topicId) });
      }
  }
}

export async function handleTextMessage(
  text: string,
  topicId: string,
  db: D1Database,
  bot: TelegramBot,
  julesClient: JulesClient,
  supergroupId: string
) {
  // Ignore commands
  if (text.startsWith('/')) return;

  const checkStmt = db.prepare('SELECT jules_session_id FROM sessions WHERE telegram_topic_id = ? AND status = ?');
  const activeSession = await checkStmt.bind(topicId, 'active').first();

  if (!activeSession) {
      // Opt: potremmo avvisare l'utente, ma potrebbe essere fastidioso per ogni messaggio. Lo ignoriamo.
      return;
  }

  try {
      await julesClient.sendActivity(activeSession.jules_session_id as string, text);
      // Optional: Add a small checkmark reaction if Telegram API allows, or silent success
  } catch (err: any) {
      await bot.sendMessage(supergroupId, `❌ Impossibile inviare a Jules: ${err.message}`, { message_thread_id: parseInt(topicId) });
  }
}
