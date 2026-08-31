/**
 * ==========================================================================
 * ONEDA FICHA PRO - GOOGLE APPS SCRIPT WEBHOOK (SINCRONIZAÇÃO 2 VIAS)
 * ==========================================================================
 * 
 * COMO INSTALAR NA SUA PLANILHA:
 * 1. Abra a sua Planilha Google:
 *    https://docs.google.com/spreadsheets/d/1fX27pHe53zhNf3hb9-RZCi3E0DoU5pY0I93nwM_2o-Y/edit
 * 2. No menu superior, clique em: Extensões > Apps Script
 * 3. Apague qualquer código existente e cole todo este arquivo.
 * 4. Clique em "Implantar" (Deploy) > "Nova Implantação" (New Deployment).
 * 5. Selecione o tipo: "App da Web" (Web App).
 * 6. Em "Quem pode acessar" (Who has access), escolha: "Qualquer pessoa" (Anyone).
 * 7. Clique em "Implantar" e copie a URL do Web App gerada.
 * ==========================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  
  try {
    var rawData = e.postData ? e.postData.contents : null;
    if (!rawData) {
      return responseJSON({ success: false, error: "Nenhum dado recebido" });
    }
    
    var data = JSON.parse(rawData);
    var targetSku = (data.produto || "").trim();
    if (!targetSku) {
      return responseJSON({ success: false, error: "Código do produto não informado" });
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var values = sheet.getDataRange().getValues();
    
    if (values.length < 2) {
      return responseJSON({ success: false, error: "Planilha vazia" });
    }
    
    // Mapeamento de colunas pelos cabeçalhos
    var headers = values[0].map(function(h) { return (h || "").toString().toLowerCase().trim(); });
    
    var colProd = -1;
    var colCusto = -1;
    var colObs = -1;
    var colMarkup = -1;
    var colPdv = -1;
    var colVar1Nome = -1, colVar1Preco = -1;
    var colVar2Nome = -1, colVar2Preco = -1;
    var colVar3Nome = -1, colVar3Preco = -1;
    
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (h.indexOf("prod") !== -1 || h.indexOf("ref") !== -1) colProd = c;
      else if (h.indexOf("custo") !== -1 || (h.indexOf("pre") !== -1 && h.indexOf("princ") !== -1)) colCusto = c;
      else if (h.indexOf("obs") !== -1) colObs = c;
      else if (h.indexOf("markup") !== -1) colMarkup = c;
      else if (h.indexOf("pdv") !== -1) colPdv = c;
      else if (h.indexOf("varia") !== -1 && h.indexOf("1") !== -1) { colVar1Nome = c; colVar1Preco = c + 1; }
      else if (h.indexOf("varia") !== -1 && h.indexOf("2") !== -1) { colVar2Nome = c; colVar2Preco = c + 1; }
      else if (h.indexOf("varia") !== -1 && h.indexOf("3") !== -1) { colVar3Nome = c; colVar3Preco = c + 1; }
    }
    
    // Encontrar a linha do produto
    var rowIndex = -1;
    for (var r = 1; r < values.length; r++) {
      var skuInRow = (values[r][colProd] || "").toString().trim();
      if (skuInRow.toUpperCase() === targetSku.toUpperCase()) {
        rowIndex = r + 1; // 1-indexed no Sheets
        break;
      }
    }
    
    if (rowIndex === -1) {
      return responseJSON({ success: false, error: "Produto não encontrado na planilha: " + targetSku });
    }
    
    // Atualizar Custo Principal
    if (colCusto !== -1 && data.custoPrincipal !== undefined) {
      sheet.getRange(rowIndex, colCusto + 1).setValue(formatMoneyForSheet(data.custoPrincipal));
    }
    
    // Atualizar Markup
    if (colMarkup !== -1 && data.markup !== undefined) {
      sheet.getRange(rowIndex, colMarkup + 1).setValue(data.markup.toString().replace(".", ","));
    }
    
    // Atualizar PDV Sugerido
    if (colPdv !== -1 && data.pdvSugerido !== undefined) {
      sheet.getRange(rowIndex, colPdv + 1).setValue(formatMoneyForSheet(data.pdvSugerido));
    }
    
    // Atualizar Observação
    if (colObs !== -1 && data.obs !== undefined) {
      sheet.getRange(rowIndex, colObs + 1).setValue(data.obs);
    }
    
    // Atualizar Variação 1
    if (colVar1Nome !== -1 && data.var1_nome !== undefined) {
      sheet.getRange(rowIndex, colVar1Nome + 1).setValue(data.var1_nome);
      if (colVar1Preco !== -1 && data.var1_preco !== undefined) {
        sheet.getRange(rowIndex, colVar1Preco + 1).setValue(formatMoneyForSheet(data.var1_preco));
      }
    }
    
    // Atualizar Variação 2
    if (colVar2Nome !== -1 && data.var2_nome !== undefined) {
      sheet.getRange(rowIndex, colVar2Nome + 1).setValue(data.var2_nome);
      if (colVar2Preco !== -1 && data.var2_preco !== undefined) {
        sheet.getRange(rowIndex, colVar2Preco + 1).setValue(formatMoneyForSheet(data.var2_preco));
      }
    }
    
    // Atualizar Variação 3
    if (colVar3Nome !== -1 && data.var3_nome !== undefined) {
      sheet.getRange(rowIndex, colVar3Nome + 1).setValue(data.var3_nome);
      if (colVar3Preco !== -1 && data.var3_preco !== undefined) {
        sheet.getRange(rowIndex, colVar3Preco + 1).setValue(formatMoneyForSheet(data.var3_preco));
      }
    }
    
    return responseJSON({
      success: true,
      message: "Produto " + targetSku + " atualizado com sucesso na planilha!",
      row: rowIndex
    });
    
  } catch (err) {
    return responseJSON({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return responseJSON({ status: "ok", app: "Oneda Ficha Pro Webhook" });
}

function formatMoneyForSheet(val) {
  if (typeof val === "number") {
    return "R$ " + val.toFixed(2).replace(".", ",");
  }
  var str = val ? val.toString().trim() : "";
  if (str && str.indexOf("R$") === -1) {
    return "R$ " + str;
  }
  return str;
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
