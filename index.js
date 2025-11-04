// girl-discord-bot - enhanced single-file example (index.js)
// Requirements: node 18+, discord.js v14
// Install: npm i discord.js@14 dotenv

require('dotenv').config();
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || ''; // your bot's application client ID (for slash registration)
const PREFIX = process.env.PREFIX || '!';
if (!TOKEN) {
  console.error('Please set TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// Simple warnings storage (file-backed)
const WARN_FILE = './warnings.json';
let warnings = {};
if (fs.existsSync(WARN_FILE)) {
  try { warnings = JSON.parse(fs.readFileSync(WARN_FILE, 'utf8')) || {}; } catch (e) { warnings = {}; }
}
function saveWarnings() { fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2)); }

// Helper: permission check
function hasPerm(member, perm) {
  try { return member.permissions.has(perm); } catch (e) { return false; }
}

// Ensure Muted role exists and attempt to lock text channels
async function ensureMutedRole(guild) {
  let role = guild.roles.cache.find(r => r.name === 'Muted');
  if (!role) {
    try {
      role = await guild.roles.create({ name: 'Muted', reason: 'Create mute role for moderation', permissions: [] });
      for (const [, channel] of guild.channels.cache) {
        if (channel.isText()) {
          try {
            await channel.permissionOverwrites.edit(role, { SendMessages: false, AddReactions: false });
          } catch (e) { /* ignore per-channel errors */ }
        }
      }
    } catch (e) {
      console.error('Could not create Muted role:', e);
    }
  }
  return role;
}

