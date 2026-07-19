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

// escape helper for Telegram MarkdownV2 (use to escape dynamic user content)
function escapeMarkdownV2(text = '') {
  return String(text).replace(/([_*![\]()~`>#+=\-|{}\.\\])/g, '\\$1');
}

// ─── Telegram send helper ──────────────────────────────────
// Centralized helper that awaits the send and logs all errors.
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
    // Normalize requested markdown mode to MarkdownV2 when provided.
    if (options.parse_mode === 'Markdown') options.parse_mode = 'MarkdownV2';

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

// /info command (replaces /help) — prettier with smiles
bot.onText(/\/info/, (msg) => {
  const chatId = msg.chat.id;
  const text = `✨ *Taklifnoma Bot — Ma'lumot*\n\n` +
    `💌 Bu bot yordamida siz onlayn taklifnoma yaratishingiz va havolasini do'stlaringizga yuborishingiz mumkin.\n\n` +
    `📌 Qanday ishlaydi:\n` +
    `1️⃣ /start — Interaktiv formani ochadi \\(veb tugma\\)\n` +
    `2️⃣ Formani to'ldiring va *Yaratish* tugmasini bosing\n` +
    `3️⃣ Havolani do'stingizga yuboring — javob kelganda sizga xabar beriladi \n\n` +
    `🔹 Foydali buyruqlar:\n` +
    `• /start — Taklifnoma yaratish tugmasi\n` +
    `• /invite — Tez taklifnoma yaratish tugmasi\n` +
    `• /myinvites — Oxirgi taklifnomalaringiz ro'yxati\n` +
    `• /stats — Taklifnomalaringiz soni\n\n` +
    `😊 Muvaffaqiyat tilaymiz\\! Do'stlaringizni chaqiring va zavqlaning ✨`;

  sendTelegramMessage(chatId, text, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });
});

// /invite — quick open of the web app form (same as start button)
bot.onText(/\/invite/, (msg) => {
  const chatId = msg.chat.id;
  sendTelegramMessage(chatId, '✨ Taklifnoma yaratish uchun quyidagi tugmani bosing:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✨ Taklifnoma yaratish', web_app: { url: `${BASE_URL}/?tg_id=${chatId}` } }
      ]]
    }
  });
});

// /about — short about text
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  const text = `📚 *Taklifnoma App*\n\n` +
    `Bu kichik loyiha oddiy va tez taklifnomalar yaratish uchun mo'ljallangan.\n` +
    `Havolani yuboring, mehmon javobini qabul qiling va natijalarni boshqaruv panelida ko'ring.\n\n` +
    `Agar biron muammo bo'lsa, konsol loglarini tekshiring yoki admin sozlamalarini yangilang.`;
  sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /stats — show simple counts for this user's invites
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const total = await Invitation.countDocuments({ tgChatId: String(chatId) });
    const answered = await Invitation.countDocuments({ tgChatId: String(chatId), 'responses.0': { $exists: true } });
    const text = `📊 *Statistika*\n\n` +
      `🔹 Umumiy taklifnomalar: *${total}*\n` +
      `🔹 Javob kelgan taklifnomalar: *${answered}*\n\n` +
      `/myinvites yordamida batafsil ko'rishingiz mumkin.`;
    sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('❌ /stats error:', err.message);
    sendTelegramMessage(chatId, '❌ Xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.');
  }
});

// /myinvites (fixed and cleaned up)
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
      const inviteUrl = `${BASE_URL}/i/${inv.id}`;
      const responsesUrl = `${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey}`;
      text += `${i+1}. *${escapeMarkdownV2(inv.to)}*\n   📅 ${new Date(inv.createdAt).toLocaleDateString('uz')}\n   💬 Javoblar: ${resp}\n   🔗 Taklifnoma: ${inviteUrl}\n   📊 Javoblar: ${responsesUrl}\n\n`;
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
    // escape dynamic pieces to avoid Markdown parsing errors and put URLs on their own lines
    if (tgChatId) {
      const body = `✅ *Taklifnoma yaratildi\\!*\n\n👤 Kimga: *${escapeMarkdownV2(inv.to)}*\n\n📨 Havola \\(do'stingizga yuboring\\):\n${inviteUrl}\n\n📊 Javoblarni ko'rish:\n${dashUrl}`;
      await sendTelegramMessage(
        tgChatId,
        body,
        {
          parse_mode: 'MarkdownV2',
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

    // FIX (Issue 2): await the notification; escape dynamic pieces before inserting into text
    if (inv.tgChatId) {
      const answerEmoji = answer === 'ha' ? '✅ HA' : "❌ YO'Q";
      let notifText = `🔔 *${escapeMarkdownV2(inv.to)}* dan javob keldi\\!\n\n${answerEmoji}`;
      if (place) notifText += `\n📍 Joy: *${escapeMarkdownV2(place)}*`;
      if (time)  notifText += `\n🕐 Vaqt: *${escapeMarkdownV2(time)}*`;
      if (newDodgeCount > 0) notifText += `\n😅 "Yo'q" tugmasidan qochdi: ${newDodgeCount} marta`;
      notifText += `\n\nBarcha javoblarni ko'rish:\n${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey}`;

      await sendTelegramMessage(inv.tgChatId, notifText, {
        parse_mode: 'MarkdownV2',
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
      console.log(`🗑  Cleanup: deleted ${result.deletedCount} old/answered invitation\\(s\\).`);
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
