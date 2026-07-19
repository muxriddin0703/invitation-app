require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { nanoid } = require('nanoid');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const Invitation = require('./models/Invitation');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// ─── MongoDB ───────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    console.log('✅ MongoDB connected');
    cleanupOldInvitations();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ─── Telegram Bot ──────────────────────────────────────────
if (!process.env.BOT_TOKEN) {
  console.error('❌ CRITICAL: BOT_TOKEN environment variable is not set. Telegram notifications will not work.');
}
if (!process.env.BASE_URL) {
  console.error('❌ CRITICAL: BASE_URL environment variable is not set. Invitation URLs will be malformed.');
}

const bot = new TelegramBot(process.env.BOT_TOKEN || 'MISSING_TOKEN', {
  polling: {
    interval: 300,
    autoStart: !!process.env.BOT_TOKEN,
    params: { timeout: 10 }
  }
});

bot.on('polling_error', (err) => {
  console.error('❌ Telegram polling error:', err.code, err.message);
});

process.once('SIGINT',  () => bot.stopPolling());
process.once('SIGTERM', () => bot.stopPolling());

const BASE_URL = process.env.BASE_URL;

// ─── MarkdownV2 escape helper ──────────────────────────────
// Escapes ALL reserved MarkdownV2 characters per Telegram Bot API docs.
// Must be applied to EVERY dynamic value AND every static string piece
// that contains any of: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
function escapeMarkdownV2(text = '') {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ─── Telegram send helper ──────────────────────────────────
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
    if (options.parse_mode === 'Markdown') options.parse_mode = 'MarkdownV2';
    await bot.sendMessage(chatId, text, options);
    console.log(`✅ Telegram notification sent to chatId=${chatId}`);
  } catch (err) {
    console.error(`❌ Telegram notification FAILED for chatId=${chatId}:`, err.message);
    if (err.response && err.response.body) {
      console.error('   Telegram API response:', JSON.stringify(err.response.body));
    }
  }
}

// ─── Bot commands ──────────────────────────────────────────

// /start — show mini web app button
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const text =
    `${escapeMarkdownV2('💌 Taklifnoma Bot')}\n\n` +
    `${escapeMarkdownV2('Quyidagi tugmani bosib taklifnoma yarating!')}\n` +
    `${escapeMarkdownV2("Yaratilgan havolani do'stingizga yuboring — u javob bersa, sizga xabar keladi.")}`;

  sendTelegramMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✨ Taklifnoma yaratish', web_app: { url: `${BASE_URL}/?tg_id=${chatId}` } }
      ]]
    }
  });
});

// /info — info about the bot
bot.onText(/\/info/, (msg) => {
  const chatId = msg.chat.id;
  const text =
    `✨ *${escapeMarkdownV2('Taklifnoma Bot — Ma\'lumot')}*\n\n` +
    `${escapeMarkdownV2('💌 Bu bot yordamida siz onlayn taklifnoma yaratishingiz va havolasini do\'stlaringizga yuborishingiz mumkin.')}\n\n` +
    `*${escapeMarkdownV2('📌 Qanday ishlaydi:')}*\n` +
    `${escapeMarkdownV2('1️⃣ /start — Interaktiv formani ochadi (veb tugma)')}\n` +
    `${escapeMarkdownV2('2️⃣ Formani to\'ldiring va Yaratish tugmasini bosing')}\n` +
    `${escapeMarkdownV2('3️⃣ Havolani do\'stingizga yuboring — javob kelganda sizga xabar beriladi')}\n\n` +
    `*${escapeMarkdownV2('🔹 Foydali buyruqlar:')}*\n` +
    `${escapeMarkdownV2('• /start — Taklifnoma yaratish tugmasi')}\n` +
    `${escapeMarkdownV2('• /invite — Tez taklifnoma yaratish tugmasi')}\n` +
    `${escapeMarkdownV2('• /myinvites — Oxirgi taklifnomalaringiz ro\'yxati')}\n` +
    `${escapeMarkdownV2('• /stats — Taklifnomalaringiz soni')}\n\n` +
    `${escapeMarkdownV2('😊 Muvaffaqiyat tilaymiz! Do\'stlaringizni chaqiring va zavqlaning ✨')}`;

  sendTelegramMessage(chatId, text, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });
});

// /invite — quick open of the web app form
bot.onText(/\/invite/, (msg) => {
  const chatId = msg.chat.id;
  sendTelegramMessage(
    chatId,
    escapeMarkdownV2('✨ Taklifnoma yaratish uchun quyidagi tugmani bosing:'),
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          { text: '✨ Taklifnoma yaratish', web_app: { url: `${BASE_URL}/?tg_id=${chatId}` } }
        ]]
      }
    }
  );
});

// /about — short about text
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  const text =
    `📚 *${escapeMarkdownV2('Taklifnoma App')}*\n\n` +
    `${escapeMarkdownV2('Bu kichik loyiha oddiy va tez taklifnomalar yaratish uchun mo\'ljallangan.')}\n` +
    `${escapeMarkdownV2('Havolani yuboring, mehmon javobini qabul qiling va natijalarni boshqaruv panelida ko\'ring.')}\n\n` +
    `${escapeMarkdownV2('Agar biron muammo bo\'lsa, konsol loglarini tekshiring yoki admin sozlamalarini yangilang.')}`;

  sendTelegramMessage(chatId, text, { parse_mode: 'MarkdownV2' });
});

