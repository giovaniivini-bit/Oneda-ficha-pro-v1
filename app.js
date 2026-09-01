/**
 * ==========================================================================
 * ONEDA FICHA PRO - Lógica da Aplicação (V2.0.0)
 * Arquitetura de 2 Telas: Tela 1 (Configuração) & Tela 2 (Apresentação)
 * Navegação por Setas CIMA (↑) / BAIXO (↓) no Modo 1 por Folha Fixo
 * ==========================================================================
 */

// Google Sheets Config
const SPREADSHEET_ID = '1fX27pHe53zhNf3hb9-RZCi3E0DoU5pY0I93nwM_2o-Y';
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
const GOOGLE_SHEET_FALLBACK_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;

// URL do Webhook do Google Apps Script para salvar dados de volta na planilha
// Para gerar essa URL, siga as instruções no arquivo google_apps_script.js
const GOOGLE_APPS_SCRIPT_WEBHOOK_URL = ''; 

// Dados Iniciais: array vazio - dados reais vêm da planilha Google Sheets
const INITIAL_FALLBACK_PRODUCTS = [];


// Estado Global da Aplicação
let imageMap = {};
let fichaMetadata = {};
let manualUploadsMap = {};
try {
    const saved = localStorage.getItem('oneda_manual_images');
    if (saved) manualUploadsMap = JSON.parse(saved);
} catch (e) {}

const state = {
    allProducts: [...INITIAL_FALLBACK_PRODUCTS],
    filteredProducts: [],
    availableRooms: [],
    selectedRooms: new Set(),
    searchQuery: '',
    currentScreen: 'welcome', // 'welcome' (Tela 1) | 'presentation' (Tela 2)
    currentView: 'showcase',  // 'list' | 'showcase' | 'stats'
    previousView: null,       // rastreia de onde veio o showcase (ex: 'list', 'stats')
    currentIndex: 0,
    activeVariation: null,
    customMarkup: 2.5,
    lastSync: null,
    // Filtros exclusivos da Tela de Lista
    listFilterSala: 'ALL',
    listSimulateMarkup: 'none',
    listSort: 'price-asc',
    // Filtro do Painel de Estatísticas
    statsFilterSala: 'ALL'
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    try {
        localStorage.removeItem('oneda_product_overrides');
    } catch (e) {}

    await loadImageMap();
    await loadFichaMetadata();
    initApp();
    setupEventListeners();
    syncGoogleSheets(false);

    // Polling automático da planilha em tempo real a cada 4 segundos
    setInterval(() => {
        syncGoogleSheets(true);
    }, 4000);
});

async function loadImageMap() {
    try {
        const res = await fetch('image_map.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
            imageMap = await res.json();
        }
    } catch (e) {}
}

async function loadFichaMetadata() {
    try {
        const res = await fetch('ficha_metadata.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
            fichaMetadata = await res.json();
        }
    } catch (e) {}
}

/**
 * Inicialização
 */
function initApp() {
    extractRooms();
    applyFilters();
    renderWelcomeRooms();
    updateScreenVisibility();
}

/**
 * Extrai lista de salas únicas
 */
function extractRooms() {
    const rooms = new Set();
    state.allProducts.forEach(p => {
        if (p.sala) rooms.add(p.sala);
    });
    state.availableRooms = Array.from(rooms);

    if (state.selectedRooms.size === 0) {
        state.availableRooms.forEach(r => state.selectedRooms.add(r));
    }
}

/**
 * Aplica filtros de sala e busca
 */
function applyFilters() {
    const query = state.searchQuery.trim().toLowerCase();

    state.filteredProducts = state.allProducts.filter(p => {
        const roomMatch = state.selectedRooms.size === 0 || state.selectedRooms.has(p.sala);
        if (!roomMatch) return false;

        if (!query) return true;

        const skuMatch = p.produto && p.produto.toLowerCase().includes(query);
        const descMatch = p.descricao && p.descricao.toLowerCase().includes(query);
        const roomMatch2 = p.sala && p.sala.toLowerCase().includes(query);
        const obsMatch = p.obs && p.obs.toLowerCase().includes(query);
        const varMatch = p.variacoes && p.variacoes.some(v => v.nome.toLowerCase().includes(query));

        return skuMatch || descMatch || roomMatch2 || obsMatch || varMatch;
    });

    if (state.currentIndex >= state.filteredProducts.length) {
        state.currentIndex = Math.max(0, state.filteredProducts.length - 1);
    }

    updateCounterLabels();
}

/**
 * Atualiza rótulos de contagem nas 2 telas
 */
function updateCounterLabels() {
    const total = state.filteredProducts.length;
    
    // Tela 1 Hint
    const startHint = document.getElementById('startCounterHint');
    if (startHint) {
        if (total > 0) {
            startHint.textContent = `${total} produto${total !== 1 ? 's' : ''} pronto${total !== 1 ? 's' : ''} para apresentação`;
        } else {
            startHint.textContent = `Nenhum produto selecionado. Marque pelo menos uma sala.`;
        }
    }

    // Tela 2 Lista
    const listCounter = document.getElementById('listTotalCounter');
    if (listCounter) {
        listCounter.textContent = `Exibindo ${total} produto${total !== 1 ? 's' : ''}`;
    }

    // Tela 2 Header Sala Tag
    const roomLabel = document.getElementById('activeRoomLabel');
    if (roomLabel) {
        if (state.selectedRooms.size === state.availableRooms.length) {
            roomLabel.textContent = `TODAS AS SALAS (${total})`;
        } else {
            const names = Array.from(state.selectedRooms).join(', ');
            roomLabel.textContent = `SALA: ${names} (${total})`;
        }
    }
}

/**
 * Alterna visibilidade entre Tela 1 (Welcome) e Tela 2 (Presentation)
 */
function updateScreenVisibility() {
    const screenWelcome = document.getElementById('screenWelcome');
    const screenPresentation = document.getElementById('screenPresentation');

    if (state.currentScreen === 'welcome') {
        screenWelcome.style.display = 'flex';
        screenPresentation.style.display = 'none';
        renderWelcomeRooms();
    } else {
        screenWelcome.style.display = 'none';
        screenPresentation.style.display = 'flex';
        renderPresentationScreen();
    }
}

/**
 * ==========================================================================
 * TELA 1: RENDERIZAÇÃO DOS FILTROS DE ENTRADA
 * ==========================================================================
 */
function renderWelcomeRooms() {
    const container = document.getElementById('welcomeRoomsContainer');
    if (!container) return;

    container.innerHTML = '';

    state.availableRooms.forEach(room => {
        const count = state.allProducts.filter(p => p.sala === room).length;
        const isSelected = state.selectedRooms.has(room);

        const chip = document.createElement('div');
        chip.className = `room-chip ${isSelected ? 'active' : ''}`;
        chip.innerHTML = `
            <i class="fa-solid fa-${isSelected ? 'check' : 'door-closed'}"></i>
            <span>${escapeHTML(room)}</span>
            <span class="count-tag">${count}</span>
        `;

        chip.addEventListener('click', () => {
            if (state.selectedRooms.has(room)) {
                if (state.selectedRooms.size > 1) {
                    state.selectedRooms.delete(room);
                }
            } else {
                state.selectedRooms.add(room);
            }
            applyFilters();
            renderWelcomeRooms();
        });

        container.appendChild(chip);
    });
}

/**
 * ==========================================================================
 * TELA 2: RENDERIZAÇÃO DA APRESENTAÇÃO (LISTA, SHOWCASE OU ESTATÍSTICAS)
 * ==========================================================================
 */
function renderPresentationScreen() {
    const viewListPanel = document.getElementById('viewListPanel');
    const viewShowcasePanel = document.getElementById('viewShowcasePanel');
    const viewStatsPanel = document.getElementById('viewStatsPanel');
    const btnToggleList = document.getElementById('btnToggleList');
    const btnToggleShowcase = document.getElementById('btnToggleShowcase');
    const btnToggleStats = document.getElementById('btnToggleStats');
    const btnBackToList = document.getElementById('btnBackToList');

    if (!viewListPanel || !viewShowcasePanel) return;

    if (state.currentView === 'list') {
        viewListPanel.style.display = 'block';
        viewShowcasePanel.style.display = 'none';
        if (viewStatsPanel) viewStatsPanel.style.display = 'none';

        viewListPanel.classList.add('active');
        viewShowcasePanel.classList.remove('active');
        if (viewStatsPanel) viewStatsPanel.classList.remove('active');

        if (btnToggleList) btnToggleList.classList.add('active');
        if (btnToggleShowcase) btnToggleShowcase.classList.remove('active');
        if (btnToggleStats) btnToggleStats.classList.remove('active');

        state.previousView = null;
        if (btnBackToList) btnBackToList.style.display = 'none';
        renderListView();
    } else if (state.currentView === 'stats') {
        viewListPanel.style.display = 'none';
        viewShowcasePanel.style.display = 'none';
        if (viewStatsPanel) viewStatsPanel.style.display = 'block';

        viewListPanel.classList.remove('active');
        viewShowcasePanel.classList.remove('active');
        if (viewStatsPanel) viewStatsPanel.classList.add('active');

        if (btnToggleList) btnToggleList.classList.remove('active');
        if (btnToggleShowcase) btnToggleShowcase.classList.remove('active');
        if (btnToggleStats) btnToggleStats.classList.add('active');

        renderStatsView();
    } else {
        viewListPanel.style.display = 'none';
        viewShowcasePanel.style.display = 'block';
        if (viewStatsPanel) viewStatsPanel.style.display = 'none';

        viewListPanel.classList.remove('active');
        viewShowcasePanel.classList.add('active');
        if (viewStatsPanel) viewStatsPanel.classList.remove('active');

        if (btnToggleList) btnToggleList.classList.remove('active');
        if (btnToggleShowcase) btnToggleShowcase.classList.add('active');
        if (btnToggleStats) btnToggleStats.classList.remove('active');

        if (btnBackToList) {
            btnBackToList.style.display = (state.previousView === 'list' || state.previousView === 'stats') ? 'inline-flex' : 'none';
        }
        renderShowcaseView();
    }

    updateCounterLabels();
}

/**
 * Abre o Painel de Estatísticas da Coleção
 */
function openStatsView() {
    state.previousView = state.currentView;
    state.currentView = 'stats';
    renderPresentationScreen();
}
window.openStatsView = openStatsView;

/**
 * Fecha o Painel de Estatísticas e volta para a Lista
 */
function closeStatsView() {
    state.currentView = 'list';
    renderPresentationScreen();
}
window.closeStatsView = closeStatsView;

/**
 * Filtro de sala específico para a tela de estatísticas
 */
function handleStatsRoomChange(roomVal) {
    state.statsFilterSala = roomVal;
    renderStatsView();
}
window.handleStatsRoomChange = handleStatsRoomChange;

