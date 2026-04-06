const fs = require('fs');
const path = require('path');

const SILENT_FILE = './data/silent.json';

// Load silent data
function loadSilentData() {
    try {
        if (!fs.existsSync(SILENT_FILE)) return {};
        return JSON.parse(fs.readFileSync(SILENT_FILE));
    } catch (error) {
        return {};
    }
}

// Save silent data
function saveSilentData(data) {
    try {
        fs.writeFileSync(SILENT_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving silent data:', error);
    }
}

// Parse duration (10m, 1h, 30s)
function parseDuration(duration) {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: return null;
    }
}

// Format time remaining
function formatTimeRemaining(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

async function silentCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        // Check if user is admin
        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, {
                text: '❌ Only group admins can use this command.'
            }, { quoted: message });
            return;
        }
        
        // Get the command text properly
        let commandText = '';
        if (message.message?.conversation) {
            commandText = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            commandText = message.message.extendedTextMessage.text;
        }
        
        console.log('[SILENT] Full command text:', commandText);
        
        // Extract the action (duration or off)
        const parts = commandText.trim().split(/\s+/);
        const action = parts.length > 1 ? parts[1] : null;
        
        console.log('[SILENT] Extracted action:', action);
        
        // Get the quoted message (the message being replied to)
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        console.log('[SILENT] Quoted message exists:', !!quotedMsg);
        
        if (!quotedMsg) {
            await sock.sendMessage(chatId, {
                text: `*SILENT MODE*\n\nTo use:\n1. Reply to a user's message\n2. Type .silent 10m\n\nExamples:\n.silent 10m - Mute for 10 minutes\n.silent 1h - Mute for 1 hour\n.silent off - Remove silent mode`
            }, { quoted: message });
            return;
        }
        
        // Get the target user from the quoted message
        let targetUser = null;
        
        // Try multiple ways to get the quoted message sender
        if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            targetUser = message.message.extendedTextMessage.contextInfo.participant;
        } else if (quotedMsg.key?.participant) {
            targetUser = quotedMsg.key.participant;
        } else if (quotedMsg.key?.remoteJid && quotedMsg.key.remoteJid !== chatId) {
            targetUser = quotedMsg.key.remoteJid;
        } else if (quotedMsg.senderJid) {
            targetUser = quotedMsg.senderJid;
        } else if (quotedMsg.sender) {
            targetUser = quotedMsg.sender;
        }
        
        console.log('[SILENT] Target user:', targetUser);
        
        if (!targetUser) {
            await sock.sendMessage(chatId, {
                text: '❌ Could not identify the user. Please reply to their message.'
            }, { quoted: message });
            return;
        }
        
        if (!action) {
            await sock.sendMessage(chatId, {
                text: `*SILENT MODE*\n\nReply to a user's message with:\n.silent 10m - Mute for 10 minutes\n.silent 1h - Mute for 1 hour\n.silent off - Remove silent mode`
            }, { quoted: message });
            return;
        }
        
        const silentData = loadSilentData();
        if (!silentData[chatId]) silentData[chatId] = {};
        
        // Remove silent mode
        if (action === 'off') {
            if (silentData[chatId][targetUser]) {
                delete silentData[chatId][targetUser];
                saveSilentData(silentData);
                
                const targetName = targetUser.split('@')[0];
                await sock.sendMessage(chatId, {
                    text: `✅ Silent mode removed for @${targetName}`,
                    mentions: [targetUser]
                }, { quoted: message });
            } else {
                const targetName = targetUser.split('@')[0];
                await sock.sendMessage(chatId, {
                    text: `❌ @${targetName} is not in silent mode`,
                    mentions: [targetUser]
                }, { quoted: message });
            }
            return;
        }
        
        // Parse duration
        const durationMs = parseDuration(action);
        if (!durationMs) {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid duration. Use: 10s, 10m, 1h (example: .silent 10m)'
            }, { quoted: message });
            return;
        }
        
        const expiresAt = Date.now() + durationMs;
        
        // Save silent mode
        silentData[chatId][targetUser] = {
            expiresAt: expiresAt,
            setBy: senderId,
            setAt: Date.now()
        };
        saveSilentData(silentData);
        
        const targetName = targetUser.split('@')[0];
        const durationStr = action;
        
        await sock.sendMessage(chatId, {
            text: `🔇 @${targetName} is now in SILENT MODE for ${durationStr}!\n\nAll their messages will be automatically deleted.\n\nTo remove: Reply to their message with .silent off`,
            mentions: [targetUser]
        }, { quoted: message });
        
        // Auto-remove after duration
        setTimeout(async () => {
            const currentData = loadSilentData();
            if (currentData[chatId] && currentData[chatId][targetUser]) {
                delete currentData[chatId][targetUser];
                saveSilentData(currentData);
                
                await sock.sendMessage(chatId, {
                    text: `✅ Silent mode expired for @${targetName}`,
                    mentions: [targetUser]
                });
            }
        }, durationMs);
        
    } catch (error) {
        console.error('Error in silent command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error processing silent command.'
        }, { quoted: message });
    }
}

// Check and delete messages from silent users
async function checkAndDeleteSilent(sock, chatId, message, senderId) {
    try {
        const silentData = loadSilentData();
        if (!silentData[chatId]) return;
        
        const silentUser = silentData[chatId][senderId];
        if (!silentUser) return;
        
        // Check if expired
        if (silentUser.expiresAt < Date.now()) {
            delete silentData[chatId][senderId];
            saveSilentData(silentData);
            return;
        }
        
        // Delete the message
        try {
            await sock.sendMessage(chatId, { delete: message.key });
            console.log(`[SILENT] Deleted message from ${senderId}`);
        } catch (err) {
            console.log('[SILENT] Could not delete message (bot may not be admin):', err.message);
        }
        
    } catch (error) {
        console.error('Error checking silent:', error);
    }
}

module.exports = {
    silentCommand,
    checkAndDeleteSilent
};
