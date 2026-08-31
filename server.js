/**
 * Oneda Ficha Pro - Standalone Web & Upload Server (Zero Dependencies)
 * Serves presentation assets, handles uploads and updates image_map.json dynamically.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3040;
const APP_DIR = __dirname;
const IMAGES_DIR = path.join(APP_DIR, 'images');

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
                const stripped = base.replace(/[A-Z]+$/, '').trim();
                if (stripped && !imageMap[stripped]) {
                    imageMap[stripped] = f;
                }
            }
        });

        fs.writeFileSync(path.join(APP_DIR, 'image_map.json'), JSON.stringify(imageMap, null, 2), 'utf-8');
        console.log(`[INFO] image_map.json atualizado com ${Object.keys(imageMap).length} referências.`);
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
        req.on('end', () => {
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

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Produto atualizado com sucesso', payload }));
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
