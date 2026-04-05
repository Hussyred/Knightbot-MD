const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const AFK_DIR = path.join(__dirname, '../data/afk_stickers');
const AFK_DATA_FILE = path.join(__dirname, '../data/afk_data.json');

// Ensure directory exists
if (!fs.existsSync(AFK_DIR)) {
    fs.mkdirSync(AFK_DIR, { recursive: true });
}

// Load AFK data
function loadAfkData() {
    try {
        if (!fs.existsSync(AFK_DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(AFK_DATA_FILE));
    } catch (error) {
        return {};
    }
}

// Save AFK data
function saveAfkData(data) {
    try {
        fs.writeFileSync(AFK_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving AFK data:', error);
    }
}

// Download sticker from message
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

// Get phone number from JID (remove @s.whatsapp.net or @lid)
function getPhoneNumber(jid) {
    if (!jid) return null;
    // Remove @s.whatsapp.net or @lid
    let phone = jid.split('@')[0];
    // Remove any non-digit characters
    phone = phone.replace(/[^0-9]/g, '');
    return phone;
}

async function afkCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        // Check if replying to a message
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            await sock.sendMessage(chatId, {
                text: `*AFK STICKER SETUP*\n\nHow to use:\n1. Reply to a STICKER\n2. Type .afk\n\nTo save sticker for someone else:\n.afk @username\n\nTo remove your sticker:\n.removeafk`
            }, { quoted: message });
            return;
        }
        
        // Check if quoted message is a sticker
        const isSticker = quotedMsg.stickerMessage || 
                         quotedMsg.message?.stickerMessage ||
                         (quotedMsg.imageMessage?.mimetype === 'image/webp');
        
        if (!isSticker) {
            await sock.sendMessage(chatId, {
                text: '❌ Please reply to a STICKER, not a text or image.'
            }, { quoted: message });
            return;
        }
        
        // Download the sticker
        const messageId = message.key.id;
        const stickerPath = await downloadSticker({ message: { stickerMessage: quotedMsg.stickerMessage || quotedMsg.message?.stickerMessage } }, messageId);
        
        if (!stickerPath) {
            await sock.sendMessage(chatId, {
                text: '❌ Failed to download sticker. Please try again.'
            }, { quoted: message });
            return;
        }
        
        // Check if user mentioned someone
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        let targetUser = null;
        
        if (mentionedJid.length > 0) {
            targetUser = mentionedJid[0];
        } else {
            // Check for @number in text
            const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
            const mentionMatch = text.match(/@(\d+)/);
            if (mentionMatch) {
                targetUser = mentionMatch[1] + '@s.whatsapp.net';
            }
        }
        
        // If no target, save for the sender
        if (!targetUser) {
            targetUser = senderId;
        }
        
        const targetPhone = getPhoneNumber(targetUser);
        if (!targetPhone) {
            await sock.sendMessage(chatId, {
                text: '❌ Could not identify user.'
            }, { quoted: message });
            return;
        }
        
        // Save sticker mapping
        const afkData = loadAfkData();
        if (!afkData[chatId]) afkData[chatId] = {};
        afkData[chatId][targetUser] = stickerPath;
        saveAfkData(afkData);
        
        const isSelf = targetUser === senderId;
        const messageText = isSelf 
            ? `✅ Sticker saved for you!\n\nWhen someone tags you, I will send this sticker.`
            : `✅ Sticker saved for @${targetPhone}!\n\nWhen someone tags them, I will send this sticker.`;
        
        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: [targetUser]
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in afk command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error saving sticker. Make sure you replied to a valid sticker.'
        }, { quoted: message });
    }
}

async function removeAfkCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        let targetUser = null;
        
        if (mentionedJid.length > 0) {
            targetUser = mentionedJid[0];
        } else {
            const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
            const mentionMatch = text.match(/@(\d+)/);
            if (mentionMatch) {
                targetUser = mentionMatch[1] + '@s.whatsapp.net';
            }
        }
        
        if (!targetUser) {
            targetUser = senderId;
        }
        
        const afkData = loadAfkData();
        
        if (afkData[chatId] && afkData[chatId][targetUser]) {
            // Delete sticker file
            const stickerPath = afkData[chatId][targetUser];
            if (fs.existsSync(stickerPath)) {
                fs.unlinkSync(stickerPath);
            }
            
            delete afkData[chatId][targetUser];
            saveAfkData(afkData);
            
            const targetPhone = getPhoneNumber(targetUser);
            await sock.sendMessage(chatId, {
                text: `✅ Removed sticker for @${targetPhone}`,
                mentions: [targetUser]
            }, { quoted: message });
        } else {
            const targetPhone = getPhoneNumber(targetUser);
            await sock.sendMessage(chatId, {
                text: `❌ No sticker found for @${targetPhone}`,
                mentions: [targetUser]
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in removeafk command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error removing sticker.'
        }, { quoted: message });
    }
}

// Function to check and send AFK sticker when user is tagged
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
                    });
                    console.log(`[AFK] Sent sticker for ${taggedUser}`);
                    break; // Only send one sticker per message
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
