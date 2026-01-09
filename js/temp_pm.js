
/**
 * Class for managing named project items (snapshots of inputs).
 * Allows users to save, load, and delete multiple named configurations.
 */
class ProjectManager {
    /**
     * @param {object} config - Configuration object
     * @param {string} config.storageKey - LocalStorage key (e.g., 'steel-project-items')
     * @param {string} config.containerId - DOM ID of the container to render the manager UI
     * @param {string[]} config.inputIds - Array of input IDs to save
     * @param {function} config.onLoadItem - Callback function(inputs) when an item is loaded
     */
    constructor(config) {
        this.storageKey = config.storageKey;
        this.containerId = config.containerId;
        this.inputIds = config.inputIds;
        this.onLoadItem = config.onLoadItem;
        
        this.items = this.loadItemsFromStorage();
        this.render();
    }

    loadItemsFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        } catch (e) {
            console.error('Failed to load project items', e);
            return {};
        }
    }

    saveCurrentAs(name) {
        if (!name) return;
        const inputs = gatherInputsFromIds(this.inputIds);
        this.items[name] = {
            timestamp: new Date().toISOString(),
            inputs: inputs
        };
        this.persist();
        this.render();
        if (typeof showFeedback === 'function') showFeedback(`Saved item: ${name}`, false);
    }

    deleteItem(name) {
        if (this.items[name]) {
            delete this.items[name];
            this.persist();
            this.render();
        }
    }

    loadItem(name) {
        const item = this.items[name];
        if (item && item.inputs) {
            if (this.onLoadItem) this.onLoadItem(item.inputs);
            if (typeof showFeedback === 'function') showFeedback(`Loaded item: ${name}`, false);
        }
    }

    persist() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        
        const header = document.createElement('h3');
        header.className = 'text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200';
        header.textContent = 'Project Items';
        
        const list = document.createElement('div');
        list.className = 'space-y-2 max-h-60 overflow-y-auto pr-1';

        if (Object.keys(this.items).length === 0) {
            list.innerHTML = '<p class="text-gray-500 italic text-sm">No saved items.</p>';
        } else {
            Object.entries(this.items).forEach(([name, data]) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded border dark:border-gray-600 shadow-sm';
                
                const label = document.createElement('div');
                label.className = 'flex flex-col';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'font-medium text-sm text-gray-800 dark:text-gray-200';
                nameSpan.textContent = name;
                
                const dateSpan = document.createElement('span');
                dateSpan.className = 'text-xs text-gray-500';
                // Format timestamp nicely
                const date = new Date(data.timestamp);
                dateSpan.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                label.append(nameSpan, dateSpan);
                
                const actions = document.createElement('div');
                actions.className = 'flex gap-2';

                const loadBtn = document.createElement('button');
                loadBtn.textContent = 'Load';
                loadBtn.className = 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-gray-600';
                loadBtn.onclick = () => this.loadItem(name);

                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.className = 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50 dark:border-red-800 dark:hover:bg-gray-600';
                delBtn.onclick = () => {
                    if(confirm(`Delete "${name}"?`)) this.deleteItem(name);
                };

                actions.append(loadBtn, delBtn);
                itemEl.append(label, actions);
                list.appendChild(itemEl);
            });
        }
        
        // Add "Save New" UI
        const saveRow = document.createElement('div');
        saveRow.className = 'mt-4 pt-4 border-t dark:border-gray-600 flex gap-2';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Item Name (e.g. Beam B1)';
        input.className = 'border rounded px-2 py-1 text-sm flex-grow dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
        input.onkeydown = (e) => { if (e.key === 'Enter') saveBtn.click(); };
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save New';
        saveBtn.className = 'bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 shadow-sm transition-colors whitespace-nowrap';
        saveBtn.onclick = () => {
            const val = input.value.trim();
            if(val) {
                if (this.items[val] && !confirm(`Overwrite existing item "${val}"?`)) return;
                this.saveCurrentAs(val);
                input.value = '';
            } else {
                if (typeof showFeedback === 'function') showFeedback('Please enter a name.', true);
            }
        };

        saveRow.append(input, saveBtn);
        container.append(header, list, saveRow);
    }
}
