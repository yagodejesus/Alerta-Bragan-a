const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');

let client;

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

const MARES_MARCO = `
🌊 *PRÓXIMAS MARÉS ALTAS EM BRAGANÇA – MARÇO (estimativas)* 🌊

📅 01 Mar — 06:10 / 18:20
📅 02 Mar — 06:55 / 19:05
📅 03 Mar — 07:40 / 19:50
📅 04 Mar — 08:25 / 20:35
📅 05 Mar — 09:10 / 21:20
📅 06 Mar — 09:55 / 22:05
📅 07 Mar — 10:40 / 22:50
📅 08 Mar — 11:25 / 23:35
📅 09 Mar — 12:10 / 00:20
📅 10 Mar — 12:55 / 01:05
📅 11 Mar — 13:40 / 01:50
📅 12 Mar — 14:25 / 02:35
📅 13 Mar — 15:10 / 03:20
📅 14 Mar — 15:55 / 04:05
📅 15 Mar — 16:40 / 04:50
📅 16 Mar — 17:25 / 05:35
📅 17 Mar — 18:10 / 06:20
📅 18 Mar — 18:55 / 07:05
📅 19 Mar — 19:40 / 07:50
📅 20 Mar — 20:25 / 08:35
📅 21 Mar — 21:10 / 09:20
📅 22 Mar — 21:55 / 10:05
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
  headless: true,
  autoClose: 0,
  puppeteerOptions: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
}).then(cli => {
  client = cli;
  console.log("✅ WhatsApp conectado");
  iniciarEscuta();
});

// ==========================================
// DELAY SEGURO (ANTI BAN)
// ==========================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// ESCUTA SOMENTE SOB DEMANDA
// ==========================================
function iniciarEscuta() {

  client.onMessage(async (message) => {

    if (message.isGroupMsg) return;

    const numero = message.from;

    console.log(`📩 Mensagem recebida de ${numero}`);

    // delay humano 4-8 segundos
    await delay(4000 + Math.random() * 4000);

    const relatorio = await gerarRelatorio();

    await client.sendText(numero, relatorio);

  });
}

// ==========================================
// CONSULTAR CHUVA
// ==========================================
async function consultarChuva(lat, lon) {

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
  const proximas3 = precipitacao.slice(index, index + 3);
  const futuro = proximas3.reduce((a, b) => a + b, 0);

  const ultimas24 = precipitacao.slice(Math.max(0, index - 24), index);
  const acumulado24h = ultimas24.reduce((a, b) => a + b, 0);

  return { atual, futuro, acumulado24h };
}

// ==========================================
// CLASSIFICAR ÍNDICE
// ==========================================
function classificarIndice(indice) {

  if (indice < 10) return { nivel: "BAIXO", emoji: "🟢" };
  if (indice < 25) return { nivel: "MÉDIO", emoji: "🟡" };
  if (indice < 50) return { nivel: "ALTO", emoji: "🟠" };
  return { nivel: "CRÍTICO (SUPOSTO ALAGAMENTO EM TRECHOS DO BAIRRO)", emoji: "🔴" };
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

  texto += "\n\n" + MARES_MARCO;
  texto += "⚠️ *AVISO:* Este índice é uma estimativa baseada em dados de chuva e vulnerabilidade. "
  texto += "📲 Envie qualquer mensagem para atualizar.";

  return texto;
}