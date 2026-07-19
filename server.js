require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { nanoid } = require('nanoid');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron'); // FIX (Issue 3): import node-cron
const Invitation = require('./models/Invitation');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// ─── MongoDB ───────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    console.log('✅ MongoDB connected');
    // FIX (Issue 3): run cleanup once on startup to clear any stale data
    cleanupOldInvitations();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ─── Telegram Bot ──────────────────────────────────────────
// FIX (Issue 2): validate BOT_TOKEN before constructing the bot
if (!process.env.BOT_TOKEN) {
  console.error('❌ CRITICAL: BOT_TOKEN environment variable is not set. Telegram notifications will not work.');
}
if (!process.env.BASE_URL) {
  console.error('❌ CRITICAL: BASE_URL environment variable is not set. Invitation URLs will be malformed.');
}

const bot = new TelegramBot(process.env.BOT_TOKEN || 'MISSING_TOKEN', {
  polling: {
    interval: 300,
    autoStart: !!process.env.BOT_TOKEN,  // FIX (Issue 2): don't start polling if token is missing
    params: { timeout: 10 }
  }
});

// FIX (Issue 2): log Telegram polling errors instead of crashing silently
bot.on('polling_error', (err) => {
  console.error('❌ Telegram polling error:', err.code, err.message);
});

process.once('SIGINT',  () => bot.stopPolling());
process.once('SIGTERM', () => bot.stopPolling());

const BASE_URL = process.env.BASE_URL; // e.g. https://yourapp.railway.app

// ─── Telegram send helper ──────────────────────────────────
// FIX (Issue 2): centralized helper that awaits the send, logs all errors,
// and never silently swallows failures.
async function sendTelegramMessage(chatId, text, options = {}) {
  if (!process.env.BOT_TOKEN) {
    console.warn('⚠️  Telegram notification skipped: BOT_TOKEN is not set.');
    return;
  }
  if (!chatId) {
    console.warn('⚠️  Telegram notification skipped: chatId is null or undefined.');
    return;
  }
  try {
    await bot.sendMessage(chatId, text, options);
    console.log(`✅ Telegram notification sent to chatId=${chatId}`);
  } catch (err) {
    // FIX (Issue 2): log the full error so Railway logs show exactly what went wrong
    console.error(`❌ Telegram notification FAILED for chatId=${chatId}:`, err.message);
    if (err.response && err.response.body) {
      console.error('   Telegram API response:', JSON.stringify(err.response.body));
    }
  }
}

// /start command — show mini web app button
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sendTelegramMessage(
    chatId,
    '💌 *Taklifnoma Bot*\n\nQuyidagi tugmani bosib taklifnoma yarating!\nYaratilgan havolani do\'stingizga yuboring — u javob bersa, sizga xabar keladi.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✨ Taklifnoma yaratish', web_app: { url: `${BASE_URL}/?tg_id=${chatId}` } }
        ]]
      }
    }
  );
});

bot.onText(/\/help/, (msg) => {
  sendTelegramMessage(
    msg.chat.id,
    '📖 *Qanday ishlaydi?*\n\n1️⃣ /start → \"Taklifnoma yaratish\" tugmasini bosing\n2️⃣ Formani to\'ldiring va *Yaratish* tugmasini bosing\n3️⃣ Sizga havola keladi — uni do\'stingizga yuboring\n4️⃣ Do\'stingiz javob berganda *sizga xabar keladi* ✅\n\n/myinvites — yaratilgan taklifnomalarim',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/myinvites/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const list = await Invitation.find({ tgChatId: String(chatId) }).sort({ createdAt: -1 }).limit(10);
    if (!list.length) {
      return sendTelegramMessage(chatId, '📭 Sizda hali taklifnomalar yo\'q.\n\n/start → taklifnoma yarating!');
    }
    let text = '📋 *Sizning taklifnomalaringiz:*\n\n';
    list.forEach((inv, i) => {
      const resp = inv.responses.length;
      text += `${i+1}. *${inv.to}*\n   📅 ${new Date(inv.createdAt).toLocaleDateString('uz')}\n   💬 Javoblar: ${resp}\n   🔗 [Taklifnoma](${BASE_URL}/i/${inv.id}) | [Javoblar](${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey})\n\n`;
    });
    sendTelegramMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('❌ /myinvites error:', err.message);
    sendTelegramMessage(chatId, '❌ Xatolik yuz berdi. Qayta urinib ko\'ring.');
  }
});

// FIX (dead code): removed `module.exports.bot = bot` — bot is never imported elsewhere.

// ─── Admin password middleware ─────────────────────────────
function checkPassword(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return next();
  if (req.body && req.body.tgChatId) return next();
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Noto\'g\'ri parol' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD || req.body.password === process.env.ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(403).json({ success: false });
});

