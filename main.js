const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const express = require("express");

// Load environment variables if .env file exists
try {
  require('dotenv').config();
} catch (err) {
  console.log('No .env file found, using hardcoded credentials');
}

const botToken = process.env.BOT_TOKEN || '7801977957:AAGZav-Jyxv39AQUdivE_EfvIpGEF9cJFfU'; // Replace with your bot token
const bot = new TelegramBot(botToken, { polling: true }); // Use polling mode for the bot

const app = express();

const ownerUserId = parseInt(process.env.OWNER_USER_ID) || 6923915798; // Replace with your user ID
const authorizedUsers = {}; // Object to store authorized user IDs and their data

const startMessage = "Welcome to 𝐒𝐏𝐘 𝐅𝐎𝐑𝐖𝐀𝐑𝐃 𝐁𝐎𝐓..."; // Your start message

// Load authorized users data from file if it exists
const authorizedUsersFile = 'authorized_users.json';
if (fs.existsSync(authorizedUsersFile)) {
  const data = fs.readFileSync(authorizedUsersFile);
  Object.assign(authorizedUsers, JSON.parse(data));
}

let forwardingData = {
  sourceChatId: null,
  destinationChatId: null,
  startId: null,
  endId: null,
  lastSuccessfulId: null,
  totalToForward: 0,
  forwardedCount: 0,
  isActive: false
};

const progressFile = 'forwarding_progress.json';

// Load progress if it exists
function loadProgress() {
  if (fs.existsSync(progressFile)) {
    try {
      const data = fs.readFileSync(progressFile, 'utf8');
      const saved = JSON.parse(data);
      forwardingData = { ...forwardingData, ...saved };
      console.log(`Loaded progress: ${forwardingData.forwardedCount} of ${forwardingData.totalToForward} messages forwarded`);
      return true;
    } catch (e) {
      console.log('Could not load progress file');
      return false;
    }
  }
  return false;
}

// Save progress after each message
function saveProgress() {
  const dataToSave = {
    sourceChatId: forwardingData.sourceChatId,
    destinationChatId: forwardingData.destinationChatId,
    startId: forwardingData.startId,
    endId: forwardingData.endId,
    lastSuccessfulId: forwardingData.lastSuccessfulId,
    totalToForward: forwardingData.totalToForward,
    forwardedCount: forwardingData.forwardedCount,
    isActive: forwardingData.isActive
  };
  fs.writeFileSync(progressFile, JSON.stringify(dataToSave, null, 2));
}

// Load existing progress on startup
loadProgress();

