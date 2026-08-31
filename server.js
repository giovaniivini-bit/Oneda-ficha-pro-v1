/**
 * Oneda Ficha Pro - Standalone Web & Upload Server
 * Serves presentation assets, handles uploads, updates image_map, and syncs via OAuth2 Google Sheets API
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const PORT = process.env.PORT || 3040;
const APP_DIR = __dirname;
const IMAGES_DIR = path.join(APP_DIR, 'images');

// =========================================================================
// GOOGLE SHEETS OAUTH2 CONFIGURATION
// =========================================================================
const SPREADSHEET_ID = '1fX27pHe53zhNf3hb9-RZCi3E0DoU5pY0I93nwM_2o-Y';
let sheetsAuthClient = null;

function setupGoogleAuth() {
    try {
        const tokenPath = '/home/ubuntu/token.json';
        
        if (fs.existsSync(tokenPath)) {
            const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            const oAuth2Client = new google.auth.OAuth2(
                tokenData.client_id,
                tokenData.client_secret,
                tokenData.token_uri || 'https://oauth2.googleapis.com/token'
            );
            
            oAuth2Client.setCredentials({
                access_token: tokenData.token,
                refresh_token: tokenData.refresh_token,
                expiry_date: tokenData.expiry ? new Date(tokenData.expiry).getTime() : null
            });
            
            sheetsAuthClient = oAuth2Client;
            console.log('[INFO] Google OAuth2 Autenticado (/home/ubuntu/token.json). A sincronização bidirecional está ATIVA!');
        } else {
            console.warn('[AVISO] /home/ubuntu/token.json não encontrado. Sincronização via API desativada.');
        }
    } catch (e) {
        console.error('[ERRO] Falha ao configurar Google OAuth2:', e.message);
    }
}
setupGoogleAuth();

async function syncToGoogleSheets(payload) {
    if (!sheetsAuthClient) return { success: false, error: 'Servidor não autenticado com o Google' };
    
    try {
        const sheets = google.sheets({ version: 'v4', auth: sheetsAuthClient });
        
        // Fetch rows
        const getRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:Z'
        });
        
        const rows = getRes.data.values;
        if (!rows || rows.length < 2) return { success: false, error: 'Planilha vazia' };
        
        const headers = rows[0].map(h => (h || '').toString().toLowerCase().trim());
        
        // Find columns
        let colProd = -1, colDesc = -1, colCusto = -1, colObs = -1, colMarkup = -1, colPdv = -1;
        let colVar1Nome = -1, colVar1Preco = -1;
        let colVar2Nome = -1, colVar2Preco = -1;
        let colVar3Nome = -1, colVar3Preco = -1;
        
        headers.forEach((h, c) => {
            if (h.includes("desc") || h.includes("descri")) colDesc = c;
            else if (h.includes("prod") || h.includes("ref") || h.includes("item")) colProd = c;
            else if (h.includes("custo") || (h.includes("pre") && h.includes("princ"))) colCusto = c;
            else if (h.includes("obs") || h.includes("observ")) colObs = c;
            else if (h.includes("markup") || h.includes("mkp") || h.includes("margem")) colMarkup = c;
            else if (h.includes("pdv") || h.includes("sugest") || h.includes("varejo")) colPdv = c;
            else if (h.includes("varia") && h.includes("1")) { colVar1Nome = c; colVar1Preco = c + 1; }
            else if (h.includes("varia") && h.includes("2")) { colVar2Nome = c; colVar2Preco = c + 1; }
            else if (h.includes("varia") && h.includes("3")) { colVar3Nome = c; colVar3Preco = c + 1; }
        });
        
        // Find product row
        const targetSku = (payload.produto || '').trim().toUpperCase();
        let rowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][colProd] && rows[i][colProd].toString().trim().toUpperCase() === targetSku) {
                rowIndex = i;
                break;
            }
        }
        
        if (rowIndex === -1) return { success: false, error: 'Produto não encontrado' };
        
        // Ensure row has at least up to column Z (index 25)
        const rowData = [...rows[rowIndex]];
        while(rowData.length < 26) rowData.push('');
        
        // Update specific columns
        if (colDesc !== -1 && payload.descricao !== undefined) rowData[colDesc] = payload.descricao;
        if (colCusto !== -1 && payload.custoPrincipal !== undefined) rowData[colCusto] = payload.custoPrincipal;
        if (colMarkup !== -1 && payload.markup !== undefined) rowData[colMarkup] = payload.markup;
        if (colPdv !== -1 && payload.pdvSugerido !== undefined) rowData[colPdv] = payload.pdvSugerido;
        if (colObs !== -1 && payload.obs !== undefined) rowData[colObs] = payload.obs;
        
        if (colVar1Nome !== -1 && payload.var1_nome !== undefined) rowData[colVar1Nome] = payload.var1_nome;
        if (colVar1Preco !== -1 && payload.var1_preco !== undefined) rowData[colVar1Preco] = payload.var1_preco;
        if (colVar2Nome !== -1 && payload.var2_nome !== undefined) rowData[colVar2Nome] = payload.var2_nome;
        if (colVar2Preco !== -1 && payload.var2_preco !== undefined) rowData[colVar2Preco] = payload.var2_preco;
        if (colVar3Nome !== -1 && payload.var3_nome !== undefined) rowData[colVar3Nome] = payload.var3_nome;
        if (colVar3Preco !== -1 && payload.var3_preco !== undefined) rowData[colVar3Preco] = payload.var3_preco;
        
        // Execute update
        const rowNum = rowIndex + 1;
        const updateRange = `A${rowNum}:Z${rowNum}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowData] }
        });
        
        console.log(`[INFO] Sincronizado Google Sheets: Produto ${targetSku} salvo com sucesso.`);
        return { success: true };
    } catch (e) {
        console.error('[ERRO] Falha ao sincronizar com Google Sheets API:', e.message);
        return { success: false, error: e.message };
    }
}
// =========================================================================



// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.JPG': 'image/jpeg',
    '.png': 'image/png',
    '.PNG': 'image/png',
    '.webp': 'image/webp',
    '.WEBP': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

// Rebuild image map
function updateImageMap() {
    try {
        if (!fs.existsSync(IMAGES_DIR)) return;
        const files = fs.readdirSync(IMAGES_DIR);
        const imageMap = {};
        files.forEach(f => {
            const ext = path.extname(f).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                const base = path.basename(f, ext).trim().toUpperCase();
                imageMap[base] = f;
                
                // Mapeamento sem pontos (ex: 0116007759)
                imageMap[base.replace(/\./g, '')] = f;

                // Base SKU sem letras no final (ex: 01.16.00.7756A -> 01.16.00.7756)
                const stripped = base.replace(/[A-Z]+$/, '').trim();
                if (stripped && !imageMap[stripped]) {
                    imageMap[stripped] = f;
                    imageMap[stripped.replace(/\./g, '')] = f;
                }

                // Base SKU sem hífen (-1, -2)
                const dashStripped = base.replace(/-\d+$/, '').trim();
                if (dashStripped && !imageMap[dashStripped]) {
                    imageMap[dashStripped] = f;
                    imageMap[dashStripped.replace(/\./g, '')] = f;
                }
            }
        });

        fs.writeFileSync(path.join(APP_DIR, 'image_map.json'), JSON.stringify(imageMap, null, 2), 'utf-8');
        console.log(`[INFO] image_map.json atualizado com ${Object.keys(imageMap).length} chaves indexadas.`);
    } catch (e) {
        console.error('[ERRO] Falha ao atualizar image_map.json:', e);
    }
}

// Initial image map build
updateImageMap();

const server = http.createServer((req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check
    if (req.url === '/health' || req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', app: 'oneda-ficha-pro', timestamp: new Date().toISOString() }));
        return;
    }

    // Endpoint de dados da planilha Google Sheets em tempo real
    if (req.url === '/api/sheet-data') {
        const sheetUrl = 'https://docs.google.com/spreadsheets/d/1fX27pHe53zhNf3hb9-RZCi3E0DoU5pY0I93nwM_2o-Y/gviz/tq?tqx=out:csv';
        https.get(sheetUrl, (sheetRes) => {
            let data = '';
            sheetRes.on('data', chunk => data += chunk);
            sheetRes.on('end', () => {
                res.writeHead(200, {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(data);
            });
        }).on('error', (err) => {
            console.error('[ERRO] Falha ao buscar Google Sheets CSV:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro ao buscar planilha', details: err.message }));
        });
        return;
    }

    // Trigger update image map
    if (req.url === '/api/refresh-images' && req.method === 'POST') {
        updateImageMap();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Image map atualizado com sucesso' }));
        return;
    }

    // Endpoint de atualização de dados do produto
    if (req.url === '/api/update-product' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const overridesFile = path.join(APP_DIR, 'product_overrides.json');
                let overrides = {};
                if (fs.existsSync(overridesFile)) {
                    try { overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf-8')); } catch (e) {}
                }
                
                if (payload.produto) {
                    overrides[payload.produto.toUpperCase()] = {
                        ...payload,
                        updatedAt: new Date().toISOString()
                    };
                    fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2), 'utf-8');
                }

                // Sincroniza via OAuth2 (API oficial do Google Sheets)
                const syncResult = await syncToGoogleSheets(payload);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'Produto atualizado localmente', 
                    googleSync: syncResult,
                    payload 
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // Static File Serving
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
    }

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(APP_DIR, safePath);

    // Security check: ensure path is within APP_DIR
    if (!filePath.startsWith(APP_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 - Arquivo Não Encontrado</h1>');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Cache control
        const isStaticAsset = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.woff2'].includes(ext);
        const cacheControl = isStaticAsset 
            ? 'public, max-age=3600' 
            : 'no-cache, no-store, must-revalidate';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': cacheControl
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  ONEDA FICHA PRO - SERVIDOR ATIVO NA PORTA ${PORT}`);
    console.log(`  Local: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
