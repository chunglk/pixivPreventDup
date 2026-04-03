// Optimized single value addition with deduplication
function addToJson(inputValue){
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

        // Initialize nested structure if needed
        if (!jsonData[key]) {
            jsonData[key] = {};
        }

        if(!jsonData[key][subValue]){
            jsonData[key][subValue] = {
                offset: [],
                downloaded: false
            };
        }
        
        jsonData[key][subValue]['downloaded'] = true;
        
        // Prevent duplicate offsets
        if (!jsonData[key][subValue]['offset'].includes(offset)) {
            jsonData[key][subValue]['offset'].push(offset);
        }

        // Save the updated JSON data back to local storage
        chrome.storage.local.set({jsonData: jsonData}, function() {
            console.log('Value added to JSON:', subValue);
        });
    });
}

// Optimized batch processing function
function addListOfValuesToJson(values) {
    // Single storage read operation
    chrome.storage.local.get(['jsonData'], function(result) {
        let jsonData = result.jsonData || {};
        
        // Process all values in memory first
        values.forEach(value => {
            let offset;
            let parsedValue;
            if(value.split('_').length > 1){
                offset = value.split('_')[1];
                parsedValue = value.split('_')[0];
            } else {
                offset = -1;
                parsedValue = value;
            }
            parsedValue = parseInt(parsedValue, 10);
            
            let key = Math.floor(parsedValue / Math.pow(10, 7));
            let subValue = parsedValue % Math.pow(10, 7);

            // Initialize nested structure if needed
            if (!jsonData[key]) {
                jsonData[key] = {};
            }
            if(!jsonData[key][subValue]){
                jsonData[key][subValue] = {
                    offset: [],
                    downloaded: false
                };
            }
            
            jsonData[key][subValue]['downloaded'] = true;
            if (!jsonData[key][subValue]['offset'].includes(offset)) {
                jsonData[key][subValue]['offset'].push(offset);
            }
        });

        // Single storage write operation
        chrome.storage.local.set({jsonData: jsonData}, function() {
            console.log('Batch values added to JSON:', values.length, 'items');
        });
    });
}

// Track completed downloads (id → basename) for the onChanged handler
const pendingDownloads = {};
// FIFO queue of basenames pushed BEFORE downloads.download() is called,
// consumed by onDeterminingFilename which fires before the download callback
const pendingDownloadFilenames = [];

chrome.contextMenus.create({
            id: "processImage",
            title: "Save and Process Image",
            contexts: ["image"],
            documentUrlPatterns: ["*://*.pixiv.net/*"]
        }, () => {
            if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes('already exists')) {
                // Ignore duplicate creation error
            }
        });

async function getJsonDataLength() {
    const result = await chrome.storage.local.get(['jsonData']);
    const jsonData = result.jsonData || {};
    let count = 0;
    for (const key in jsonData) {
        if (jsonData.hasOwnProperty(key)) {
            count += Object.keys(jsonData[key]).length;
        }
    }
    console.log('Total entries in JSON:', count);
    return count;
}   

chrome.runtime.onMessage.addListener(function(request, _, sendResponse) {
    console.log('Received message:', request);
    if (request.action === 'addToJson') {
        addToJson(request.value);
        sendResponse({status: 'success'});
    } else if (request.action === 'checkJsonAnchor') {
        const offsets = checkJsonAnchor(request.value);
        sendResponse({value: offsets});
    } else if (request.action === 'addListOfValuesToJson') {
        addListOfValuesToJson(request.values);
        sendResponse({status: 'success'});
    } else if (request.action === 'getCurrentUrl') {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentUrl = tabs[0].url;
            sendResponse({url: currentUrl});
        });
    }  else if (request.action === 'importCsv') {
        const csvText = request.csv;
        const values = csvText.split('\n').map(line => line.trim()).filter(line => line);
        addListOfValuesToJson(values);
        sendResponse({success: true});
    }
});

