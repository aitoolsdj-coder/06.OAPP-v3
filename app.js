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
    ordersBoard: document.getElementById('orders-board'),
    itemsBoard: document.getElementById('items-board'),
    refreshButtons: document.querySelectorAll('.refresh-btn'),
    // Forms
    ordersForm: document.getElementById('orders-form'),
    itemsForm: document.getElementById('items-form'),
    // Settings & Chat
    linksList: document.getElementById('links-list'),
    chatLinkInput: document.getElementById('chat-link-input'),
    userNameInput: document.getElementById('user-name-input'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    openChatBtn: document.getElementById('open-chat-btn')
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
    container.classList.toggle('hidden');

    // Auto-fill Author when opening form
    if (!container.classList.contains('hidden')) {
        const userName = Storage.getUserName();
        if (userName) {
            const form = container.querySelector('form');
            if (form && form.elements.autor && !form.elements.autor.value) {
                form.elements.autor.value = userName;
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

// --- Documentation Rendering ---
function renderLinks() {
    const list = Elements.linksList;
    if (!list) return;
    list.innerHTML = '';
    const links = Storage.getLinks();

    links.forEach(link => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="${link.url}" target="_blank">${link.title}</a>
            <button onclick="removeLink(${link.id})" style="border:none;background:none;color:#999;cursor:pointer;">✕</button>
        `;
        list.appendChild(li);
    });
}

function addNewLink() {
    const title = prompt('Nazwa linku:');
    if (!title) return;
    const url = prompt('URL linku:');
    if (!url) return;

    Storage.addLink(title, url);
    renderLinks();
}

function removeLink(id) {
    if (confirm('Usunąć link?')) {
        Storage.removeLink(id);
        renderLinks();
    }
}

window.addNewLink = addNewLink;
window.removeLink = removeLink;


/* --- Synchronization --- */

async function syncOrders(silent = false) {
    if (!navigator.onLine) {
        if (!silent) showToast('Brak sieci. Pokazuję dane lokalne.');
        return;
    }

    if (!silent) showToast('Odświeżanie zapotrzebowań...');
    try {
        const res = await window.API.fetchOrders();
        console.log('[OAPP] Sync Orders:', res);

        if (res && res.ok && Array.isArray(res.items)) {
            // Filter out empty items
            const cleanItems = res.items.filter(i => i.co && i.co.trim().length > 0);

            Storage.saveOrders(cleanItems);
            Storage.setLastSyncOrders(Date.now());
            renderKanban(Elements.ordersBoard, cleanItems, 'order');
            if (!silent) showToast('Zapotrzebowania zaktualizowane.');
        } else {
            console.warn('[OAPP] Invalid format for orders', res);
            if (!silent) showToast('Błąd formatu danych.');
        }
    } catch (err) {
        console.error('[OAPP] Sync Orders Error', err);
        if (!silent) showToast('1. Błąd synchronizacji.');
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
        console.log('[OAPP] Sync Items:', res);

        if (res && res.ok && Array.isArray(res.items)) {
            // Filter out empty items
            const cleanItems = res.items.filter(i => i.opis && i.opis.trim().length > 0);

            Storage.saveItems(cleanItems);
            Storage.setLastSyncItems(Date.now());
            renderKanban(Elements.itemsBoard, cleanItems, 'item');
            if (!silent) showToast('Pytania zaktualizowane.');
        } else {
            console.warn('[OAPP] Invalid format for items', res);
            if (!silent) showToast('Błąd formatu danych.');
        }
    } catch (err) {
        console.error('[OAPP] Sync Items Error', err);
        if (!silent) showToast('2. Błąd synchronizacji.');
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
    const lastSyncOrders = Storage.getLastSyncOrders();
    const lastSyncItems = Storage.getLastSyncItems();

    if (now - lastSyncOrders > AppState.syncInterval) {
        syncOrders(true);
    }
    if (now - lastSyncItems > AppState.syncInterval) {
        syncItems(true);
    }
}

/* --- Settings Logic --- */
function initSettings() {
    // Load saved settings
    if (Elements.chatLinkInput) Elements.chatLinkInput.value = Storage.getChatLink();
    if (Elements.userNameInput) Elements.userNameInput.value = Storage.getUserName();
    renderLinks(); // Now in settings view
}

if (Elements.saveSettingsBtn) {
    Elements.saveSettingsBtn.addEventListener('click', () => {
        const rawLink = Elements.chatLinkInput.value.trim();
        const userName = Elements.userNameInput.value.trim();
        let success = true;

        if (rawLink) {
            if (!rawLink.startsWith('http')) {
                showToast('Link do Chat AI musi startować od http.');
                success = false;
            } else {
                Storage.saveChatLink(rawLink);
            }
        }

        Storage.saveUserName(userName); // Save even if empty

        if (success) showToast('Ustawienia zapisane.');
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

if (Elements.openChatBtn) {
    Elements.openChatBtn.addEventListener('click', () => {
        const link = Storage.getChatLink();
        if (link) {
            window.open(link, '_blank');
        } else {
            showToast('Skonfiguruj link w zakładce Ustawienia.');
        }
    });
}

/* --- Event Listeners --- */

// Navigation
Elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Switch Active Class
        Elements.navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Switch View
        Elements.views.forEach(v => v.classList.remove('active'));
        const targetId = btn.dataset.target;
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');

        AppState.currentView = targetId;

        // View Specific Logic
        if (targetId === 'view-orders') {
            const orders = Storage.getOrders();
            renderKanban(Elements.ordersBoard, orders, 'order');
            if (navigator.onLine) syncOrders(true);

        } else if (targetId === 'view-items') {
            const items = Storage.getItems();
            renderKanban(Elements.itemsBoard, items, 'item');
            if (navigator.onLine) syncItems(true);

        } else if (targetId === 'view-settings') {
            initSettings();
        }
        // view-chat and view-docs are static or simple
    });
});

// Refresh Buttons
const refreshOrdersBtn = document.getElementById('refresh-orders');
if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener('click', () => syncOrders(false));
}

const refreshItemsBtn = document.getElementById('refresh-items');
if (refreshItemsBtn) {
    refreshItemsBtn.addEventListener('click', () => syncItems(false));
}

// Form Submissions
if (Elements.ordersForm) {
    Elements.ordersForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        if (!data.co.trim()) return;

        const newItem = {
            id: `local-${Date.now()}`,
            ...data,
            status: 'Nowe'
        };

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
                console.error('[OAPP] Add Order Failed', err);
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

        const newItem = {
            id: `local-${Date.now()}`,
            ...data,
            status: 'Nowe'
        };

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
                console.error('[OAPP] Add Item Failed', err);
                showToast('Błąd wysyłania. Zapisano lokalnie.');
            }
        } else {
            showToast('Offline. Zapisano lokalnie.');
        }
    });
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

/* --- Initialization --- */
function init() {
    console.log('[OAPP] Initializing...');

    // Load initial data
    const orders = Storage.getOrders();
    renderKanban(Elements.ordersBoard, orders, 'order');

    const items = Storage.getItems();
    renderKanban(Elements.itemsBoard, items, 'item');

    // Check auto-sync
    checkAutoSync();

    if (navigator.onLine) {
        syncOrders(true);
        syncItems(true);
    }
}

document.addEventListener('DOMContentLoaded', init);
