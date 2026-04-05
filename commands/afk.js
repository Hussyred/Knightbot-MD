const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const AFK_DIR = path.join(__dirname, '../data/afk_stickers');
const AFK_DATA_FILE = path.join(__dirname, '../data/afk_data.json');

// Ensure directory exists
if (!fs.existsSync(AFK_DIR)) {
    fs.mkdirSync(AFK_DIR, { recursive: true });
}

function loadAfkData() {
    try {
        if (!fs.existsSync(AFK_DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(AFK_DATA_FILE));
    } catch (error) {
        return {};
    }
}

function saveAfkData(data) {
    try {
        fs.writeFileSync(AFK_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving AFK data:', error);
    }
}

async function downloadSticker(message, messageId) {
    try {
        const stickerMsg = message.message?.stickerMessage || 
                          message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
        
        if (!stickerMsg) return null;
        
        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        const filePath = path.join(AFK_DIR, `${messageId}.webp`);
        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (error) {
        console.error('Error downloading sticker:', error);
        return null;
    }
}

// Get the real JID/LID of a user from a message
async function getUserJid(sock, identifier, chatId) {
    // If it's already a JID/LID format
    if (identifier.includes('@')) {
        return identifier;
    }
    
    // Try to find user in group by phone number
    if (chatId.endsWith('@g.us')) {
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            for (const participant of groupMetadata.participants) {
                if (participant.id.includes(identifier)) {
                    return participant.id;
                }
            }
        } catch (e) {}
    }
    
    // Return as phone number JID
    return identifier + '@s.whatsapp.net';
}

async function afkCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        const commandText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        console.log(`[AFK] Command text: "${commandText}"`);
        
        // Extract phone number from command
        const phoneMatch = commandText.match(/\d{10,15}/);
        let targetUser = null;
        let targetIdentifier = null;
        
        // Check mentionedJid first (most reliable)
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentionedJid.length > 0) {
            targetUser = mentionedJid[0];
            targetIdentifier = targetUser;
            console.log(`[AFK] Target from mention: ${targetUser}`);
        } 
        // If no mention but has phone number
        else if (phoneMatch) {
            targetIdentifier = phoneMatch[0];
            targetUser = await getUserJid(sock, targetIdentifier, chatId);
            console.log(`[AFK] Target from phone: ${targetIdentifier} -> ${targetUser}`);
        }
        
        // Get the quoted sticker
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            await sock.sendMessage(chatId, {
                text: `*AFK STICKER SETUP*\n\n1. Reply to a STICKER\n2. Type .afk\n\nTo save for someone else:\n- Mention them in the command: .afk @user\n- Or use their number: .afk 2348023810565`
            }, { quoted: message });
            return;
        }
        
        const isSticker = quotedMsg.stickerMessage || 
                         quotedMsg.message?.stickerMessage ||
                         (quotedMsg.imageMessage?.mimetype === 'image/webp');
        
        if (!isSticker) {
            await sock.sendMessage(chatId, { text: '❌ Reply to a STICKER.' }, { quoted: message });
            return;
        }
        
        const messageId = message.key.id;
        const stickerPath = await downloadSticker({ message: { stickerMessage: quotedMsg.stickerMessage || quotedMsg.message?.stickerMessage } }, messageId);
        
        if (!stickerPath) {
            await sock.sendMessage(chatId, { text: '❌ Failed to download sticker.' }, { quoted: message });
            return;
        }
        
        const afkData = loadAfkData();
        if (!afkData[chatId]) afkData[chatId] = {};
        
        if (targetUser) {
            afkData[chatId][targetUser] = stickerPath;
            saveAfkData(afkData);
            const displayId = targetUser.split('@')[0];
            await sock.sendMessage(chatId, {
                text: `✅ Sticker saved for @${displayId}!`,
                mentions: [targetUser]
            }, { quoted: message });
        } else {
            afkData[chatId][senderId] = stickerPath;
            saveAfkData(afkData);
            await sock.sendMessage(chatId, {
                text: `✅ Sticker saved for you!`
            }, { quoted: message });
        }
        
    } catch (error) {
        console.error('Error in afk command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error saving sticker.' }, { quoted: message });
    }
}

async function removeAfkCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        let targetUser = mentionedJid[0] || senderId;
        
        const afkData = loadAfkData();
        
        if (afkData[chatId] && afkData[chatId][targetUser]) {
            const stickerPath = afkData[chatId][targetUser];
            if (fs.existsSync(stickerPath)) fs.unlinkSync(stickerPath);
            delete afkData[chatId][targetUser];
            saveAfkData(afkData);
            await sock.sendMessage(chatId, { text: `✅ Sticker removed.` }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: `❌ No sticker found.` }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in removeafk command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error removing sticker.' }, { quoted: message });
    }
}

async function checkAndSendAfkSticker(sock, chatId, message, mentionedJid) {
    try {
        if (!mentionedJid || mentionedJid.length === 0) return;
        
        const afkData = loadAfkData();
        if (!afkData[chatId]) return;
        
        for (const taggedUser of mentionedJid) {
            if (afkData[chatId][taggedUser]) {
                const stickerPath = afkData[chatId][taggedUser];
                if (fs.existsSync(stickerPath)) {
                    await sock.sendMessage(chatId, {
                        sticker: { url: stickerPath }
                    }, { quoted: message });
                    console.log(`[AFK] Sent sticker for ${taggedUser}`);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error sending AFK sticker:', error);
    }
}

module.exports = {
    afkCommand,
    removeAfkCommand,
    checkAndSendAfkSticker
};