chrome.contextMenus.onClicked.addListener((info) => {
    console.log('Context menu clicked:', info);
    if (info.srcUrl) {
        const fileName = info.srcUrl;
        const value = fileName.split('/').pop().trim();
        

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'getBlobUrl',
                    srcUrl: info.srcUrl
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting blob URL:', chrome.runtime.lastError.message);
                        return;
                    }
                    console.log('Response from content script:', response);
                    if (response && response.url) {
                        const blobUrl = response.url;
                        console.log('Blob URL:', blobUrl);
                        // Push BEFORE calling downloads.download() so the queue entry
                        // is ready when onDeterminingFilename fires (before the callback)
                        pendingDownloadFilenames.push(value);
                        chrome.downloads.download({
                            url: blobUrl,
                            filename: value,
                            saveAs: true
                        }, function(downloadId) {
                            if (downloadId !== undefined) {
                                pendingDownloads[downloadId] = value;
                            }
                        });
                    } else {
                        console.error('No blob URL returned from content script');
                    }
                });
            }
        });
        
        
    } else {
        console.error('srcUrl is undefined in context menu click event:', info);
    }
});

// Before the save dialog opens, suggest the last-used directory as the default location
chrome.downloads.onDeterminingFilename.addListener(function(item, suggest) {
    // Only handle blob URLs from pixiv (our downloads);
    // also guard against an empty queue in case of unrelated blob downloads
    if (!item.url.startsWith('blob:') || pendingDownloadFilenames.length === 0) {
        return; // Not our download — let Chrome use its default behaviour
    }
    // Consume the queued basename (FIFO matches the download order)
    const basename = pendingDownloadFilenames.shift();

    // item.filename is Chrome's tentative absolute path (basename inside Chrome's download dir)
    // e.g. "C:\Users\user\Downloads\image.jpg"  →  base = "C:\Users\user\Downloads\"
    const tentativePath = item.filename;
    const lastSep = Math.max(tentativePath.lastIndexOf('\\'), tentativePath.lastIndexOf('/'));
    const detectedBase = tentativePath.substring(0, lastSep + 1);

    chrome.storage.local.get(['lastDownloadDirectory'], function(result) {
        const lastDir = result.lastDownloadDirectory;
        let suggestedFilename = basename;

        if (lastDir && lastDir.startsWith(detectedBase)) {
            // Convert the stored absolute subdir into a relative path Chrome can use
            const relDir = lastDir.slice(detectedBase.length).replace(/\\/g, '/');
            if (relDir) {
                suggestedFilename = relDir + basename;
            }
        }

        suggest({ filename: suggestedFilename });
    });

    return true; // Indicate that suggest() will be called asynchronously
});

chrome.downloads.onChanged.addListener(function(delta) {
    if (delta.state && delta.state.current === 'complete') {
        console.log('Download completed:', delta);
        // delta only has id and state, no filename
        chrome.downloads.search({id: delta.id}, function(results) {
            if (results && results.length > 0) {
                const fullPath = results[0].filename;
                console.log('Download completed with filename:', fullPath);
                const lastSep = Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'));
                const absoluteDir = fullPath.substring(0, lastSep + 1);
                const fileName = fullPath.substring(lastSep + 1);

                // Persist the directory so the next download can default to it
                if (delta.id in pendingDownloads) {
                    chrome.storage.local.set({ lastDownloadDirectory: absoluteDir });
                    delete pendingDownloads[delta.id];
                }

                addToJson(fileName);
            }
        });
    }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    console.log('Tab updated:', tabId, changeInfo, tab);
    if (
        changeInfo.status === 'complete' &&
        tab.url &&
        tab.url.includes('pixiv.net')
    ) {
        console.log('Tab changed to Pixiv:', tabId);
        chrome.tabs.sendMessage(tabId, {action: 'tab_changed', url: tab.url}, function(response) {
            if (chrome.runtime.lastError) {
                console.error('Error sending message to content script:', chrome.runtime.lastError);
            } else {
                console.log('Response from content script:', response);
            }
        });
    }
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (tab && tab.id === activeInfo.tabId && tab.url.includes('www.pixiv.net/artworks/')) {
            chrome.action.openPopup();
        }
    });
});