/**
 * Volta para a lista a partir do showcase (preservando posição de rolagem)
 */
function backToList() {
    const dest = state.previousView === 'stats' ? 'stats' : 'list';
    state.previousView = null;
    state.currentView = dest;
    renderPresentationScreen();
}
window.backToList = backToList;

/**
 * Navega direto para um produto específico no Showcase pelo ID
 */
function goToProductById(prodId) {
    const idx = state.filteredProducts.findIndex(p => p.id === prodId);
    if (idx !== -1) {
        state.currentIndex = idx;
        state.previousView = state.currentView;
        state.currentView = 'showcase';
        renderPresentationScreen();
    }
}
window.goToProductById = goToProductById;

const COLOR_STOP_WORDS = [
    /\bcor\s*\d+\b/i, /\bbright\s*white\b/i, /\bsea\s*foam\b/i, /\bdark\s*shadow\b/i,
    /\bflint\b/i, /\boatmeal\b/i, /\bzephyr\b/i, /\bblack\b/i, /\boff\s*white\b/i,
    /\bdark\s*blue\b/i, /\bdesenvolver\b/i, /\bpendente\b/i, /\btingir\b/i,
    /\bvestir\s*assim\b/i, /\bno\s*cabide\b/i, /\bsolicitar\b/i, /\betiqueta\b/i,
    /\bsolapa\b/i, /\bbandeira\b/i, /\btag\b/i, /\bbainha\b/i, /\bgola\b/i,
    /\bcava\b/i, /\bc[oó]s\b/i, /\bilh[oó]s\b/i, /\bcadinho\b/i, /\bcadar[cç]o\b/i,
    /\bfornecedor\b/i, /\bc[oó]digo\b/i, /\blote\b/i, /\b\d{2}-\d{4}\b/i,
    /\bmc\s*\d{6,}\b/i, /\btc\s*\d{2}\/\d{4}\b/i, /\brotativo\b/i, /\bestampa\b/i,
    /\bbolso\b/i, /\bcaixa\s*de\s*f[oó]sforo\b/i, /\bvinho\b/i
];

function isColorOrLabelLine(text) {
    if (!text) return true;
    return COLOR_STOP_WORDS.some(pat => pat.test(text));
}

/**
 * Extrai / Normaliza a Malha do produto a partir de metadados OCR da ficha ou descrição
 */
