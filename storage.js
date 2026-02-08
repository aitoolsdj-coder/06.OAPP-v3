/**
 * OAPP v3 - Storage Module
 * Handles specific localStorage operations and data persistence.
 */

const STORAGE_KEYS = {
    ORDERS: 'oapp_orders_data',
    ITEMS: 'oapp_items_data',
    LINKS: 'oapp_links_data',
    LAST_SYNC_ORDERS: 'oapp_last_sync_orders',
    LAST_SYNC_ITEMS: 'oapp_last_sync_items',
    LAST_SYNC_ITEMS: 'oapp_last_sync_items',
    NOTEBOOKS: 'oapp_notebooks_data', // Replaces CHAT_LINK
    USER_NAME: 'oapp_user_name',
    THEME: 'oapp_theme_settings' // Reserved for future use
};

const Storage = {
    // --- Generic Getters/Setters ---
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('[OAPP] Storage Read Error:', e);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('[OAPP] Storage Write Error:', e);
            return false;
        }
    },

    // --- Specific Data Handlers ---

    // Zapotrzebowania (Orders)
    getOrders() {
        return this.get(STORAGE_KEYS.ORDERS, []);
    },

    saveOrders(orders) {
        return this.set(STORAGE_KEYS.ORDERS, orders);
    },

    getLastSyncOrders() {
        return this.get(STORAGE_KEYS.LAST_SYNC_ORDERS, 0);
    },

    setLastSyncOrders(timestamp) {
        return this.set(STORAGE_KEYS.LAST_SYNC_ORDERS, timestamp);
    },

    // Pytania (Items/Questions)
    getItems() {
        return this.get(STORAGE_KEYS.ITEMS, []);
    },

    saveItems(items) {
        return this.set(STORAGE_KEYS.ITEMS, items);
    },

    getLastSyncItems() {
        return this.get(STORAGE_KEYS.LAST_SYNC_ITEMS, 0);
    },

    setLastSyncItems(timestamp) {
        return this.set(STORAGE_KEYS.LAST_SYNC_ITEMS, timestamp);
    },

    // Dokumentacja Links
    getLinks() {
        return this.get(STORAGE_KEYS.LINKS, []);
    },

    saveLinks(links) {
        return this.set(STORAGE_KEYS.LINKS, links);
    },

    addLink(title, url) {
        const links = this.getLinks();
        links.push({ id: Date.now(), title, url });
        this.saveLinks(links);
    },

    removeLink(id) {
        const links = this.getLinks();
        const newLinks = links.filter(link => link.id !== id);
        this.saveLinks(newLinks);
    },

    // --- Notebooks (Chat AI) ---
    getNotebooks() {
        // Migration check: if old single link exists but no notebooks, convert it
        let notebooks = this.get(STORAGE_KEYS.NOTEBOOKS, []);
        if (notebooks.length === 0) {
            const oldLink = this.get('oapp_chat_link');
            if (oldLink) {
                notebooks.push({ id: Date.now(), title: 'Mój Notebook', url: oldLink });
                this.saveNotebooks(notebooks);
                localStorage.removeItem('oapp_chat_link'); // Cleanup
            }
        }
        return notebooks;
    },

    saveNotebooks(notebooks) {
        return this.set(STORAGE_KEYS.NOTEBOOKS, notebooks);
    },

    addNotebook(title, url) {
        const list = this.getNotebooks();
        list.push({ id: Date.now(), title, url });
        this.saveNotebooks(list);
    },

    removeNotebook(id) {
        const list = this.getNotebooks();
        const newList = list.filter(n => n.id !== id);
        this.saveNotebooks(newList);
    },

    // --- User Settings ---
    getUserName() {
        return this.get(STORAGE_KEYS.USER_NAME, '');
    },

    saveUserName(name) {
        return this.set(STORAGE_KEYS.USER_NAME, name);
    },

    // --- Utility ---
    // Clears all OAPP related data (useful for hard reset)
    clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    }
};