// /stats — show counts for this user's invitations
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const total    = await Invitation.countDocuments({ tgChatId: String(chatId) });
    const answered = await Invitation.countDocuments({ tgChatId: String(chatId), 'responses.0': { $exists: true } });

    const text =
      `📊 *${escapeMarkdownV2('Statistika')}*\n\n` +
      `${escapeMarkdownV2('🔹 Umumiy taklifnomalar:')} *${escapeMarkdownV2(String(total))}*\n` +
      `${escapeMarkdownV2('🔹 Javob kelgan taklifnomalar:')} *${escapeMarkdownV2(String(answered))}*\n\n` +
      `${escapeMarkdownV2('/myinvites yordamida batafsil ko\'rishingiz mumkin.')}`;

    sendTelegramMessage(chatId, text, { parse_mode: 'MarkdownV2' });
  } catch (err) {
    console.error('❌ /stats error:', err.message);
    sendTelegramMessage(chatId, escapeMarkdownV2('❌ Xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.'), { parse_mode: 'MarkdownV2' });
  }
});

// /myinvites — list last 10 invitations
bot.onText(/\/myinvites/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const list = await Invitation.find({ tgChatId: String(chatId) }).sort({ createdAt: -1 }).limit(10);

    if (!list.length) {
      return sendTelegramMessage(
        chatId,
        escapeMarkdownV2('📭 Sizda hali taklifnomalar yo\'q.\n\n/start → taklifnoma yarating!'),
        { parse_mode: 'MarkdownV2' }
      );
    }

    let text = `📋 *${escapeMarkdownV2('Sizning taklifnomalaringiz:')}*\n\n`;

    list.forEach((inv, i) => {
      const resp        = inv.responses.length;
      const inviteUrl   = `${BASE_URL}/i/${inv.id}`;
      const responsesUrl = `${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey}`;
      const date        = new Date(inv.createdAt).toLocaleDateString('uz');

      text +=
        `*${escapeMarkdownV2(String(i + 1))}\\. ${escapeMarkdownV2(inv.to)}*\n` +
        `   📅 ${escapeMarkdownV2(date)}\n` +
        `   💬 ${escapeMarkdownV2('Javoblar:')} ${escapeMarkdownV2(String(resp))}\n` +
        `   🔗 ${escapeMarkdownV2('Taklifnoma:')} ${escapeMarkdownV2(inviteUrl)}\n` +
        `   📊 ${escapeMarkdownV2('Javoblar:')} ${escapeMarkdownV2(responsesUrl)}\n\n`;
    });

    sendTelegramMessage(chatId, text, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });
  } catch (err) {
    console.error('❌ /myinvites error:', err.message);
    sendTelegramMessage(
      chatId,
      escapeMarkdownV2('❌ Xatolik yuz berdi. Qayta urinib ko\'ring.'),
      { parse_mode: 'MarkdownV2' }
    );
  }
});

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
    const id       = nanoid(8);
    const adminKey = nanoid(16);
    const tgChatId = req.body.tgChatId || null;
    const inv      = new Invitation({ ...req.body, id, adminKey, tgChatId });
    await inv.save();

    const inviteUrl = `${BASE_URL}/i/${id}`;
    const dashUrl   = `${BASE_URL}/dashboard/${id}?key=${adminKey}`;

    if (tgChatId) {
      const body =
        `✅ *${escapeMarkdownV2('Taklifnoma yaratildi!')}*\n\n` +
        `👤 ${escapeMarkdownV2('Kimga:')} *${escapeMarkdownV2(inv.to)}*\n\n` +
        `📨 ${escapeMarkdownV2('Havola (do\'stingizga yuboring):')}\n${escapeMarkdownV2(inviteUrl)}\n\n` +
        `📊 ${escapeMarkdownV2('Javoblarni ko\'rish:')}\n${escapeMarkdownV2(dashUrl)}`;

      await sendTelegramMessage(tgChatId, body, {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Havolani ulashish', switch_inline_query: inviteUrl }],
            [{ text: '📊 Javoblarni ko\'rish', web_app: { url: dashUrl } }]
          ]
        }
      });
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

    const newDodgeCount = Number(noAttempts) || 0;
    if (newDodgeCount > 0) inv.noAttempts += newDodgeCount;
    await inv.save();

    if (inv.tgChatId) {
      const answerEmoji = answer === 'ha'
        ? escapeMarkdownV2('✅ HA')
        : escapeMarkdownV2("❌ YO'Q");

      let notifText =
        `🔔 *${escapeMarkdownV2(inv.to)}* ${escapeMarkdownV2('dan javob keldi!')}\n\n` +
        `${answerEmoji}`;

      if (place) {
        notifText += `\n📍 ${escapeMarkdownV2('Joy:')} *${escapeMarkdownV2(place)}*`;
      }
      if (time) {
        notifText += `\n🕐 ${escapeMarkdownV2('Vaqt:')} *${escapeMarkdownV2(time)}*`;
      }
      if (newDodgeCount > 0) {
        notifText += `\n😅 ${escapeMarkdownV2(`"Yo'q" tugmasidan qochdi: ${newDodgeCount} marta`)}`;
      }

      notifText +=
        `\n\n${escapeMarkdownV2('Barcha javoblarni ko\'rish:')}\n` +
        `${escapeMarkdownV2(`${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey}`)}`;

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
async function cleanupOldInvitations() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await Invitation.deleteMany({
      $or: [
        { createdAt: { $lt: sevenDaysAgo } },
        { 'responses.0': { $exists: true } },
        { completed: true }
      ]
    });
    if (result.deletedCount > 0) {
      console.log(`🗑  Cleanup: deleted ${result.deletedCount} old/answered invitation(s).`);
    }
  } catch (err) {
    console.error('❌ Cleanup error:', err.message);
  }
}

// Schedule cleanup every day at 03:00
cron.schedule('0 3 * * *', () => {
  console.log('🕒 Running scheduled invitation cleanup...');
  cleanupOldInvitations();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
