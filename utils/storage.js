// Shared utility functions for optimized storage operations
// This file can be imported by both background and popup scripts

// Utility function to parse input value and extract offset
function parseInputValue(inputValue) {
    let offset, value;
    if(inputValue.split('_').length > 1){
        offset = inputValue.split('_')[1];
        value = inputValue.split('_')[0];
    } else {
        offset = -1;
        value = inputValue;
    }
    return {
        offset: offset,
        value: parseInt(value, 10)
    };
}

// Utility function to calculate storage keys
function calculateStorageKeys(value) {
    const key = Math.floor(value / Math.pow(10, 7));
    const subValue = value % Math.pow(10, 7);
    return { key, subValue };
}

// Optimized function to add single value to JSON
function addToJsonOptimized(inputValue, callback) {
    chrome.storage.local.get(['jsonData'], function(result) {
        const { offset, value } = parseInputValue(inputValue);
        let jsonData = result.jsonData || {};
        const { key, subValue } = calculateStorageKeys(value);

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
            if (callback) callback();
        });
    });
}

// Optimized function to add multiple values to JSON in batch
function addListToJsonOptimized(values, progressCallback, completeCallback) {
    chrome.storage.local.get(['jsonData'], function(result) {
        let jsonData = result.jsonData || {};
        let processed = 0;
        
        // Process all values in memory first
        values.forEach(inputValue => {
            const { offset, value } = parseInputValue(inputValue);
            const { key, subValue } = calculateStorageKeys(value);

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
            
            processed++;
            // Report progress less frequently for better performance
            if (progressCallback && (processed % 100 === 0 || processed === values.length)) {
                progressCallback(processed, values.length);
            }
        });

        // Single storage write operation
        chrome.storage.local.set({jsonData: jsonData}, function() {
            console.log('Batch values added to JSON:', values.length, 'items');
            if (completeCallback) completeCallback(processed);
        });
    });
}

// Optimized function to get JSON data length
async function getJsonDataLengthOptimized() {
    const result = await chrome.storage.local.get(['jsonData']);
    const jsonData = result.jsonData || {};
    let count = 0;
    
    // Use more efficient counting
    for (const key in jsonData) {
        if (jsonData.hasOwnProperty(key)) {
            count += Object.keys(jsonData[key]).length;
        }
    }
    
    console.log('Total entries in JSON:', count);
    return count;
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        parseInputValue,
        calculateStorageKeys,
        addToJsonOptimized,
        addListToJsonOptimized,
        getJsonDataLengthOptimized
    };
}