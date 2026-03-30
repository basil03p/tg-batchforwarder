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

const startMessage = "Welcome to �𝐡𝐮𝐠𝐚𝐦 𝐅𝐎𝐑𝐖𝐀𝐑𝐃𝐈𝐍𝐆..."; // Your start message

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
  currentMessageId: null,  // Track which message is being processed NOW
  totalToForward: 0,
  forwardedCount: 0,
  isActive: false,
  sentMessages: {} // Track all successfully sent messages by ID
};

const progressFile = 'forwarding_progress.json';
const presetsFile = 'channel_presets.json';

let channelPresets = {}; // Object to store channel presets

// Load presets if they exist
function loadPresets() {
  if (fs.existsSync(presetsFile)) {
    try {
      const data = fs.readFileSync(presetsFile, 'utf8');
      channelPresets = JSON.parse(data);
      console.log('Loaded channel presets');
      return true;
    } catch (e) {
      console.log('Could not load presets file');
      return false;
    }
  }
  return false;
}

// Save presets to file
function savePresets() {
  fs.writeFileSync(presetsFile, JSON.stringify(channelPresets, null, 2));
}

// Load progress if it exists
function loadProgress() {
  if (fs.existsSync(progressFile)) {
    try {
      const data = fs.readFileSync(progressFile, 'utf8');
      const saved = JSON.parse(data);
      forwardingData = { ...forwardingData, ...saved };
      console.log(`Loaded progress: ${forwardingData.forwardedCount} of ${forwardingData.totalToForward} messages forwarded`);
      console.log(`Last successful: ${forwardingData.lastSuccessfulId}, Currently processing: ${forwardingData.currentMessageId}`);
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
    currentMessageId: forwardingData.currentMessageId,
    totalToForward: forwardingData.totalToForward,
    forwardedCount: forwardingData.forwardedCount,
    isActive: forwardingData.isActive,
    sentMessages: forwardingData.sentMessages
  };
  fs.writeFileSync(progressFile, JSON.stringify(dataToSave, null, 2));
}

// Load existing progress on startup
loadProgress();
loadPresets();

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
    forwardingData.currentMessageId = null;
    forwardingData.sentMessages = {};
    saveProgress();
  }

  const messageDelay = 150;       // 150ms between each message
  const retryDelay = 2000;        // 2s wait on temporary error
  const floodWaitDelay = 50000;   // 50s on rate limit

  let consecutiveErrors = 0;

  for (let messageId = startId; messageId <= endId; messageId++) {
    if (!isForwarding) {
      await bot.sendMessage(chatId, `⏸️ Stopped at message ${messageId}. Progress saved. Use /resume to continue.`);
      forwardingData.isActive = false;
      saveProgress();
      break;
    }

    // Skip if already sent successfully
    if (forwardingData.sentMessages[messageId]) {
      console.log(`⏭️  Skipping message ${messageId} (already sent)`);
      forwardingData.currentMessageId = messageId;
      saveProgress();
      continue;
    }

    // Mark this message as currently being processed
    forwardingData.currentMessageId = messageId;
    saveProgress(); // Save BEFORE attempting to send

    let success = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        await bot.copyMessage(destinationChatId, sourceChatId, messageId, { 
          disable_notification: true 
        });
        
        // Mark as successfully sent
        forwardingData.sentMessages[messageId] = true;
        forwardingData.lastSuccessfulId = messageId;
        forwardingData.forwardedCount++;
        consecutiveErrors = 0;
        success = true;

        // Save progress immediately after success
        saveProgress();

        console.log(`✅ Message ${messageId} sent successfully (attempt ${attempts})`);

        // Log progress every 100 messages
        if (forwardingData.forwardedCount % 100 === 0) {
          const percent = Math.round((forwardingData.forwardedCount / forwardingData.totalToForward) * 100);
          console.log(`📊 Progress: ${forwardingData.forwardedCount}/${forwardingData.totalToForward} (${percent}%)`);
          await bot.sendMessage(chatId, `📊 Progress: ${forwardingData.forwardedCount}/${forwardingData.totalToForward} messages`);
        }

        await delay(messageDelay);

      } catch (error) {
        const errorCode = error.response?.statusCode;
        const errorMsg = error.message || 'Unknown error';

        console.error(`❌ Error on message ${messageId} (attempt ${attempts}/${maxAttempts}): [${errorCode}] ${errorMsg}`);

        if (errorCode === 429) {
          // Rate limit - save progress and wait
          saveProgress(); // Save before waiting
          const retryAfter = error.response?.headers?.['retry-after'] || 50;
          const waitTime = parseInt(retryAfter) * 1000 + 5000;
          console.log(`🔴 Rate limited! Waiting ${waitTime / 1000}s before retry on message ${messageId}...`);
          await bot.sendMessage(chatId, `⏱️ Rate limited! Waiting ${waitTime / 1000}s... (message ${messageId})`);
          await delay(waitTime);
          // Continue to retry loop
          
        } else if (errorCode === 400 || errorCode === 403) {
          // Message doesn't exist or can't be accessed - log but retry next time
          console.log(`⚠️ Message ${messageId} cannot be forwarded (error ${errorCode}). Will retry on resume...`);
          forwardingData.forwardedCount++; // Count as processed but NOT sent
          forwardingData.lastSuccessfulId = messageId;
          saveProgress();
          success = true; // Don't retry now, but will retry on resume
          
        } else if (errorCode === 404) {
          // Message not found - log but retry next time
          console.log(`⚠️ Message ${messageId} not found. Will retry on resume...`);
          forwardingData.forwardedCount++; // Count as processed but NOT sent
          forwardingData.lastSuccessfulId = messageId;
          saveProgress();
          success = true; // Don't retry now, but will retry on resume
          
        } else {
          // Other temporary error - retry
          consecutiveErrors++;
          if (attempts < maxAttempts) {
            console.log(`⏳ Temporary error on message ${messageId}. Waiting ${retryDelay}ms before retry ${attempts}/${maxAttempts}...`);
            saveProgress(); // Save before waiting
            await delay(retryDelay);
          }
        }

        // If too many consecutive errors, stop
        if (consecutiveErrors > 3) {
          await bot.sendMessage(chatId, `❌ Too many consecutive errors. Stopped at message ${messageId}. Use /resume to continue.`);
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
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }
  forwardingData.lastSuccessfulId = null;
  forwardingData.currentMessageId = null;
  forwardingData.sentMessages = {};
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

// Preset channel management
bot.onText(/\/preset/, async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (!authorizedUsers[msg.from.id] && msg.from.id !== ownerUserId) {
    bot.sendMessage(chatId, 'You are not authorized to perform this action.');
    return;
  }

  if (text === '/preset') {
    // Show help
    const presetList = Object.keys(channelPresets).length > 0 
      ? Object.entries(channelPresets).map(([name, data]) => `• ${name}: ${data.sourceChatId} → ${data.destinationChatId}`).join('\n')
      : 'No presets saved yet.';
    
    bot.sendMessage(chatId, 
      `📋 *Preset Channels*\n\n${presetList}\n\n` +
      `What would you like to do?\n` +
      `/preset list - Show all presets\n` +
      `/preset add - Add new preset\n` +
      `/preset delete - Delete preset`, 
      { parse_mode: 'Markdown' }
    );
  } else if (text === '/preset list') {
    if (Object.keys(channelPresets).length === 0) {
      bot.sendMessage(chatId, '📭 No presets saved yet.\nUse: /preset add');
    } else {
      const list = Object.entries(channelPresets)
        .map(([name, data]) => `• *${name}*: \`${data.sourceChatId}\` → \`${data.destinationChatId}\``)
        .join('\n');
      bot.sendMessage(chatId, `📋 *Saved Presets*\n\n${list}`, { parse_mode: 'Markdown' });
    }
  } else if (text === '/preset add') {
    await bot.sendMessage(chatId, 'Please provide a name for the preset:');
    bot.once('message', (nameMessage) => {
      const presetName = nameMessage.text.trim();

      if (channelPresets[presetName]) {
        bot.sendMessage(chatId, `❌ Preset *${presetName}* already exists.`, { parse_mode: 'Markdown' });
        return;
      }

      bot.sendMessage(chatId, 'Now provide the source chat ID (integer):');
      bot.once('message', (sourceMessage) => {
        const sourceId = parseInt(sourceMessage.text.trim());

        if (isNaN(sourceId)) {
          bot.sendMessage(chatId, '❌ Source ID must be a number.');
          return;
        }

        bot.sendMessage(chatId, 'Now provide the destination chat ID (integer):');
        bot.once('message', (destMessage) => {
          const destId = parseInt(destMessage.text.trim());

          if (isNaN(destId)) {
            bot.sendMessage(chatId, '❌ Destination ID must be a number.');
            return;
          }

          channelPresets[presetName] = {
            sourceChatId: sourceId,
            destinationChatId: destId
          };
          savePresets();
          bot.sendMessage(chatId, `✅ Preset *${presetName}* added:\n\`${sourceId}\` → \`${destId}\``, { parse_mode: 'Markdown' });
        });
      });
    });
  } else if (text === '/preset delete') {
    if (Object.keys(channelPresets).length === 0) {
      bot.sendMessage(chatId, '❌ No presets to delete.');
      return;
    }

    const presetList = Object.keys(channelPresets).map(name => `• ${name}`).join('\n');
    await bot.sendMessage(chatId, `📋 Which preset to delete?\n\n${presetList}`);
    
    bot.once('message', (deleteMessage) => {
      const presetName = deleteMessage.text.trim();
      
      if (channelPresets[presetName]) {
        delete channelPresets[presetName];
        savePresets();
        bot.sendMessage(chatId, `✅ Preset *${presetName}* deleted.`, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, `❌ Preset *${presetName}* not found.`, { parse_mode: 'Markdown' });
      }
    });
  }
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = 
    `🚀 *Welcome to Chugam FORWARDING*\n\n` +
    `I can forward messages from one channel to another.\n\n` +
    `📋 *Current Configuration:*\n` +
    `Preset: p1\n` +
    `Source: \`-1003302499228\`\n` +
    `Target: \`-1003469694444\`\n`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Preset Channels', callback_data: 'show_presets' }],
        [{ text: '➕ Add Preset', callback_data: 'add_preset' }],
        [{ text: '🚀 Forward Messages', callback_data: 'forward_messages' }],
        [{ text: '⚙️ Manage Presets', callback_data: 'manage_presets' }],
        [{ text: '📊 Status', callback_data: 'show_status' }],
        [{ text: '❓ Help', callback_data: 'show_help' }],
        [{ text: '𝙊𝙬𝙣𝙚𝙧', url: 'https://t.me/chug999' }],
      ],
    },
  });
});

