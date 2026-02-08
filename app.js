/**
 * OAPP v3 - Main Application Logic
 */

/* --- State & Config --- */
const AppState = {
    currentView: 'view-orders', // Default
    syncInterval: 86400000,     // 24 hours in ms
    isOffline: !navigator.onLine
};

/* --- DOM Elements --- */
const Elements = {
    views: document.querySelectorAll('.view'),
    navButtons: document.querySelectorAll('.nav-btn'),

    // Boards
    ordersBoard: document.getElementById('orders-board'),
    itemsBoard: document.getElementById('items-board'),

    // Forms
    ordersForm: document.getElementById('orders-form'),
    itemsForm: document.getElementById('items-form'),

    // Settings Elements
    userNameInput: document.getElementById('user-name-input'),
    saveUserBtn: document.getElementById('save-user-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),

    // Lists
    linksList: document.getElementById('links-list'),
    notebooksListSettings: document.getElementById('settings-notebooks-list'),
    notebooksListDisplay: document.getElementById('notebooks-list-display'),
    notebooksEmptyHint: document.getElementById('notebooks-empty-hint')
};

/* --- UI Utilities --- */
function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function toggleForm(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.classList.toggle('hidden');

    // Auto-fill Author when opening form
    if (!container.classList.contains('hidden')) {
        const userName = Storage.getUserName();
        if (userName) {
            // Find input by name="autor" or class="input-autor"
            const form = container.querySelector('form');
            if (form) {
                const autorInput = form.querySelector('[name="autor"]') || form.querySelector('.input-autor');
                if (autorInput && !autorInput.value) {
                    autorInput.value = userName;
                }
            }
        }
    }
}

function updateConnectionStatus() {
    AppState.isOffline = !navigator.onLine;
    if (AppState.isOffline) {
        showToast('Brak sieci. Tryb offline.', 4000);
        document.body.classList.add('offline-mode');
    } else {
        showToast('Online. Przywrócono połączenie.', 4000);
        document.body.classList.remove('offline-mode');
        // Try to sync current view when back online
        syncCurrentView();
    }
}

/* --- Rendering --- */

// --- Kanban Board Render (Generic) ---
function renderKanban(container, items, type) {
    if (!container) return;
    container.innerHTML = '';
    const statuses = ['Nowe', 'W toku', 'Zrealizowane'];

    statuses.forEach(status => {
        const column = document.createElement('div');
        column.className = 'kanban-column';
        column.dataset.status = status;

        const header = document.createElement('h3');
        header.textContent = status;
        column.appendChild(header);

        const statusItems = items.filter(item => item.status === status);

        statusItems.forEach(item => {
            const card = createCard(item, type);
            column.appendChild(card);
        });

        container.appendChild(column);
    });
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;

    // Determine content based on type
    let titleHtml = '';
    let metaHtml = '';
    let extraHtml = '';

    if (type === 'order') {
        titleHtml = `<span class="card-title">${item.co} (${item.ilosc})</span>`;
        metaHtml = `
            ${item.producent ? `Prod: ${item.producent}` : ''} 
            ${item.autor ? `| Autor: ${item.autor}` : ''}
        `;
    } else if (type === 'item') {
        const priorityClass = `priority-${item.priorytet || 'Średni'}`;
        titleHtml = `
            <span class="card-title">${item.opis}</span>
            <span class="priority-badge ${priorityClass}">${item.priorytet || 'Średni'}</span>
        `;
        metaHtml = `
            ${item.termin_odpowiedzi ? `Termin: ${item.termin_odpowiedzi}` : ''}
            ${item.autor ? `| Autor: ${item.autor}` : ''}
        `;
        if (item.odpowiedz) {
            extraHtml = `<div class="card-answer"><strong>Odp:</strong> ${item.odpowiedz}</div>`;
        }
    }

    // Status Actions
    const actionsHtml = `
        <div class="status-actions">
            <button class="status-btn" onclick="updateStatus('${type}', '${item.id}', 'Nowe')" title="Na nowe">N</button>
            <button class="status-btn" onclick="updateStatus('${type}', '${item.id}', 'W toku')" title="W toku">W</button>
            <button class="status-btn" onclick="updateStatus('${type}', '${item.id}', 'Zrealizowane')" title="Zrealizowane">Z</button>
        </div>
    `;

    card.innerHTML = `
        <div class="card-header">
            <div class="card-title-area">${titleHtml}</div>
            ${actionsHtml}
        </div>
        <div class="card-meta">${metaHtml}</div>
        ${extraHtml}
    `;

    return card;
}

// --- Status Updates ---
async function updateStatus(type, id, newStatus) {
    console.log(`[OAPP] Updating ${type} ${id} to ${newStatus}`);

    // Optimistic Update
    let currentItems = type === 'order' ? Storage.getOrders() : Storage.getItems();
    const itemIndex = currentItems.findIndex(i => i.id === id);

    if (itemIndex > -1) {
        if (currentItems[itemIndex].status === newStatus) return; // No change

        const oldStatus = currentItems[itemIndex].status;
        currentItems[itemIndex].status = newStatus;

        // Save locally immediately
        if (type === 'order') Storage.saveOrders(currentItems);
        else Storage.saveItems(currentItems);

        // Re-render immediately
        if (type === 'order') renderKanban(Elements.ordersBoard, currentItems, 'order');
        else renderKanban(Elements.itemsBoard, currentItems, 'item');

        // Check for local ID
        if (String(id).startsWith('local-')) {
            showToast('Element lokalny - status zaktualizowany tylko lokalnie.');
            return;
        }

        // Sync with Backend
        if (navigator.onLine) {
            try {
                let res;
                if (type === 'order') res = await window.API.updateOrderStatus(id, newStatus);
                else res = await window.API.updateItemStatus(id, newStatus);

                if (res && res.ok) {
                    showToast('Status zaktualizowany w chmurze.');
                } else {
                    throw new Error('API Error');
                }
            } catch (err) {
                console.error('[OAPP] Status Update Failed', err);
                showToast('Błąd aktualizacji statusu online. Zmiana zapisana lokalnie.');
            }
        } else {
            showToast('Offline. Status zmieniony lokalnie.');
        }
    }
}

window.updateStatus = updateStatus;
window.toggleForm = toggleForm;

// --- Links & Notebooks Rendering ---

function renderLinks() {
    const list = Elements.linksList;
    if (!list) return; // Guard
    list.innerHTML = '';
    const links = Storage.getLinks();

    links.forEach(link => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="${link.url}" target="_blank">${link.title}</a>
            <button onclick="removeLink(${link.id})" title="Usuń">✕</button>
        `;
        list.appendChild(li);
    });
}

function renderNotebooks() {
    // 1. Settings List
    const settingsList = Elements.notebooksListSettings;
    if (settingsList) {
        settingsList.innerHTML = '';
        const notebooks = Storage.getNotebooks();
        notebooks.forEach(nb => {
            const li = document.createElement('li');
            li.innerHTML = `
                <a href="${nb.url}" target="_blank">${nb.title}</a>
                <button onclick="removeNotebook(${nb.id})" title="Usuń">✕</button>
            `;
            settingsList.appendChild(li);
        });
    }

    // 2. Chat View Grid
    const displayGrid = Elements.notebooksListDisplay;
    const emptyHint = Elements.notebooksEmptyHint;

    if (displayGrid) {
        displayGrid.innerHTML = '';
        const notebooks = Storage.getNotebooks();

        if (notebooks.length === 0) {
            if (emptyHint) emptyHint.style.display = 'block';
        } else {
            if (emptyHint) emptyHint.style.display = 'none';
            notebooks.forEach(nb => {
                const a = document.createElement('a');
                a.className = 'notebook-card';
                a.href = nb.url;
                a.target = '_blank';
                a.innerHTML = `
                    <div class="notebook-icon">🤖</div>
                    <div class="notebook-title">${nb.title}</div>
                `;
                displayGrid.appendChild(a);
            });
        }
    }
}

// Global functions for inline onclicks
window.addNewLink = function () {
    const title = prompt('Nazwa linku:');
    if (!title) return;
    const url = prompt('URL linku:');
    if (!url) return;

    Storage.addLink(title, url);
    renderLinks();
};

window.removeLink = function (id) {
    if (confirm('Usunąć link?')) {
        Storage.removeLink(id);
        renderLinks();
    }
};

window.addNewNotebook = function () {
    const title = prompt('Nazwa Notebooka:');
    if (!title) return;
    const url = prompt('Link do Notebooka (Share URL):');
    if (!url) return;

    Storage.addNotebook(title, url);
    renderNotebooks();
};

window.removeNotebook = function (id) {
    if (confirm('Usunąć Notebook?')) {
        Storage.removeNotebook(id);
        renderNotebooks();
    }
};


/* --- Synchronization --- */
async function syncOrders(silent = false) {
    if (!navigator.onLine) {
        if (!silent) showToast('Brak sieci. Pokazuję dane lokalne.');
        return;
    }
    if (!silent) showToast('Odświeżanie zapotrzebowań...');
    try {
        const res = await window.API.fetchOrders();
        // console.log('[OAPP] Sync Orders:', res);
        if (res && res.ok && Array.isArray(res.items)) {
            const cleanItems = res.items.filter(i => i.co && i.co.trim().length > 0);
            Storage.saveOrders(cleanItems);
            Storage.setLastSyncOrders(Date.now());
            renderKanban(Elements.ordersBoard, cleanItems, 'order');
            if (!silent) showToast('Zapotrzebowania zaktualizowane.');
        } else {
            if (!silent) showToast('Błąd formatu danych.');
        }
    } catch (err) {
        console.error(err);
        if (!silent) showToast('Błąd synchronizacji.');
    }
}

async function syncItems(silent = false) {
    if (!navigator.onLine) {
        if (!silent) showToast('Brak sieci. Pokazuję dane lokalne.');
        return;
    }
    if (!silent) showToast('Odświeżanie pytań...');
    try {
        const res = await window.API.fetchItems();
        // console.log('[OAPP] Sync Items:', res);
        if (res && res.ok && Array.isArray(res.items)) {
            const cleanItems = res.items.filter(i => i.opis && i.opis.trim().length > 0);
            Storage.saveItems(cleanItems);
            Storage.setLastSyncItems(Date.now());
            renderKanban(Elements.itemsBoard, cleanItems, 'item');
            if (!silent) showToast('Pytania zaktualizowane.');
        } else {
            if (!silent) showToast('Błąd formatu danych.');
        }
    } catch (err) {
        console.error(err);
        if (!silent) showToast('Błąd synchronizacji.');
    }
}

function syncCurrentView(silent = false) {
    if (AppState.currentView === 'view-orders') {
        syncOrders(silent);
    } else if (AppState.currentView === 'view-items') {
        syncItems(silent);
    }
}

function checkAutoSync() {
    const now = Date.now();
    if (now - Storage.getLastSyncOrders() > AppState.syncInterval) syncOrders(true);
    if (now - Storage.getLastSyncItems() > AppState.syncInterval) syncItems(true);
}

/* --- Settings Init --- */
function initSettings() {
    if (Elements.userNameInput) Elements.userNameInput.value = Storage.getUserName();
    renderLinks();
    renderNotebooks();
}

/* --- Event Listeners --- */

// 1. Navigation
Elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Toggle Active
        Elements.navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle View
        Elements.views.forEach(v => v.classList.remove('active'));
        const targetId = btn.dataset.target;
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');

        AppState.currentView = targetId;

        // View Logic
        if (targetId === 'view-orders') {
            const orders = Storage.getOrders();
            renderKanban(Elements.ordersBoard, orders, 'order');
            if (navigator.onLine) syncOrders(true);

        } else if (targetId === 'view-items') {
            const items = Storage.getItems();
            renderKanban(Elements.itemsBoard, items, 'item');
            if (navigator.onLine) syncItems(true);

        } else if (targetId === 'view-chat') {
            renderNotebooks();

        } else if (targetId === 'view-settings') {
            initSettings();
        }
    });
});

// 2. Settings Actions
if (Elements.saveUserBtn) {
    Elements.saveUserBtn.addEventListener('click', () => {
        const userName = Elements.userNameInput.value.trim();
        Storage.saveUserName(userName);
        showToast('Podpis zapisany!');
    });
}

if (Elements.testConnectionBtn) {
    Elements.testConnectionBtn.addEventListener('click', async () => {
        showToast('Testowanie połączenia...');
        try {
            const res = await window.API.fetchItems();
            if (res && res.ok) {
                showToast('✅ Połączenie OK!');
            } else {
                showToast('⚠️ Połączenie: Otrzymano błąd.');
            }
        } catch (err) {
            console.error(err);
            showToast('❌ Błąd połączenia.');
        }
    });
}

// 3. Refresh Buttons
const refreshOrdersBtn = document.getElementById('refresh-orders');
if (refreshOrdersBtn) refreshOrdersBtn.addEventListener('click', () => syncOrders(false));

const refreshItemsBtn = document.getElementById('refresh-items');
if (refreshItemsBtn) refreshItemsBtn.addEventListener('click', () => syncItems(false));

// 4. Forms
if (Elements.ordersForm) {
    Elements.ordersForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        if (!data.co.trim()) return;

        const newItem = { id: `local-${Date.now()}`, ...data, status: 'Nowe' };

        const orders = Storage.getOrders();
        orders.unshift(newItem);
        Storage.saveOrders(orders);
        renderKanban(Elements.ordersBoard, orders, 'order');

        e.target.reset();
        toggleForm('orders-form-container');

        if (navigator.onLine) {
            showToast('Wysyłanie...');
            try {
                await window.API.addOrder(data);
                showToast('Dodano pomyślnie.');
                syncOrders(true);
            } catch (err) {
                showToast('Błąd wysyłania. Zapisano lokalnie.');
            }
        } else {
            showToast('Offline. Zapisano lokalnie.');
        }
    });
}

if (Elements.itemsForm) {
    Elements.itemsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        if (!data.opis.trim()) return;

        const newItem = { id: `local-${Date.now()}`, ...data, status: 'Nowe' };

        const items = Storage.getItems();
        items.unshift(newItem);
        Storage.saveItems(items);
        renderKanban(Elements.itemsBoard, items, 'item');

        e.target.reset();
        toggleForm('items-form-container');

        if (navigator.onLine) {
            showToast('Wysyłanie...');
            try {
                await window.API.addItem(data);
                showToast('Dodano pomyślnie.');
                syncItems(true);
            } catch (err) {
                showToast('Błąd wysyłania. Zapisano lokalnie.');
            }
        } else {
            showToast('Offline. Zapisano lokalnie.');
        }
    });
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

/* --- Init --- */
function init() {
    console.log('[OAPP] Initializing...');

    // Render initial
    renderKanban(Elements.ordersBoard, Storage.getOrders(), 'order');
    renderKanban(Elements.itemsBoard, Storage.getItems(), 'item');
    renderNotebooks(); // For Chat view if starting there, though usually starts at orders

    checkAutoSync();

    if (navigator.onLine) {
        syncOrders(true);
        syncItems(true);
    }
}

document.addEventListener('DOMContentLoaded', init);
