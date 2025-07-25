console.log('Popup script loaded.');
document.getElementById('status').textContent = 'Extension is active.';

async function getJsonDataLength() {
    let count = 0;
    const result = await chrome.storage.local.get(['jsonData']);
    const jsonData = result.jsonData || {};
    for (const key in jsonData) {
        if (jsonData.hasOwnProperty(key)) {
                count += Object.keys(jsonData[key]).length;
        }
    }
    console.log('Total entries in JSON:', count);
    return count;
}

function getFirst10Entries() {
    chrome.storage.local.get(['jsonData'], function(result) {
        const jsonData = result.jsonData || {};
        const entries = [];
        for (const key in jsonData) {
            if (jsonData.hasOwnProperty(key)) {
                for (const subKey in jsonData[key]) {
                    if (jsonData[key].hasOwnProperty(subKey)) {
                        entries.push({
                            key: key,
                            subKey: subKey,
                            value: jsonData[key][subKey]
                        });
                        if (entries.length >= 10) {
                            break;
                        }
                    }
                }
            }
            if (entries.length >= 10) {
                break;
            }
        }
        console.log('First 10 entries:', entries);
        document.getElementById('importStatus').textContent += ` First 10 entries: ${JSON.stringify(entries)}`;
    });
}

function showIsCurrentPageDownloaded(){
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs[0] || !tabs[0].url || !tabs[0].url.startsWith('https://www.pixiv.net/artworks/')) {
            document.getElementById('currentPageStatus').textContent = 'Not a Pixiv artwork page.';
            return;
        }
        const currentTab = tabs[0];
        if (currentTab) {
            const currentUrl = currentTab.url;
            key = Math.floor(parseInt(currentUrl.split('/').pop(), 10) / 10000000);
            value = parseInt(currentUrl.split('/').pop(), 10) % 10000000; // Get the last 7 digits

            chrome.storage.local.get(['jsonData'], function(result) {
                let jsonData = result.jsonData || {};
                if (jsonData[key] && jsonData[key][value] && jsonData[key][value]['downloaded']) {
                    console.log('Current page is downloaded:', currentUrl);
                    document.getElementById('currentPageStatus').textContent = 'This page is already downloaded.';
                    console.log('Offsets:', jsonData[key][value]['offset']);
                    // Optionally, you can display the offsets in the popup
                    const offsetsDiv = document.createElement('div');
                    offsetsDiv.textContent = 'Offsets: ' + (jsonData[key][value]['offset'] || []).join(', ');
                    offsetsDiv.style.fontWeight = 'bold';
                    offsetsDiv.style.fontSize = '12px';
                    offsetsDiv.style.borderRadius = '4px';
                    offsetsDiv.style.padding = '2px 8px';
                    offsetsDiv.style.marginTop = '4px';
                    document.getElementById('currentPageStatus').appendChild(offsetsDiv);
                } else {
                    console.log('Current page is not downloaded:', currentUrl);
                    document.getElementById('currentPageStatus').textContent = 'This page is not downloaded yet.';
                }
            });
        }
    });
}

function toggleVisibility(id) {
          const el = document.getElementById(id);
          el.style.display = el.textContent.trim() ? '' : 'none';
        }
['status', 'importStatus', 'currentPageStatus'].forEach(id => {
    const el = document.getElementById(id);
    const observer = new MutationObserver(() => toggleVisibility(id));
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    toggleVisibility(id);
});

function addToJson(inputValue){
    // Retrieve the existing JSON data from local storage
    chrome.storage.local.get(['jsonData'], function(result) {
        let offset;
        let value;
        if(inputValue.split('_').length > 1){
            offset = inputValue.split('_')[1];
            value = inputValue.split('_')[0];
        }else{
            offset = -1;
            value = inputValue;
        }
        value = parseInt(value, 10);
        let jsonData = result.jsonData || {};

        let key = Math.floor(value / Math.pow(10, 7));
        let subValue = value % Math.pow(10, 7);

        // Check if the key already exists in the JSON data
        if (!jsonData[key]) {
            jsonData[key] = {};
        }

        if(!jsonData[key][subValue]){
            jsonData[key][subValue] = {};
            jsonData[key][subValue]['offset'] = [];
        }
        jsonData[key][subValue]['downloaded'] = true;
        jsonData[key][subValue]['offset'].push(offset);

        // Save the updated JSON data back to local storage
        chrome.storage.local.set({jsonData: jsonData}, function() {
            console.log('Value added to JSON:', subValue);
        });
    });
}

function addListOfValuesToJson(values) {
    chrome.storage.local.get(['jsonData'], function(result) {
        let jsonData = result.jsonData || {};
        values.forEach((value, idx) => {
            let offset;
            if(value.split('_').length > 1){
            offset = value.split('_')[1];
            value = value.split('_')[0];
            }else{
            offset = -1;
            }
            value = parseInt(value, 10);
            let key = Math.floor(value / Math.pow(10, 7));
            let subValue = value % Math.pow(10, 7);

            // Check if the key already exists in the JSON data
            if (!jsonData[key]) {
            jsonData[key] = {};
            }

            if(!jsonData[key][subValue]){
            jsonData[key][subValue] = {};
            jsonData[key][subValue]['offset'] = [];
            }
            jsonData[key][subValue]['downloaded'] = true;
            jsonData[key][subValue]['offset'].push(offset);

            // Show progress in the status div
            document.getElementById('status').textContent = `Processing ${idx + 1} of ${values.length}...`;
        });
        // Save the updated JSON data back to local storage
        chrome.storage.local.set({jsonData: jsonData}, function() {
            console.log('Values added to JSON:', values);
        });
    });
}


getJsonDataLength().then(length => {
    document.getElementById('status').textContent += ` Total entries in JSON: ${length}`;
});

document.getElementById('csvUpload').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvText = e.target.result;
        const values = csvText.split('\n').map(line => line.trim()).filter(line => line);
        addListOfValuesToJson(values);
        // document.getElementById('status').textContent = 'CSV data imported successfully.';
    };
    reader.readAsText(file);
});

document.getElementById('resetBtn').addEventListener('click', function() {
    chrome.storage.local.clear(function() {
        console.log('Local storage cleared.');
        document.getElementById('status').textContent = 'Local storage cleared.';
    });
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Received message in popup:', request);
    if (request.action === 'tab_changed') {
        showIsCurrentPageDownloaded();
    }
});
showIsCurrentPageDownloaded();