// ─── Create invitation ─────────────────────────────────────
app.post('/api/invitations', checkPassword, async (req, res) => {
  try {
    const id = nanoid(8);
    const adminKey = nanoid(16);
    const tgChatId = req.body.tgChatId || null;
    const inv = new Invitation({ ...req.body, id, adminKey, tgChatId });
    await inv.save();

    const inviteUrl = `${BASE_URL}/i/${id}`;
    const dashUrl   = `${BASE_URL}/dashboard/${id}?key=${adminKey}`;

    // FIX (Issue 2): await the Telegram notification so errors surface in logs;
    // use the centralized helper that logs failures instead of swallowing them.
    if (tgChatId) {
      await sendTelegramMessage(
        tgChatId,
        `✅ *Taklifnoma yaratildi!*\n\n👤 Kimga: *${inv.to}*\n\n📨 *Havola (do'stingizga yuboring):*\n${inviteUrl}\n\n📊 *Javoblarni ko'rish:*\n${dashUrl}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Havolani ulashish', switch_inline_query: inviteUrl }],
              [{ text: '📊 Javoblarni ko\'rish', web_app: { url: dashUrl } }]
            ]
          }
        }
      );
    }

    res.json({ url: inviteUrl, adminUrl: dashUrl });
  } catch (e) {
    console.error('❌ POST /api/invitations error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Get invitation (public) ───────────────────────────────
app.get('/api/invitations/:id', async (req, res) => {
  try {
    const inv = await Invitation.findOne({ id: req.params.id });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    const { adminKey, tgChatId, responses, noAttempts, ...publicData } = inv.toObject();
    res.json(publicData);
  } catch (e) {
    console.error('❌ GET /api/invitations/:id error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Submit response ───────────────────────────────────────
app.post('/api/invitations/:id/respond', async (req, res) => {
  try {
    const inv = await Invitation.findOne({ id: req.params.id });
    if (!inv) return res.status(404).json({ error: 'Not found' });

    const { answer, place, time, noAttempts, guestName } = req.body;
    inv.responses.push({ answer, place, time, guestName });

    // FIX (additional): capture the incoming noAttempts value BEFORE saving,
    // so the notification text reflects what just happened, not the running total.
    const newDodgeCount = Number(noAttempts) || 0;
    if (newDodgeCount > 0) inv.noAttempts += newDodgeCount;
    await inv.save();

    // FIX (Issue 2): await the notification; use centralized helper with logging.
    if (inv.tgChatId) {
      const answerEmoji = answer === 'ha' ? '✅ HA' : '❌ YO\'Q';
      let notifText = `🔔 *${inv.to}* dan javob keldi!\n\n${answerEmoji}`;
      if (place) notifText += `\n📍 Joy: *${place}*`;
      if (time)  notifText += `\n🕐 Vaqt: *${time}*`;
      if (newDodgeCount > 0) notifText += `\n😅 "Yo'q" tugmasidan qochdi: ${newDodgeCount} marta`;
      notifText += `\n\n[Barcha javoblarni ko'rish](${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey})`;

      await sendTelegramMessage(inv.tgChatId, notifText, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('❌ POST /api/invitations/:id/respond error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Get responses (admin) ─────────────────────────────────
app.get('/api/invitations/:id/responses', async (req, res) => {
  try {
    const inv = await Invitation.findOne({ id: req.params.id });
    if (!inv || inv.adminKey !== req.query.key) return res.status(403).json({ error: 'Forbidden' });
    res.json({
      from: inv.from, to: inv.to, question: inv.question,
      createdAt: inv.createdAt, noAttempts: inv.noAttempts,
      responses: inv.responses
    });
  } catch (e) {
    console.error('❌ GET /api/invitations/:id/responses error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── HTML routes ───────────────────────────────────────────
app.get('/i/:id',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'invite.html')));
app.get('/dashboard/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('*',              (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ─── Cleanup old invitations ────────────────────────────────
// FIX (Issue 3): delete invitations that are older than 7 days OR have responses OR are completed.
async function cleanupOldInvitations() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await Invitation.deleteMany({
      $or: [
        { createdAt: { $lt: sevenDaysAgo } },           // older than 7 days
        { 'responses.0': { $exists: true } },            // has at least one response (answered)
        { completed: true }                               // marked completed (future-proofing)
      ]
    });
    if (result.deletedCount > 0) {
      console.log(`🗑  Cleanup: deleted ${result.deletedCount} old/answered invitation(s).`);
    }
  } catch (err) {
    console.error('❌ Cleanup error:', err.message);
  }
}

// FIX (Issue 3): schedule cleanup to run every day at 03:00 server time.
cron.schedule('0 3 * * *', () => {
  console.log('🕒 Running scheduled invitation cleanup...');
  cleanupOldInvitations();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