// --- Slash commands definition to register globally (if CLIENT_ID provided) ---
const slashCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Bot latency'),
  new SlashCommandBuilder().setName('avatar').setDescription('Show user avatar').addUserOption(opt => opt.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show info about a user').addUserOption(opt => opt.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show info about the server'),
  new SlashCommandBuilder().setName('say').setDescription('Make the bot say something').addStringOption(o => o.setName('text').setDescription('Text to say').setRequired(true)),
  new SlashCommandBuilder().setName('hug').setDescription('Give someone a hug').addUserOption(o => o.setName('user').setDescription('User to hug')),

  // moderation
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member').addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a member').addUserOption(o => o.setName('user').setDescription('Member to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a member').addUserOption(o => o.setName('user').setDescription('Member to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Bulk delete messages').addIntegerOption(o => o.setName('amount').setDescription('Amount 1-100').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member').addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('warnings').setDescription('List warnings for a user').addUserOption(o => o.setName('user').setDescription('Member'))
].map(cmd => cmd.toJSON());

async function registerGlobalSlashCommands() {
  if (!CLIENT_ID) {
    console.warn('CLIENT_ID not set — skipping global slash command registration. To register globally, set CLIENT_ID in .env');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering global slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log('Global slash commands registered. (May take up to 1 hour to appear in all guilds)');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

// Interaction handler (slash commands)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  try {
    if (cmd === 'ping') {
      const sent = await interaction.reply({ content: 'Pong...', fetchReply: true });
      await interaction.editReply(`Pong! Latency: ${sent.createdTimestamp - interaction.createdTimestamp}ms`);
    }

    else if (cmd === 'avatar') {
      const user = interaction.options.getUser('user') || interaction.user;
      await interaction.reply(`${user.tag}'s avatar: ${user.displayAvatarURL({ dynamic: true, size: 1024 })}`);
    }

    else if (cmd === 'userinfo') {
      const user = interaction.options.getUser('user') || interaction.user;
      const member = interaction.guild ? interaction.guild.members.cache.get(user.id) : null;
      await interaction.reply({ content: `**User:** ${user.tag}\n**ID:** ${user.id}\n**Joined server:** ${member ? (member.joinedAt || 'Unknown') : 'N/A'}` });
    }

    else if (cmd === 'serverinfo') {
      const g = interaction.guild;
      await interaction.reply({ content: `**${g.name}**\nID: ${g.id}\nMembers: ${g.memberCount}` });
    }

    else if (cmd === 'say') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'You need Manage Messages permission.', ephemeral: true });
      const text = interaction.options.getString('text');
      await interaction.reply({ content: text });
    }

    else if (cmd === 'hug') {
      const user = interaction.options.getUser('user') || interaction.user;
      await interaction.reply(`${interaction.user.tag} hugs ${user.tag} 🤗`);
    }

    // moderation
    else if (cmd === 'kick' || cmd === 'ban') {
      const targetUser = interaction.options.getUser('user');
      const target = interaction.guild.members.cache.get(targetUser.id);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });

      if (cmd === 'kick') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: 'You need Kick Members permission.', ephemeral: true });
        if (!target.kickable) return interaction.reply({ content: 'I cannot kick that user.', ephemeral: true });
        await target.kick(reason);
        await interaction.reply({ content: `✅ ${target.user.tag} was kicked. Reason: ${reason}` });
      } else {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'You need Ban Members permission.', ephemeral: true });
        if (!target.bannable) return interaction.reply({ content: 'I cannot ban that user.', ephemeral: true });
        await target.ban({ reason });
        await interaction.reply({ content: `🚫 ${target.user.tag} was banned. Reason: ${reason}` });
      }
    }

    else if (cmd === 'mute') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({ content: 'You need Manage Roles permission.', ephemeral: true });
      const targetUser = interaction.options.getUser('user');
      const target = interaction.guild.members.cache.get(targetUser.id);
      if (!target) return interaction.reply({ content: 'User not found.', ephemeral: true });
      const role = await ensureMutedRole(interaction.guild);
      if (!role) return interaction.reply({ content: 'Could not create/find Muted role.', ephemeral: true });
      if (target.roles.cache.has(role.id)) return interaction.reply({ content: 'User is already muted.', ephemeral: true });
      await target.roles.add(role, `Muted by ${interaction.user.tag}`);
      await interaction.reply({ content: `🔇 ${target.user.tag} has been muted.` });
    }

    else if (cmd === 'unmute') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({ content: 'You need Manage Roles permission.', ephemeral: true });
      const targetUser = interaction.options.getUser('user');
      const target = interaction.guild.members.cache.get(targetUser.id);
      if (!target) return interaction.reply({ content: 'User not found.', ephemeral: true });
      const role = interaction.guild.roles.cache.find(r => r.name === 'Muted');
      if (!role || !target.roles.cache.has(role.id)) return interaction.reply({ content: 'User is not muted.', ephemeral: true });
      await target.roles.remove(role, `Unmuted by ${interaction.user.tag}`);
      await interaction.reply({ content: `🔊 ${target.user.tag} has been unmuted.` });
    }

    else if (cmd === 'clear') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'You need Manage Messages permission.', ephemeral: true });
      const amount = interaction.options.getInteger('amount');
      if (!amount || amount < 1 || amount > 100) return interaction.reply({ content: 'Amount must be between 1 and 100.', ephemeral: true });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `🧹 Deleted ${deleted.size} messages.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: 'Failed to bulk delete messages.', ephemeral: true });
      }
    }

    else if (cmd === 'warn') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
        return interaction.reply({ content: 'You need moderation permissions to warn users.', ephemeral: true });
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const guildId = interaction.guild.id;
      warnings[guildId] = warnings[guildId] || {};
      warnings[guildId][targetUser.id] = warnings[guildId][targetUser.id] || [];
      warnings[guildId][targetUser.id].push({ moderator: interaction.user.id, reason, date: new Date().toISOString() });
      saveWarnings();
      await interaction.reply({ content: `⚠️ ${targetUser.tag} has been warned. Reason: ${reason}` });
    }

    else if (cmd === 'warnings') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const guildId = interaction.guild.id;
      const userWarns = (warnings[guildId] && warnings[guildId][targetUser.id]) || [];
      if (!userWarns.length) return interaction.reply({ content: `${targetUser.tag} has no warnings.`, ephemeral: true });
      const list = userWarns.map((w, i) => `${i + 1}. ${w.reason} — <@${w.moderator}> (${w.date.split('T')[0]})`).join('\n');
      await interaction.reply({ content: `Warnings for ${targetUser.tag}:\n${list}` });
    }

  } catch (err) {
    console.error('Error handling interaction:', err);
    if (!interaction.replied) await interaction.reply({ content: 'There was an error while running that command.', ephemeral: true });
  }
});

// --- Prefix commands (keeps backwards compatibility) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // ping
  if (cmd === 'ping') {
    const m = await message.channel.send('Pinging...');
    m.edit(`Pong! Latency: ${m.createdTimestamp - message.createdTimestamp}ms | API: ${Math.round(client.ws.ping)}ms`);
  }

  // avatar
  else if (cmd === 'avatar') {
    const target = message.mentions.users.first() || message.author;
    message.channel.send(`${target.tag}'s avatar: ${target.displayAvatarURL({ dynamic: true, size: 1024 })}`);
  }

  // say
  else if (cmd === 'say') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageMessages)) return message.reply('You need Manage Messages permission.');
    const text = args.join(' ');
    if (!text) return message.reply('Provide text to say.');
    message.channel.send(text);
  }

  // userinfo
  else if (cmd === 'userinfo') {
    const target = message.mentions.users.first() || message.author;
    const member = message.guild.members.cache.get(target.id);
    message.channel.send(`User: ${target.tag}\nID: ${target.id}\nJoined: ${member ? member.joinedAt : 'N/A'}`);
  }

  // serverinfo
  else if (cmd === 'serverinfo') {
    const g = message.guild;
    message.channel.send(`${g.name} — ID: ${g.id} — Members: ${g.memberCount}`);
  }

  // leftover moderation commands: reuse earlier patterns for kick/ban/mute/unmute/clear/warn/warnings
  else if (cmd === 'kick') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.KickMembers)) return message.reply('You need Kick Members permission.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to kick.');
    if (!target.kickable) return message.reply('I cannot kick that user.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try { await target.kick(reason); message.channel.send(`✅ ${target.user.tag} kicked. Reason: ${reason}`); } catch (e) { message.reply('Failed to kick.'); }
  }

  else if (cmd === 'ban') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.BanMembers)) return message.reply('You need Ban Members permission.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to ban.');
    if (!target.bannable) return message.reply('I cannot ban that user.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try { await target.ban({ reason }); message.channel.send(`🚫 ${target.user.tag} banned. Reason: ${reason}`); } catch (e) { message.reply('Failed to ban.'); }
  }

  else if (cmd === 'mute') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageRoles)) return message.reply('You need Manage Roles permission.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to mute.');
    const role = await ensureMutedRole(message.guild);
    if (!role) return message.reply('Could not create/find Muted role.');
    if (target.roles.cache.has(role.id)) return message.reply('User already muted.');
    try { await target.roles.add(role, `Muted by ${message.author.tag}`); message.channel.send(`🔇 ${target.user.tag} muted.`); } catch (e) { message.reply('Failed to mute.'); }
  }

  else if (cmd === 'unmute') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageRoles)) return message.reply('You need Manage Roles permission.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to unmute.');
    const role = message.guild.roles.cache.find(r => r.name === 'Muted');
    if (!role || !target.roles.cache.has(role.id)) return message.reply('User is not muted.');
    try { await target.roles.remove(role, `Unmuted by ${message.author.tag}`); message.channel.send(`🔊 ${target.user.tag} unmuted.`); } catch (e) { message.reply('Failed to unmute.'); }
  }

  else if (cmd === 'clear' || cmd === 'purge') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ManageMessages)) return message.reply('You need Manage Messages permission.');
    const count = parseInt(args[0], 10);
    if (!count || count < 1 || count > 100) return message.reply('Provide a number between 1 and 100.');
    try { const deleted = await message.channel.bulkDelete(count + 1, true); message.channel.send(`🧹 Deleted ${deleted.size - 1} messages.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)); } catch (e) { message.reply('Failed to bulk delete.'); }
  }

  else if (cmd === 'warn') {
    if (!hasPerm(message.member, PermissionsBitField.Flags.ModerateMembers) && !hasPerm(message.member, PermissionsBitField.Flags.ManageMessages) && !hasPerm(message.member, PermissionsBitField.Flags.ManageGuild))
      return message.reply('You need moderation permissions to warn.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to warn.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const guildId = message.guild.id;
    warnings[guildId] = warnings[guildId] || {};
    warnings[guildId][target.id] = warnings[guildId][target.id] || [];
    warnings[guildId][target.id].push({ moderator: message.author.id, reason, date: new Date().toISOString() });
    saveWarnings();
    message.channel.send(`⚠️ ${target.user.tag} warned. Reason: ${reason}`);
  }

  else if (cmd === 'warnings') {
    const target = message.mentions.members.first() || message.member;
    const guildId = message.guild.id;
    const userWarns = (warnings[guildId] && warnings[guildId][target.id]) || [];
    if (!userWarns.length) return message.reply(`${target.user.tag} has no warnings.`);
    const list = userWarns.map((w, i) => `${i + 1}. ${w.reason} — <@${w.moderator}> (${w.date.split('T')[0]})`).join('\n');
    message.channel.send({ content: `Warnings for ${target.user.tag}:\n${list}` });
  }

});

// Loading-style console output and presence setup
function showLoadingSequenceAndReady() {
  const seq = ['1%','2%','4%','12%','26%','68%','89%','99%','100%'];
  let delay = 0;
  seq.forEach((s, i) => {
    delay += 150; // quick progress animation
    setTimeout(() => console.log(`Loading bot... ${s}`), delay);
  });
  setTimeout(async () => {
    console.log('pls wait...');
  }, delay + 150);
  setTimeout(async () => {
    try {
      await client.user.setPresence({ activities: [{ name: 'Zelda', type: ActivityType.Watching }], status: 'dnd' });
      console.log('Done! Powered On!');
      console.log(`${client.user.tag} is online.`);
    } catch (e) { console.warn('Failed to set presence:', e); }
  }, delay + 500);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  showLoadingSequenceAndReady();
});

// Register slash commands (attempt) and then login
(async () => {
  await registerGlobalSlashCommands();
  client.login(TOKEN).catch(err => { console.error('Failed to login:', err); process.exit(1); });
})();

// Notes: 
// - Put TOKEN and optionally CLIENT_ID and PREFIX in your .env file.
// - Global slash commands can take up to an hour to appear after registration. If you prefer instant testing while developing, register per-guild using Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID).
// - This single-file bot aims for clarity. For larger projects split commands into separate files and use a DB for persistence.
// .env example:
// TOKEN=your_bot_token_here
// CLIENT_ID=your_application_id_here
// PREFIX=! 
