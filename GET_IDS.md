# Quick ID Finder Guide

## Get Your Bot Token & User ID

### 1️⃣ Bot Token
- Search for **@BotFather** in Telegram
- Send: `/newbot`
- Follow steps to create bot
- Copy the Token (example: `7801977957:AAGZav-Jyxv39AQUdivE_EfvIpGEF9cJFfU`)
- Paste in `.env` file → `BOT_TOKEN=your_token_here`

### 2️⃣ Your User ID
- Search for **@userinfobot** in Telegram
- Click Start or send any message
- Bot sends back your **User ID** (example: `6923915798`)
- Paste in `.env` file → `OWNER_USER_ID=your_id_here`

---

## Get Channel & Group IDs

### 📺 Source Channel ID (where files are)
1. Add bot to your source channel as **Admin**
2. Forward ANY message from that channel to **@userinfobot**
3. Check the reply - you'll see:
   ```
   Chat: -1001234567890  ← This is your Channel ID
   ```
4. Copy this number (it starts with `-100`)

### 👥 Destination Group ID (where to send files)
1. Add bot to your destination group as **Admin**
2. Send any message in the group
3. Forward that message to **@userinfobot**
4. You'll see:
   ```
   Chat: -1001987654321  ← This is your Group ID
   ```
5. Copy this number

---

## Start Forwarding

### Command Flow:
```
/forward
↓
Bot: "Please provide the source chat ID"
You: -1001234567890  (copy from @userinfobot)
↓
Bot: "Please provide the destination chat ID"
You: -1001987654321  (copy from @userinfobot)
↓
Bot: "Please provide the start message ID"
You: 1  (message #1 to start)
↓
Bot: "Please provide the end message ID"
You: 100  (message #100 to end)
↓
✅ Messages forwarded! (all files, videos, text - NO "Forwarded from" tag)
```

---

## Example: Forward Avatar Movie Posts

Let's say you want to forward the Avatar posts from your channel:

**If Avatar is message 50-80 in source channel:**
```
/forward
Source: -1001234567890
Destination: -1001987654321
Start: 50
End: 80
```

✅ All 30 messages (videos, text, descriptions) forward cleanly without "Forwarded from" tag!
