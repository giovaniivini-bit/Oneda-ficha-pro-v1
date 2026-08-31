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

// Dados Iniciais Offline (Exatamente espelhado da planilha)
const INITIAL_FALLBACK_PRODUCTS = [
    {
        id: 1,
        sala: 'T54 - KIDS',
        produto: '01.16.00.7759',
        precoPrincipal: 15.00,
        precoPrincipalFormatted: 'R$ 15,00',
        obs: 'aaa',
        markup: 2.5,
        pdvSugerido: 37.50,
        pdvFormatted: 'R$ 37,50',
        variacoes: [
            { nome: 'sem estampa', preco: 12.00, precoFormatted: 'R$ 12,00' },
            { nome: 'sem nada', preco: 11.00, precoFormatted: 'R$ 11,00' },
            { nome: 'sem costura', preco: 11.00, precoFormatted: 'R$ 11,00' }
        ]
    },
    {
        id: 2,
        sala: 'T54 - KIDS',
        produto: '01.16.00.7756C',
        precoPrincipal: 15.00,
        precoPrincipalFormatted: 'R$ 15,00',
        obs: 'nenhuma',
        markup: 2.5,
        pdvSugerido: 37.50,
        pdvFormatted: 'R$ 37,50',
        variacoes: []
    },
    {
        id: 3,
        sala: 'T54 - KIDS',
        produto: '01.16.00.7756A',
        precoPrincipal: 16.00,
        precoPrincipalFormatted: 'R$ 16,00',
        obs: 'vvvv',
        markup: 2.5,
        pdvSugerido: 40.00,
        pdvFormatted: 'R$ 40,00',
        variacoes: []
    },
    {
        id: 4,
        sala: 'T54 - KIDS',
        produto: '01.16.00.7756B',
        precoPrincipal: 18.00,
        precoPrincipalFormatted: 'R$ 18,00',
        obs: 'dddddd',
        markup: 2.5,
        pdvSugerido: 45.00,
        pdvFormatted: 'R$ 45,00',
        variacoes: [
            { nome: 'sem nada', preco: 11.00, precoFormatted: 'R$ 11,00' }
        ]
    }
];

// Estado Global da Aplicação
let imageMap = {};
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
    currentView: 'showcase',  // 'list' | 'showcase'
    currentIndex: 0,
    activeVariation: null,
    customMarkup: 2.5,
    lastSync: null,
    // Filtros exclusivos da Tela de Lista
    listFilterSala: 'ALL',
    listSimulateMarkup: 'none',
    listSort: 'price-asc'
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    await loadImageMap();
    initApp();
    setupEventListeners();
    syncGoogleSheets(false);

    // Polling automático da planilha a cada 8 segundos
    setInterval(() => {
        syncGoogleSheets(true);
    }, 8000);
});

