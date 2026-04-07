let jsonAnchorCache = {};
let jsonData = {};
let pageURL = '';
let isProcessing = false; // Prevent concurrent executions
let lastProcessTime = 0; // Throttling timestamp

// Maps blob: URLs (created by Pixiv's React app) to the original CDN URL they were fetched from.
// Populated by messages sent from the main-world tracking script injected by background.js.
const blobUrlToSourceUrl = {};
window.addEventListener('message', function(event) {
    if (event.source === window && event.data && event.data.__pixivExtBlob) {
        blobUrlToSourceUrl[event.data.blobUrl] = event.data.sourceUrl;
    }
});

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

                // Read the total image count from the multi-image badge (the stacked-pages icon).
                // The badge SVG has a unique viewBox "0 0 9 10"; its sibling span holds the number.
                function getTotalImageCount() {
                    const svgEl = anchor.querySelector('svg[viewBox="0 0 9 10"]');
                    if (!svgEl) return 1;
                    // svg → span(wrapper) → span(icon) → div(container with count span)
                    const containerDiv = svgEl.parentElement?.parentElement?.parentElement;
                    if (!containerDiv) return 1;
                    const countEl = containerDiv.lastElementChild;
                    if (!countEl) return 1;
                    const n = parseInt(countEl.textContent.trim(), 10);
                    return isNaN(n) ? 1 : n;
                }

                function showDownloadedMessage(target, offsets, totalCount) {
                    const messageId = 'extension-message' + slug;
                    // Reuse existing element so it updates if more images are downloaded later
                    let message = target.querySelector('#' + messageId);
                    if (!message) {
                        message = document.createElement('div');
                        message.id = messageId;
                        Object.assign(message.style, {
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            marginTop: '4px',
                            pointerEvents: 'none'
                        });
                        target.appendChild(message);
                    }

                    let text, bg;
                    if (totalCount > 1) {
                        // Offsets like "p0.jpg" are page-specific; -1 means no page info
                        const pageOffsets = offsets.filter(o => o !== -1 && o !== '-1');
                        const downloadedCount = pageOffsets.length > 0 ? pageOffsets.length : offsets.length;
                        if (downloadedCount >= totalCount) {
                            text = 'All downloaded!';
                            bg   = 'rgba(220, 38, 38, 0.88)'; // red — fully done
                        } else {
                            text = `${downloadedCount}/${totalCount} downloaded`;
                            bg   = 'rgba(217, 119, 6, 0.92)'; // orange — partial
                        }
                    } else {
                        text = 'Already downloaded!';
                        bg   = 'rgba(220, 38, 38, 0.88)'; // red
                    }
                    message.textContent = text;
                    message.style.background = bg;
                }

                function handleDownloaded(response) {
                    if (response && response.length > 0) {
                        const totalCount = getTotalImageCount();
                        const children = Array.from(anchor.children);
                        if (children.length >= 2) {
                            showDownloadedMessage(children[1], response, totalCount);
                        } else {
                            showDownloadedMessage(anchor, response, totalCount);
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
        // Look up the original CDN URL from the blob tracker map to recover the real filename
        const sourceUrl = blobUrlToSourceUrl[request.srcUrl];
        let filename = sourceUrl ? sourceUrl.split('/').pop() : null;

        // DOM-based fallback for blob: URLs the tracker didn't catch (race condition on first load).
        // Only applies on artwork detail pages where we know the artwork ID from the URL.
        if (!filename && request.srcUrl.startsWith('blob:')) {
            const artworkIdMatch = window.location.pathname.match(/\/artworks\/(\d+)/);
            if (artworkIdMatch) {
                const artworkId = artworkIdMatch[1];
                // Page index = position of this blob img among all blob imgs in document order
                const blobImgs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
                const idx = blobImgs.findIndex(img => img.src === request.srcUrl);
                const pageIndex = idx >= 0 ? idx : 0;
                // Extension: scan performance resource entries for a pximg.net URL with this artwork ID
                const entries = performance.getEntriesByType('resource');
                const pximgEntry = entries.find(
                    e => (e.name.includes('pximg.net') || e.name.includes('pixiv.cat'))
                         && e.name.includes(artworkId)
                );
                const ext = pximgEntry
                    ? (pximgEntry.name.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] ?? 'jpg')
                    : 'jpg';
                filename = `${artworkId}_p${pageIndex}.${ext}`;
            }
        }

        fetch(request.srcUrl)
            .then(response => response.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                sendResponse({url: blobUrl, filename: filename});
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