let isForwarding = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function forwardMessagesInRange(chatId, sourceChatId, destinationChatId, startId, endId) {
  isForwarding = true;
  forwardingData.isActive = true;
  forwardingData.sourceChatId = sourceChatId;
  forwardingData.destinationChatId = destinationChatId;
  forwardingData.startId = startId;
  forwardingData.endId = endId;
  forwardingData.totalToForward = endId - startId + 1;

  // Check if resuming
  if (forwardingData.lastSuccessfulId && forwardingData.lastSuccessfulId >= startId) {
    const resumeFrom = forwardingData.lastSuccessfulId + 1;
    if (resumeFrom <= endId) {
      await bot.sendMessage(chatId, `📋 Resuming from message ${resumeFrom}. Already forwarded: ${forwardingData.forwardedCount}/${forwardingData.totalToForward}`);
      startId = resumeFrom;
    } else {
      await bot.sendMessage(chatId, `✅ All ${forwardingData.forwardedCount} messages already forwarded!`);
      isForwarding = false;
      return;
    }
  } else {
    forwardingData.forwardedCount = 0;
    forwardingData.lastSuccessfulId = null;
    saveProgress();
  }

  const messageDelay = 150;       // 150ms between each message (slower for 7k messages)
  const retryDelay = 5000;        // 5s wait on temporary error
  const floodWaitDelay = 45000;   // 45s on rate limit

  let consecutiveErrors = 0;

  for (let messageId = startId; messageId <= endId; messageId++) {
    if (!isForwarding) {
      await bot.sendMessage(chatId, `⏸️ Stopped at message ${messageId}. Progress saved. Use /resume to continue.`);
      forwardingData.isActive = false;
      saveProgress();
      break;
    }

    let success = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        await bot.copyMessage(destinationChatId, sourceChatId, messageId, { 
          disable_notification: true 
        });
        
        forwardingData.lastSuccessfulId = messageId;
        forwardingData.forwardedCount++;
        consecutiveErrors = 0;
        success = true;

        // Save progress every message
        saveProgress();

        // Log progress every 100 messages
        if (forwardingData.forwardedCount % 100 === 0) {
          const percent = Math.round((forwardingData.forwardedCount / forwardingData.totalToForward) * 100);
          console.log(`✅ Progress: ${forwardingData.forwardedCount}/${forwardingData.totalToForward} (${percent}%)`);
          await bot.sendMessage(chatId, `📊 Progress: ${forwardingData.forwardedCount}/${forwardingData.totalToForward} messages`);
        }

        await delay(messageDelay);

      } catch (error) {
        const errorCode = error.response?.statusCode;
        const errorMsg = error.message || 'Unknown error';

        console.error(`Error on message ${messageId} (attempt ${attempts}/${maxAttempts}): ${errorMsg}`);

        if (errorCode === 429) {
          // Rate limit - must wait
          const retryAfter = error.response?.headers?.['retry-after'] || 45;
          const waitTime = parseInt(retryAfter) * 1000 + 5000; // Add 5s buffer
          console.log(`🔴 Rate limited! Waiting ${waitTime / 1000}s before retry...`);
          await bot.sendMessage(chatId, `⏱️ Rate limited! Waiting ${waitTime / 1000}s... (message ${messageId})`);
          await delay(waitTime);
          
        } else if (errorCode === 400 || errorCode === 403) {
          // Bad request or forbidden - skip this message
          console.log(`⚠️ Message ${messageId} cannot be forwarded (error ${errorCode}). Skipping...`);
          success = true; // Skip this message
          forwardingData.forwardedCount++;
          forwardingData.lastSuccessfulId = messageId;
          saveProgress();
          
        } else {
          // Other temporary error - retry
          consecutiveErrors++;
          if (attempts < maxAttempts) {
            console.log(`⏳ Temporary error on message ${messageId}. Waiting ${retryDelay}ms before retry...`);
            await delay(retryDelay);
          }
        }

        // If too many consecutive errors, stop to prevent infinite loop
        if (consecutiveErrors > 3) {
          await bot.sendMessage(chatId, `❌ Too many errors. Stopped at message ${messageId}. Use /resume to continue.`);
          forwardingData.isActive = false;
          saveProgress();
          isForwarding = false;
          return;
        }
      }
    }

    if (!success) {
      await bot.sendMessage(chatId, `❌ Failed to forward message ${messageId} after ${maxAttempts} attempts. Use /resume to continue.`);
      forwardingData.isActive = false;
      saveProgress();
      isForwarding = false;
      return;
    }
  }

  // All done!
  await bot.sendMessage(chatId, `✅ 🎉 All ${forwardingData.forwardedCount} messages forwarded successfully!`);
  fs.unlinkSync(progressFile);
  forwardingData.lastSuccessfulId = null;
  forwardingData.isActive = false;
  isForwarding = false;
}

// Handle authorized users and commands
bot.onText(/\/auth (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = parseInt(match[1]);

  if (msg.from.id === ownerUserId) {
    authorizedUsers[userId] = true;
    saveAuthorizedUsers();
    bot.sendMessage(chatId, `User ${userId} is now authorized.`);
  } else {
    bot.sendMessage(chatId, 'You are not authorized to perform this action...');
  }
});

bot.onText(/\/unauth/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId === ownerUserId) {
    if (authorizedUsers[userId]) {
      delete authorizedUsers[userId];
      saveAuthorizedUsers();
      bot.sendMessage(chatId, 'You are now unauthorized to use the bot...');
    } else {
      bot.sendMessage(chatId, 'You are not authorized to use the bot...');
    }
  } else {
    bot.sendMessage(chatId, 'Only the owner can perform this action...');
  }
});

bot.onText(/\/owner/, (msg) => {
  const chatId = msg.chat.id;
  
  if (msg.from.id === ownerUserId) {
    bot.sendMessage(chatId, 'You are the owner of this bot.');
  } else {
    bot.sendMessage(chatId, 'You are not the owner of this bot.');
  }
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, startMessage, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '𝙊𝙬𝙣𝙚𝙧', url: 'https://t.me/gazabho' }],
        [{ text: '𝙂𝙚𝙩 𝙔𝙤𝙪𝙧𝙨𝙚𝙡𝙛 𝘼𝙪𝙩𝙝𝙤𝙧𝙞𝙯𝙚𝙙', url: 'https://t.me/dev_gagan' }],
      ],
    },
  });
});

