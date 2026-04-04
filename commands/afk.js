const fs = require('fs');
const path = require('path');

const AFK_FILE = './data/afk_stickers.json';

// Load saved stickers
function loadAfkStickers() {
    try {
        if (!fs.existsSync(AFK_FILE)) return {};
        return JSON.parse(fs.readFileSync(AFK_FILE));
    } catch (error) {
        return {};
    }
}

// Save sticker for a user in a group
function saveAfkSticker(groupId, userId, stickerMessage) {
    const stickers = loadAfkStickers();
    if (!stickers[groupId]) stickers[groupId] = {};
    stickers[groupId][userId] = stickerMessage;
    fs.writeFileSync(AFK_FILE, JSON.stringify(stickers, null, 2));
    return true;
}

// Get sticker for a user in a group
function getAfkSticker(groupId, userId) {
    const stickers = loadAfkStickers();
    return stickers[groupId]?.[userId] || null;
}

// Remove sticker for a user
function removeAfkSticker(groupId, userId) {
    const stickers = loadAfkStickers();
    if (stickers[groupId] && stickers[groupId][userId]) {
        delete stickers[groupId][userId];
        fs.writeFileSync(AFK_FILE, JSON.stringify(stickers, null, 2));
        return true;
    }
    return false;
}

async function afkCommand(sock, chatId, message) {
    try {
        // Check if replying to a sticker
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg || !quotedMsg.stickerMessage) {
            await sock.sendMessage(chatId, { 
                text: '❌ Reply to a STICKER with .afk\n\nUsage:\n.afk - Save sticker for yourself\n.afk @username - Save sticker for that person'
            }, { quoted: message });
            return;
        }
        
        const stickerMessage = quotedMsg.stickerMessage;
        
        // Check if a user was mentioned
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        let targetUser = null;
        
        if (mentionedJid.length > 0) {
            // User mentioned someone - save sticker for that person
            targetUser = mentionedJid[0];
            const name = targetUser.split('@')[0];
            saveAfkSticker(chatId, targetUser, stickerMessage);
            await sock.sendMessage(chatId, { 
                text: `✅ Sticker saved for @${name}!\n\nWhen someone tags @${name}, I will reply with this sticker.`,
                mentions: [targetUser]
            }, { quoted: message });
        } else {
            // No mention - save sticker for the command sender
            const senderId = message.author || message.from;
            const name = senderId.split('@')[0];
            saveAfkSticker(chatId, senderId, stickerMessage);
            await sock.sendMessage(chatId, { 
                text: `✅ Sticker saved for @${name}!\n\nWhen someone tags you, I will reply with this sticker.`,
                mentions: [senderId]
            }, { quoted: message });
        }
        
    } catch (error) {
        console.error('Error in afk command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error saving sticker. Please reply to a valid sticker.'
        }, { quoted: message });
    }
}

async function removeAfkCommand(sock, chatId, message) {
    try {
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        let targetUser = null;
        
        if (mentionedJid.length > 0) {
            targetUser = mentionedJid[0];
        } else {
            targetUser = message.author || message.from;
        }
        
        const removed = removeAfkSticker(chatId, targetUser);
        const name = targetUser.split('@')[0];
        
        if (removed) {
            await sock.sendMessage(chatId, { 
                text: `✅ Removed sticker for @${name}`,
                mentions: [targetUser]
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { 
                text: `❌ No sticker found for @${name}`,
                mentions: [targetUser]
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in removeafk command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error removing sticker' }, { quoted: message });
    }
}

module.exports = {
    afkCommand,
    removeAfkCommand,
    getAfkSticker,
    saveAfkSticker,
    removeAfkSticker,
    loadAfkStickers
};
