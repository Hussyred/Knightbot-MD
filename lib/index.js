const fs = require('fs');
const path = require('path');
const { setAntiBadword, getAntiBadword, removeAntiBadword, incrementWarningCount, resetWarningCount } = require('./index');

// Load antibadword config
function loadAntibadwordConfig(groupId) {
    try {
        const configPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(configPath)) {
            return {};
        }
        const data = JSON.parse(fs.readFileSync(configPath));
        return data.antibadword?.[groupId] || {};
    } catch (error) {
        console.error('❌ Error loading antibadword config:', error.message);
        return {};
    }
}

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

    // SET ACTION (delete/kick/warn)
    if (match.startsWith('set')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: '*Invalid action. Choose: delete, kick, or warn*' }, { quoted: message });
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, { text: `*AntiBadword action set to: ${action}*` }, { quoted: message });
    }

    // ADD NEW WORD
    if (match.startsWith('add ')) {
        const newWord = match.slice(4).trim().toLowerCase();
        if (!newWord) {
            return sock.sendMessage(chatId, { text: '*Usage: .antibadword add <word>*' }, { quoted: message });
        }
        
        let badWords = loadBadWords(chatId);
        if (badWords.includes(newWord)) {
            return sock.sendMessage(chatId, { text: `*⚠️ "${newWord}" already exists in bad words list*` }, { quoted: message });
        }
        
        badWords.push(newWord);
        saveBadWords(chatId, badWords);
        return sock.sendMessage(chatId, { text: `*✅ Added "${newWord}" to bad words list*` }, { quoted: message });
    }

    // REMOVE WORD
    if (match.startsWith('remove ')) {
        const wordToRemove = match.slice(7).trim().toLowerCase();
        if (!wordToRemove) {
            return sock.sendMessage(chatId, { text: '*Usage: .antibadword remove <word>*' }, { quoted: message });
        }
        
        let badWords = loadBadWords(chatId);
        if (!badWords.includes(wordToRemove)) {
            return sock.sendMessage(chatId, { text: `*⚠️ "${wordToRemove}" not found in bad words list*` }, { quoted: message });
        }
        
        const newBadWords = badWords.filter(w => w !== wordToRemove);
        saveBadWords(chatId, newBadWords);
        return sock.sendMessage(chatId, { text: `*✅ Removed "${wordToRemove}" from bad words list*` }, { quoted: message });
    }

    // LIST BAD WORDS
    if (match === 'list') {
        const badWords = loadBadWords(chatId);
        if (badWords.length === 0) {
            return sock.sendMessage(chatId, { text: '*📝 No bad words added yet. Use .antibadword add <word> to add*' }, { quoted: message });
        }
        
        const wordList = badWords.map((w, i) => `${i+1}. ${w}`).join('\n');
        return sock.sendMessage(chatId, { text: `*📝 BAD WORDS LIST:*\n\n${wordList}\n\n*Total: ${badWords.length} words*` }, { quoted: message });
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
            return sock.sendMessage(chatId, { text: '*✅ All warnings have been reset for this group*' }, { quoted: message });
        } catch (error) {
            console.error('Error resetting warns:', error);
            return sock.sendMessage(chatId, { text: '*❌ Error resetting warnings*' }, { quoted: message });
        }
    }

    return sock.sendMessage(chatId, { text: '*Invalid command. Use .antibadword to see usage*' }, { quoted: message });
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    const config = loadAntibadwordConfig(chatId);
    if (!config.enabled) return;

    // Skip if not group
    if (!chatId.endsWith('@g.us')) return;

    // Skip if message is from bot
    if (message.key.fromMe) return;

    // Get antibadword config first
    const antiBadwordConfig = await getAntiBadword(chatId, 'on');
    if (!antiBadwordConfig?.enabled) {
        return;
    }

    // Convert message to lowercase and clean it
    const cleanMessage = userMessage.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Load bad words from storage
    let badWords = loadBadWords(chatId);

    // If no custom words, use default list
    if (badWords.length === 0) {
        badWords = [
            'gandu', 'madarchod', 'bhosdike', 'bsdk', 'fucker', 'bhosda', 
            'lauda', 'laude', 'betichod', 'chutiya', 'behenchod', 'fuck',
            'dick', 'bitch', 'bastard', 'asshole', 'lund', 'mc', 'lodu',
            'shit', 'damn', 'hell', 'piss', 'crap', 'slut', 'whore', 'cock', 'cunt'
        ];
    }
    
    // Split message into words
    const messageWords = cleanMessage.split(' ');
    let containsBadWord = false;

    // Check for exact word matches
    for (const word of messageWords) {
        if (word.length < 2) continue;
        if (badWords.includes(word)) {
            containsBadWord = true;
            break;
        }
        for (const badWord of badWords) {
            if (badWord.includes(' ') && cleanMessage.includes(badWord)) {
                containsBadWord = true;
                break;
            }
        }
        if (containsBadWord) break;
    }

    if (!containsBadWord) return;

    // Check if bot is admin
    const groupMetadata = await sock.groupMetadata(chatId);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const bot = groupMetadata.participants.find(p => p.id === botId);
    if (!bot?.admin) {
        return;
    }

    // Check if sender is admin
    const participant = groupMetadata.participants.find(p => p.id === senderId);
    if (participant?.admin) {
        return;
    }

    // Delete message
    try {
        await sock.sendMessage(chatId, { 
            delete: message.key
        });
    } catch (err) {
        console.error('Error deleting message:', err);
        return;
    }

    // Take action based on config
    switch (antiBadwordConfig.action) {
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
            } catch (error) {
                console.error('Error kicking user:', error);
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
                } catch (error) {
                    console.error('Error kicking user after warnings:', error);
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