function getProductMalha(prod) {
    if (!prod) return 'Meia Malha Penteada';
    const skuClean = (prod.produto || '').toUpperCase().trim();
    const baseSku = skuClean.replace(/[A-Z]+$/, '').replace(/-\d+$/, '').trim();
    const meta = fichaMetadata[skuClean] || fichaMetadata[baseSku] || {};
    let raw = (meta.malha || '').trim();

    if (isColorOrLabelLine(raw)) raw = '';

    if (!raw && prod.obs) {
        const mMatch = prod.obs.match(/(polilinho|meia\s*malha|moletom\s*3\s*cabos|moletom|molecotton|cotton|ribana|viscose|favo|waffle|gorgur[aã]o|piquet|linho|malh[aã]o|moletinho)/i);
        if (mMatch) raw = mMatch[0];
    }
    if (!raw && prod.descricao) {
        const mMatch2 = prod.descricao.match(/(polilinho|moletom|malha|cotton|ribana|viscose|linho|moletinho|gorgur[aã]o)/i);
        if (mMatch2) raw = mMatch2[0];
    }

    if (!raw) return 'Meia Malha Penteada';

    let clean = raw.trim();
    clean = clean.replace(/^[-\s/.:;[\]|]+|[-\s/.:;[\]|]+$/g, '');
    clean = clean.replace(/\b1\/2\s*Malha\b/gi, 'Meia Malha');
    clean = clean.replace(/\b1\/2\b/g, 'Meia');

    if (/polilinho/i.test(clean)) return 'Meia Malha Polilinho';
    if (/meia\s*malha\s*oe/i.test(clean) || /malha\s*oe/i.test(clean)) return 'Meia Malha OE';
    if (/meia\s*malha\s*pent/i.test(clean)) return 'Meia Malha Penteada';
    if (/meia\s*malha\s*card/i.test(clean)) return 'Meia Malha Cardada';
    if (/meia\s*malha/i.test(clean)) return 'Meia Malha Penteada';
    if (/malh[aã]o/i.test(clean)) return 'Malhão 180g';
    if (/molecotton\s*jeans/i.test(clean)) return 'Molecotton Jeans';
    if (/molecotton/i.test(clean)) return 'Molecotton';
    if (/moletom\s*3\s*cabos/i.test(clean)) return 'Moletom 3 Cabos';
    if (/moletom.*(com\s*felpa|c\/\s*felpa)/i.test(clean)) return 'Moletom com Felpa';
    if (/moletom.*(sem\s*felpa|s\/\s*felpa)/i.test(clean)) return 'Moletom sem Felpa';
    if (/moletom/i.test(clean)) return 'Moletom PA';
    if (/moletinho/i.test(clean)) return 'Moletinho';
    if (/suedine/i.test(clean)) return 'Suedine Penteado';
    if (/atlantic\s*stripe/i.test(clean)) return 'Malha Atlantic Stripe';
    if (/canelad[oa]/i.test(clean)) return 'Malha Canelada';
    if (/gorgur[aã]o/i.test(clean)) return 'Gorgurão PA';
    if (/ribana/i.test(clean)) return 'Ribana';
    if (/malha\s*favo/i.test(clean)) return 'Malha Favo';
    if (/waffle/i.test(clean)) return 'Waffle Elegance';
    if (/cotton/i.test(clean)) return 'Cotton com Elastano';
    if (/piquet/i.test(clean)) return 'Piquet';
    if (/viscose|viscolycra/i.test(clean)) return 'Viscose';
    if (/micro\s*touch/i.test(clean)) return 'Malha Micro Touch';
    if (/ponto\s*light/i.test(clean)) return 'Malha Ponto Light';
    if (/flam[eê]/i.test(clean)) return 'Malha Flamê';
    if (/tnt\s*dry/i.test(clean)) return 'Malha TNT Dry';

    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Extrai / Normaliza a Modelagem do produto a partir de metadados OCR da ficha ou descrição
 */
function getProductModelagem(prod) {
    if (!prod) return 'Top MC';
    const skuClean = (prod.produto || '').toUpperCase().trim();
    const baseSku = skuClean.replace(/[A-Z]+$/, '').replace(/-\d+$/, '').trim();
    const meta = fichaMetadata[skuClean] || fichaMetadata[baseSku] || {};
    let raw = (meta.modelagem || '').trim();

    if (isColorOrLabelLine(raw)) raw = '';

    if (!raw && prod.descricao) {
        raw = prod.descricao.split('/')[0].trim();
    }

    if (!raw) return 'Top MC';

    let clean = raw.trim();
    clean = clean.replace(/^[-\s/.:;[\]|]+|[-\s/.:;[\]|]+$/g, '');
    clean = clean.replace(/^(Alteração|Alteracao|Modelo|Ref|Item)[:\s]*/i, '');
    clean = clean.replace(/(Estilo|Data|C&A|C&amp;A).*$/i, '').trim();

    if (/mach[aã]o\s*box|mach[aã]o/i.test(clean)) return 'Top Machão Box';
    if (/top\s*mc\s*d\.?\s*200/i.test(clean)) return 'Top MC D.200';
    if (/top\s*mc\s*oversized/i.test(clean)) return 'Top MC Oversized';
    if (/top\s*mc\s*regular/i.test(clean)) return 'Top MC Regular';
    if (/top\s*(mc|curto)/i.test(clean) || /baby\s*look|camiseta/i.test(clean) || /top\s+.*mc/i.test(clean)) return 'Top MC';
    if (/top\s*(ml|longo)/i.test(clean) || /blusa\s+ml|frufru/i.test(clean) || /top\s+.*ml/i.test(clean)) return 'Top ML';
    if (/blus[aã]o\s*ml|blus[aã]o/i.test(clean)) return 'Blusão ML';
    if (/conj.*(top\s*mc|curto).*short/i.test(clean) || /conj.*curto/i.test(clean)) return 'Conj. Top MC + Shorts';
    if (/conj.*blus[aã]o.*cal[cç]a|conj.*moletom/i.test(clean)) return 'Conjunto Moletom';
    if (/conj.*polo/i.test(clean)) return 'Conjunto Polo';
    if (/conj.*longo/i.test(clean)) return 'Conjunto Longo';
    if (/cal[cç]a\s*jogger\s*saruel/i.test(clean)) return 'Calça Jogger Saruel';
    if (/cal[cç]a\s*jogger/i.test(clean)) return 'Calça Jogger';
    if (/cal[cç]a\s*clochard/i.test(clean)) return 'Calça Clochard';
    if (/cal[cç]a/i.test(clean)) return 'Calça';
    if (/kit\s*regata|regata/i.test(clean)) return 'Kit Regata';
    if (/shorts\s*saia/i.test(clean)) return 'Shorts Saia';
    if (/shorts?|bermuda/i.test(clean)) return 'Shorts';
    if (/jardineira/i.test(clean)) return 'Jardineira';
    if (/body\s*curto|body\s*mc/i.test(clean)) return 'Body Curto';
    if (/body\s*longo|body\s*ml/i.test(clean)) return 'Body Longo';
    if (/macaquinho/i.test(clean)) return 'Macaquinho';
    if (/vestido/i.test(clean)) return 'Vestido';
    if (/camisa\s*polo|polo/i.test(clean)) return 'Camisa Polo';

    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * 2.C: Renderização do Painel de Estatísticas & Inteligência de Coleção
 */
function renderStatsView() {
    const viewStatsPanel = document.getElementById('viewStatsPanel');
    if (!viewStatsPanel) return;

    // Popula o select de salas das estatísticas
    const selectStatsRoom = document.getElementById('statsRoomFilter');
    if (selectStatsRoom) {
        let roomOpts = '<option value="ALL">Todas as Salas</option>';
        state.availableRooms.forEach(r => {
            roomOpts += `<option value="${escapeHTML(r)}" ${state.statsFilterSala === r ? 'selected' : ''}>${escapeHTML(r)}</option>`;
        });
        selectStatsRoom.innerHTML = roomOpts;
        if (!state.statsFilterSala) state.statsFilterSala = 'ALL';
        selectStatsRoom.value = state.statsFilterSala;
    }

    // Filtra produtos conforme a sala selecionada no painel de estatísticas
    let activeProducts = state.allProducts.filter(p => {
        const roomMatch = state.selectedRooms.size === 0 || state.selectedRooms.has(p.sala);
        if (!roomMatch) return false;
        if (state.statsFilterSala !== 'ALL' && p.sala !== state.statsFilterSala) return false;
        return true;
    });

    if (activeProducts.length === 0) {
        activeProducts = state.filteredProducts.length > 0 ? state.filteredProducts : state.allProducts;
    }

    const totalCount = activeProducts.length;

    // Subtítulo
    const subtitle = document.getElementById('statsSubtitle');
    if (subtitle) {
        const roomText = state.statsFilterSala === 'ALL' ? 'todas as salas' : `a sala ${state.statsFilterSala}`;
        subtitle.textContent = `Análise consolidada de ${totalCount} produtos para ${roomText}`;
    }

    if (totalCount === 0) return;

    // 1. Cálculos de Custos e PDV
    let totalCost = 0;
    let totalPdv = 0;
    let minCost = Infinity;
    let maxCost = -Infinity;
    let validCostItems = 0;

    activeProducts.forEach(p => {
        const cost = p.precoPrincipal || 0;
        const pdv = p.pdvSugerido || 0;
        if (cost > 0) {
            totalCost += cost;
            validCostItems++;
            if (cost < minCost) minCost = cost;
            if (cost > maxCost) maxCost = cost;
        }
        if (pdv > 0) {
            totalPdv += pdv;
        }
    });

    const avgCost = validCostItems > 0 ? (totalCost / validCostItems) : 0;
    const avgPdv = validCostItems > 0 ? (totalPdv / validCostItems) : 0;
    const avgMarkup = avgCost > 0 ? (avgPdv / avgCost) : 2.5;

    // Preenche KPIs
    const kpiAvgCost = document.getElementById('kpiAvgCost');
    const kpiCostRange = document.getElementById('kpiCostRange');
    const kpiAvgPdv = document.getElementById('kpiAvgPdv');
    const kpiAvgMarkup = document.getElementById('kpiAvgMarkup');
    const kpiTotalItems = document.getElementById('kpiTotalItems');
    const kpiRoomsCount = document.getElementById('kpiRoomsCount');
    const kpiFabricsCount = document.getElementById('kpiFabricsCount');
    const kpiModelsCount = document.getElementById('kpiModelsCount');

    if (kpiAvgCost) kpiAvgCost.textContent = formatCurrency(avgCost);
    if (kpiCostRange) kpiCostRange.textContent = `Mín: ${formatCurrency(minCost === Infinity ? 0 : minCost)} • Máx: ${formatCurrency(maxCost === -Infinity ? 0 : maxCost)}`;
    if (kpiAvgPdv) kpiAvgPdv.textContent = formatCurrency(avgPdv);
    if (kpiAvgMarkup) kpiAvgMarkup.textContent = `Markup médio: ${avgMarkup.toFixed(2)}x`;
    if (kpiTotalItems) kpiTotalItems.textContent = totalCount;
    
    const uniqueRooms = new Set(activeProducts.map(p => p.sala)).size;
    if (kpiRoomsCount) kpiRoomsCount.textContent = `Distribuídos em ${uniqueRooms} sala${uniqueRooms !== 1 ? 's' : ''}`;

    // 2. Agregação de Malhas e Modelagens
    const fabricMap = {};
    const modelMap = {};

    activeProducts.forEach(p => {
        const malha = getProductMalha(p);
        const model = getProductModelagem(p);

        if (!fabricMap[malha]) fabricMap[malha] = { count: 0, totalCost: 0 };
        fabricMap[malha].count++;
        fabricMap[malha].totalCost += (p.precoPrincipal || 0);

        if (!modelMap[model]) modelMap[model] = { count: 0, totalCost: 0 };
        modelMap[model].count++;
        modelMap[model].totalCost += (p.precoPrincipal || 0);
    });

    const fabricList = Object.entries(fabricMap)
        .map(([name, data]) => ({
            name,
            count: data.count,
            pct: ((data.count / totalCount) * 100).toFixed(1),
            avgCost: data.count > 0 ? (data.totalCost / data.count) : 0
        }))
        .sort((a, b) => b.count - a.count);

    const modelList = Object.entries(modelMap)
        .map(([name, data]) => ({
            name,
            count: data.count,
            pct: ((data.count / totalCount) * 100).toFixed(1),
            avgCost: data.count > 0 ? (data.totalCost / data.count) : 0
        }))
        .sort((a, b) => b.count - a.count);

    if (kpiFabricsCount) kpiFabricsCount.textContent = `${fabricList.length} Tecidos`;
    if (kpiModelsCount) kpiModelsCount.textContent = `${modelList.length} modelagens catalogadas`;

    const badgeFabrics = document.getElementById('badgeTotalFabrics');
    if (badgeFabrics) badgeFabrics.textContent = `${fabricList.length} Tipos`;

    const badgeModels = document.getElementById('badgeTotalModels');
    if (badgeModels) badgeModels.textContent = `${modelList.length} Modelos`;

    // Renderiza Gráfico 1: Malhas
    const chartFabricsList = document.getElementById('chartFabricsList');
    if (chartFabricsList) {
        chartFabricsList.innerHTML = fabricList.map(item => `
            <div class="chart-bar-item">
                <div class="chart-bar-header">
                    <span class="chart-bar-name" title="${escapeHTML(item.name)}"><i class="fa-solid fa-layer-group" style="color: var(--accent-cyan); margin-right: 6px;"></i> ${escapeHTML(item.name)}</span>
                    <div class="chart-bar-stats">
                        <span class="chart-bar-count">${item.count} pç${item.count !== 1 ? 's' : ''}</span>
                        <span class="chart-bar-pct">${item.pct}%</span>
                        <span class="chart-bar-avg" title="Custo médio da malha">Méd: ${formatCurrency(item.avgCost)}</span>
                    </div>
                </div>
                <div class="chart-progress-bg">
                    <div class="chart-progress-fill chart-fill-cyan" style="width: ${Math.max(4, item.pct)}%;"></div>
                </div>
            </div>
        `).join('');
    }

    // Renderiza Gráfico 2: Modelagens
    const chartModelsList = document.getElementById('chartModelsList');
    if (chartModelsList) {
        chartModelsList.innerHTML = modelList.map(item => `
            <div class="chart-bar-item">
                <div class="chart-bar-header">
                    <span class="chart-bar-name" title="${escapeHTML(item.name)}"><i class="fa-solid fa-shapes" style="color: var(--accent-purple); margin-right: 6px;"></i> ${escapeHTML(item.name)}</span>
                    <div class="chart-bar-stats">
                        <span class="chart-bar-count">${item.count} pç${item.count !== 1 ? 's' : ''}</span>
                        <span class="chart-bar-pct" style="color: var(--accent-purple); background: rgba(168,85,247,0.12);">${item.pct}%</span>
                        <span class="chart-bar-avg" title="Custo médio da modelagem">Méd: ${formatCurrency(item.avgCost)}</span>
                    </div>
                </div>
                <div class="chart-progress-bg">
                    <div class="chart-progress-fill chart-fill-purple" style="width: ${Math.max(4, item.pct)}%;"></div>
                </div>
            </div>
        `).join('');
    }

    // 3. Rankings: Top 5 Mais Caros e Top 5 Mais Baratos
    const validProds = activeProducts.filter(p => (p.precoPrincipal || 0) > 0);
    const sortedDesc = [...validProds].sort((a, b) => (b.precoPrincipal || 0) - (a.precoPrincipal || 0)).slice(0, 5);
    const sortedAsc = [...validProds].sort((a, b) => (a.precoPrincipal || 0) - (b.precoPrincipal || 0)).slice(0, 5);

    const rankingExpensive = document.getElementById('rankingExpensiveList');
    if (rankingExpensive) {
        rankingExpensive.innerHTML = sortedDesc.map((p, idx) => {
            const imgUrl = getProductImageUrl(p);
            return `
                <div class="ranking-item" onclick="goToProductById(${p.id})" title="Clique para abrir no modo 1 por folha">
                    <div class="ranking-pos ${idx === 0 ? 'ranking-pos-1' : ''}">${idx + 1}</div>
                    <img class="ranking-thumb" src="${imgUrl}" alt="${escapeHTML(p.produto)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'44\\' height=\\'44\\' fill=\\'%2364748b\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%231e293b\\'/><text x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2394a3b8\\' font-size=\\'10\\'>SEM FOTO</text></svg>'">
                    <div class="ranking-info">
                        <span class="ranking-sku-tag">${escapeHTML(p.produto)}</span>
                        <span class="ranking-desc">${escapeHTML(p.descricao || 'Sem descrição')}</span>
                        <span class="ranking-sala-badge"><i class="fa-solid fa-door-open"></i> ${escapeHTML(p.sala)} • ${escapeHTML(getProductMalha(p))}</span>
                    </div>
                    <div class="ranking-price-box">
                        <div class="ranking-cost">${formatCurrency(p.precoPrincipal)}</div>
                        <div class="ranking-pdv">PDV: ${formatCurrency(p.pdvSugerido)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    const rankingAffordable = document.getElementById('rankingAffordableList');
    if (rankingAffordable) {
        rankingAffordable.innerHTML = sortedAsc.map((p, idx) => {
            const imgUrl = getProductImageUrl(p);
            return `
                <div class="ranking-item" onclick="goToProductById(${p.id})" title="Clique para abrir no modo 1 por folha">
                    <div class="ranking-pos ${idx === 0 ? 'ranking-pos-1' : ''}">${idx + 1}</div>
                    <img class="ranking-thumb" src="${imgUrl}" alt="${escapeHTML(p.produto)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'44\\' height=\\'44\\' fill=\\'%2364748b\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%231e293b\\'/><text x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2394a3b8\\' font-size=\\'10\\'>SEM FOTO</text></svg>'">
                    <div class="ranking-info">
                        <span class="ranking-sku-tag">${escapeHTML(p.produto)}</span>
                        <span class="ranking-desc">${escapeHTML(p.descricao || 'Sem descrição')}</span>
                        <span class="ranking-sala-badge"><i class="fa-solid fa-door-open"></i> ${escapeHTML(p.sala)} • ${escapeHTML(getProductMalha(p))}</span>
                    </div>
                    <div class="ranking-price-box">
                        <div class="ranking-cost">${formatCurrency(p.precoPrincipal)}</div>
                        <div class="ranking-pdv">PDV: ${formatCurrency(p.pdvSugerido)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

/**
 * 2.A: Renderização do Modo Lista (Tabela com Miniaturas e Filtros)
 */
function renderListView() {
    const tableBody = document.getElementById('productsTableBody');
    const emptyState = document.getElementById('emptyStateList');
    const tableWrapper = document.getElementById('productsTableWrapper');
    const thColDiff = document.getElementById('thColDiff');
    const selectSala = document.getElementById('filterListSala');
    const selectMarkup = document.getElementById('filterListMarkup');
    const selectSort = document.getElementById('filterListSort');

    if (!tableBody) return;

    // Atualiza opções do select de salas se necessário
    if (selectSala) {
        const currentVal = selectSala.value || state.listFilterSala;
        let html = '<option value="ALL">Todas as Salas</option>';
        state.availableRooms.forEach(room => {
            html += `<option value="${escapeHTML(room)}">${escapeHTML(room)}</option>`;
        });
        selectSala.innerHTML = html;
        selectSala.value = state.availableRooms.includes(currentVal) ? currentVal : 'ALL';
        state.listFilterSala = selectSala.value;
    }

    if (selectMarkup) {
        selectMarkup.value = state.listSimulateMarkup;
    }
    if (selectSort) {
        selectSort.value = state.listSort;
    }

    // Filtra produtos de acordo com os filtros globais e o filtro de sala da lista
    let listProducts = [...state.filteredProducts];
    if (state.listFilterSala !== 'ALL') {
        listProducts = listProducts.filter(p => p.sala === state.listFilterSala);
    }

    // Ordenação
    const sortMode = state.listSort;
    listProducts.sort((a, b) => {
        if (sortMode === 'price-asc') return (a.precoPrincipal || 0) - (b.precoPrincipal || 0);
        if (sortMode === 'price-desc') return (b.precoPrincipal || 0) - (a.precoPrincipal || 0);
        if (sortMode === 'sku-asc') return (a.produto || '').localeCompare(b.produto || '');
        if (sortMode === 'sku-desc') return (b.produto || '').localeCompare(a.produto || '');
        if (sortMode === 'desc-asc') return (a.descricao || '').localeCompare(b.descricao || '');
        return 0;
    });

    // Contador da lista
    const listTotalCounter = document.getElementById('listTotalCounter');
    if (listTotalCounter) {
        listTotalCounter.textContent = `Exibindo ${listProducts.length} produto${listProducts.length !== 1 ? 's' : ''}`;
    }

    if (listProducts.length === 0) {
        tableBody.innerHTML = '';
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (tableWrapper) tableWrapper.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    tableBody.innerHTML = '';

    // Configuração do Markup e cabeçalho de coluna
    const markupVal = state.listSimulateMarkup;
    const isMarkupActive = markupVal !== 'none';
    const numMarkup = parseFloat(markupVal) || 0;

    if (thColDiff) {
        thColDiff.textContent = isMarkupActive 
            ? `PDV SIMULADO (${numMarkup}x)` 
            : `DIFERENÇA BASE`;
    }

    // Custo base de referência para a coluna de diferença
    const baseProduct = listProducts[0];
    const baseCost = baseProduct ? (baseProduct.precoPrincipal || 0) : 0;

    listProducts.forEach((product) => {
        const row = document.createElement('div');
        row.className = 'table-list-row';

        // Aplicar tamanho atual do slider diretamente (inline style tem prioridade)
        const thumbW = parseInt(localStorage.getItem('oneda_list_thumb_size') || '120', 10);
        const thumbH = Math.round(thumbW * 0.75);
        const gridCols = `${thumbW + 16}px 1.3fr 2.3fr 1fr 1.2fr`;
        row.style.gridTemplateColumns = gridCols;

        const imgUrl = getProductImageUrl(product.produto);
        const cost = product.precoPrincipal || 0;

        const diff = cost - baseCost;
        let diffFormatted = '';
        if (Math.abs(diff) < 0.009) {
            diffFormatted = 'R$ 0,00';
        } else if (diff > 0) {
            diffFormatted = `+ ${formatCurrency(diff)}`;
        } else {
            diffFormatted = `- ${formatCurrency(Math.abs(diff))}`;
        }

        let diffBadgeHTML = '';
        if (isMarkupActive) {
            const simulatedPdv = cost * numMarkup;
            diffBadgeHTML = `<span class="row-diff-badge diff-markup">${formatCurrency(simulatedPdv)}</span>`;
        } else {
            if (Math.abs(diff) < 0.009) {
                diffBadgeHTML = `<span class="row-diff-badge diff-zero">R$ 0,00</span>`;
            } else if (diff > 0) {
                diffBadgeHTML = `<span class="row-diff-badge diff-plus">${diffFormatted}</span>`;
            } else {
                diffBadgeHTML = `<span class="row-diff-badge diff-minus">${diffFormatted}</span>`;
            }
        }

        row.innerHTML = `
            <div class="row-thumb-box" style="width:${thumbW}px;height:${thumbH}px;min-width:${thumbW}px;">
                <img src="${imgUrl}" alt="${product.produto}" class="row-thumb-img" loading="lazy" onerror="handleThumbImgError(this)">
            </div>
            <div class="row-sku-text">${escapeHTML(product.produto)}</div>
            <div class="row-desc-text" title="${escapeHTML(product.descricao || '')}">${escapeHTML(product.descricao || '—')}</div>
            <div class="row-cost-text">${product.precoPrincipalFormatted}</div>
            <div class="row-diff-cell">${diffBadgeHTML}</div>
        `;

        row.addEventListener('click', () => {
            const originalIdx = state.filteredProducts.findIndex(p => p.produto === product.produto);
            if (originalIdx !== -1) {
                state.currentIndex = originalIdx;
            }
            state.activeVariation = null;
            state.previousView = 'list'; // vindo da lista, permite voltar
            state.currentView = 'showcase';
            renderPresentationScreen();
        });

        tableBody.appendChild(row);
    });

    // Sincronizar tamanho do header com o slider atual após render
    const currentThumbW = parseInt(localStorage.getItem('oneda_list_thumb_size') || '120', 10);
    const headerEl = document.querySelector('.products-table-header');
    if (headerEl) headerEl.style.gridTemplateColumns = `${currentThumbW + 16}px 1.3fr 2.3fr 1fr 1.2fr`;
}

/**
 * 2.B: Renderização do Modo 1 por Folha Fixo (Showcase 100%)
 */
function renderShowcaseView() {
    const product = state.filteredProducts[state.currentIndex];
    if (!product) return;

    // Header & Meta
    document.getElementById('imgBadgeSku').textContent = product.produto || 'SKU';
    const descBadge = document.getElementById('imgBadgeDesc');
    const descSep = document.getElementById('imgBadgeDescSep');
    if (descBadge && descSep) {
        if (product.descricao && product.descricao.trim()) {
            descBadge.textContent = product.descricao.trim();
            descBadge.style.display = 'inline';
            descSep.style.display = 'inline';
        } else {
            descBadge.style.display = 'none';
            descSep.style.display = 'none';
        }
    }
    document.getElementById('showcaseCounterPill').textContent = `${state.currentIndex + 1} / ${state.filteredProducts.length}`;

    // Imagem do Produto
    const imgEl = document.getElementById('showcaseProductImg');
    const placeholderEl = document.getElementById('imagePlaceholder');
    const fallbackText = document.getElementById('imgSkuFallbackText');
    loadImageWithFallbackCascade(imgEl, placeholderEl, fallbackText, product.produto);

    // Observações (obs: espelho fiel da planilha)
    const obsTextEl = document.getElementById('showcaseObsText');
    const obsBox = document.getElementById('showcaseObsBox');
    if (product.obs && product.obs.trim()) {
        obsTextEl.textContent = product.obs.trim();
        obsBox.style.opacity = '1';
    } else {
        obsTextEl.textContent = 'Nenhuma observação cadastrada na planilha.';
        obsBox.style.opacity = '0.7';
    }

    // Preço e PDV Sugerido
    renderShowcasePricing(product);

    // Variações
    renderShowcaseVariations(product);

    // Carrossel Inferior
    renderStripThumbnails();
}

/**
 * Renderiza Preço e PDV do Showcase
 */
function renderShowcasePricing(product) {
    let currentPrice = product.precoPrincipal;
    let priceCaption = 'Custo base da referência';

    if (state.activeVariation !== null && product.variacoes[state.activeVariation]) {
        const v = product.variacoes[state.activeVariation];
        currentPrice = v.preco;
        priceCaption = `Opção: ${v.nome}`;
    }

    const effectiveMarkup = product.markup || 2.5;
    const calculatedPdv = product.pdvSugerido || (currentPrice * effectiveMarkup);

    document.getElementById('showcaseMainPrice').textContent = formatCurrency(currentPrice);
    document.getElementById('showcasePriceTip').textContent = priceCaption;

    document.getElementById('showcasePdvPrice').textContent = formatCurrency(calculatedPdv);
    
    const markupFormatted = effectiveMarkup.toString().replace('.', ',');
    const markupBadge = document.getElementById('showcaseMarkupBadge');
    if (markupBadge) {
        markupBadge.textContent = `(Markup sugerido: ${markupFormatted})`;
    }
}

/**
 * Renderiza Variações (sem duplicar o item padrão, com micro-tag Variação 1, 2, 3...)
 */
function renderShowcaseVariations(product) {
    const list = document.getElementById('showcaseVariationsList');
    if (!list) return;

    list.innerHTML = '';

    if (!product.variacoes || product.variacoes.length === 0) {
        list.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; font-style: italic; padding: 8px 4px;">Sem opções adicionais cadastradas para este modelo.</div>`;
        return;
    }

    // Variações específicas da planilha (Variação 1, Variação 2, etc.)
    product.variacoes.forEach((v, i) => {
        const isSel = state.activeVariation === i;
        const row = document.createElement('div');
        row.className = `variation-item-row ${isSel ? 'selected' : ''}`;
        
        row.innerHTML = `
            <div class="var-text-col">
                <span class="var-micro-tag">Variação ${i + 1}</span>
                <span class="var-name">${escapeHTML(v.nome)}</span>
            </div>
            <span class="var-price">${v.precoFormatted}</span>
        `;

        row.addEventListener('click', () => {
            // Toggle: se já estava selecionado, volta ao custo principal
            if (state.activeVariation === i) {
                state.activeVariation = null;
            } else {
                state.activeVariation = i;
            }
            renderShowcasePricing(product);
            renderShowcaseVariations(product);
        });

        list.appendChild(row);
    });
}

/**
 * Renderiza miniaturas da barra inferior
 */
function renderStripThumbnails() {
    const track = document.getElementById('stripTrack');
    const countLabel = document.getElementById('stripCountLabel');
    if (!track) return;

    countLabel.textContent = state.filteredProducts.length;
    track.innerHTML = '';

    state.filteredProducts.forEach((p, idx) => {
        const isActive = idx === state.currentIndex;
        const item = document.createElement('div');
        item.className = `strip-item ${isActive ? 'active' : ''}`;
        item.id = `stripItem_${idx}`;

        const imgUrl = getProductImageUrl(p.produto);
        item.innerHTML = `
            <img src="${imgUrl}" alt="${p.produto}" class="strip-img" onerror="handleThumbImgError(this)">
            <span class="strip-sku">${escapeHTML(p.produto)}</span>
        `;

        item.addEventListener('click', () => {
            state.currentIndex = idx;
            state.activeVariation = null;
            renderShowcaseView();
            scrollStripItem(idx);
        });

        track.appendChild(item);
    });

    scrollStripItem(state.currentIndex);
}

function scrollStripItem(idx) {
    setTimeout(() => {
        const item = document.getElementById(`stripItem_${idx}`);
        if (item) {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 80);
}

/**
 * ==========================================================================
 * NAVEGAÇÃO DE PRODUTOS (SETAS CIMA / BAIXO)
 * ==========================================================================
 */
function nextProduct() {
    if (state.filteredProducts.length === 0) return;
    state.currentIndex = (state.currentIndex + 1) % state.filteredProducts.length;
    state.activeVariation = null;
    if (state.currentView === 'showcase') {
        renderShowcaseView();
    }
}

function prevProduct() {
    if (state.filteredProducts.length === 0) return;
    state.currentIndex = (state.currentIndex - 1 + state.filteredProducts.length) % state.filteredProducts.length;
    state.activeVariation = null;
    if (state.currentView === 'showcase') {
        renderShowcaseView();
    }
}

/**
 * ==========================================================================
 * EVENT LISTENERS & ATALHOS DE TECLADO
 * ==========================================================================
 */
function setupEventListeners() {
    function safeAdd(id, event, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
        return el;
    }

    // Tela 1: Seleção de Opções de Apresentação (Lista vs 1 por Folha)
    const optList = document.getElementById('optCardList');
    const optShowcase = document.getElementById('optCardShowcase');

    if (optList && optShowcase) {
        optList.addEventListener('click', () => {
            state.currentView = 'list';
            optList.classList.add('active');
            optShowcase.classList.remove('active');
        });

        optShowcase.addEventListener('click', () => {
            state.currentView = 'showcase';
            optShowcase.classList.add('active');
            optList.classList.remove('active');
        });
    }

    // Tela 1: Botão Todas / Limpar Salas
    safeAdd('btnWelcomeAllRooms', 'click', () => {
        state.availableRooms.forEach(r => state.selectedRooms.add(r));
        applyFilters();
        renderWelcomeRooms();
    });
    safeAdd('btnWelcomeClearRooms', 'click', () => {
        state.selectedRooms.clear();
        applyFilters();
        renderWelcomeRooms();
    });

    // Tela 1 -> Tela 2: INICIAR APRESENTAÇÃO
    safeAdd('btnStartPresentation', 'click', () => {
        if (state.filteredProducts.length === 0) {
            alert('Por favor, selecione pelo menos uma sala com produtos para iniciar!');
            return;
        }
        state.currentScreen = 'presentation';
        updateScreenVisibility();
    });

    // Tela 2 -> Tela 1: VOLTAR AOS FILTROS
    safeAdd('btnBackToWelcome', 'click', () => {
        state.currentScreen = 'welcome';
        updateScreenVisibility();
    });
    safeAdd('btnEmptyGoBack', 'click', () => {
        state.currentScreen = 'welcome';
        updateScreenVisibility();
    });

    // Tela 2: Toggle Rápido Lista / 1 por Folha / Estatísticas
    safeAdd('btnToggleList', 'click', () => {
        state.currentView = 'list';
        renderPresentationScreen();
    });
    safeAdd('btnToggleShowcase', 'click', () => {
        state.currentView = 'showcase';
        renderPresentationScreen();
    });
    safeAdd('btnToggleStats', 'click', () => {
        openStatsView();
    });
    safeAdd('btnOpenStats', 'click', () => {
        openStatsView();
    });

    // Filtros exclusivos da Tela de Lista
    const selectListSala = document.getElementById('filterListSala');
    if (selectListSala) {
        selectListSala.addEventListener('change', (e) => {
            state.listFilterSala = e.target.value;
            renderListView();
        });
    }

    const selectListMarkup = document.getElementById('filterListMarkup');
    if (selectListMarkup) {
        selectListMarkup.addEventListener('change', (e) => {
            state.listSimulateMarkup = e.target.value;
            renderListView();
        });
    }

    const selectListSort = document.getElementById('filterListSort');
    if (selectListSort) {
        selectListSort.addEventListener('change', (e) => {
            state.listSort = e.target.value;
            renderListView();
        });
    }

    // Tela 2: Navegação Vertical (Setas Cima ↑ / Baixo ↓)
    safeAdd('btnPrevProductUp', 'click', prevProduct);
    safeAdd('btnNextProductDown', 'click', nextProduct);

    // Barra de Busca da Tela 2
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('btnClearSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            if (clearSearchBtn) clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
            applyFilters();
            renderPresentationScreen();
        });
    }
    if (clearSearchBtn && searchInput) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            state.searchQuery = '';
            clearSearchBtn.style.display = 'none';
            applyFilters();
            renderPresentationScreen();
            searchInput.focus();
        });
    }

    // Toggle Barra Inferior
    safeAdd('stripHandle', 'click', () => {
        const track = document.getElementById('stripTrack');
        const icon = document.getElementById('stripHandleIcon');
        if (track) {
            if (track.style.display === 'none') {
                track.style.display = 'flex';
                if (icon) icon.className = 'fa-solid fa-chevron-up';
            } else {
                track.style.display = 'none';
                if (icon) icon.className = 'fa-solid fa-chevron-down';
            }
        }
    });

    // Fullscreen Toggle
    safeAdd('btnToggleFullscreen', 'click', toggleFullscreen);

    // Zoom Image Modal
    safeAdd('btnZoomImage', 'click', openImageZoom);
    safeAdd('showcaseProductImg', 'click', openImageZoom);
    safeAdd('btnCloseZoom', 'click', closeImageZoom);
    safeAdd('imageZoomModal', 'click', (e) => {
        if (e.target.id === 'imageZoomModal') closeImageZoom();
    });

    // Upload Manual & Drag-and-Drop
    const btnUpload = document.getElementById('btnUploadImageManual');
    const fileInput = document.getElementById('manualImageFileInput');
    if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const prod = state.filteredProducts[state.currentIndex];
                if (prod) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setManualProductImage(prod.produto, ev.target.result);
                    reader.readAsDataURL(file);
                }
            }
            fileInput.value = '';
        });
    }

    const imgBox = document.getElementById('productImageBox');
    if (imgBox) {
        ['dragenter', 'dragover'].forEach(name => {
            imgBox.addEventListener(name, (e) => {
                e.preventDefault();
                imgBox.style.borderColor = 'var(--accent-cyan)';
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            imgBox.addEventListener(name, (e) => {
                e.preventDefault();
                imgBox.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            });
        });
        imgBox.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0 && files[0].type.startsWith('image/')) {
                const prod = state.filteredProducts[state.currentIndex];
                if (prod) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setManualProductImage(prod.produto, ev.target.result);
                    reader.readAsDataURL(files[0]);
                }
            }
        });
    }

    // Modal Quick Search (Ctrl + K)
    safeAdd('btnCloseQuickSearch', 'click', closeQuickSearchModal);
    safeAdd('quickSearchModal', 'click', (e) => {
        if (e.target.id === 'quickSearchModal') closeQuickSearchModal();
    });
    const modalInput = document.getElementById('modalSearchInput');
    if (modalInput) {
        modalInput.addEventListener('input', (e) => renderQuickSearchResults(e.target.value));
    }

    // Controle de Tamanho de Imagem na Lista
    setupImageSizeControl();

    // Modal de Impressão / PDF
    safeAdd('btnOpenPrintModal', 'click', openPrintModal);
    safeAdd('btnClosePrintModal', 'click', closePrintModal);
    safeAdd('printModal', 'click', (e) => {
        if (e.target.id === 'printModal') closePrintModal();
    });

    // Modal de Edição de Ficha (Lápis Verde)
    safeAdd('btnOpenEditProduct', 'click', openEditProductModal);
    safeAdd('btnCloseEditModal', 'click', closeEditProductModal);
    safeAdd('btnCancelEdit', 'click', closeEditProductModal);
    safeAdd('editProductModal', 'click', (e) => {
        if (e.target.id === 'editProductModal') closeEditProductModal();
    });
    safeAdd('editProductForm', 'submit', handleSaveEditProduct);
    safeAdd('btnSaveEdit', 'click', handleSaveEditProduct);

    // NAVEGAÇÃO GLOBAL POR TECLADO
    window.addEventListener('keydown', (e) => {
        // Ctrl + K
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openQuickSearchModal();
            return;
        }

        // ESC: Volta da Tela 2 para Tela 1 ou fecha modal
        if (e.key === 'Escape') {
            const zoomModal = document.getElementById('imageZoomModal');
            const searchModal = document.getElementById('quickSearchModal');
            if (zoomModal && zoomModal.style.display !== 'none') {
                closeImageZoom();
            } else if (searchModal && searchModal.style.display !== 'none') {
                closeQuickSearchModal();
            } else if (state.currentScreen === 'presentation') {
                state.currentScreen = 'welcome';
                updateScreenVisibility();
            }
            return;
        }

        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

        // Se estiver no modo 1 por folha na Tela 2:
        if (state.currentScreen === 'presentation' && state.currentView === 'showcase') {
            // SETAS CIMA / BAIXO trocam produtos
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                nextProduct();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                prevProduct();
            } else if (e.key.toLowerCase() === 'f') {
                toggleFullscreen();
            }
        }
    });

    // Rolagem suave do mouse para trocar produtos no modo fixo
    let wheelCooldown = false;
    window.addEventListener('wheel', (e) => {
        if (state.currentScreen === 'presentation' && state.currentView === 'showcase') {
            if (wheelCooldown) return;
            if (Math.abs(e.deltaY) > 30) {
                wheelCooldown = true;
                if (e.deltaY > 0) {
                    nextProduct();
                } else {
                    prevProduct();
                }
                setTimeout(() => { wheelCooldown = false; }, 300);
            }
        }
    }, { passive: true });
}