// Handle button callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'show_presets') {
    if (Object.keys(channelPresets).length === 0) {
      await bot.answerCallbackQuery(query.id, '📭 No presets yet!', true);
      return;
    }
    const list = Object.entries(channelPresets)
      .map(([name, d]) => `• *${name}*: \`${d.sourceChatId}\` → \`${d.destinationChatId}\``)
      .join('\n');
    await bot.editMessageText(`📋 *Saved Presets*\n\n${list}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '← Back', callback_data: 'back_to_menu' }]] }
    });
    await bot.answerCallbackQuery(query.id);

  } else if (data === 'add_preset') {
    if (!authorizedUsers[userId] && userId !== ownerUserId) {
      await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
      return;
    }
    await bot.sendMessage(chatId, 'Please provide a name for the preset:');
    bot.once('message', (nameMessage) => {
      const presetName = nameMessage.text.trim();
      if (channelPresets[presetName]) {
        bot.sendMessage(chatId, `❌ Preset *${presetName}* already exists.`, { parse_mode: 'Markdown' });
        return;
      }
      bot.sendMessage(chatId, 'Now provide the source chat ID:');
      bot.once('message', (sourceMessage) => {
        const sourceId = parseInt(sourceMessage.text.trim());
        if (isNaN(sourceId)) {
          bot.sendMessage(chatId, '❌ Must be a number.');
          return;
        }
        bot.sendMessage(chatId, 'Now provide the destination chat ID:');
        bot.once('message', (destMessage) => {
          const destId = parseInt(destMessage.text.trim());
          if (isNaN(destId)) {
            bot.sendMessage(chatId, '❌ Must be a number.');
            return;
          }
          channelPresets[presetName] = { sourceChatId: sourceId, destinationChatId: destId };
          savePresets();
          bot.sendMessage(chatId, `✅ Preset *${presetName}* added!`, { parse_mode: 'Markdown' });
        });
      });
    });
    await bot.answerCallbackQuery(query.id);

  } else if (data === 'forward_messages') {
    if (!authorizedUsers[userId]) {
      await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
      return;
    }
    if (Object.keys(channelPresets).length === 0) {
      await bot.answerCallbackQuery(query.id, '❌ No presets available!', true);
      return;
    }
    const presetList = Object.keys(channelPresets).map(name => `• ${name}`).join('\n');
    await bot.sendMessage(chatId, `📋 Available Presets:\n\n${presetList}\n\nType the preset name:`);
    bot.once('message', (presetMessage) => {
      const presetName = presetMessage.text.trim();
      const preset = channelPresets[presetName];
      if (!preset) {
        bot.sendMessage(chatId, `❌ Preset not found.`);
        return;
      }
      bot.sendMessage(chatId, `✅ Preset: *${presetName}*\n\nStart message ID:`, { parse_mode: 'Markdown' });
      bot.once('message', (startMessage) => {
        const startId = parseInt(startMessage.text.trim());
        if (isNaN(startId)) {
          bot.sendMessage(chatId, '❌ Must be a number.');
          return;
        }
        bot.sendMessage(chatId, 'End message ID:');
        bot.once('message', (endMessage) => {
          const endId = parseInt(endMessage.text.trim());
          if (isNaN(endId)) {
            bot.sendMessage(chatId, '❌ Must be a number.');
            return;
          }
          bot.sendMessage(chatId, `🚀 Starting forward: ${startId} to ${endId}`);
          forwardMessagesInRange(chatId, preset.sourceChatId, preset.destinationChatId, startId, endId);
        });
      });
    });
    await bot.answerCallbackQuery(query.id);

  } else if (data === 'manage_presets') {
    if (!authorizedUsers[userId] && userId !== ownerUserId) {
      await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
      return;
    }
    const presets = Object.keys(channelPresets);
    if (presets.length === 0) {
      await bot.answerCallbackQuery(query.id, '📭 No presets to manage!', true);
      return;
    }
    const buttons = presets.map(p => [{ text: `🗑️ Delete ${p}`, callback_data: `delete_preset_${p}` }]);
    buttons.push([{ text: '← Back', callback_data: 'back_to_menu' }]);
    await bot.editMessageText('⚙️ *Manage Presets*\n\nChoose a preset to delete:', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    await bot.answerCallbackQuery(query.id);

  } else if (data.startsWith('delete_preset_')) {
    if (!authorizedUsers[userId] && userId !== ownerUserId) {
      await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
      return;
    }
    const presetName = data.replace('delete_preset_', '');
    delete channelPresets[presetName];
    savePresets();
    await bot.editMessageText(`✅ Preset *${presetName}* deleted!`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '← Back', callback_data: 'back_to_menu' }]] }
    });
    await bot.answerCallbackQuery(query.id);

  } else if (data === 'show_status') {
    if (forwardingData.isActive) {
      const percent = Math.round((forwardingData.forwardedCount / forwardingData.totalToForward) * 100);
      const status = `📊 *Status*\n\n✅ Forwarded: ${forwardingData.forwardedCount}/${forwardingData.totalToForward} (${percent}%)\n📍 Last: ${forwardingData.lastSuccessfulId}`;
      await bot.editMessageText(status, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '← Back', callback_data: 'back_to_menu' }]] }
      });
    } else {
      const status = forwardingData.lastSuccessfulId 
        ? `📋 *Saved Progress*\n\n✅ ${forwardingData.forwardedCount} messages forwarded\n📍 Last: ${forwardingData.lastSuccessfulId}`
        : `📭 *No active transfer*`;
      await bot.editMessageText(status, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '← Back', callback_data: 'back_to_menu' }]] }
      });
    }
    await bot.answerCallbackQuery(query.id);

  } else if (data === 'show_help') {
    const help = `❓ *Help*\n\n` +
      `*Commands:*\n` +
      `/preset - Manage presets interactively\n` +
      `/forwardpreset - Forward with preset\n` +
      `/forward - Manual forward\n` +
      `/resume - Resume stopped transfer\n` +
      `/cancel - Stop current transfer\n` +
      `/status - Check progress\n\n` +
      `*Presets* make it easy to save channel pairs and forward quickly!`;
    await bot.editMessageText(help, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '← Back', callback_data: 'back_to_menu' }]] }
    });
    await bot.answerCallbackQuery(query.id);

  } else if (data === 'back_to_menu') {
    const welcomeText = 
      `🚀 *Welcome to Chugam FORWARDING*\n\n` +
      `I can forward messages from one channel to another.`;
    await bot.editMessageText(welcomeText, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Preset Channels', callback_data: 'show_presets' }],
          [{ text: '➕ Add Preset', callback_data: 'add_preset' }],
          [{ text: '🚀 Forward Messages', callback_data: 'forward_messages' }],
          [{ text: '⚙️ Manage Presets', callback_data: 'manage_presets' }],
          [{ text: '📊 Status', callback_data: 'show_status' }],
          [{ text: '❓ Help', callback_data: 'show_help' }],
          [{ text: '𝙊𝙬𝙣𝙚𝙧', url: 'https://t.me/chug999' }],
        ],
      },
    });
    await bot.answerCallbackQuery(query.id);
  }
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

bot.onText(/\/forwardpreset/, async (msg) => {
  const chatId = msg.chat.id;

  if (!authorizedUsers[msg.from.id]) {
    bot.sendMessage(chatId, 'You are not authorized to perform this action.');
    return;
  }

  if (Object.keys(channelPresets).length === 0) {
    bot.sendMessage(chatId, '❌ No presets available. Create one with: /preset add <name> <source> <dest>');
    return;
  }

  const presetList = Object.keys(channelPresets).map(name => `• ${name}`).join('\n');
  await bot.sendMessage(chatId, `📋 Available presets:\n${presetList}\n\nPlease provide the preset name:`);

  bot.once('message', (presetMessage) => {
    const presetName = presetMessage.text.trim();
    const preset = channelPresets[presetName];

    if (!preset) {
      bot.sendMessage(chatId, `❌ Preset "${presetName}" not found.`);
      return;
    }

    bot.sendMessage(chatId, `✅ Preset selected: *${presetName}*\n${preset.sourceChatId} → ${preset.destinationChatId}\n\nPlease provide the start message ID (integer):`, { parse_mode: 'Markdown' });

    bot.once('message', (startMessage) => {
      const startId = parseIntegerMessage(startMessage);

      if (isNaN(startId)) {
        bot.sendMessage(chatId, 'Invalid input. Please resend the start message ID as an integer.');
        return;
      }

      bot.sendMessage(chatId, 'Please provide the end message ID (integer):');

      bot.once('message', (endMessage) => {
        const endId = parseIntegerMessage(endMessage);

        if (isNaN(endId)) {
          bot.sendMessage(chatId, 'Invalid input. Please resend the end message ID as an integer.');
          return;
        }

        if (startId > endId) {
          bot.sendMessage(chatId, '❌ Start ID must be less than or equal to end ID.');
          return;
        }

        bot.sendMessage(chatId, `🚀 Starting forward from preset *${presetName}*\nMessages: ${startId} to ${endId}`, { parse_mode: 'Markdown' });

        forwardMessagesInRange(chatId, preset.sourceChatId, preset.destinationChatId, startId, endId)
          .then(() => {
            bot.sendMessage(chatId, '✅ Forwarded messages using preset');
          })
          .catch((error) => {
            bot.sendMessage(chatId, 'Error forwarding messages. Please try again later.');
            console.error('Error forwarding messages:', error);
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
const PORT = process.env.PORT || 5000;
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