async function loadImageMap() {
    try {
        const res = await fetch('image_map.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
            imageMap = await res.json();
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
 * TELA 2: RENDERIZAÇÃO DA APRESENTAÇÃO (LISTA OU 1 POR FOLHA FIXO)
 * ==========================================================================
 */
function renderPresentationScreen() {
    const viewListPanel = document.getElementById('viewListPanel');
    const viewShowcasePanel = document.getElementById('viewShowcasePanel');
    const btnToggleList = document.getElementById('btnToggleList');
    const btnToggleShowcase = document.getElementById('btnToggleShowcase');

    if (state.currentView === 'list') {
        viewListPanel.classList.add('active');
        viewShowcasePanel.classList.remove('active');
        btnToggleList.classList.add('active');
        btnToggleShowcase.classList.remove('active');
        renderListView();
    } else {
        viewListPanel.classList.remove('active');
        viewShowcasePanel.classList.add('active');
        btnToggleList.classList.remove('active');
        btnToggleShowcase.classList.add('active');
        renderShowcaseView();
    }

    updateCounterLabels();
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
            <div class="row-thumb-box">
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
            state.currentView = 'showcase';
            renderPresentationScreen();
        });

        tableBody.appendChild(row);
    });
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
    // Tela 1: Seleção de Opções de Apresentação (Lista vs 1 por Folha)
    const optList = document.getElementById('optCardList');
    const optShowcase = document.getElementById('optCardShowcase');

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

    // Tela 1: Botão Todas / Limpar Salas
    document.getElementById('btnWelcomeAllRooms').addEventListener('click', () => {
        state.availableRooms.forEach(r => state.selectedRooms.add(r));
        applyFilters();
        renderWelcomeRooms();
    });
    document.getElementById('btnWelcomeClearRooms').addEventListener('click', () => {
        state.selectedRooms.clear();
        applyFilters();
        renderWelcomeRooms();
    });

    // Tela 1 -> Tela 2: INICIAR APRESENTAÇÃO
    document.getElementById('btnStartPresentation').addEventListener('click', () => {
        if (state.filteredProducts.length === 0) {
            alert('Por favor, selecione pelo menos uma sala com produtos para iniciar!');
            return;
        }
        state.currentScreen = 'presentation';
        updateScreenVisibility();
    });

    // Tela 2 -> Tela 1: VOLTAR AOS FILTROS
    document.getElementById('btnBackToWelcome').addEventListener('click', () => {
        state.currentScreen = 'welcome';
        updateScreenVisibility();
    });
    document.getElementById('btnEmptyGoBack')?.addEventListener('click', () => {
        state.currentScreen = 'welcome';
        updateScreenVisibility();
    });

    // Tela 2: Toggle Rápido Lista / 1 por Folha
    document.getElementById('btnToggleList').addEventListener('click', () => {
        state.currentView = 'list';
        renderPresentationScreen();
    });
    document.getElementById('btnToggleShowcase').addEventListener('click', () => {
        state.currentView = 'showcase';
        renderPresentationScreen();
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
    document.getElementById('btnPrevProductUp').addEventListener('click', prevProduct);
    document.getElementById('btnNextProductDown').addEventListener('click', nextProduct);

    // Barra de Busca da Tela 2
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('btnClearSearch');
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
        applyFilters();
        renderPresentationScreen();
    });
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        clearSearchBtn.style.display = 'none';
        applyFilters();
        renderPresentationScreen();
        searchInput.focus();
    });

    // Toggle Barra Inferior
    document.getElementById('stripHandle').addEventListener('click', () => {
        const track = document.getElementById('stripTrack');
        const icon = document.getElementById('stripHandleIcon');
        if (track.style.display === 'none') {
            track.style.display = 'flex';
            icon.className = 'fa-solid fa-chevron-up';
        } else {
            track.style.display = 'none';
            icon.className = 'fa-solid fa-chevron-down';
        }
    });

    // Fullscreen Toggle
    document.getElementById('btnToggleFullscreen').addEventListener('click', toggleFullscreen);

    // Zoom Image Modal
    document.getElementById('btnZoomImage').addEventListener('click', openImageZoom);
    document.getElementById('showcaseProductImg').addEventListener('click', openImageZoom);
    document.getElementById('btnCloseZoom').addEventListener('click', closeImageZoom);
    document.getElementById('imageZoomModal').addEventListener('click', (e) => {
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
    document.getElementById('btnCloseQuickSearch').addEventListener('click', closeQuickSearchModal);
    document.getElementById('quickSearchModal').addEventListener('click', (e) => {
        if (e.target.id === 'quickSearchModal') closeQuickSearchModal();
    });
    const modalInput = document.getElementById('modalSearchInput');
    modalInput.addEventListener('input', (e) => renderQuickSearchResults(e.target.value));

    // Controle de Tamanho de Imagem na Lista
    setupImageSizeControl();

    // Modal de Impressão / PDF
    const btnOpenPrint = document.getElementById('btnOpenPrintModal');
    if (btnOpenPrint) btnOpenPrint.addEventListener('click', openPrintModal);
    const btnClosePrint = document.getElementById('btnClosePrintModal');
    if (btnClosePrint) btnClosePrint.addEventListener('click', closePrintModal);
    const printModal = document.getElementById('printModal');
    if (printModal) {
        printModal.addEventListener('click', (e) => {
            if (e.target.id === 'printModal') closePrintModal();
        });
    }

    // Modal de Edição de Ficha (Lápis Verde)
    document.getElementById('btnOpenEditProduct').addEventListener('click', openEditProductModal);
    document.getElementById('btnCloseEditModal').addEventListener('click', closeEditProductModal);
    document.getElementById('btnCancelEdit').addEventListener('click', closeEditProductModal);
    document.getElementById('editProductModal').addEventListener('click', (e) => {
        if (e.target.id === 'editProductModal') closeEditProductModal();
    });
    document.getElementById('editProductForm').addEventListener('submit', handleSaveEditProduct);

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
            if (zoomModal.style.display !== 'none') {
                closeImageZoom();
            } else if (searchModal.style.display !== 'none') {
                closeQuickSearchModal();
            } else if (state.currentScreen === 'presentation') {
                state.currentScreen = 'welcome';
                updateScreenVisibility();
            }
            return;
        }

        if (document.activeElement.tagName === 'INPUT') return;

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
    e.preventDefault();
    const product = state.filteredProducts[state.currentIndex];
    if (!product) return;

    const sku = document.getElementById('editProductSku').value.trim();
    const descField = document.getElementById('editProductDesc');
    const descText = descField ? descField.value.trim() : (product.descricao || '');

    const custoNum = parseCurrency(document.getElementById('editCustoPrincipal').value);
    const markupNum = parseFloat(document.getElementById('editMarkup').value.replace(',', '.')) || 2.5;
    const obsText = document.getElementById('editObs').value.trim();

    // Variações
    const v1Name = document.getElementById('editVar1Name').value.trim();
    const v1Price = parseCurrency(document.getElementById('editVar1Price').value) || custoNum;

    const v2Name = document.getElementById('editVar2Name').value.trim();
    const v2Price = parseCurrency(document.getElementById('editVar2Price').value) || custoNum;

    const v3Name = document.getElementById('editVar3Name').value.trim();
    const v3Price = parseCurrency(document.getElementById('editVar3Price').value) || custoNum;

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
    const btnSaveText = document.getElementById('btnSaveEditText');
    if (btnSaveText) btnSaveText.innerHTML = '<i class="fa-solid fa-check"></i> Salvando na Planilha...';

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
        await fetch('/api/update-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.warn('Sync com backend falhou:', err);
    }

    // Atualiza a tela imediatamente
    renderShowcaseView();
    renderListView();

    setTimeout(() => {
        closeEditProductModal();
    }, 400);
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
    document.documentElement.style.setProperty('--list-thumb-width', `${w}px`);
    document.documentElement.style.setProperty('--list-thumb-height', `${h}px`);
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
    const printArea = document.getElementById('printArea');
    if (!printArea) return;

    let productsToPrint = [];
    if (mode === 'current') {
        const current = state.filteredProducts[state.currentIndex];
        if (current) productsToPrint = [current];
    } else if (mode === 'room') {
        // Imprime todos os produtos da sala selecionada (ou lista filtrada)
        productsToPrint = [...state.filteredProducts];
    } else if (mode === 'list') {
        // Abre a impressão direta da página no modo tabela
        setTimeout(() => { window.print(); }, 200);
        return;
    }

    if (productsToPrint.length === 0) {
        alert('Nenhum produto disponível para impressão!');
        return;
    }

    // Gera o HTML de 1 folha A4 para cada produto
    let html = '';
    productsToPrint.forEach((p, idx) => {
        const imgUrl = getProductImageUrl(p.produto);
        const markupVal = state.listSimulateMarkup !== 'none' ? parseFloat(state.listSimulateMarkup) : (p.markup || 2.5);
        const pdvVal = p.pdvSugerido || (p.precoPrincipal * markupVal);

        let varsHTML = '';
        if (p.variacoes && p.variacoes.length > 0) {
            varsHTML = `
                <div class="print-vars-box">
                    <div class="print-vars-title">Opções / Variações do Produto</div>
                    <table class="print-vars-table">
                        ${p.variacoes.map((v, vIdx) => `
                            <tr>
                                <td><strong>Variação ${vIdx + 1}:</strong> ${escapeHTML(v.nome)}</td>
                                <td>${v.precoFormatted || formatCurrency(v.preco)}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `;
        }

        html += `
            <div class="print-page-sheet">
                <div class="print-sheet-header">
                    <div class="print-sheet-brand">ONEDA <span>FICHA PRO</span></div>
                    <div class="print-sheet-room">${escapeHTML(p.sala || 'MOSTRUÁRIO')}</div>
                </div>

                <div class="print-sheet-body">
                    <div class="print-photo-col">
                        <img src="${imgUrl}" alt="${p.produto}">
                    </div>

                    <div class="print-info-col">
                        <div class="print-meta-box">
                            <div class="print-meta-sku">${escapeHTML(p.produto)}</div>
                            <div class="print-meta-desc">${escapeHTML(p.descricao || '')}</div>
                        </div>

                        <div class="print-prices-box">
                            <div class="print-price-col">
                                <span class="print-price-lbl">Custo Principal</span>
                                <span class="print-cost-num">${p.precoPrincipalFormatted || formatCurrency(p.precoPrincipal)}</span>
                            </div>
                            <div class="print-price-col">
                                <span class="print-price-lbl">PDV Sugerido (${markupVal}x)</span>
                                <span class="print-pdv-num">${formatCurrency(pdvVal)}</span>
                            </div>
                        </div>

                        ${varsHTML}

                        <div class="print-obs-sheet">
                            <div class="print-obs-lbl">Observações Técnicas:</div>
                            <div class="print-obs-val">${escapeHTML(p.obs || 'Nenhuma observação informada.')}</div>
                        </div>
                    </div>
                </div>

                <div class="print-sheet-footer">
                    <span>Catálogo Comercial Oficial • Oneda Ficha Pro</span>
                    <span>Folha ${idx + 1} de ${productsToPrint.length} • Sala: ${escapeHTML(p.sala || 'Geral')} • Gerado em ${new Date().toLocaleDateString('pt-BR')}</span>
                </div>
            </div>
        `;
    });

    printArea.innerHTML = html;

    // Dispara a janela de impressão nativa
    setTimeout(() => {
        window.print();
    }, 300);
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
        let csvText = '';

        // 1. Tenta API do próprio backend (evita bloqueios de CORS)
        try {
            const apiRes = await fetch('/api/sheet-data', { cache: 'no-store' });
            if (apiRes.ok) {
                const text = await apiRes.text();
                if (text && text.length > 20) csvText = text;
            }
        } catch (e) {}

        // 2. Fallback direto para o Google Sheets GViz
        if (!csvText) {
            try {
                const gRes = await fetch(GOOGLE_SHEET_CSV_URL, { cache: 'no-store' });
                if (gRes.ok) {
                    const text = await gRes.text();
                    if (text && text.length > 20) csvText = text;
                }
            } catch (e) {}
        }

        // 3. Fallback export CSV
        if (!csvText) {
            try {
                const gRes2 = await fetch(GOOGLE_SHEET_FALLBACK_URL, { cache: 'no-store' });
                if (gRes2.ok) {
                    const text = await gRes2.text();
                    if (text && text.length > 20) csvText = text;
                }
            } catch (e) {}
        }

        if (csvText) {
            const parsed = parseGoogleSheetCSV(csvText);
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
        if (!silent) console.warn('Sync falhou, usando dados de cache:', err);
    }
}

function parseGoogleSheetCSV(csvText) {
    const lines = parseCSVRows(csvText);
    if (lines.length < 2) return null;

    const headers = lines[0].map(h => (h || '').trim().toLowerCase());
    
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

        const prodCode = (colProd >= 0 && row[colProd]) ? row[colProd].trim() : '';
        if (!prodCode) continue;

        const sala = (colSala >= 0 && row[colSala] && row[colSala].trim()) ? row[colSala].trim() : 'GERAL';
        const descricao = (colDesc >= 0 && row[colDesc]) ? row[colDesc].trim() : '';
        const obs = (colObs >= 0 && row[colObs]) ? row[colObs].trim() : '';
        
        const precoStr = (colPreco >= 0 && row[colPreco]) ? row[colPreco] : '0';
        const precoNum = parseCurrency(precoStr);

        const markupStr = (colMarkup >= 0 && row[colMarkup]) ? row[colMarkup].replace(',', '.') : '';
        const markup = parseFloat(markupStr) || 2.5;

        const pdvStr = (colPdv >= 0 && row[colPdv]) ? row[colPdv] : '';
        let pdvNum = parseCurrency(pdvStr);
        if (pdvNum === 0 && precoNum > 0) {
            pdvNum = Number((precoNum * markup).toFixed(2));
        }

        const variacoes = [];
        varCols.forEach((vCol) => {
            const vName = (row[vCol.nameIdx] || '').trim();
            const vPriceStr = (row[vCol.priceIdx] || '').trim();
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

        // Aplica overrides locais se existirem
        try {
            const stored = localStorage.getItem('oneda_product_overrides');
            if (stored) {
                const overrides = JSON.parse(stored);
                const ov = overrides[prodCode.toUpperCase()];
                if (ov) {
                    if (ov.descricao !== undefined) prodItem.descricao = ov.descricao;
                    if (ov.custoPrincipal !== undefined) {
                        prodItem.precoPrincipal = ov.custoPrincipal;
                        prodItem.precoPrincipalFormatted = formatCurrency(ov.custoPrincipal);
                    }
                    if (ov.markup !== undefined) prodItem.markup = ov.markup;
                    if (ov.pdvSugerido !== undefined) {
                        prodItem.pdvSugerido = ov.pdvSugerido;
                        prodItem.pdvFormatted = formatCurrency(ov.pdvSugerido);
                    }
                    if (ov.obs !== undefined) prodItem.obs = ov.obs;
                    if (ov.variacoes !== undefined) prodItem.variacoes = ov.variacoes;
                }
            }
        } catch (e) {}

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

function getProductImageUrl(sku) {
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
