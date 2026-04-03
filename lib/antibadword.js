const fs = require('fs');
const path = require('path');
const { setAntiBadword, getAntiBadword, removeAntiBadword, incrementWarningCount, resetWarningCount } = require('./index');

// Load bad words from storage
function loadBadWords(groupId) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(configPath)) {
            return [];
        }
        const data = JSON.parse(fs.readFileSync(configPath));
        return data.antibadword?.[groupId]?.badWords || [];
    } catch (error) {
        console.error('❌ Error loading bad words:', error.message);
        return [];
    }
}

// Save bad words to storage
function saveBadWords(groupId, badWords) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        let data = {};
        if (fs.existsSync(configPath)) {
            data = JSON.parse(fs.readFileSync(configPath));
        }
        if (!data.antibadword) data.antibadword = {};
        if (!data.antibadword[groupId]) data.antibadword[groupId] = {};
        data.antibadword[groupId].badWords = badWords;
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error saving bad words:', error.message);
        return false;
    }
}

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIBADWORD SETUP*\n\n*.antibadword on*\nTurn on antibadword\n\n*.antibadword off*\nDisables antibadword\n\n*.antibadword add <word>*\nAdd a bad word\n\n*.antibadword remove <word>*\nRemove a bad word\n\n*.antibadword list*\nShow all bad words\n\n*.antibadword set <action>*\nSet action: delete/kick/warn\n\n*.antibadword resetwarn*\nReset all warnings`
        }, { quoted: message });
    }

    // TURN ON
    if (match === 'on') {
        const existingConfig = await getAntiBadword(chatId, 'on');
        if (existingConfig?.enabled) {
            return sock.sendMessage(chatId, { text: '*AntiBadword is already enabled for this group*' });
        }
        await setAntiBadword(chatId, 'on', 'delete');
        return sock.sendMessage(chatId, { text: '*AntiBadword has been enabled. Use .antibadword set <action> to customize action*' }, { quoted: message });
    }

    // TURN OFF
    if (match === 'off') {
        const config = await getAntiBadword(chatId, 'on');
        if (!config?.enabled) {
            return sock.sendMessage(chatId, { text: '*AntiBadword is already disabled for this group*' }, { quoted: message });
        }
        await removeAntiBadword(chatId);
        return sock.sendMessage(chatId, { text: '*AntiBadword has been disabled for this group*' }, { quoted: message });
    }

    // SET ACTION
    if (match.startsWith('set')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: '*Invalid action. Choose: delete, kick, or warn*' }, { quoted: message });
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, { text: `*AntiBadword action set to: ${action}*` }, { quoted: message });
    }

    // ADD WORD
    if (match.startsWith('add ')) {
        const newWord = match.slice(4).trim().toLowerCase();
        if (!newWord) {
            return sock.sendMessage(chatId, { text: '*Usage: .antibadword add <word>*' }, { quoted: message });
        }
        
        let badWords = loadBadWords(chatId);
        if (badWords.includes(newWord)) {
            return sock.sendMessage(chatId, { text: `*⚠️ "${newWord}" already exists*` }, { quoted: message });
        }
        
        badWords.push(newWord);
        saveBadWords(chatId, badWords);
        return sock.sendMessage(chatId, { text: `*✅ Added "${newWord}"*` }, { quoted: message });
    }

    // REMOVE WORD
    if (match.startsWith('remove ')) {
        const wordToRemove = match.slice(7).trim().toLowerCase();
        if (!wordToRemove) {
            return sock.sendMessage(chatId, { text: '*Usage: .antibadword remove <word>*' }, { quoted: message });
        }
        
        let badWords = loadBadWords(chatId);
        if (!badWords.includes(wordToRemove)) {
            return sock.sendMessage(chatId, { text: `*⚠️ "${wordToRemove}" not found*` }, { quoted: message });
        }
        
        const newBadWords = badWords.filter(w => w !== wordToRemove);
        saveBadWords(chatId, newBadWords);
        return sock.sendMessage(chatId, { text: `*✅ Removed "${wordToRemove}"*` }, { quoted: message });
    }

    // LIST WORDS
    if (match === 'list') {
        const badWords = loadBadWords(chatId);
        if (badWords.length === 0) {
            return sock.sendMessage(chatId, { text: '*📝 No bad words added yet*' }, { quoted: message });
        }
        
        const wordList = badWords.map((w, i) => `${i+1}. ${w}`).join('\n');
        return sock.sendMessage(chatId, { text: `*📝 BAD WORDS:*\n\n${wordList}\n\n*Total: ${badWords.length}*` }, { quoted: message });
    }

    // RESET WARNS
    if (match === 'resetwarn') {
        try {
            const configPath = path.join(__dirname, '../data/userGroupData.json');
            if (fs.existsSync(configPath)) {
                const data = JSON.parse(fs.readFileSync(configPath));
                if (data.warnings && data.warnings[chatId]) {
                    delete data.warnings[chatId];
                    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
                }
            }
            return sock.sendMessage(chatId, { text: '*✅ All warnings reset*' }, { quoted: message });
        } catch (error) {
            return sock.sendMessage(chatId, { text: '*❌ Error resetting warnings*' }, { quoted: message });
        }
    }

    return sock.sendMessage(chatId, { text: '*Invalid command*' }, { quoted: message });
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    // Skip if not group
    if (!chatId.endsWith('@g.us')) return;
    
    // Skip if message is from bot
    if (message.key.fromMe) return;
    
    // Get antibadword config
    const antiBadwordConfig = await getAntiBadword(chatId, 'on');
    
    // Log for debugging
    console.log(`[DEBUG] Antibadword check - Group: ${chatId}, Enabled: ${antiBadwordConfig?.enabled}, Action: ${antiBadwordConfig?.action}`);
    
    if (!antiBadwordConfig?.enabled) {
        console.log('[DEBUG] Antibadword not enabled for this group');
        return;
    }
    
    // Load bad words for this group
    let badWords = loadBadWords(chatId);
    console.log(`[DEBUG] Loaded ${badWords.length} bad words for this group`);
    
    // If no custom words, don't detect anything
    if (badWords.length === 0) {
        console.log('[DEBUG] No bad words added yet');
        return;
    }
    
    // Check message for bad words
    const messageLower = userMessage.toLowerCase();
    let foundBadWord = null;
    
    for (const badWord of badWords) {
        if (messageLower.includes(badWord.toLowerCase())) {
            foundBadWord = badWord;
            break;
        }
    }
    
    if (!foundBadWord) {
        console.log('[DEBUG] No bad word found');
        return;
    }
    
    console.log(`[DEBUG] Bad word detected: "${foundBadWord}"`);
    
    // Check if bot is admin
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const bot = groupMetadata.participants.find(p => p.id === botId);
        if (!bot?.admin) {
            console.log('[DEBUG] Bot is not admin');
            return;
        }
        
        // Check if sender is admin
        const participant = groupMetadata.participants.find(p => p.id === senderId);
        if (participant?.admin) {
            console.log('[DEBUG] Sender is admin, skipping');
            return;
        }
    } catch (err) {
        console.error('[DEBUG] Error checking admin status:', err);
        return;
    }
    
    // Delete the message
    try {
        await sock.sendMessage(chatId, { delete: message.key });
        console.log('[DEBUG] Message deleted');
    } catch (err) {
        console.error('[DEBUG] Error deleting message:', err);
        return;
    }
    
    // Take action
    const action = antiBadwordConfig.action || 'delete';
    
    switch (action) {
        case 'delete':
            await sock.sendMessage(chatId, {
                text: `*@${senderId.split('@')[0]} bad words are not allowed here*`,
                mentions: [senderId]
            });
            break;
            
        case 'kick':
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `*@${senderId.split('@')[0]} has been kicked for using bad words*`,
                    mentions: [senderId]
                });
            } catch (err) {
                console.error('Error kicking:', err);
            }
            break;
            
        case 'warn':
            const warningCount = await incrementWarningCount(chatId, senderId);
            if (warningCount >= 5) {
                try {
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    await resetWarningCount(chatId, senderId);
                    await sock.sendMessage(chatId, {
                        text: `*@${senderId.split('@')[0]} has been kicked after 5 warnings*`,
                        mentions: [senderId]
                    });
                } catch (err) {
                    console.error('Error kicking after warns:', err);
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: `*@${senderId.split('@')[0]} warning ${warningCount}/5 for using bad words*`,
                    mentions: [senderId]
                });
            }
            break;
    }
}

module.exports = {
    handleAntiBadwordCommand,
    handleBadwordDetection
};
