// ======================
// 🛍️ Amaan-Store-Bot v1.1
// ======================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 🔧 CONFIGURATION
const STORE_NAME = "Amaan Store";
const ADMINS = ["6281230953140@c.us"]; // Replace with your number
const DB_PATH = path.join(__dirname, 'db', 'amaan_store.db');

// 📦 DATABASE SETUP
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price TEXT NOT NULL,
      description TEXT,
      category TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// 🤖 WHATSAPP CLIENT
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "/tmp/.wwebjs_auth",
    clientId: "amaan-store-bot"
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
});

// 🔔 ERROR NOTIFICATION FUNCTION
async function notifyAdmin(errorMessage) {
  const timestamp = new Date().toLocaleString();
  const formattedMessage = `⚠️ [${timestamp}] ${STORE_NAME} Bot Error:\n${errorMessage}`;
  
  for (const admin of ADMINS) {
    try {
      await client.sendMessage(admin, formattedMessage);
      console.log(`📢 Notified admin ${admin}`);
    } catch (err) {
      console.error('Failed to notify admin:', err);
    }
  }
}

// 🎉 BOT STARTUP
console.log(`\n🛍️ Starting ${STORE_NAME} Bot...\n`);

// 🔄 EVENT HANDLERS
client.on('qr', qr => {
  console.log(`${STORE_NAME} Bot QR Code:`);
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log(`\n✅ ${STORE_NAME} Bot is ready!\n`);
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (err) notifyAdmin(`Database error: ${err.message}`);
    console.log(`📦 Products in database: ${row?.count || 0}`);
  });
});

// 🚨 ERROR HANDLER
process.on('uncaughtException', async (err) => {
  console.error('CRITICAL ERROR:', err);
  await notifyAdmin(`Uncaught Exception:\n${err.stack}`);
});

// 📩 MESSAGE HANDLER
client.on('message', async msg => {
  try {
    const chat = await msg.getChat();
    const isAdmin = ADMINS.includes(msg.from);

    // ... [rest of your existing message handler code]
    
  } catch (err) {
    console.error('Message handling error:', err);
    await notifyAdmin(`Message Error:\nFrom: ${msg.from}\nError: ${err.message}`);
  }
});

// 👋 WELCOME HANDLER
client.on('group_participants_update', async ({ id, participants, action }) => {
  try {
    if (action === 'add') {
      const chat = await client.getChatById(id);
      const contact = await client.getContactById(participants[0]);
      await chat.sendMessage(
        `👋 Welcome to ${STORE_NAME}, @${contact.number}!\nType *!catalog* to see products`,
        { mentions: [contact] }
      );
    }
  } catch (err) {
    console.error('Welcome error:', err);
    await notifyAdmin(`Welcome Error:\nGroup: ${id}\nError: ${err.message}`);
  }
});

// 🚀 INITIALIZE BOT
client.initialize().catch(async err => {
  console.error('Init failed:', err);
  await notifyAdmin(`INIT FAILED:\n${err.stack}`);
});

// ⚠️ HEROKU SHUTDOWN HANDLER
process.on('SIGTERM', async () => {
  console.log(`\n🛑 Shutting down ${STORE_NAME} Bot...\n`);
  try {
    await notifyAdmin("🛑 Bot is shutting down...");
    db.close();
    await client.destroy();
  } catch (err) {
    console.error('Shutdown error:', err);
  }
});