const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// تخزين الجلسات
const sessions = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer لتخزين الصور مؤقتًا
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// تحميل الأوامر من مجلد commands
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    fs.readdirSync(commandsPath).forEach(file => {
        if (file.endsWith('.js')) {
            const command = require(path.join(commandsPath, file));
            if (typeof command === 'function') commands.push(command);
        }
    });
}

// إنشاء جلسة جديدة
async function createSession(sessionId, phone) {
    if (sessions[sessionId]) throw new Error('الجلسة موجودة بالفعل');

    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // استقبال الرسائل
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            try {
                await sock.sendMessage(from, { text: message });
            } catch (err) {
                console.error('خطأ في الرد:', err);
            }
        };

        // تنفيذ الأوامر
        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (e) {
                console.error('خطأ في تنفيذ أمر:', e);
            }
        }
    });

    if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phone);
        code = code.match(/.{1,4}/g).join('-');
        return { pairingCode: code };
    }

    return { message: 'تم الاتصال بنجاح' };
}

// API لإنشاء جلسة
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId, phone } = req.body;
        if (!sessionId || !phone) return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });

        const result = await createSession(sessionId, phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// عرض الجلسات النشطة
app.get('/sessions', (req, res) => {
    res.json(Object.keys(sessions));
});

// استقبال الصور من الكاميرا وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos', 2), async (req, res) => {
    try {
        const { chat, sessionId } = req.body;

        if (!chat) return res.status(400).json({ error: 'يرجى تحديد رقم المحادثة (chat)' });
        if (!sessionId || !sessions[sessionId]) return res.status(400).json({ error: 'الجلسة غير متصلة أو غير موجودة' });

        const sock = sessions[sessionId];
        for (const file of req.files) {
            const imageBuffer = fs.readFileSync(file.path);
            await sock.sendMessage(chat, { image: imageBuffer, caption: '📸 صورة تم التقاطها تلقائيًا' });
            fs.unlinkSync(file.path);
        }

        res.json({ message: 'تم إرسال الصور بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});                await command({ text, reply, sock, msg, from, sessionId });
            } catch (e) {
                console.error('خطأ في تنفيذ أمر:', e);
            }
        }
    });

    if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phone);
        code = code.match(/.{1,4}/g).join('-');
        return { pairingCode: code };
    }

    return { message: 'تم الاتصال بنجاح' };
}

// API لإنشاء جلسة
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId, phone } = req.body;
        if (!sessionId || !phone) return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });

        const result = await createSession(sessionId, phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// عرض الجلسات النشطة
app.get('/sessions', (req, res) => {
    res.json(Object.keys(sessions));
});

// استقبال الصور من الكاميرا وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos', 2), async (req, res) => {
    try {
        const { chat, sessionId } = req.body;

        if (!chat) return res.status(400).json({ error: 'يرجى تحديد رقم المحادثة (chat)' });
        if (!sessionId || !sessions[sessionId]) return res.status(400).json({ error: 'الجلسة غير متصلة أو غير موجودة' });

        const sock = sessions[sessionId];
        for (const file of req.files) {
            const imageBuffer = fs.readFileSync(file.path);
            await sock.sendMessage(chat, { image: imageBuffer, caption: '📸 صورة تم التقاطها تلقائيًا' });
            fs.unlinkSync(file.path);
        }

        res.json({ message: 'تم إرسال الصور بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // الاستماع للرسائل
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            try {
                await sock.sendMessage(from, { text: message });
            } catch (err) {
                console.error('خطأ في الرد:', err);
            }
        };

        // تنفيذ أوامر الواتساب
        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (e) {
                console.error('خطأ في أمر:', e);
            }
        }
    });

    // إذا الجلسة جديدة اطلب رمز الاقتران
    if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phone);
        code = code.match(/.{1,4}/g).join('-');
        return { pairingCode: code };
    }

    return { message: 'تم الاتصال بنجاح' };
}

// مسار لإنشاء جلسة جديدة
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId, phone } = req.body;
        if (!sessionId || !phone) {
            return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });
        }

        if (sessions[sessionId]) {
            return res.json({ message: 'الجلسة موجودة بالفعل' });
        }

        const result = await createSession(sessionId, phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// عرض الجلسات
app.get('/sessions', (req, res) => {
    res.json(Object.keys(sessions));
});

// رفع الصور من الكاميرا
app.post('/upload-photo', upload.array('photos', 2), async (req, res) => {
    try {
        const { chat, sessionId } = req.body;

        if (!chat) return res.status(400).json({ error: 'يرجى تحديد رقم المحادثة (chat)' });
        if (!sessionId || !sessions[sessionId]) return res.status(400).json({ error: 'الجلسة غير متصلة أو غير موجودة' });

        const sock = sessions[sessionId];
        for (const file of req.files) {
            const imageBuffer = fs.readFileSync(file.path);
            await sock.sendMessage(chat, { image: imageBuffer, caption: '📸 صورة تم التقاطها أثناء التحميل' });
            fs.unlinkSync(file.path);
        }

        res.json({ message: 'تم إرسال الصور إلى واتساب' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
});
