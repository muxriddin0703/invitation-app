const mongoose = require('mongoose');

const InvitationSchema = new mongoose.Schema({
  id:       { type: String, unique: true },
  adminKey: String,
  tgChatId: String,   // Telegram chat ID of creator — for notifications
  from:     String,
  to:       String,
  message:  String,
  question: String,
  allowNo:  { type: Boolean, default: true },
  time:     String,
  place:    String,
  locationTimeSelection: {
    enabled:      { type: Boolean, default: false },
    placeOptions: [String],
    timeOptions:  [String]
  },
  style: {
    theme: { type: String, default: 'romantik' },
    color: { type: String, default: '#c2185b' }
  },
  language:   { type: String, default: 'uz' },
  noAttempts: { type: Number, default: 0 },
  responses: [{
    answer:      String,
    place:       String,
    time:        String,
    guestName:   String,
    respondedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Invitation', InvitationSchema);
