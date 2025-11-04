# README.md

## Anna Bot
Anna Bot is a cool girl Discord moderation bot made with **discord.js v14**. It features moderation commands, a fun presence, and a simple file-based warning system.

### ✨ Features
- Custom presence: *Watching Zelda* (DND status)
- Moderation commands: `!kick`, `!ban`, `!mute`, `!unmute`, `!clear`, `!warn`, `!warnings`
- Easy setup with `.env`
- Simple JSON warning storage
- Requires proper Discord bot permissions

### 🧩 Setup
```bash
# Install dependencies
npm install discord.js@14 dotenv

# Create a .env file
TOKEN=your_bot_token_here
PREFIX=!

# Run the bot
node index.js
```

### ⚙️ Permissions
Make sure your bot has the following permissions enabled:
- Kick Members
- Ban Members
- Manage Roles
- Manage Messages
- Read Message Content (for prefix commands)

### 🪄 Presence
The bot appears as:
> Watching Zelda
> Status: DND (Do Not Disturb)

### 🧠 Notes
- Built for educational/fun use.
- Recommended Node.js version: **18+**.
- You can add slash commands easily by extending the code.