/**
 * ==========================================================================
 * MODAIS E HELPERS
 * ==========================================================================
 */
function openImageZoom() {
    const product = state.filteredProducts[state.currentIndex];
    if (!product) return;

    const modal = document.getElementById('imageZoomModal');
    const img = document.getElementById('zoomModalImg');
    const caption = document.getElementById('zoomModalCaption');

    img.src = getProductImageUrl(product.produto);
    caption.textContent = `${product.produto} • Sala: ${product.sala}`;
    modal.style.display = 'flex';
}

function closeImageZoom() {
    document.getElementById('imageZoomModal').style.display = 'none';
}

function openQuickSearchModal() {
    const modal = document.getElementById('quickSearchModal');
    const input = document.getElementById('modalSearchInput');
    modal.style.display = 'flex';
    input.value = '';
    renderQuickSearchResults('');
    setTimeout(() => input.focus(), 50);
}

function closeQuickSearchModal() {
    document.getElementById('quickSearchModal').style.display = 'none';
}

/**
 * ==========================================================================
 * MODAL DE EDIÇÃO DE PRODUTO & SINCRONIZAÇÃO COM A PLANILHA
 * ==========================================================================
 */
function openEditProductModal() {
    const product = state.filteredProducts[state.currentIndex];
    if (!product) return;

    document.getElementById('editProductSku').value = product.produto || '';
    const descField = document.getElementById('editProductDesc');
    if (descField) descField.value = product.descricao || '';

    document.getElementById('editCustoPrincipal').value = (product.precoPrincipal || 0).toFixed(2).replace('.', ',');
    document.getElementById('editMarkup').value = (product.markup || 2.5).toString().replace('.', ',');
    document.getElementById('editObs').value = product.obs || '';

    // Variação 1
    const v1 = product.variacoes && product.variacoes[0] ? product.variacoes[0] : null;
    document.getElementById('editVar1Name').value = v1 ? v1.nome : '';
    document.getElementById('editVar1Price').value = v1 ? (v1.preco || 0).toFixed(2).replace('.', ',') : '';

    // Variação 2
    const v2 = product.variacoes && product.variacoes[1] ? product.variacoes[1] : null;
    document.getElementById('editVar2Name').value = v2 ? v2.nome : '';
    document.getElementById('editVar2Price').value = v2 ? (v2.preco || 0).toFixed(2).replace('.', ',') : '';

    // Variação 3
    const v3 = product.variacoes && product.variacoes[2] ? product.variacoes[2] : null;
    document.getElementById('editVar3Name').value = v3 ? v3.nome : '';
    document.getElementById('editVar3Price').value = v3 ? (v3.preco || 0).toFixed(2).replace('.', ',') : '';

    const btnSaveText = document.getElementById('btnSaveEditText');
    if (btnSaveText) btnSaveText.textContent = 'Salvar & Atualizar Planilha';

    document.getElementById('editProductModal').style.display = 'flex';
}

