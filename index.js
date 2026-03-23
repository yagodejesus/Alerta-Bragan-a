const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const path = require('path');

const app = express();
let client;

// ================= SERVER QR =================
app.get('/qr', (req, res) => {
  const filePath = path.join(__dirname, 'qr.png');

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(filePath);
  } else {
    return res.send('⚠️ QR ainda não gerado. Aguarde alguns segundos...');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`👉 Abra: https://SEU-APP.railway.app/qr`);
});

// ================= BAIRROS =================
const BAIRROS = [
  { nome: "Centro", lat: -1.0537, lon: -46.7650, vulnerabilidade: 1.2 },
  { nome: "Aldeia", lat: -1.0600, lon: -46.7600, vulnerabilidade: 1.9 },
  { nome: "Vila Sinhá", lat: -1.0450, lon: -46.7700, vulnerabilidade: 1.5 },
  { nome: "Perpétuo Socorro", lat: -1.0500, lon: -46.7550, vulnerabilidade: 1.6 },
  { nome: "Riozinho", lat: -1.0570, lon: -46.7800, vulnerabilidade: 1.8 },
  { nome: "Cereja", lat: -1.0650, lon: -46.7700, vulnerabilidade: 1.4 },
  { nome: "Taíra", lat: -1.0700, lon: -46.7600, vulnerabilidade: 1.7 },
  { nome: "Vila Nova", lat: -1.0480, lon: -46.7800, vulnerabilidade: 1.5 },
];

// ================= MARÉS =================
const MARES_MARCO = `
🌊 *PRÓXIMAS MARÉS ALTAS EM BRAGANÇA – MARÇO (estimativas)* 🌊

📅 23 Mar — 22:40 / 10:50
📅 24 Mar — 23:25 / 11:35
📅 25 Mar — 00:10 / 12:20
📅 26 Mar — 00:55 / 13:05
📅 27 Mar — 01:40 / 13:50
📅 28 Mar — 02:25 / 14:35
📅 29 Mar — 03:10 / 15:20
📅 30 Mar — 03:55 / 16:05
📅 31 Mar — 04:40 / 16:50
`;

// ==========================================
// INICIAR WPP
// ==========================================
wppconnect.create({
  session: 'alerta_braganca',

  autoClose: 0, // 🔥 ESSENCIAL

  catchQR: (base64Qr) => {
    console.log('📲 Gerando QR...');

    const matches = base64Qr.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);

    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], 'base64');

      // sobrescreve sempre
      fs.writeFileSync('qr.png', buffer);

      console.log('✅ QR atualizado!');
      console.log('👉 Acesse: /qr');
    }
  },

  statusFind: (statusSession) => {
    console.log('📡 Status:', statusSession);
  },

  puppeteerOptions: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }

})
.then(cli => {
  client = cli;
  console.log("✅ WhatsApp conectado");
  iniciarEscuta();
})
.catch(err => {
  console.error("❌ Erro ao iniciar WPP:", err);
});

// ==========================================
// DELAY
// ==========================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// ESCUTA
// ==========================================
function iniciarEscuta() {

  client.onMessage(async (message) => {

    if (message.isGroupMsg) return;

    const numero = message.from;

    console.log(`📩 Msg de ${numero}`);

    await delay(4000 + Math.random() * 4000);

    const relatorio = await gerarRelatorio();

    await client.sendText(numero, relatorio);

  });
}

// ==========================================
// CHUVA
// ==========================================
async function consultarChuva(lat, lon) {

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=precipitation&forecast_days=1&past_days=1`;

    const response = await axios.get(url);

    const horas = response.data.hourly.time;
    const precipitacao = response.data.hourly.precipitation;

    const agoraISO = new Date().toISOString().slice(0, 13);
    const index = horas.findIndex(h => h.startsWith(agoraISO));

    if (index < 0) return { atual: 0, futuro: 0, acumulado24h: 0 };

    return {
      atual: precipitacao[index] || 0,
      futuro: precipitacao.slice(index, index + 3).reduce((a, b) => a + b, 0),
      acumulado24h: precipitacao
        .slice(Math.max(0, index - 24), index)
        .reduce((a, b) => a + b, 0)
    };

  } catch {
    return { atual: 0, futuro: 0, acumulado24h: 0 };
  }
}

// ==========================================
// CLASSIFICAÇÃO
// ==========================================
function classificarIndice(indice) {
  if (indice < 10) return { nivel: "BAIXO", emoji: "🟢" };
  if (indice < 25) return { nivel: "MÉDIO", emoji: "🟡" };
  if (indice < 50) return { nivel: "ALTO", emoji: "🟠" };
  return { nivel: "CRÍTICO", emoji: "🔴" };
}

// ==========================================
// RELATÓRIO
// ==========================================
async function gerarRelatorio() {

  let texto = "🚨 *ALERTA DE ALAGAMENTO - BRAGANÇA*\n\n";

  for (let bairro of BAIRROS) {

    const chuva = await consultarChuva(bairro.lat, bairro.lon);

    const indice =
      ((chuva.atual * 2) +
      (chuva.futuro * 1.5) +
      (chuva.acumulado24h * 0.7)) * bairro.vulnerabilidade;

    const c = classificarIndice(indice);

    texto += `📍 *${bairro.nome}*\n`;
    texto += `🌧️ ${chuva.atual.toFixed(1)}mm agora\n`;
    texto += `⏳ ${chuva.futuro.toFixed(1)}mm próximas 3h\n`;
    texto += `📊 ${chuva.acumulado24h.toFixed(1)}mm (24h)\n`;
    texto += `🚨 ${c.emoji} ${c.nivel}\n\n`;
  }

  texto += MARES_MARCO;
  texto += "\n⚠️ Envie qualquer mensagem para atualizar.";

  return texto;
}