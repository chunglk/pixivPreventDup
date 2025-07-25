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
    values.forEach(value => {
        addToJson(value);
    });
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
        addToJson(value);
    } else {
        console.error('srcUrl is undefined in context menu click event:', info);
    }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    console.log('Tab updated:', tabId, changeInfo, tab);
    if (
        changeInfo.status === 'complete' &&
        tab.url &&
        tab.url.includes('pixiv.net')
    ) {

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