function closeEditProductModal() {
    const modal = document.getElementById('editProductModal');
    if (modal) modal.style.display = 'none';
}

// Exportações globais
window.openEditProductModal = openEditProductModal;
window.closeEditProductModal = closeEditProductModal;
window.handleSaveEditProduct = handleSaveEditProduct;

async function handleSaveEditProduct(e) {
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const product = state.filteredProducts[state.currentIndex];
    if (!product) return;

    const sku = (document.getElementById('editProductSku')?.value || '').trim();
    const descField = document.getElementById('editProductDesc');
    const descText = descField ? descField.value.trim() : (product.descricao || '');

    const custoNum = parseCurrency(document.getElementById('editCustoPrincipal')?.value);
    const markupNum = parseFloat((document.getElementById('editMarkup')?.value || '2.5').replace(',', '.')) || 2.5;
    const obsText = (document.getElementById('editObs')?.value || '').trim();

    // Variações
    const v1Name = (document.getElementById('editVar1Name')?.value || '').trim();
    const v1Price = parseCurrency(document.getElementById('editVar1Price')?.value) || custoNum;

    const v2Name = (document.getElementById('editVar2Name')?.value || '').trim();
    const v2Price = parseCurrency(document.getElementById('editVar2Price')?.value) || custoNum;

    const v3Name = (document.getElementById('editVar3Name')?.value || '').trim();
    const v3Price = parseCurrency(document.getElementById('editVar3Price')?.value) || custoNum;

    const newVariacoes = [];
    if (v1Name) newVariacoes.push({ nome: v1Name, preco: v1Price, precoFormatted: formatCurrency(v1Price) });
    if (v2Name) newVariacoes.push({ nome: v2Name, preco: v2Price, precoFormatted: formatCurrency(v2Price) });
    if (v3Name) newVariacoes.push({ nome: v3Name, preco: v3Price, precoFormatted: formatCurrency(v3Price) });

    const pdvCalculado = Number((custoNum * markupNum).toFixed(2));

    // Atualiza o produto no estado local
    product.descricao = descText;
    product.precoPrincipal = custoNum;
    product.precoPrincipalFormatted = formatCurrency(custoNum);
    product.markup = markupNum;
    product.pdvSugerido = pdvCalculado;
    product.pdvFormatted = formatCurrency(pdvCalculado);
    product.obs = obsText;
    product.variacoes = newVariacoes;

    // Atualiza também na lista completa
    const fullProd = state.allProducts.find(p => p.produto === sku);
    if (fullProd) {
        Object.assign(fullProd, product);
    }

    // Persistência no LocalStorage
    try {
        let savedOverrides = {};
        const stored = localStorage.getItem('oneda_product_overrides');
        if (stored) savedOverrides = JSON.parse(stored);
        savedOverrides[sku.toUpperCase()] = {
            descricao: descText,
            custoPrincipal: custoNum,
            markup: markupNum,
            pdvSugerido: pdvCalculado,
            obs: obsText,
            variacoes: newVariacoes
        };
        localStorage.setItem('oneda_product_overrides', JSON.stringify(savedOverrides));
    } catch (err) {}

    // Feedback visual
    const btnSave = document.getElementById('btnSaveEdit');
    const btnSaveText = document.getElementById('btnSaveEditText');
    if (btnSave) btnSave.disabled = true;
    if (btnSaveText) btnSaveText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando na Planilha...';

    // Dispara sincronização com o backend / webhook da planilha
    const payload = {
        produto: sku,
        descricao: descText,
        custoPrincipal: formatCurrency(custoNum),
        markup: markupNum.toString().replace('.', ','),
        pdvSugerido: formatCurrency(pdvCalculado),
        obs: obsText,
        var1_nome: v1Name,
        var1_preco: v1Name ? formatCurrency(v1Price) : '',
        var2_nome: v2Name,
        var2_preco: v2Name ? formatCurrency(v2Price) : '',
        var3_nome: v3Name,
        var3_preco: v3Name ? formatCurrency(v3Price) : ''
    };

    try {
        const response = await fetch('/api/update-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.googleSync && result.googleSync.success) {
            showToast(`Produto ${sku} atualizado na Planilha Google!`);
        } else if (result.googleSync && result.googleSync.error) {
            console.warn('Erro ao sincronizar com Google Sheets:', result.googleSync.error);
            showToast(`Salvo no app (Aviso Google Sheets: ${result.googleSync.error})`);
        } else {
            showToast(`Produto ${sku} atualizado com sucesso!`);
        }
    } catch (err) {
        console.warn('Sync com backend falhou:', err);
        showToast(`Salvo localmente no App!`);
    } finally {
        if (btnSave) btnSave.disabled = false;
        if (btnSaveText) btnSaveText.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar & Atualizar Planilha';
    }

    // Atualiza a tela imediatamente
    if (state.currentView === 'showcase') {
        renderShowcaseView();
    } else {
        renderListView();
    }

    setTimeout(() => {
        closeEditProductModal();
    }, 200);
}

