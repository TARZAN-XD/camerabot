module.exports = async (sock, number) => {
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    await sock.sendMessage(jid, {
        document: { url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
        mimetype: 'application/pdf',
        fileName: 'bigfile.pdf',
        caption: '🔥 CRASH TEST 🔥'
    });
};
