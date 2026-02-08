/**
 * OAPP v3 - API Module
 * Handles interactions with n8n backend.
 */

const BASE_URL = 'https://jakubdworak.app.n8n.cloud/webhook';
const TIMEOUT_MS = 12000; // 12 seconds

window.API = {
    endpoints: {
        orders: {
            list: `${BASE_URL}/oapp/zapotrzebowania/list`,
            add: `${BASE_URL}/oapp/zapotrzebowania/add`,
            status: `${BASE_URL}/oapp/zapotrzebowania/status`
        },
        items: {
            list: `${BASE_URL}/oapp/pytania/list`,
            add: `${BASE_URL}/oapp/pytania/add`,
            status: `${BASE_URL}/oapp/pytania/status`
        }
    },

    /**
     * Generic fetch wrapper with timeout
     */
    async request(url, method = 'GET', body = null) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            clearTimeout(id);

            if (!response.ok) {
                if (response.status === 404) throw new Error('Endpoint not found (404)');
                if (response.status === 500) throw new Error('Server Error (500)');
                throw new Error(`HTTP Error ${response.status}`);
            }

            try {
                return await response.json();
            } catch (jsonError) {
                // If response is not JSON (e.g. simple "OK" text)
                const text = await response.text();
                return { ok: true, message: text };
            }
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                throw new Error(`Timeout (${TIMEOUT_MS}ms)`);
            }
            throw error;
        }
    },

    // --- Zapotrzebowania Methods ---
    async fetchOrders() {
        return this.request(this.endpoints.orders.list);
    },

    async addOrder(data) {
        return this.request(this.endpoints.orders.add, 'POST', data);
    },

    async updateOrderStatus(id, status) {
        return this.request(this.endpoints.orders.status, 'POST', { id, status });
    },

    // --- Pytania Methods ---
    async fetchItems() {
        return this.request(this.endpoints.items.list);
    },

    async addItem(data) {
        return this.request(this.endpoints.items.add, 'POST', data);
    },

    async updateItemStatus(id, status) {
        return this.request(this.endpoints.items.status, 'POST', { id, status });
    }
};

// Backward compatibility for cached app.js versions
var API = window.API;
