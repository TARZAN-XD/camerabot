const express = require('express');
const qrcode = require('qrcode');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_FILE = './session.json';
const { state, saveState } = useSingleFileAuthState(SESSION_FILE);

let sock;
let qrCodeString = '';

app.use(express.json());
app.use(express.static('public'));

// تشغيل بوت الواتساب
async function startSock() {
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) {
            qrCodeString = qr;
            console.log('📌 مسح QR من المتصفح للربط');
        }
        if (connection === 'close') {
            const status = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (status === DisconnectReason.loggedOut) {
                console.log('❌ تم تسجيل الخروج، حذف الجلسة');
                fs.unlinkSync(SESSION_FILE);
                process.exit(0);
            } else {
                console.log('🔄 إعادة محاولة الاتصال...');
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح');
        }
    });

    sock.ev.on('creds.update', saveState);
}

startSock();

// ✅ عرض QR في المتصفح
app.get('/qr', async (req, res) => {
    if (!qrCodeString) return res.status(404).send('لا يوجد رمز QR حاليا');
    try {
        const qrImage = await qrcode.toDataURL(qrCodeString);
        res.send(`<img src="${qrImage}" style="width:300px;"/>`);
    } catch {
        res.status(500).send('خطأ في توليد QR');
    }
});

// ✅ إرسال رسالة اختبار تحمل
app.post('/send-stress', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).send('أدخل رقم الواتساب');

    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    try {
        // رسالة ثقيلة: صورة + أزرار + نص طويل
        const buttons = [
            { buttonId: 'btn1', buttonText: { displayText: 'زر 1' }, type: 1 },
            { buttonId: 'btn2', buttonText: { displayText: 'زر 2' }, type: 1 },
            { buttonId: 'btn3', buttonText: { displayText: 'زر 3' }, type: 1 }
        ];

        const buttonMessage = {
            image: { url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg' },
            caption: '📢 رسالة اختبار التحمل\n'.repeat(50), // نص طويل
            footer: 'اختبار ثقيل للأداء',
            buttons: buttons,
            headerType: 4,
        };

        await sock.sendMessage(jid, buttonMessage);
        res.send('✅ تم إرسال رسالة التحمل بنجاح');
    } catch (err) {
        console.error(err);
        res.status(500).send('خطأ في الإرسال');
    }
});

// ✅ واجهة HTML بسيطة
app.get('/', (req, res) => {
    res.send(`
        <h1>اختبار تحمل واتساب</h1>
        <p>امسح رمز QR أدناه للاتصال:</p>
        <div id="qr">جاري تحميل QR...</div>
        <br/>
        <input type="text" id="number" placeholder="رقم واتساب (مثال: 9665xxxxxxx)" />
        <button onclick="sendStress()">إرسال اختبار التحمل</button>
        <p id="status"></p>
        <script>
            async function loadQR() {
                const qrDiv = document.getElementById('qr');
                const res = await fetch('/qr');
                qrDiv.innerHTML = res.ok ? await res.text() : 'لا يوجد QR حالياً';
            }
            loadQR();
            setInterval(loadQR, 5000);
            async function sendStress() {
                const number = document.getElementById('number').value.trim();
                if (!number) { alert('أدخل الرقم'); return; }
                const status = document.getElementById('status');
                status.textContent = 'جاري الإرسال...';
                const res = await fetch('/send-stress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number })
                });
                status.textContent = await res.text();
            }
        </script>
    `);
});

app.listen(PORT, () => console.log(`🚀 شغال على http://localhost:${PORT}`));    fs.mkdirSync(sessionPath, { recursive: true });

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
