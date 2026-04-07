console.log('Popup script loaded.');

// ── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(text, type = 'info') {
    const el = document.getElementById('status');
    el.textContent = text;
    el.className = `card ${type}`;
    el.style.display = text ? '' : 'none';
}

function setImportStatus(text, type = 'info') {
    const el = document.getElementById('importStatus');
    el.textContent = text;
    el.className = `card ${type}`;
    el.style.display = text ? '' : 'none';
}

async function getJsonDataLength() {
    const result = await chrome.storage.local.get(['jsonData']);
    const jsonData = result.jsonData || {};
    let count = 0;
    for (const key in jsonData) {
        if (jsonData.hasOwnProperty(key)) {
            count += Object.keys(jsonData[key]).length;
        }
    }
    return count;
}

// ── Storage usage bar ─────────────────────────────────────────────────────────
// Chrome local storage soft quota is 10 MB (10 485 760 bytes)
const STORAGE_QUOTA = 10 * 1024 * 1024;

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function refreshStorageBar() {
    chrome.storage.local.getBytesInUse(null, function(bytes) {
        const pct = Math.min(100, (bytes / STORAGE_QUOTA) * 100).toFixed(1);
        const fill = document.getElementById('storageBarFill');
        fill.style.width = `${pct}%`;
        fill.style.background = pct > 80 ? '#e53935' : pct > 60 ? '#f5a623' : '#0078d4';
        document.getElementById('storageLabel').textContent = `${formatBytes(bytes)} (${pct}%)`;
    });
}

// ── Current page status ───────────────────────────────────────────────────────

function showIsCurrentPageDownloaded() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const el = document.getElementById('currentPageStatus');
        el.innerHTML = '';

        if (!tabs[0] || !tabs[0].url || !tabs[0].url.startsWith('https://www.pixiv.net/artworks/')) {
            el.className = 'na';
            el.textContent = 'Not a Pixiv artwork page.';
            el.style.display = '';
            return;
        }

        const currentUrl = tabs[0].url;
        const artworkId = parseInt(currentUrl.split('/').pop(), 10);
        const key = Math.floor(artworkId / 10000000);
        const value = artworkId % 10000000;

        chrome.storage.local.get(['jsonData'], function(result) {
            const jsonData = result.jsonData || {};
            if (jsonData[key] && jsonData[key][value] && jsonData[key][value]['downloaded']) {
                el.className = 'downloaded';
                el.textContent = '⚠ Already downloaded';
                const offsets = (jsonData[key][value]['offset'] || [])
                    .filter(o => o !== -1 && o !== '-1');
                if (offsets.length > 0) {
                    const d = document.createElement('div');
                    d.className = 'offsets-line';
                    d.textContent = 'Offsets: ' + offsets.join(', ');
                    el.appendChild(d);
                }
            } else {
                el.className = 'not-downloaded';
                el.textContent = '✓ Not yet downloaded';
            }
            el.style.display = '';
        });
    });
}

// ── Import CSV ────────────────────────────────────────────────────────────────

