/**
 * AquaSmart - Google Apps Script
 * ===============================
 * Faz de backend: recebe dados do ESP e guarda no Google Sheets.
 *
 * COMO CRIAR:
 * 1. Abre https://script.google.com
 * 2. Cola este código
 * 3. Vai a "Ficheiro -> Guardar" (dá um nome)
 * 4. Vai a "Executar -> criarSheet()" na primeira vez (para criar a sheet)
 * 5. Vai a "Implementar -> Nova implementação"
 *    - Tipo: "Aplicação Web"
 *    - Executar como: "Eu"
 *    - Quem pode aceder: "Qualquer pessoa"
 * 6. Copia o URL gerado e mete no sketch do Arduino
 */

const SHEET_NAME = "AquaSmart_Regas";

function criarSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Data/Hora", "Duracao (s)", "Humidade Inicio (%)", "Humidade Fim (%)",
                     "Temperatura Inicio (°C)", "Temperatura Fim (°C)", "Litros Gasto"]);
  }
  Logger.log("Sheet pronta: " + sheet.getName());
}

function doGet(e) {
  // Se pedir historico, devolve tudo
  if (e && e.parameter && e.parameter.obterHistorico === "1") {
    return obterHistorico();
  }

  // Senao, regista uma nova rega
  return registarRega(e);
}

function registarRega(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Data/Hora", "Duracao (s)", "Humidade Inicio (%)", "Humidade Fim (%)",
                     "Temperatura Inicio (°C)", "Temperatura Fim (°C)", "Litros Gasto"]);
  }

  const agora = new Date();
  const dataStr = Utilities.formatDate(agora, "GMT+1", "dd/MM/yyyy HH:mm");

  const duracao = e?.parameter?.duracao || "0";
  const humidadeInicio = e?.parameter?.humidade_inicio || "0";
  const humidadeFim = e?.parameter?.humidade_fim || "0";
  const tempInicio = e?.parameter?.temp_inicio || "--";
  const tempFim = e?.parameter?.temp_fim || "--";
  const litros = e?.parameter?.litros || "0";

  sheet.appendRow([dataStr, duracao, humidadeInicio, humidadeFim, tempInicio, tempFim, litros]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterHistorico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return ContentService
      .createTextOutput("")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const dados = sheet.getDataRange().getValues();
  let resultado = "";

  // Pula cabecalho (linha 0)
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    const data = linha[0] || "";
    const duracao = linha[1] || 0;
    const humidade = (linha[2] || 0) + "->" + (linha[3] || 0);
    const litros = linha[6] || 0;
    resultado += `${data},${duracao},${humidade},${litros}\n`;
  }

  return ContentService
    .createTextOutput(resultado)
    .setMimeType(ContentService.MimeType.TEXT);
}
