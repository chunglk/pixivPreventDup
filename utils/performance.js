// Performance monitoring utility for Chrome extension
class PerformanceMonitor {
    constructor() {
        this.timings = new Map();
        this.enabled = true; // Set to false in production
    }

    start(label) {
        if (!this.enabled) return;
        this.timings.set(label, performance.now());
    }

    end(label) {
        if (!this.enabled) return;
        const startTime = this.timings.get(label);
        if (startTime) {
            const duration = performance.now() - startTime;
            console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
            this.timings.delete(label);
            return duration;
        }
    }

    measure(label, fn) {
        if (!this.enabled) return fn();
        this.start(label);
        const result = fn();
        this.end(label);
        return result;
    }

    async measureAsync(label, asyncFn) {
        if (!this.enabled) return await asyncFn();
        this.start(label);
        const result = await asyncFn();
        this.end(label);
        return result;
    }

    // Memory usage monitoring (Chrome extension specific)
    logMemoryUsage(label = 'Memory Usage') {
        if (!this.enabled) return;
        if (chrome && chrome.system && chrome.system.memory) {
            chrome.system.memory.getInfo((info) => {
                console.log(`💾 ${label}:`, {
                    availableCapacity: `${(info.availableCapacity / 1024 / 1024 / 1024).toFixed(2)} GB`,
                    capacity: `${(info.capacity / 1024 / 1024 / 1024).toFixed(2)} GB`
                });
            });
        }
    }

    // Storage usage monitoring
    async logStorageUsage(label = 'Storage Usage') {
        if (!this.enabled) return;
        try {
            const result = await chrome.storage.local.getBytesInUse();
            console.log(`💽 ${label}: ${(result / 1024).toFixed(2)} KB`);
        } catch (error) {
            console.warn('Could not get storage usage:', error);
        }
    }
}

// Global instance
const perfMonitor = new PerformanceMonitor();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.perfMonitor = perfMonitor;
}