function renderQuickSearchResults(query) {
    const container = document.getElementById('modalSearchResults');
    const q = query.trim().toLowerCase();

    const matches = state.allProducts.filter(p => {
        if (!q) return true;
        const skuMatch = p.produto && p.produto.toLowerCase().includes(q);
        const descMatch = p.descricao && p.descricao.toLowerCase().includes(q);
        const salaMatch = p.sala && p.sala.toLowerCase().includes(q);
        const obsMatch = p.obs && p.obs.toLowerCase().includes(q);
        const varMatch = p.variacoes && p.variacoes.some(v => v.nome.toLowerCase().includes(q));
        return skuMatch || descMatch || salaMatch || obsMatch || varMatch;
    }).slice(0, 20);

    if (matches.length === 0) {
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">Nenhum produto correspondente</div>`;
        return;
    }

    container.innerHTML = '';
    matches.forEach(p => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const imgUrl = getProductImageUrl(p.produto);

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${imgUrl}" alt="${p.produto}" style="width: 40px; height: 40px; object-fit: contain; background: #090c14; border-radius: 6px; padding: 2px;" onerror="handleThumbImgError(this)">
                <div>
                    <div style="font-weight: 800; color: #fff; font-size: 14px;">
                        ${escapeHTML(p.produto)}
                        ${p.descricao ? `<span style="font-weight: 600; color: var(--accent-cyan); font-size: 12px; margin-left: 6px;">• ${escapeHTML(p.descricao)}</span>` : ''}
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHTML(p.sala || 'SALA')} ${p.obs ? `— <span style="color: var(--text-muted);">${escapeHTML(p.obs)}</span>` : ''}</div>
                </div>
            </div>
            <div style="font-weight: 800; color: var(--accent-emerald); font-size: 15px;">${p.precoPrincipalFormatted}</div>
        `;

        item.addEventListener('click', () => {
            if (!state.selectedRooms.has(p.sala)) {
                state.selectedRooms.add(p.sala);
                applyFilters();
                renderWelcomeRooms();
            }

            const targetIdx = state.filteredProducts.findIndex(item => item.produto === p.produto);
            if (targetIdx !== -1) {
                state.currentIndex = targetIdx;
            }
            state.activeVariation = null;
            state.currentScreen = 'presentation';
            state.currentView = 'showcase';
            closeQuickSearchModal();
            updateScreenVisibility();
        });

        container.appendChild(item);
    });
}

/**
 * ==========================================================================
 * CONTROLE DE TAMANHO DA FOTO NA LISTA (50% a 200%)
 * ==========================================================================
 */
function setupImageSizeControl() {
    const sizeSlider = document.getElementById('listImgSizeRange');
    if (!sizeSlider) return;

    const savedSize = localStorage.getItem('oneda_list_thumb_size') || '120';
    sizeSlider.value = savedSize;
    applyImageSize(savedSize);

    sizeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        applyImageSize(val);
        localStorage.setItem('oneda_list_thumb_size', val);
    });
}

function applyImageSize(widthPx) {
    const w = parseInt(widthPx, 10) || 120;
    const h = Math.round(w * 0.75); // Proporção 4:3

    // 1) Atualizar variáveis CSS globais (para novas rows geradas depois)
    document.documentElement.style.setProperty('--list-thumb-width', `${w}px`);
    document.documentElement.style.setProperty('--list-thumb-height', `${h}px`);

    // 2) Aplicar inline style diretamente em todos os elementos existentes
    //    (inline style tem prioridade sobre qualquer regra CSS estática)
    const gridCols = `${w + 16}px 1.3fr 2.3fr 1fr 1.2fr`;
    const header = document.querySelector('.products-table-header');
    if (header) header.style.gridTemplateColumns = gridCols;

    const rows = document.querySelectorAll('.table-list-row');
    rows.forEach(row => {
        row.style.gridTemplateColumns = gridCols;
    });

    document.querySelectorAll('.row-thumb-box').forEach(box => {
        box.style.width = `${w}px`;
        box.style.height = `${h}px`;
        box.style.minWidth = `${w}px`;
    });

    // 3) Se não encontrou rows (lista ainda não renderizada ou vazia), forçar re-render
    if (rows.length === 0 && state.currentView === 'list' && state.currentScreen === 'presentation') {
        renderListView();
    }

    // 4) Atualizar label
    const sizeLabel = document.getElementById('imgSizeValLabel');
    if (sizeLabel) sizeLabel.textContent = `${w}px`;
}

/**
 * ==========================================================================
 * SISTEMA DE IMPRESSÃO & EXPORTAÇÃO PDF (1 POR FOLHA OU LISTA)
 * ==========================================================================
 */
function openPrintModal() {
    const modal = document.getElementById('printModal');
    if (modal) modal.style.display = 'flex';
}

function closePrintModal() {
    const modal = document.getElementById('printModal');
    if (modal) modal.style.display = 'none';
}

window.openPrintModal = openPrintModal;
window.closePrintModal = closePrintModal;
window.executePrint = executePrint;

function executePrint(mode) {
    closePrintModal();

    if (mode === 'list') {
        openPrintWindow_List();
        return;
    }

    let productsToPrint = [];
    if (mode === 'current') {
        const current = state.filteredProducts[state.currentIndex];
        if (current) productsToPrint = [current];
    } else if (mode === 'room') {
        productsToPrint = [...state.filteredProducts];
    }

    if (productsToPrint.length === 0) {
        alert('Nenhum produto disponível para impressão!');
        return;
    }

    openPrintWindow_Sheets(productsToPrint);
}

/**
 * Abre nova janela de impressão com fichas 1 por página (A4 portrait)
 */
function openPrintWindow_Sheets(productsToPrint) {
    const markupVal = state.listSimulateMarkup !== 'none' ? parseFloat(state.listSimulateMarkup) : 2.5;
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const total = productsToPrint.length;

    let sheetsHTML = '';
    productsToPrint.forEach((p, idx) => {
        const imgUrl = getProductImageUrl(p.produto);
        const pdvVal = p.precoPrincipal * markupVal;

        let varsHTML = '';
        if (p.variacoes && p.variacoes.length > 0) {
            varsHTML = `<div class="vars-box"><div class="vars-title">Opções / Variações</div><table class="vars-table">${
                p.variacoes.map((v, vIdx) => `<tr><td><b>Var. ${vIdx+1}:</b> ${escapeHTML(v.nome)}</td><td>${v.precoFormatted||formatCurrency(v.preco)}</td></tr>`).join('')
            }</table></div>`;
        }

        sheetsHTML += `<div class="page-sheet">
            <div class="sheet-header">
                <div class="sheet-brand">ONEDA <span>FICHA PRO</span></div>
                <div class="sheet-room">${escapeHTML(p.sala||'MOSTRUÁRIO')}</div>
            </div>
            <div class="sheet-body">
                <div class="photo-col"><img src="${imgUrl}" alt="${escapeHTML(p.produto)}"></div>
                <div class="info-col">
                    <div class="meta-box">
                        <div class="meta-sku">${escapeHTML(p.produto)}</div>
                        <div class="meta-desc">${escapeHTML(p.descricao||'')}</div>
                    </div>
                    <div class="prices-box">
                        <div class="price-col">
                            <span class="price-lbl">Custo Principal</span>
                            <span class="cost-num">${p.precoPrincipalFormatted||formatCurrency(p.precoPrincipal)}</span>
                        </div>
                        <div class="price-col">
                            <span class="price-lbl">PDV Sugerido (${markupVal}x)</span>
                            <span class="pdv-num">${formatCurrency(pdvVal)}</span>
                        </div>
                    </div>
                    ${varsHTML}
                    <div class="obs-box">
                        <div class="obs-lbl">Observações Técnicas:</div>
                        <div class="obs-val">${escapeHTML(p.obs||'Nenhuma observação informada.')}</div>
                    </div>
                </div>
            </div>
            <div class="sheet-footer">
                <span>Catálogo Comercial • Oneda Ficha Pro</span>
                <span>Folha ${idx+1} de ${total} • ${escapeHTML(p.sala||'Geral')} • ${dateStr}</span>
            </div>
        </div>`;
    });

    const printDoc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Impressão — Oneda Ficha Pro</title>
<style>
@page{size:A4 portrait;margin:10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#0f172a}
.page-sheet{width:100%;min-height:270mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;break-after:page;padding:6mm 0}
.page-sheet:last-child{page-break-after:auto;break-after:auto}
.sheet-header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:14px}
.sheet-brand{font-size:22px;font-weight:900;letter-spacing:.5px}
.sheet-brand span{color:#0ea5e9}
.sheet-room{font-size:11px;font-weight:800;padding:3px 10px;border:1.5px solid #0f172a;border-radius:5px;text-transform:uppercase}
.sheet-body{display:grid;grid-template-columns:1.3fr 1fr;gap:16px;flex:1;align-items:stretch}
.photo-col{display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fff;overflow:hidden}
.photo-col img{max-width:100%;max-height:420px;object-fit:contain}
.info-col{display:flex;flex-direction:column;gap:12px}
.meta-box{border-bottom:1px solid #e2e8f0;padding-bottom:10px}
.meta-sku{font-size:20px;font-weight:900}
.meta-desc{font-size:13px;color:#475569;margin-top:4px}
.prices-box{display:flex;gap:14px}
.price-col{flex:1;background:#f8fafc;border-radius:8px;padding:10px 12px}
.price-lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;display:block;margin-bottom:4px}
.cost-num{font-size:20px;font-weight:900;color:#0f172a}
.pdv-num{font-size:20px;font-weight:900;color:#0ea5e9}
.vars-box{margin-top:2px}
.vars-title{font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.vars-table{width:100%;border-collapse:collapse;font-size:12px}
.vars-table td{padding:5px 8px;border:1px solid #e2e8f0}
.obs-box{margin-top:auto;padding-top:8px;border-top:1px solid #e2e8f0}
.obs-lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:4px}
.obs-val{font-size:12px;color:#475569}
.sheet-footer{display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:10px}
</style></head><body>
${sheetsHTML}
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},2000);};<\/script>
</body></html>`;

    const pw = window.open('', '_blank', 'width=900,height=700');
    if (!pw) { alert('Bloqueador de pop-up ativo! Permita pop-ups para este site nas configurações do navegador.'); return; }
    pw.document.open();
    pw.document.write(printDoc);
    pw.document.close();
}

