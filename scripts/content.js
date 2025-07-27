let jsonAnchorCache = {};
let jsonData = {};
let pageURL = '';

function getJsonData(){
    // Retrieve the existing JSON data from local storage
    return chrome.storage.local.get(['jsonData'])
        .then(function(result) {
            jsonData = result.jsonData || {};
            return jsonData;
        })
        .catch(function(error) {
            console.warn('Error retrieving jsonData from chrome.storage.local:', error);
            return {};
        });
}

async function checkJsonAnchor(value) {
    // Ensure jsonData is loaded
    if (Object.keys(jsonData).length === 0) {
        await getJsonData();
    }
    value = parseInt(value, 10);
    const originalValue = value;
    let key = Math.floor(value / 10000000);
    value = value % 10000000; // Get the last 7 digits
    // Check if the key exists and contains the value
    if (jsonData[key] && jsonData[key][value] && jsonData[key][value]['downloaded']) {
        jsonAnchorCache[originalValue] = jsonData[key][value]['offset'] || [];
        return jsonData[key][value]['offset'] || [];
    } else {
        jsonAnchorCache[originalValue] = [];
        return [];
    }
}

function checkAnchorsAndShowMessage() {
    console.log('Checking anchors and showing messages...');
    const selectors = [
        "ul li div div a",
        "nav div div div div div div a"
    ];
    if(pageURL.includes("www.pixiv.net/bookmark_new_illust.php")){
        console.log('Detected bookmark_new_illust page, removing last selector');
        selectors.pop();
    }
    const anchors = document.querySelectorAll(selectors.join(', '));
    console.log('Found anchors:', anchors.length);

    anchors.forEach(anchor => {
        const slug = anchor.getAttribute('data-gtm-value');
        if (!slug) return;

        function showDownloadedMessage(target) {
            const messageId = 'extension-message' + slug;
            if (!target.querySelector('#' + messageId)) {
                const message = document.createElement('div');
                message.textContent = 'Already downloaded!';
                Object.assign(message.style, {
                    background: 'rgba(255, 0, 0, 0.85)',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    marginTop: '4px',
                    pointerEvents: 'none'
                });
                message.id = messageId;
                target.appendChild(message);
            }
        }

        function handleDownloaded(response) {
            if (response && response.length > 0) {
                const children = Array.from(anchor.children);
                if (children.length >= 2) {
                    showDownloadedMessage(children[1]);
                } else {
                    showDownloadedMessage(anchor);
                }
            }
        }

        if (jsonAnchorCache.hasOwnProperty(slug)) {
            console.log('Cache hit for slug:', slug);
            handleDownloaded(jsonAnchorCache[slug]);
        } else {
            checkJsonAnchor(slug).then(handleDownloaded);
        }
    });
}


chrome.runtime.onMessage.addListener(function(request, _sender, sendResponse) {
    if (request.action === 'tab_changed') {
        pageURL = request.url;
        jsonAnchorCache = {}; 
        const nav = document.querySelector('nav');
        if (nav) {
            console.log('Nav element found, setting up observer...');
            let timeoutId = null;
            const observer = new MutationObserver(() => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    checkAnchorsAndShowMessage();
                }, 0); 
            });
            observer.observe(nav, { childList: true, subtree: true });
        }
        setTimeout(() => {
            console.log('Tab changed, checking anchors...');
            checkAnchorsAndShowMessage();
            sendResponse({status: 'success'});
        }, 500); 
        return true;
    } else if (request.action === 'getBlobUrl') {
        fetch(request.srcUrl)
            .then(response => response.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                sendResponse({url: blobUrl});
            })
            .catch(error => {
                console.error('Error creating blob URL:', error);
                sendResponse({url: null, error: error.toString()});
            });
        return true; 
    }
});

setTimeout(() => {
    window.addEventListener('scroll', () => {
        if (window.scrollTimeout) clearTimeout(window.scrollTimeout);
        window.scrollTimeout = setTimeout(() => {
            checkAnchorsAndShowMessage();
        }, 300);
    });
}, 500);

chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.jsonData) {
        console.log('jsonData changed:', changes.jsonData.newValue);
        jsonAnchorCache = {}; 
        getJsonData();
        setTimeout(() => {
            checkAnchorsAndShowMessage();
        }, 1000); 
       
    }
});