function addListOfValuesToJson(values) {
    const progressWrap = document.getElementById('progressWrap');
    const progressBar  = document.getElementById('progressBar');
    const progressLabel = document.getElementById('progressLabel');

    progressWrap.classList.add('show');
    progressBar.style.width = '0%';

    chrome.storage.local.get(['jsonData'], function(result) {
        let jsonData = result.jsonData || {};
        const offsetSets = {};

        // Seed sets from existing data
        for (const k in jsonData) {
            for (const sv in jsonData[k]) {
                const existing = jsonData[k][sv].offset;
                if (Array.isArray(existing)) {
                    offsetSets[`${k}/${sv}`] = new Set(existing);
                }
            }
        }

        let processed = 0;
        values.forEach(value => {
            let offset, parsedValue;
            if (value.split('_').length > 1) {
                offset = value.split('_')[1];
                parsedValue = value.split('_')[0];
            } else {
                offset = -1;
                parsedValue = value;
            }
            parsedValue = parseInt(parsedValue, 10);
            const key = Math.floor(parsedValue / Math.pow(10, 7));
            const subValue = parsedValue % Math.pow(10, 7);
            const setKey = `${key}/${subValue}`;

            if (!jsonData[key]) jsonData[key] = {};
            if (!jsonData[key][subValue]) {
                jsonData[key][subValue] = { offset: [], downloaded: false };
            }
            jsonData[key][subValue]['downloaded'] = true;

            if (!offsetSets[setKey]) {
                offsetSets[setKey] = new Set(jsonData[key][subValue].offset);
            }
            offsetSets[setKey].add(offset);

            processed++;
            if (processed % 200 === 0 || processed === values.length) {
                const pct = Math.round((processed / values.length) * 100);
                progressBar.style.width = `${pct}%`;
                progressLabel.textContent = `Processing ${processed} / ${values.length}…`;
            }
        });

        // Write sets back to arrays
        for (const setKey in offsetSets) {
            const [k, sv] = setKey.split('/');
            if (jsonData[k] && jsonData[k][sv]) {
                jsonData[k][sv].offset = Array.from(offsetSets[setKey]);
            }
        }

        chrome.storage.local.set({jsonData: jsonData}, function() {
            progressWrap.classList.remove('show');
            setImportStatus(`Imported ${values.length} items successfully.`, 'success');
            refreshEntryCount();
            refreshStorageBar();
        });
    });
}

// ── Export CSV ────────────────────────────────────────────────────────────────

document.getElementById('exportBtn').addEventListener('click', function() {
    chrome.runtime.sendMessage({action: 'exportCsv'}, function(response) {
        if (!response || !response.success) {
            setImportStatus('Export failed.', 'error');
            return;
        }
        const blob = new Blob([response.csv], {type: 'text/csv'});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `pixiv_downloads_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setImportStatus('Export complete.', 'success');
    });
});

// ── Re-scan page ──────────────────────────────────────────────────────────────

document.getElementById('rescanBtn').addEventListener('click', function() {
    const btn = this;
    btn.textContent = 'Scanning…';
    btn.disabled = true;
    chrome.runtime.sendMessage({action: 'rescanPage'}, function() {
        btn.textContent = 'Re-scan Page';
        btn.disabled = false;
        setImportStatus('Page re-scan triggered.', 'info');
    });
});

// ── Reset with confirmation ───────────────────────────────────────────────────

document.getElementById('resetBtn').addEventListener('click', function() {
    document.getElementById('confirmOverlay').classList.add('show');
});

document.getElementById('confirmNo').addEventListener('click', function() {
    document.getElementById('confirmOverlay').classList.remove('show');
});

document.getElementById('confirmYes').addEventListener('click', function() {
    document.getElementById('confirmOverlay').classList.remove('show');
    chrome.storage.local.clear(function() {
        setStatus('All data has been reset.', 'warn');
        setImportStatus('', '');
        document.getElementById('currentPageStatus').style.display = 'none';
        refreshStorageBar();
    });
});

// ── CSV upload ────────────────────────────────────────────────────────────────

document.getElementById('csvUpload').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.value = ''; // allow re-importing the same file

    const reader = new FileReader();
    reader.onload = function(e) {
        const values = e.target.result.split('\n').map(l => l.trim()).filter(l => l);
        addListOfValuesToJson(values);
    };
    reader.readAsText(file);
});

// ── Tab changed message ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function(request) {
    if (request.action === 'tab_changed') {
        showIsCurrentPageDownloaded();
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────

function refreshEntryCount() {
    getJsonDataLength().then(length => {
        setStatus(`Active — ${length.toLocaleString()} entries tracked`, 'info');
    });
}

refreshEntryCount();
refreshStorageBar();
showIsCurrentPageDownloaded();