/**
 * Abre nova janela de impressão com lista/tabela resumida (A4 landscape)
 */
function openPrintWindow_List() {
    const markupVal = state.listSimulateMarkup !== 'none' ? parseFloat(state.listSimulateMarkup) : null;
    const dateStr = new Date().toLocaleDateString('pt-BR');
    let listProducts = [...state.filteredProducts];
    if (state.listFilterSala !== 'ALL') {
        listProducts = listProducts.filter(p => p.sala === state.listFilterSala);
    }
    if (listProducts.length === 0) { alert('Nenhum produto na lista atual!'); return; }

    const baseCost = listProducts[0]?.precoPrincipal || 0;
    const colHeader = markupVal ? `PDV (${markupVal}x)` : 'DIFERENÇA BASE';
    const salaLabel = state.listFilterSala === 'ALL' ? 'Todas as Salas' : state.listFilterSala;

    const rowsHTML = listProducts.map((p, idx) => {
        const imgUrl = getProductImageUrl(p.produto);
        let diffCell = '';
        if (markupVal) {
            diffCell = `<b>${formatCurrency(p.precoPrincipal * markupVal)}</b>`;
        } else {
            const diff = p.precoPrincipal - baseCost;
            diffCell = Math.abs(diff) < 0.01 ? 'R$ 0,00' : (diff > 0 ? `+${formatCurrency(diff)}` : `-${formatCurrency(Math.abs(diff))}`);
        }
        return `<tr>
            <td style="text-align:center;color:#64748b">${idx+1}</td>
            <td style="text-align:center"><img src="${imgUrl}" style="width:55px;height:42px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px"></td>
            <td><b>${escapeHTML(p.produto)}</b></td>
            <td style="color:#475569">${escapeHTML(p.descricao||'—')}</td>
            <td style="text-align:right;font-weight:700">${p.precoPrincipalFormatted||formatCurrency(p.precoPrincipal)}</td>
            <td style="text-align:right;font-weight:700;color:#0ea5e9">${diffCell}</td>
        </tr>`;
    }).join('');

    const printDoc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Lista — Oneda Ficha Pro</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#0f172a}
h1{font-size:18px;font-weight:900;margin-bottom:4px}
.subtitle{font-size:10px;color:#64748b;margin-bottom:14px}
table{width:100%;border-collapse:collapse}
th{background:#0f172a;color:#fff;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:left}
td{padding:6px 10px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
tr:nth-child(even) td{background:#f8fafc}
.footer{margin-top:14px;font-size:9px;color:#94a3b8;text-align:right}
</style></head><body>
<h1>ONEDA <span style="color:#0ea5e9">FICHA PRO</span> — Lista de Produtos</h1>
<div class="subtitle">Sala: ${escapeHTML(salaLabel)} • ${markupVal?`Markup ${markupVal}x`:'Sem Markup'} • ${listProducts.length} produtos • ${dateStr}</div>
<table>
<thead><tr><th>#</th><th>FOTO</th><th>PRODUTO</th><th>DESCRIÇÃO</th><th style="text-align:right">CUSTO</th><th style="text-align:right">${colHeader}</th></tr></thead>
<tbody>${rowsHTML}</tbody>
</table>
<div class="footer">Catálogo Comercial Oficial • Oneda Ficha Pro • ${dateStr}</div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},2000);};<\/script>
</body></html>`;

    const pw = window.open('', '_blank', 'width=900,height=700');
    if (!pw) { alert('Bloqueador de pop-up ativo! Permita pop-ups para este site nas configurações do navegador.'); return; }
    pw.document.open();
    pw.document.write(printDoc);
    pw.document.close();
}

/**
 * ==========================================================================
 * FORÇAR SINCRONIZAÇÃO (PLANILHA + FOTOS) - TELA 1 E TELA 2
 * ==========================================================================
 */
async function triggerForceSync() {
    const syncIcon = document.getElementById('syncIcon');
    const syncText = document.getElementById('syncBtnText');
    const welcomeIcon = document.getElementById('welcomeSyncBtnIcon');
    const welcomeText = document.getElementById('welcomeSyncBtnLabel');

    if (syncIcon) syncIcon.classList.add('fa-spin');
    if (syncText) syncText.textContent = 'Sincronizando...';
    if (welcomeIcon) welcomeIcon.classList.add('fa-spin');
    if (welcomeText) welcomeText.textContent = 'Sincronizando...';

    try {
        // 1. Atualiza indexação de imagens do servidor
        try {
            await fetch('/api/refresh-images', { method: 'POST' });
        } catch (e) {}

        // 2. Recarrega o mapa de imagens
        await loadImageMap();

        // 3. Força leitura da planilha Google Sheets
        await syncGoogleSheets(false);

        // 4. Re-renderiza a tela ativa
        if (state.currentScreen === 'presentation') {
            if (state.currentView === 'showcase') {
                renderShowcaseView();
            } else {
                renderListView();
            }
        }

        // Feedback de sucesso
        if (syncText) syncText.textContent = '✔ Sincronizado!';
        if (syncIcon) syncIcon.classList.remove('fa-spin');
        if (welcomeText) welcomeText.textContent = '✔ Sincronizado!';
        if (welcomeIcon) welcomeIcon.classList.remove('fa-spin');

        showToast('Planilha e 329+ fotos sincronizadas com sucesso!');
    } catch (err) {
        if (syncText) syncText.textContent = 'Erro ao Sincronizar';
        if (syncIcon) syncIcon.classList.remove('fa-spin');
        if (welcomeText) welcomeText.textContent = 'Erro';
        if (welcomeIcon) welcomeIcon.classList.remove('fa-spin');
    }

    setTimeout(() => {
        if (syncText) syncText.textContent = 'Sincronizar';
        if (welcomeText) welcomeText.textContent = 'Sincronizar';
    }, 2000);
}

function showToast(message) {
    let toast = document.getElementById('appGlobalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appGlobalToast';
        toast.className = 'global-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${escapeHTML(message)}</span>`;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

window.triggerForceSync = triggerForceSync;
/**
 * ==========================================================================
 * GOOGLE SHEETS LIVE SYNC
 * ==========================================================================
 */
async function syncGoogleSheets(silent = false) {
    try {
        let sheetData = null;

        // 1. Tenta API oficial v4 do backend (Tempo real, 0 cache)
        try {
            const apiRes = await fetch('/api/sheet-data?t=' + Date.now(), { cache: 'no-store' });
            if (apiRes.ok) {
                const contentType = apiRes.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const json = await apiRes.json();
                    if (json && json.success && json.rows) {
                        sheetData = json.rows;
                    }
                } else {
                    const text = await apiRes.text();
                    if (text && text.length > 20) sheetData = text;
                }
            }
        } catch (e) {}

        // 2. Fallback direto para o Google Sheets GViz
        if (!sheetData) {
            try {
                const gRes = await fetch(GOOGLE_SHEET_CSV_URL + '&t=' + Date.now(), { cache: 'no-store' });
                if (gRes.ok) {
                    const text = await gRes.text();
                    if (text && text.length > 20) sheetData = text;
                }
            } catch (e) {}
        }

        // 3. Fallback export CSV
        if (!sheetData) {
            try {
                const gRes2 = await fetch(GOOGLE_SHEET_FALLBACK_URL + '?format=csv&t=' + Date.now(), { cache: 'no-store' });
                if (gRes2.ok) {
                    const text = await gRes2.text();
                    if (text && text.length > 20) sheetData = text;
                }
            } catch (e) {}
        }

        if (sheetData) {
            const parsed = parseGoogleSheetData(sheetData);
            if (parsed && parsed.length > 0) {
                state.allProducts = parsed;
                extractRooms();
                applyFilters();
                renderWelcomeRooms();
                updateCounterLabels();
                state.lastSync = new Date();
                
                // Se já estiver na tela de apresentação, atualiza em tempo real!
                if (state.currentScreen === 'presentation') {
                    if (state.currentView === 'showcase') {
                        renderShowcaseView();
                    } else {
                        renderListView();
                    }
                }

                const pill = document.getElementById('welcomeSyncText');
                if (pill) pill.textContent = `Planilha Atualizada (${state.lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
            }
        }
    } catch (err) {
        if (!silent) console.warn('Sync falhou:', err);
    }
}

function parseGoogleSheetData(input) {
    let lines = [];
    if (Array.isArray(input)) {
        lines = input;
    } else if (typeof input === 'string') {
        lines = parseCSVRows(input);
    }
    if (!lines || lines.length < 2) return null;

    const headers = lines[0].map(h => (h || '').toString().trim().toLowerCase());
    
    const colSala = headers.findIndex(h => h.includes('sala'));
    const colProd = headers.findIndex(h => h.includes('prod') || h.includes('ref') || h.includes('item'));
    const colDesc = headers.findIndex(h => h.includes('desc') || h.includes('descri'));
    const colPreco = headers.findIndex(h => (h.includes('custo') && h.includes('princ')) || (h.includes('pre') && h.includes('princ')) || h.includes('principal') || h.includes('custo') || h.includes('pre'));
    const colObs = headers.findIndex(h => h.includes('obs') || h.includes('observ'));
    const colMarkup = headers.findIndex(h => h.includes('markup') || h.includes('mkp') || h.includes('margem'));
    const colPdv = headers.findIndex(h => h.includes('pdv') || h.includes('sugest') || h.includes('varejo'));

    const varCols = [];
    for (let i = 1; i <= 4; i++) {
        const nameIdx = headers.findIndex(h => (h.includes('varia') || h.includes('opcao') || h.includes('opção')) && h.includes(`${i}`));
        if (nameIdx !== -1) {
            let priceIdx = nameIdx + 1;
            varCols.push({ nameIdx, priceIdx, num: i });
        }
    }

    const products = [];
    let idCounter = 1;

    for (let r = 1; r < lines.length; r++) {
        const row = lines[r];
        if (!row || row.length === 0) continue;

        const prodCode = (colProd >= 0 && row[colProd] !== undefined && row[colProd] !== null) ? String(row[colProd]).trim() : '';
        if (!prodCode) continue;

        const sala = (colSala >= 0 && row[colSala] && String(row[colSala]).trim()) ? String(row[colSala]).trim() : 'GERAL';
        const descricao = (colDesc >= 0 && row[colDesc] !== undefined && row[colDesc] !== null) ? String(row[colDesc]).trim() : '';
        const obs = (colObs >= 0 && row[colObs] !== undefined && row[colObs] !== null) ? String(row[colObs]).trim() : '';
        
        const precoStr = (colPreco >= 0 && row[colPreco] !== undefined && row[colPreco] !== null) ? String(row[colPreco]) : '0';
        const precoNum = parseCurrency(precoStr);

        const markupStr = (colMarkup >= 0 && row[colMarkup] !== undefined && row[colMarkup] !== null) ? String(row[colMarkup]).replace(',', '.') : '';
        const markup = parseFloat(markupStr) || 2.5;

        const pdvStr = (colPdv >= 0 && row[colPdv] !== undefined && row[colPdv] !== null) ? String(row[colPdv]) : '';
        let pdvNum = parseCurrency(pdvStr);
        if (pdvNum === 0 && precoNum > 0) {
            pdvNum = Number((precoNum * markup).toFixed(2));
        }

        const variacoes = [];
        varCols.forEach((vCol) => {
            const vName = (row[vCol.nameIdx] !== undefined && row[vCol.nameIdx] !== null) ? String(row[vCol.nameIdx]).trim() : '';
            const vPriceStr = (row[vCol.priceIdx] !== undefined && row[vCol.priceIdx] !== null) ? String(row[vCol.priceIdx]).trim() : '';
            if (vName) {
                const vPrice = parseCurrency(vPriceStr) || precoNum;
                variacoes.push({
                    nome: vName,
                    preco: vPrice,
                    precoFormatted: formatCurrency(vPrice)
                });
            }
        });

        const prodItem = {
            id: idCounter++,
            sala: sala,
            produto: prodCode,
            descricao: descricao,
            precoPrincipal: precoNum,
            precoPrincipalFormatted: formatCurrency(precoNum),
            obs: obs,
            markup: markup,
            pdvSugerido: pdvNum,
            pdvFormatted: formatCurrency(pdvNum),
            variacoes: variacoes
        };

        products.push(prodItem);
    }

    return products;
}

function parseCSVRows(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentCell);
            if (currentRow.some(c => c.trim().length > 0)) rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }

    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        if (currentRow.some(c => c.trim().length > 0)) rows.push(currentRow);
    }

    return rows;
}

/**
 * ==========================================================================
 * CARREGAMENTO E MANIPULAÇÃO DE IMAGENS ULTRARRÁPIDO
 * ==========================================================================
 */
function loadImageWithFallbackCascade(imgEl, placeholderEl, fallbackText, sku) {
    if (!sku) {
        imgEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
        return;
    }

    const cleanSku = sku.trim();
    const resolvedUrl = getProductImageUrl(cleanSku);

    imgEl.onload = () => {
        imgEl.style.display = 'block';
        placeholderEl.style.display = 'none';
    };
    imgEl.onerror = () => {
        imgEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
        if (fallbackText) fallbackText.textContent = cleanSku;
    };

    imgEl.src = resolvedUrl;
}

function getProductImageUrl(skuOrProd) {
    if (!skuOrProd) return 'images/placeholder.jpg';
    const sku = typeof skuOrProd === 'object' ? (skuOrProd.produto || '') : String(skuOrProd);
    if (!sku) return 'images/placeholder.jpg';
    const cleanSku = sku.trim().toUpperCase();
    const baseSku = cleanSku.replace(/[A-Z]+$/, '').replace(/-\d+$/, '').trim();

    if (manualUploadsMap[cleanSku]) return manualUploadsMap[cleanSku];
    if (imageMap) {
        const found = imageMap[cleanSku] || 
                      imageMap[baseSku] || 
                      imageMap[cleanSku.replace(/\./g, '')] || 
                      imageMap[baseSku.replace(/\./g, '')];
        if (found) return `images/${found}`;
    }
    return `images/${cleanSku}.jpg`;
}

function handleCardImgError(imgEl, sku) {
    const cleanSku = sku ? sku.trim().toUpperCase() : '';
    const baseSku = cleanSku.replace(/[A-Z]+$/, '').replace(/-\d+$/, '').trim();
    
    if (manualUploadsMap[cleanSku]) {
        imgEl.src = manualUploadsMap[cleanSku];
        return;
    }

    if (imageMap && baseSku && imageMap[baseSku] && !imgEl.dataset.triedBase) {
        imgEl.dataset.triedBase = 'true';
        imgEl.src = `images/${imageMap[baseSku]}`;
        return;
    }

    // Fallback limpo sem travar o navegador
    imgEl.parentElement.innerHTML = `
        <div class="image-placeholder" style="display:flex;">
            <i class="fa-regular fa-image" style="font-size:24px;"></i>
            <small style="color:var(--text-muted);">${escapeHTML(sku)}</small>
        </div>
    `;
}

function handleThumbImgError(imgEl) {
    imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
}

function setManualProductImage(sku, dataUrl) {
    if (!sku || !dataUrl) return;
    manualUploadsMap[sku] = dataUrl;
    try {
        localStorage.setItem('oneda_manual_images', JSON.stringify(manualUploadsMap));
    } catch (e) {}
    renderPresentationScreen();
}

function parseCurrency(str) {
    if (!str) return 0;
    const clean = str.toString().replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

function formatCurrency(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
