require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { nanoid } = require('nanoid');
const TelegramBot = require('node-telegram-bot-api');
const Invitation = require('./models/Invitation');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── MongoDB ───────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err.message));

// ─── Telegram Bot ──────────────────────────────────────────
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 }
  }
});

process.once('SIGINT',  () => bot.stopPolling());
process.once('SIGTERM', () => bot.stopPolling());
const BASE_URL = process.env.BASE_URL; // e.g. https://yourapp.railway.app

// /start command — show mini web app button
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
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
  bot.sendMessage(msg.chat.id,
    '📖 *Qanday ishlaydi?*\n\n1️⃣ /start → "Taklifnoma yaratish" tugmasini bosing\n2️⃣ Formani to\'ldiring va *Yaratish* tugmasini bosing\n3️⃣ Sizga havola keladi — uni do\'stingizga yuboring\n4️⃣ Do\'stingiz javob berganda *sizga xabar keladi* ✅\n\n/myinvites — yaratilgan taklifnomalarim',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/myinvites/, async (msg) => {
  const chatId = msg.chat.id;
  const list = await Invitation.find({ tgChatId: String(chatId) }).sort({ createdAt: -1 }).limit(10);
  if (!list.length) {
    return bot.sendMessage(chatId, '📭 Sizda hali taklifnomalar yo\'q.\n\n/start → taklifnoma yarating!');
  }
  let text = '📋 *Sizning taklifnomalaringiz:*\n\n';
  list.forEach((inv, i) => {
    const resp = inv.responses.length;
    text += `${i+1}. *${inv.to}*\n   📅 ${new Date(inv.createdAt).toLocaleDateString('uz')}\n   💬 Javoblar: ${resp}\n   🔗 [Taklifnoma](${BASE_URL}/i/${inv.id}) | [Javoblar](${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey})\n\n`;
  });
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// Export bot so routes can use it
module.exports.bot = bot;

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

    // Notify creator via Telegram
    if (tgChatId) {
      bot.sendMessage(tgChatId,
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
      ).catch(() => {});
    }

    res.json({ url: inviteUrl, adminUrl: dashUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get invitation (public) ───────────────────────────────
app.get('/api/invitations/:id', async (req, res) => {
  const inv = await Invitation.findOne({ id: req.params.id });
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const { adminKey, tgChatId, responses, noAttempts, ...publicData } = inv.toObject();
  res.json(publicData);
});

// ─── Submit response ───────────────────────────────────────
app.post('/api/invitations/:id/respond', async (req, res) => {
  try {
    const inv = await Invitation.findOne({ id: req.params.id });
    if (!inv) return res.status(404).json({ error: 'Not found' });

    const { answer, place, time, noAttempts, guestName } = req.body;
    inv.responses.push({ answer, place, time, guestName });
    if (noAttempts) inv.noAttempts += Number(noAttempts) || 0;
    await inv.save();

    // 🔔 Notify creator via Telegram
    if (inv.tgChatId) {
      const answerEmoji = answer === 'ha' ? '✅ HA' : '❌ YO\'Q';
      let notifText = `🔔 *${inv.to}* dan javob keldi!\n\n${answerEmoji}`;
      if (place) notifText += `\n📍 Joy: *${place}*`;
      if (time)  notifText += `\n🕐 Vaqt: *${time}*`;
      if (noAttempts > 0) notifText += `\n😅 "Yo'q" tugmasidan qochdi: ${noAttempts} marta`;
      notifText += `\n\n[Barcha javoblarni ko'rish](${BASE_URL}/dashboard/${inv.id}?key=${inv.adminKey})`;

      bot.sendMessage(inv.tgChatId, notifText, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get responses (admin) ─────────────────────────────────
app.get('/api/invitations/:id/responses', async (req, res) => {
  const inv = await Invitation.findOne({ id: req.params.id });
  if (!inv || inv.adminKey !== req.query.key) return res.status(403).json({ error: 'Forbidden' });
  res.json({
    from: inv.from, to: inv.to, question: inv.question,
    createdAt: inv.createdAt, noAttempts: inv.noAttempts,
    responses: inv.responses
  });
});

// ─── HTML routes ───────────────────────────────────────────
app.get('/i/:id',         (req, res) => res.sendFile(__dirname + '/public/invite.html'));
app.get('/dashboard/:id', (req, res) => res.sendFile(__dirname + '/public/dashboard.html'));
app.get('/',              (req, res) => res.sendFile(__dirname + '/public/admin.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
