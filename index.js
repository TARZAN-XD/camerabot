const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const qrcode = require('qrcode');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;
const sessions = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ✅ تحميل الأوامر
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

// ✅ دالة إنشاء الجلسة
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

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            await sock.sendMessage(from, { text: message });
        };

        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (err) {
                console.error('خطأ في تنفيذ الأمر:', err.message);
            }
        }
    });

    return sock;
}

// ✅ API لطلب رمز الاقتران
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

// ✅ API لتوليد QR
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

// ✅ API لرفع الصور
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
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true
    });

    sessions[sessionId] = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection } = update;
        if (qr) {
            const qrPath = path.join(__dirname, 'public', `${sessionId}.png`);
            await qrcode.toFile(qrPath, qr);
            console.log(`✅ QR جاهز للجلسة: ${sessionId}`);
        }
        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة الآن`);
        }
        if (connection === 'close') {
            console.log(`❌ تم قطع الاتصال لجلسة: ${sessionId}`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            await sock.sendMessage(from, { text: message });
        };

        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (err) {
                console.error('خطأ في تنفيذ الأمر:', err.message);
            }
        }
    });

    return sock;
}

// ✅ API لإنشاء جلسة
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'أدخل معرف الجلسة' });

        if (sessions[sessionId]) {
            return res.json({ message: 'الجلسة موجودة بالفعل', qrUrl: `/${sessionId}.png` });
        }

        await createSession(sessionId);
        res.json({ message: `تم إنشاء الجلسة ${sessionId}`, qrUrl: `/${sessionId}.png` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ API لطلب Pairing Code
app.post('/pair', async (req, res) => {
    try {
        const { sessionId, number } = req.body;
        if (!sessionId || !number) return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });

        const sock = sessions[sessionId];
        if (!sock) return res.status(404).json({ error: 'الجلسة غير موجودة' });

        if (sock.authState.creds.registered) {
            return res.status(400).json({ error: 'الجلسة مرتبطة بالفعل' });
        }

        let code = await sock.requestPairingCode(number);
        code = code.match(/.{1,4}/g).join('-');
        res.json({ pairingCode: code });
    } catch (err) {
        res.status(500).json({ error: 'فشل في إنشاء الرمز: ' + err.message });
    }
});

// ✅ API لرفع الصور
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

// ✅ API لعرض الجلسات النشطة
app.get('/sessions', (req, res) => {
    res.json({ activeSessions: Object.keys(sessions) });
});

// ✅ تشغيل السيرفر
async function startServer() {
    app.listen(PORT, () => console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`));
}

