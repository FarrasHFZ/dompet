// One-time helper: find your Telegram chat id and send a test message.
//   1. In Telegram, talk to @BotFather: /newbot, pick a name, copy the token.
//   2. Open your new bot and press Start (send it any message).
//   3. Run:  TG_TOKEN=<token> node tools/telegram-setup.mjs     (PowerShell: $env:TG_TOKEN='<token>'; node tools/telegram-setup.mjs)
// The token stays on your machine; this script never writes it to a file.
const token = process.env.TG_TOKEN;
if (!token) { console.error('Set TG_TOKEN first (see the comment at the top of this file).'); process.exit(1); }
const api = (m, body) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());

const me = await api('getMe');
if (!me.ok) { console.error('Token rejected by Telegram:', me.description); process.exit(1); }
console.log(`Bot: @${me.result.username}`);
const up = await api('getUpdates');
const chats = new Map();
(up.result || []).forEach(u => { const c = (u.message || u.channel_post || {}).chat; if (c) chats.set(c.id, c); });
if (!chats.size) { console.error('No chats yet. Open your bot in Telegram, press Start, then run this again.'); process.exit(1); }
for (const [id, c] of chats) {
  console.log(`Chat id: ${id}  (${c.type}${c.first_name ? ', ' + c.first_name : ''})`);
  const r = await api('sendMessage', { chat_id: id, text: 'Test from IDX Swing Screener setup. If you see this, alerts can reach you.' });
  console.log(r.ok ? '  test message sent' : '  send failed: ' + r.description);
}
console.log('\nNext (each prompts for the value, so nothing lands in your shell history):\n  gh secret set TG_TOKEN\n  gh secret set TG_CHAT_ID');
