let jsonAnchorCache = {};
let jsonData = {};
let pageURL = '';
let isProcessing = false; // Prevent concurrent executions
let lastProcessTime = 0; // Throttling timestamp

// Optimized JSON data retrieval with caching
function getJsonData(){
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

// Throttled and optimized anchor checking
function checkAnchorsAndShowMessage() {
    // Throttling: prevent excessive calls
    const now = Date.now();
    if (isProcessing || (now - lastProcessTime) < 200) {
        return;
    }
    
    isProcessing = true;
    lastProcessTime = now;
    
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

    // Use RequestAnimationFrame for better performance
    requestAnimationFrame(() => {
        // Process anchors in batches to prevent blocking
        const batchSize = 10;
        let currentIndex = 0;
        
        function processBatch() {
            const endIndex = Math.min(currentIndex + batchSize, anchors.length);
            
            for (let i = currentIndex; i < endIndex; i++) {
                const anchor = anchors[i];
                const slug = anchor.getAttribute('data-gtm-value');
                if (!slug) continue;

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
            }
            
            currentIndex = endIndex;
            
            if (currentIndex < anchors.length) {
                // Process next batch in next frame
                requestAnimationFrame(processBatch);
            } else {
                // Processing complete
                isProcessing = false;
            }
        }
        
        processBatch();
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
                }, 100); // Reduced timeout for better responsiveness
            });
            observer.observe(nav, { childList: true, subtree: true });
        }
        setTimeout(() => {
            console.log('Tab changed, checking anchors...');
            checkAnchorsAndShowMessage();
            sendResponse({status: 'success'});
        }, 300); // Reduced delay
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

// Optimized scroll handling with better throttling
setTimeout(() => {
    let scrollTimeout;
    let lastScrollTime = 0;
    
    window.addEventListener('scroll', () => {
        const now = Date.now();
        if (now - lastScrollTime < 150) return; // Throttle scroll events
        
        lastScrollTime = now;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            checkAnchorsAndShowMessage();
        }, 200); // Reduced timeout
    }, { passive: true }); // Use passive listeners for better performance
}, 200);

// Optimized storage change listener
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.jsonData) {
        console.log('jsonData changed:', Object.keys(changes.jsonData.newValue || {}).length, 'keys');
        jsonAnchorCache = {}; 
        getJsonData().then(() => {
            setTimeout(() => {
                checkAnchorsAndShowMessage();
            }, 500); // Reduced delay
        });
    }
});