startServer();    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true
    });

    sessions[sessionId] = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect } = update;

        if (qr) {
            // توليد صورة QR في مجلد public لتسهيل الوصول
            const qrPath = path.join(__dirname, 'public', `${sessionId}.png`);
            await qrcode.toFile(qrPath, qr);
            console.log(`✅ QR جاهز للجلسة: ${sessionId} (${qrPath})`);
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة الآن`);
        }

        if (connection === 'close') {
            console.log(`❌ تم قطع الاتصال لجلسة: ${sessionId}`);
            // إعادة الاتصال إذا لم يتم تسجيل الخروج نهائياً
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect) {
                console.log(`🔄 إعادة محاولة الاتصال لجلسة: ${sessionId}`);
                createSession(sessionId);
            } else {
                delete sessions[sessionId];
                console.log(`🗑️ تم حذف الجلسة ${sessionId} بعد تسجيل الخروج`);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            await sock.sendMessage(from, { text: message });
        };

        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (err) {
                console.error('خطأ في تنفيذ الأمر:', err.message);
            }
        }
    });

    return sock;
}

// API لإنشاء جلسة جديدة
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'أدخل معرف الجلسة' });

        if (sessions[sessionId]) {
            return res.json({ message: 'الجلسة موجودة بالفعل', qrUrl: `/${sessionId}.png` });
        }

        await createSession(sessionId);
        res.json({ message: `تم إنشاء الجلسة ${sessionId}`, qrUrl: `/${sessionId}.png` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API لطلب رمز الاقتران (Pairing Code)
app.post('/pair', async (req, res) => {
    try {
        const { sessionId, number } = req.body;
        if (!sessionId || !number) return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });

        const sock = sessions[sessionId];
        if (!sock) return res.status(404).json({ error: 'الجلسة غير موجودة' });

        if (sock.authState.creds.registered) {
            return res.status(400).json({ error: 'الجلسة مرتبطة بالفعل' });
        }

        let code = await sock.requestPairingCode(number);
        code = code.match(/.{1,4}/g).join('-');
        res.json({ pairingCode: code });
    } catch (err) {
        res.status(500).json({ error: 'فشل في إنشاء الرمز: ' + err.message });
    }
});

// API لعرض صفحة QR (توجه المستخدم إلى صفحة HTML تعرض الصورة)
app.get('/qr-page', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).send('❌ لم يتم إدخال معرف الجلسة');
    res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

// API لصفحة Pairing (يمكنك وضع صفحة HTML مخصصة لهذا الغرض في public)
app.get('/pairing-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pairing.html'));
});

// API رفع الصور وإرسالها إلى واتساب
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

// API لعرض الجلسات النشطة
app.get('/sessions', (req, res) => {
    res.json({ activeSessions: Object.keys(sessions) });
});

app.listen(PORT, () => console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`));    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true
    });

    sessions[sessionId] = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect } = update;

        if (qr) {
            const qrPath = path.join(__dirname, 'public', `${sessionId}.png`);
            await qrcode.toFile(qrPath, qr);
            console.log(`✅ QR جاهز للجلسة: ${sessionId}`);
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة الآن`);
        }

        if (connection === 'close') {
            console.log(`❌ تم قطع الاتصال لجلسة: ${sessionId}`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            await sock.sendMessage(from, { text: message });
        };

        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (err) {
                console.error('خطأ في تنفيذ الأمر:', err.message);
            }
        }
    });

    return sock;
}

// ✅ API لإنشاء جلسة
app.post('/create-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'أدخل معرف الجلسة' });

        if (sessions[sessionId]) {
            return res.json({ message: 'الجلسة موجودة بالفعل', qrUrl: `/${sessionId}.png` });
        }

        await createSession(sessionId);
        res.json({ message: `تم إنشاء الجلسة ${sessionId}`, qrUrl: `/${sessionId}.png` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ API لطلب Pairing Code
app.post('/pair', async (req, res) => {
    try {
        const { sessionId, number } = req.body;
        if (!sessionId || !number) return res.status(400).json({ error: 'أدخل معرف الجلسة ورقم الهاتف' });

        const sock = sessions[sessionId];
        if (!sock) return res.status(404).json({ error: 'الجلسة غير موجودة' });

        if (sock.authState.creds.registered) {
            return res.status(400).json({ error: 'الجلسة مرتبطة بالفعل' });
        }

        let code = await sock.requestPairingCode(number);
        code = code.match(/.{1,4}/g).join('-');
        res.json({ pairingCode: code });
    } catch (err) {
        res.status(500).json({ error: 'فشل في إنشاء الرمز: ' + err.message });
    }
});

// ✅ API لعرض QR بشكل واجهة
app.get('/qr-page', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.send('❌ لم يتم إدخال معرف الجلسة');
    res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

// ✅ API لصفحة Pairing Code
app.get('/pairing-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pairing.html'));
});

// ✅ API لرفع الصور وإرسالها إلى واتساب
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

// ✅ API لعرض الجلسات النشطة
app.get('/sessions', (req, res) => {
    res.json({ activeSessions: Object.keys(sessions) });
});

app.listen(PORT, () => console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`));
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        const reply = async (message) => {
            await sock.sendMessage(from, { text: message });
        };

        for (const command of commands) {
            try {
                await command({ text, reply, sock, msg, from, sessionId });
            } catch (err) {
                console.error('خطأ في تنفيذ الأمر:', err.message);
            }
        }
    });

    return sock;
}

// ✅ API لطلب رمز الاقتران
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

// ✅ API لتوليد QR
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

// ✅ API لرفع الصور
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

app.listen(PORT, () => console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`));
