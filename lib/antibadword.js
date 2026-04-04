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
            text: `*ANTIBADWORD SETUP*\n\n*.antibadword on*\nTurn on\n\n*.antibadword off*\nTurn off\n\n*.antibadword add <word>*\nAdd word\n\n*.antibadword remove <word>*\nRemove word\n\n*.antibadword list*\nShow words\n\n*.antibadword set delete/kick/warn*\nSet action\n\n*.antibadword resetwarn*\nReset warnings`
        }, { quoted: message });
    }

    if (match === 'on') {
        await setAntiBadword(chatId, 'on', 'delete');
        return sock.sendMessage(chatId, { text: '*✅ AntiBadword ON*' }, { quoted: message });
    }

    if (match === 'off') {
        await removeAntiBadword(chatId);
        return sock.sendMessage(chatId, { text: '*✅ AntiBadword OFF*' }, { quoted: message });
    }

    if (match.startsWith('set ')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: '*❌ Use: delete, kick, or warn*' }, { quoted: message });
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, { text: `*✅ Action: ${action}*` }, { quoted: message });
    }

    if (match.startsWith('add ')) {
        const word = match.slice(4).trim().toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: '*❌ Usage: .antibadword add <word>*' }, { quoted: message });
        let words = loadBadWords(chatId);
        if (words.includes(word)) return sock.sendMessage(chatId, { text: `*⚠️ ${word} already exists*` }, { quoted: message });
        words.push(word);
        saveBadWords(chatId, words);
        return sock.sendMessage(chatId, { text: `*✅ Added: ${word}*` }, { quoted: message });
    }

    if (match.startsWith('remove ')) {
        const word = match.slice(7).trim().toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: '*❌ Usage: .antibadword remove <word>*' }, { quoted: message });
        let words = loadBadWords(chatId);
        if (!words.includes(word)) return sock.sendMessage(chatId, { text: `*⚠️ ${word} not found*` }, { quoted: message });
        const newWords = words.filter(w => w !== word);
        saveBadWords(chatId, newWords);
        return sock.sendMessage(chatId, { text: `*✅ Removed: ${word}*` }, { quoted: message });
    }

    if (match === 'list') {
        const words = loadBadWords(chatId);
        if (words.length === 0) return sock.sendMessage(chatId, { text: '*📝 No bad words added*' }, { quoted: message });
        return sock.sendMessage(chatId, { text: `*📝 Bad Words:*\n${words.join(', ')}\n\nTotal: ${words.length}` }, { quoted: message });
    }

    if (match === 'resetwarn') {
        try {
            const configPath = path.join(__dirname, '../data/userGroupData.json');
            if (fs.existsSync(configPath)) {
                const data = JSON.parse(fs.readFileSync(configPath));
                if (data.warnings && data.warnings[chatId]) delete data.warnings[chatId];
                fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
            }
            return sock.sendMessage(chatId, { text: '*✅ Warnings reset*' }, { quoted: message });
        } catch (error) {
            return sock.sendMessage(chatId, { text: '*❌ Error resetting warnings*' }, { quoted: message });
        }
    }

    return sock.sendMessage(chatId, { text: '*❌ Invalid command*' }, { quoted: message });
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    // Skip if not group
    if (!chatId.endsWith('@g.us')) return;
    
    // Skip if message from bot
    if (message.key.fromMe) return;
    
    // Get antibadword config
    const config = await getAntiBadword(chatId, 'on');
    
    // Check if enabled
    if (!config || !config.enabled) return;
    
    // Load bad words
    const badWords = loadBadWords(chatId);
    if (badWords.length === 0) return;
    
    // Check message for bad words
    const messageLower = userMessage.toLowerCase();
    let found = false;
    for (const word of badWords) {
        if (messageLower.includes(word.toLowerCase())) {
            found = true;
            break;
        }
    }
    
    if (!found) return;
    
    // Check bot is admin
    const groupMetadata = await sock.groupMetadata(chatId);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const bot = groupMetadata.participants.find(p => p.id === botId);
    if (!bot?.admin) return;
    
    // Check sender is not admin
    const sender = groupMetadata.participants.find(p => p.id === senderId);
    if (sender?.admin) return;
    
    // Delete message
    try {
        await sock.sendMessage(chatId, { delete: message.key });
    } catch (err) { 