bot.onText(/\/forward/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!authorizedUsers[msg.from.id]) {
    bot.sendMessage(chatId, 'You are not authorized to perform this action.');
    return;
  }

  await bot.sendMessage(chatId, 'Please provide the source chat ID (integer):');
  bot.once('message', (sourceMessage) => {
    const sourceChatId = parseIntegerMessage(sourceMessage);

    if (isNaN(sourceChatId)) {
      bot.sendMessage(chatId, 'Invalid input. Please resend the source chat ID as an integer.');
      return;
    }

    bot.sendMessage(chatId, 'Please provide the destination chat ID (integer):');
    bot.once('message', (destinationMessage) => {
      const destinationChatId = parseIntegerMessage(destinationMessage);

      if (isNaN(destinationChatId)) {
        bot.sendMessage(chatId, 'Invalid input. Please resend the destination chat ID as an integer.');
        return;
      }

      bot.sendMessage(chatId, 'Please provide the start message ID (integer):');
      bot.once('message', (startMessageIdMessage) => {
        const startMessageId = parseIntegerMessage(startMessageIdMessage);

        if (isNaN(startMessageId)) {
          bot.sendMessage(chatId, 'Invalid input. Please resend the start message ID as an integer.');
          return;
        }

        bot.sendMessage(chatId, 'Please provide the end message ID (integer):');
        bot.once('message', (endMessageIdMessage) => {
          const endMessageId = parseIntegerMessage(endMessageIdMessage);

          if (isNaN(endMessageId)) {
            bot.sendMessage(chatId, 'Invalid input. Please resend the end message ID as an integer.');
            return;
          }

          forwardMessagesInRange(chatId, sourceChatId, destinationChatId, startMessageId, endMessageId)
            .then(() => {
              bot.sendMessage(chatId, 'Forwarded messages to the destination chat');
            })
            .catch((error) => {
              bot.sendMessage(chatId, 'Error forwarding messages. Please try again later.');
              console.error('Error forwarding messages:', error);
            });
        });
      });
    });
  });
});

bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  if (isForwarding) {
    isForwarding = false;
    await bot.sendMessage(chatId, 'Forwarding process canceled.');
  } else {
    await bot.sendMessage(chatId, 'No forwarding process is currently ongoing.');
  }
});

bot.onText(/\/resume/, async (msg) => {
  const chatId = msg.chat.id;

  if (!authorizedUsers[msg.from.id]) {
    bot.sendMessage(chatId, 'You are not authorized to perform this action.');
    return;
  }

  if (!loadProgress() || !forwardingData.lastSuccessfulId) {
    await bot.sendMessage(chatId, '❌ No saved progress to resume. Use /forward to start a new transfer.');
    return;
  }

  if (!forwardingData.sourceChatId || !forwardingData.destinationChatId) {
    await bot.sendMessage(chatId, '❌ Cannot resume: missing chat IDs. Use /forward to start again.');
    return;
  }

  await bot.sendMessage(chatId, `📥 Resuming... Last forwarded: ${forwardingData.lastSuccessfulId}`);
  
  const startId = forwardingData.lastSuccessfulId + 1;
  const endId = forwardingData.endId;

  if (startId > endId) {
    await bot.sendMessage(chatId, `✅ All messages already forwarded!`);
    return;
  }

  await forwardMessagesInRange(chatId, forwardingData.sourceChatId, forwardingData.destinationChatId, startId, endId);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  if (forwardingData.isActive) {
    const percent = Math.round((forwardingData.forwardedCount / forwardingData.totalToForward) * 100);
    await bot.sendMessage(chatId, `📊 Status:\n✅ Forwarded: ${forwardingData.forwardedCount}/${forwardingData.totalToForward} (${percent}%)\n📍 Last: Message ${forwardingData.lastSuccessfulId}\n\nUse /cancel to stop or /resume to continue.`);
  } else {
    if (forwardingData.lastSuccessfulId) {
      await bot.sendMessage(chatId, `📋 Saved Progress:\n✅ ${forwardingData.forwardedCount} messages forwarded\n📍 Last: Message ${forwardingData.lastSuccessfulId}\n\nUse /resume to continue.`);
    } else {
      await bot.sendMessage(chatId, `📭 No active transfer or saved progress.`);
    }
  }
});

function saveAuthorizedUsers() {
  const data = JSON.stringify(authorizedUsers, null, 2);
  fs.writeFileSync('authorized_users.json', data, 'utf8');
}

// Basic health check endpoint for Express
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// Start the Express server
const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown for both the bot and server
process.once('SIGINT', () => {
  bot.stopPolling();
  server.close(() => {
    console.log('Server shut down gracefully');
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  bot.stopPolling();
  server.close(() => {
    console.log('Server shut down gracefully');
    process.exit(0);
  });
});

// Utility to parse integer from message
function parseIntegerMessage(message) {
  const parsedValue = parseInt(message.text.trim());
  return isNaN(parsedValue) ? NaN : parsedValue;
}
