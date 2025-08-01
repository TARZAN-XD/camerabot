module.exports = async (sock, number) => {
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    for (let i = 0; i < 3; i++) {
        await sock.sendMessage(jid, {
            viewOnce: true,
            video: { url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
            caption: '🔥 PROTOCOL BUG 🔥'
        });
    }
};
