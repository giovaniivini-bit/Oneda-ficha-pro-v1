const fs = require('fs');
const https = require('https');

const imageMap = JSON.parse(fs.readFileSync('image_map.json', 'utf8'));

https.get('https://docs.google.com/spreadsheets/d/1fX27pHe53zhNf3hb9-RZCi3E0DoU5pY0I93nwM_2o-Y/gviz/tq?tqx=out:csv', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const lines = data.split('\n');
        let matched = 0, missing = 0;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const cols = line.split(',');
            const rawSku = cols[1] ? cols[1].replace(/"/g, '').trim() : '';
            if (!rawSku) continue;
            
            const cleanSku = rawSku.toUpperCase();
            const baseSku = cleanSku.replace(/[A-Z]+$/, '').replace(/-\d+$/, '').trim();
            
            const found = imageMap[cleanSku] || imageMap[baseSku] || imageMap[cleanSku.replace(/\./g, '')];
            if (found) matched++;
            else missing++;
        }
        console.log('TOTAL MATCHED:', matched, '| MISSING:', missing);
    });
});



