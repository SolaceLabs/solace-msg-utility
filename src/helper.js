// Helper utilities and common functions for Solace Web Utility

// Utility functions that can be used across the application
const SolaceUtilityHelpers = {
  
  // DOM Helper functions
  dom: {
    // Get element by ID with error handling
    getElement: function(id) {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with ID '${id}' not found`);
      }
      return element;
    },
    
    // Set element text content safely
    setText: function(id, text) {
      const element = this.getElement(id);
      if (element) {
        element.textContent = text;
      }
    },
    
    // Set element HTML content safely
    setHTML: function(id, html) {
      const element = this.getElement(id);
      if (element) {
        element.innerHTML = html;
      }
    },
    
    // Add class to element
    addClass: function(id, className) {
      const element = this.getElement(id);
      if (element) {
        element.classList.add(className);
      }
    },
    
    // Remove class from element
    removeClass: function(id, className) {
      const element = this.getElement(id);
      if (element) {
        element.classList.remove(className);
      }
    },
    
    // Toggle class on element
    toggleClass: function(id, className) {
      const element = this.getElement(id);
      if (element) {
        element.classList.toggle(className);
      }
    }
  },
  
  // Validation helper functions
  validation: {
    // Check if string is empty or only whitespace
    isEmpty: function(str) {
      return !str || str.trim().length === 0;
    },
    
    // Validate URL format
    isValidUrl: function(url) {
      try {
        new URL(url);
        return true;
      } catch (e) {
        return false;
      }
    },
    
    // Validate WebSocket URL format
    isValidWebSocketUrl: function(url) {
      return url.startsWith('ws://') || url.startsWith('wss://');
    },
    
    // Check if object has required properties
    hasRequiredFields: function(obj, requiredFields) {
      for (let field of requiredFields) {
        if (!obj.hasOwnProperty(field) || this.isEmpty(obj[field])) {
          return false;
        }
      }
      return true;
    }
  },
  
  // String helper functions
  strings: {
    // Truncate string to specified length
    truncate: function(str, length = 50) {
      if (str.length <= length) return str;
      return str.substring(0, length) + '...';
    },
    
    // Escape HTML characters
    escapeHtml: function(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    // Generate random string
    generateRandomId: function(length = 8) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
  },
  
  // Storage helper functions
  storage: {
    // Safely get item from localStorage
    get: function(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn('localStorage.getItem failed:', e);
        return null;
      }
    },
    
    // Safely set item in localStorage
    set: function(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        console.warn('localStorage.setItem failed:', e);
        return false;
      }
    },
    
    // Safely remove item from localStorage
    remove: function(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.warn('localStorage.removeItem failed:', e);
        return false;
      }
    },
    
    // Get JSON object from localStorage
    getJSON: function(key) {
      try {
        const item = this.get(key);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        console.warn('JSON.parse failed for key:', key, e);
        return null;
      }
    },
    
    // Set JSON object in localStorage
    setJSON: function(key, obj) {
      try {
        const json = JSON.stringify(obj);
        return this.set(key, json);
      } catch (e) {
        console.warn('JSON.stringify failed for key:', key, e);
        return false;
      }
    }
  },
  
  // Event helper functions
  events: {
    // Add event listener with error handling
    on: function(elementId, event, handler) {
      const element = SolaceUtilityHelpers.dom.getElement(elementId);
      if (element) {
        element.addEventListener(event, handler);
      }
    },
    
    // Remove event listener with error handling
    off: function(elementId, event, handler) {
      const element = SolaceUtilityHelpers.dom.getElement(elementId);
      if (element) {
        element.removeEventListener(event, handler);
      }
    },
    
    // Prevent event propagation
    stopPropagation: function(event) {
      if (event) {
        event.stopPropagation();
      }
    },
    
    // Prevent default action
    preventDefault: function(event) {
      if (event) {
        event.preventDefault();
      }
    }
  },
  
  // Array helper functions
  arrays: {
    // Remove item from array
    remove: function(array, item) {
      const index = array.indexOf(item);
      if (index > -1) {
        array.splice(index, 1);
      }
      return array;
    },
    
    // Check if array is empty
    isEmpty: function(array) {
      return !array || array.length === 0;
    },
    
    // Get unique values from array
    unique: function(array) {
      return [...new Set(array)];
    },
    
    // Chunk array into smaller arrays
    chunk: function(array, size) {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }
  },
  
  // Async helper functions
  async: {
    // Sleep/delay function
    sleep: function(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // Timeout wrapper for promises
    timeout: function(promise, ms) {
      return Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), ms)
        )
      ]);
    },
    
    // Retry function with exponential backoff
    retry: async function(fn, retries = 3, delay = 1000) {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === retries - 1) throw error;
          await this.sleep(delay * Math.pow(2, i));
        }
      }
    }
  },
  
  // Object helper functions
  objects: {
    // Deep clone object
    deepClone: function(obj) {
      return JSON.parse(JSON.stringify(obj));
    },
    
    // Check if object is empty
    isEmpty: function(obj) {
      return Object.keys(obj).length === 0;
    },
    
    // Get nested property safely
    get: function(obj, path, defaultValue = null) {
      const keys = path.split('.');
      let result = obj;
      
      for (let key of keys) {
        if (result === null || result === undefined || !result.hasOwnProperty(key)) {
          return defaultValue;
        }
        result = result[key];
      }
      
      return result;
    },
    
    // Set nested property
    set: function(obj, path, value) {
      const keys = path.split('.');
      const lastKey = keys.pop();
      let current = obj;
      
      for (let key of keys) {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      current[lastKey] = value;
      return obj;
    }
  },
  
  // Error handling helpers
  errors: {
    // Create standardized error object
    create: function(message, code = 'UNKNOWN_ERROR', details = null) {
      return {
        message,
        code,
        details,
        timestamp: new Date().toISOString()
      };
    },
    
    // Log error with context
    log: function(error, context = '') {
      const errorInfo = {
        message: error.message || error,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
      };
      
      console.error('Application Error:', errorInfo);
      return errorInfo;
    },
    
    // Handle promise rejection
    handleRejection: function(error, context = '') {
      this.log(error, context);
      // Could send to error reporting service here
    }
  },
  
  // Performance helpers
  performance: {
    // Debounce function
    debounce: function(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },
    
    // Throttle function
    throttle: function(func, limit) {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      }
    },
    
    // Measure execution time
    time: function(name, fn) {
      const start = performance.now();
      const result = fn();
      const end = performance.now();
      console.log(`${name} took ${end - start} milliseconds`);
      return result;
    }
  }
};

// Make helpers globally available
window.SolaceUtilityHelpers = SolaceUtilityHelpers;