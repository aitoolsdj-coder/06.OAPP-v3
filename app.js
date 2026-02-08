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
    // Documentation
    linksList: document.getElementById('links-list'),
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
                if (type === 'order') res = await API.updateOrderStatus(id, newStatus);
                else res = await API.updateItemStatus(id, newStatus);

                if (res && res.ok) {
                    showToast('Status zaktualizowany w chmurze.');
                    // Optional silent sync to ensure consistency
                    // setTimeout(() => syncCurrentView(true), 1000); 
                } else {
                    throw new Error('API Error');
                }
            } catch (err) {
                console.error('[OAPP] Status Update Failed', err);
                showToast('Błąd aktualizacji statusu online. Zmiana zapisana lokalnie.');
                // In a real robust app, we'd queue this action. 
                // Here we stick to optimistic UI + local failover.
            }
        } else {
            showToast('Offline. Status zmieniony lokalnie.');
        }
    }
}

// Expose updateStatus globally for inline onclick handlers
window.updateStatus = updateStatus;
window.toggleForm = toggleForm;

// --- Documentation Rendering ---
function renderLinks() {
    const list = Elements.linksList;
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
        const res = await API.fetchOrders();
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
        const res = await API.fetchItems();
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
    const lastSyncOrders = Storage.getLastSyncOrders();
    const lastSyncItems = Storage.getLastSyncItems();

    if (now - lastSyncOrders > AppState.syncInterval) {
        syncOrders(true);
    }
    if (now - lastSyncItems > AppState.syncInterval) {
        syncItems(true);
    }
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
        document.getElementById(targetId).classList.add('active');

        AppState.currentView = targetId;

        // Trigger Sync if switching to data view
        if (targetId === 'view-orders') {
            const orders = Storage.getOrders();
            renderKanban(Elements.ordersBoard, orders, 'order');
            // Background sync logic if stale? Or just manual?
            // User requested: "Po wejściu w zakładkę: wykonaj sync tylko tej zakładki."
            // We'll do it if network available
            if (navigator.onLine) syncOrders(true);

        } else if (targetId === 'view-items') {
            const items = Storage.getItems();
            renderKanban(Elements.itemsBoard, items, 'item');
            if (navigator.onLine) syncItems(true);

        } else if (targetId === 'view-docs') {
            renderLinks();
        }
    });
});

// Refresh Buttons (Manual Sync)
document.getElementById('refresh-orders').addEventListener('click', () => {
    console.log('[OAPP] Manual Refresh: Orders');
    syncOrders(false);
});

document.getElementById('refresh-items').addEventListener('click', () => {
    console.log('[OAPP] Manual Refresh: Items');
    syncItems(false);
});

// Form Submissions
Elements.ordersForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    if (!data.co.trim()) return;

    // Create temp local object
    const newItem = {
        id: `local-${Date.now()}`,
        ...data,
        status: 'Nowe'
    };

    // Optimistically add to local storage
    const orders = Storage.getOrders();
    orders.unshift(newItem); // Add to top
    Storage.saveOrders(orders);
    renderKanban(Elements.ordersBoard, orders, 'order');

    e.target.reset();
    toggleForm('orders-form-container');

    if (navigator.onLine) {
        showToast('Wysyłanie...');
        try {
            await API.addOrder(data);
            showToast('Dodano pomyślnie.');
            syncOrders(true); // Refresh with server ID
        } catch (err) {
            console.error('[OAPP] Add Order Failed', err);
            showToast('Błąd wysyłania. Zapisano lokalnie.');
        }
    } else {
        showToast('Offline. Zapisano lokalnie.');
    }
});

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
            await API.addItem(data);
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


// Connectivity
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

/* --- Initialization --- */
function init() {
    console.log('[OAPP] Initializing...');

    // Load initial data from Storage
    const orders = Storage.getOrders();
    renderKanban(Elements.ordersBoard, orders, 'order');

    const items = Storage.getItems();
    renderKanban(Elements.itemsBoard, items, 'item');

    renderLinks();

    // Check for stale data / Auto-sync
    checkAutoSync();

    // Initial Sync if online
    if (navigator.onLine) {
        syncOrders(true);
        syncItems(true);
    }
}

// Run init when DOM ready
document.addEventListener('DOMContentLoaded', init);
