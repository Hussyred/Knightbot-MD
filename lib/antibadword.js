const fs = require('fs');
const path = require('path');
const { setAntiBadword, getAntiBadword, removeAntiBadword, incrementWarningCount, resetWarningCount } = require('./index');

// Load bad words for a group
function loadBadWords(groupId) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(configPath)) return [];
        const data = JSON.parse(fs.readFileSync(configPath));
        return data.antibadword?.[groupId]?.badWords || [];
    } catch (error) {
        return [];
    }
}

function saveBadWords(groupId, badWords) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        let data = {};
        if (fs.existsSync(configPath)) data = JSON.parse(fs.readFileSync(configPath));
        if (!data.antibadword) data.antibadword = {};
        if (!data.antibadword[groupId]) data.antibadword[groupId] = {};
        data.antibadword[groupId].badWords = badWords;
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        return false;
    }
}

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIBADWORD SETUP*\n\n.antibadword on - Turn on\n.antibadword off - Turn off\n.antibadword add <word> - Add word\n.antibadword remove <word> - Remove word\n.antibadword list - Show words\n.antibadword set delete/kick/warn - Set action\n.antibadword resetwarn - Reset warnings`
        }, { quoted: message });
    }

    if (match === 'on') {
        await setAntiBadword(chatId, 'on', 'delete');
        return sock.sendMessage(chatId, { text: '✅ AntiBadword ON' }, { quoted: message });
    }

    if (match === 'off') {
        await removeAntiBadword(chatId);
        return sock.sendMessage(chatId, { text: '✅ AntiBadword OFF' }, { quoted: message });
    }

    if (match.startsWith('set ')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: '❌ Use: delete, kick, or warn' }, { quoted: message });
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, { text: `✅ Action: ${action}` }, { quoted: message });
    }

    if (match.startsWith('add ')) {
        const word = match.slice(4).trim().toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: '❌ Usage: .antibadword add <word>' }, { quoted: message });
        let words = loadBadWords(chatId);
        if (words.includes(word)) return sock.sendMessage(chatId, { text: `⚠️ ${word} already exists` }, { quoted: message });
        words.push(word);
        saveBadWords(chatId, words);
        return sock.sendMessage(chatId, { text: `✅ Added: ${word}` }, { quoted: message });
    }

    if (match.startsWith('remove ')) {
        const word = match.slice(7).trim().toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: '❌ Usage: .antibadword remove <word>' }, { quoted: message });
        let words = loadBadWords(chatId);
        if (!words.includes(word)) return sock.sendMessage(chatId, { text: `⚠️ ${word} not found` }, { quoted: message });
        const newWords = words.filter(w => w !== word);
        saveBadWords(chatId, newWords);
        return sock.sendMessage(chatId, { text: `✅ Removed: ${word}` }, { quoted: message });
    }

    if (match === 'list') {
        const words = loadBadWords(chatId);
        if (words.length === 0) return sock.sendMessage(chatId, { text: '📝 No bad words added' }, { quoted: message });
        return sock.sendMessage(chatId, { text: `📝 Bad Words:\n${words.join(', ')}\n\nTotal: ${words.length}` }, { quoted: message });
    }

    if (match === 'resetwarn') {
        try {
            const configPath = path.join(__dirname, '../data/userGroupData.json');
            if (fs.existsSync(configPath)) {
                const data = JSON.parse(fs.readFileSync(configPath));
                if (data.warnings && data.warnings[chatId]) delete data.warnings[chatId];
                fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
            }
            return sock.sendMessage(chatId, { text: '✅ Warnings reset' }, { quoted: message });
        } catch (error) {
            return sock.sendMessage(chatId, { text: '❌ Error resetting warnings' }, { quoted: message });
        }
    }

    return sock.sendMessage(chatId, { text: '❌ Invalid command' }, { quoted: message });
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    console.log('[ANTIBADWORD] Function called');
    
    // Skip if not group
    if (!chatId.endsWith('@g.us')) {
        console.log('[ANTIBADWORD] Not a group, skipping');
        return;
    }
    
    // Skip if message from bot
    if (message.key.fromMe) {
        console.log('[ANTIBADWORD] Message from bot, skipping');
        return;
    }
    
    // Get antibadword config
    const config = await getAntiBadword(chatId, 'on');
    console.log('[ANTIBADWORD] Config:', config);
    
    // Check if enabled
    if (!config || !config.enabled) {
        console.log('[ANTIBADWORD] Not enabled');
        return;
    }
    
    // Load bad words
    const badWords = loadBadWords(chatId);
    console.log('[ANTIBADWORD] Bad words:', badWords);
    
    if (badWords.length === 0) {
        console.log('[ANTIBADWORD] No bad words added');
        return;
    }
    
    // Check message for bad words
    const messageLower = userMessage.toLowerCase();
    let found = false;
    let foundWord = '';
    for (const word of badWords) {
        if (messageLower.includes(word.toLowerCase())) {
            found = true;
            foundWord = word;
            break;
        }
    }
    
    if (!found) {
        console.log('[ANTIBADWORD] No bad word found');
        return;
    }
    
    console.log(`[ANTIBADWORD] Bad word found: "${foundWord}"`);
    
    // Check if sender is admin (skip if admin)
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const sender = groupMetadata.participants.find(p => p.id === senderId);
        if (sender?.admin === 'admin' || sender?.admin === 'superadmin') {
            console.log('[ANTIBADWORD] Sender is admin, skipping');
            return;
        }
    } catch (err) {
        console.log('[ANTIBADWORD] Error checking admin:', err.message);
    }
    
    // Delete message
    try {
        await sock.sendMessage(chatId, { delete: message.key });
        console.log('[ANTIBADWORD] Message deleted');
    } catch (err) {
        console.log('[ANTIBADWORD] Error deleting message:', err.message);
        return;
    }
    
    // Take action
    const action = config.action || 'delete';
    console.log('[ANTIBADWORD] Action:', action);
    
    if (action === 'delete') {
        let deleteMessage = '';
        if (foundWord === 'dm') {
            deleteMessage = `⚠️ @${senderId.split('@')[0]}\n\n"DM" is not allowed in this group to prevent scams.\n\nScammers often ask victims to "DM them" to avoid public scrutiny.\n\nTo stay safe, please keep all conversations public.\n\nMessage deleted.`;
        } else {
            deleteMessage = `⚠️ @${senderId.split('@')[0]} bad words are not allowed`;
        }
        await sock.sendMessage(chatId, {
            text: deleteMessage,
            mentions: [senderId]
        });
    }
    else if (action === 'kick') {
        try {
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            let kickMessage = '';
            if (foundWord === 'dm') {
                kickMessage = `👢 @${senderId.split('@')[0]} kicked for using "DM" (scam prevention)`;
            } else {
                kickMessage = `👢 @${senderId.split('@')[0]} kicked for bad word: ${foundWord}`;
            }
            await sock.sendMessage(chatId, {
                text: kickMessage,
                mentions: [senderId]
            });
        } catch (err) {
            console.log('[ANTIBADWORD] Error kicking:', err.message);
        }
    }
    else if (action === 'warn') {
        const count = await incrementWarningCount(chatId, senderId);
        if (count >= 5) {
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await resetWarningCount(chatId, senderId);
                let warnKickMessage = '';
                if (foundWord === 'dm') {
                    warnKickMessage = `👢 @${senderId.split('@')[0]} kicked after 5 warnings (scam prevention)`;
                } else {
                    warnKickMessage = `👢 @${senderId.split('@')[0]} kicked after 5 warnings`;
                }
                await sock.sendMessage(chatId, {
                    text: warnKickMessage,
                    mentions: [senderId]
                });
            } catch (err) {
                console.log('[ANTIBADWORD] Error kicking after warns:', err.message);
            }
        } else {
            let warnMessage = '';
            if (foundWord === 'dm') {
                warnMessage = `⚠️ @${senderId.split('@')[0]} warning ${count}/5 - "DM" is not allowed (scam prevention)`;
            } else {
                warnMessage = `⚠️ @${senderId.split('@')[0]} warning ${count}/5 for: ${foundWord}`;
            }
            await sock.sendMessage(chatId, {
                text: warnMessage,
                mentions: [senderId]
            });
        }
    }
}

module.exports = {
    handleAntiBadwordCommand,
    handleBadwordDetection
};
