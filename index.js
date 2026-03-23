const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');
const fs = require('fs');
const express = require('express');

const app = express();
let client;

// ================= SERVER QR =================
app.get('/qr', (req, res) => {
  if (fs.existsSync('./qr.png')) {
    return res.sendFile(__dirname + '/qr.png');
  } else {
    return res.send('QR ainda não gerado. Aguarde ou reinicie o serviço.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`👉 Acesse: /qr para ver o QR Code`);
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

⚠️ Horários estimativos baseados em padrão de maré semidiurna.
`;

// ==========================================
// INICIAR WPP
// ==========================================
wppconnect.create({
  session: 'alerta_braganca',
  autoClose: 0,

  catchQR: (base64Qr, asciiQR) => {
    console.log('📲 QR gerado!');

    // salvar imagem
    const matches = base64Qr.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], 'base64');
      fs.writeFileSync('qr.png', buffer);
      console.log('✅ QR salvo em qr.png');
    }

    console.log('👉 Acesse /qr no navegador para escanear');
  },

  statusFind: (statusSession) => {
    console.log('📡 Status da sessão:', statusSession);
  },

  puppeteerOptions: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }

}).then(cli => {
  client = cli;
  console.log("✅ WhatsApp conectado");
  iniciarEscuta();
}).catch(err => {
  console.error("❌ Erro ao iniciar WPP:", err);
});

// ==========================================
// DELAY SEGURO
// ==========================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// ESCUTA MENSAGENS
// ==========================================
function iniciarEscuta() {

  client.onMessage(async (message) => {

    if (message.isGroupMsg) return;

    const numero = message.from;

    console.log(`📩 Mensagem recebida de ${numero}`);

    await delay(4000 + Math.random() * 4000);

    const relatorio = await gerarRelatorio();

    await client.sendText(numero, relatorio);

  });
}

// ==========================================
// CONSULTAR CHUVA
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

    const atual = precipitacao[index] || 0;
    const futuro = precipitacao.slice(index, index + 3).reduce((a, b) => a + b, 0);
    const acumulado24h = precipitacao
      .slice(Math.max(0, index - 24), index)
      .reduce((a, b) => a + b, 0);

    return { atual, futuro, acumulado24h };

  } catch (error) {
    console.error("Erro ao consultar chuva:", error.message);
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

  return {
    nivel: "CRÍTICO (SUPOSTO ALAGAMENTO EM TRECHOS DO BAIRRO)",
    emoji: "🔴"
  };
}

// ==========================================
// GERAR RELATÓRIO
// ==========================================
async function gerarRelatorio() {

  let texto = "🚨 *ÍNDICE DE ALAGAMENTO - BRAGANÇA*\n\n";

  for (let bairro of BAIRROS) {

    const chuva = await consultarChuva(bairro.lat, bairro.lon);

    const indiceBase =
      (chuva.atual * 2) +
      (chuva.futuro * 1.5) +
      (chuva.acumulado24h * 0.7);

    const indiceFinal = indiceBase * bairro.vulnerabilidade;

    const classificacao = classificarIndice(indiceFinal);

    texto += `📍 *${bairro.nome}*\n`;
    texto += `🌧️ Chuva agora: ${chuva.atual.toFixed(1)}mm\n`;
    texto += `⏳ Próximas 3h: ${chuva.futuro.toFixed(1)}mm\n`;
    texto += `📊 Últimas 24h: ${chuva.acumulado24h.toFixed(1)}mm\n`;
    texto += `🚨 Risco: ${classificacao.emoji} ${classificacao.nivel}\n\n`;
  }

  texto += "\n" + MARES_MARCO;
  texto += "\n⚠️ *AVISO:* Estimativa baseada em chuva + vulnerabilidade.\n";
  texto += "📲 Envie qualquer mensagem para atualizar.";

  return texto;
}