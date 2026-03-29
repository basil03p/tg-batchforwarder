# 🚀 LOCAL SETUP GUIDE - Message Forwarder Bot

## Step 1: Get Your Telegram Bot Token
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Copy the **Bot Token** (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

## Step 2: Get Your User ID
1. Open Telegram and search for **@userinfobot**
2. Send any message
3. Bot will reply with your **User ID** (a number like: `1234567890`)

## Step 3: Update Configuration
Open `main.js` and replace:
```javascript
const botToken = 'your_bot_token_here';  // Line 5
const ownerUserId = your_user_id_here;   // Line 6
```

## Step 4: Start the Bot
```bash
npm start
```

You should see: `Server is running on port 3000`

## Step 5: Get Channel/Group IDs

### For Source Channel (where files are):
1. Add the bot to your source channel as an administrator
2. Forward any message from that channel to @userinfobot
3. It will show you the channel ID (negative number like: `-1001234567890`)

### For Destination Group (where to send files):
1. Add the bot to your destination group as an administrator  
2. Send any message in the group
3. Forward it to @userinfobot to get the group ID

## Step 6: Forward Messages
1. Send `/forward` command to the bot (in private chat)
2. Bot will ask for:
   - **Source chat ID** (copy from step above)
   - **Destination chat ID** (copy from step above)
   - **Start message ID** (message number to start from)
   - **End message ID** (message number to end at)

The bot will copy all messages (files, videos, text) **WITHOUT "Forwarded from" tag** ✅

## Using the Bot

### Commands:
- `/start` - Initialize
- `/forward` - Start forwarding messages in a range
- `/cancel` - Stop ongoing forwarding
- `/auth <user_id>` - Authorize another user
- `/owner` - Check if you're the owner

## Important Notes:
✅ **Files, videos, text, and all media types are supported**  
✅ **No "Forwarded from" tag** - messages look original  
✅ **Handles rate limiting automatically**  
✅ **Can batch forward hundreds of messages**
