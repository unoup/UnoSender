/**
 * Injects wa.js (wa-js bundle) and wa-bridge.js into the page's MAIN world.
 *
 * Both scripts are listed in manifest.json web_accessible_resources so they
 * can be fetched via chrome.runtime.getURL().
 *
 * Injection order matters:
 *   1. wa.js   — sets up window.WPP
 *   2. wa-bridge.js — listens for postMessage commands and calls WPP.*
 */
export function injectWaBridge() {
  return new Promise((resolve, reject) => {
    // Step 1: inject wa.js (WPPConnect wa-js bundle)
    const waScript = document.createElement('script');
    waScript.src = chrome.runtime.getURL('vendors/wa.js');
    waScript.type = 'text/javascript';

    waScript.onload = () => {
      // Step 2: inject wa-bridge.js after wa.js is loaded
      const bridgeScript = document.createElement('script');
      bridgeScript.src = chrome.runtime.getURL('content/wa-bridge.js');
      bridgeScript.type = 'text/javascript';
      bridgeScript.onload = () => resolve();
      bridgeScript.onerror = (e) => reject(new Error('Failed to inject wa-bridge.js'));
      (document.head || document.documentElement).appendChild(bridgeScript);
    };

    waScript.onerror = () => {
      // wa.js not available (extension not yet built with vendors/wa.js)
      // Fall back to bridge-only injection which will use DOM fallback
      console.warn('[UnoSender] wa.js not found — will use DOM fallback mode');
      const bridgeScript = document.createElement('script');
      bridgeScript.src = chrome.runtime.getURL('content/wa-bridge.js');
      bridgeScript.type = 'text/javascript';
      bridgeScript.onload = () => resolve();
      bridgeScript.onerror = () => reject(new Error('Failed to inject wa-bridge.js'));
      (document.head || document.documentElement).appendChild(bridgeScript);
    };

    (document.head || document.documentElement).appendChild(waScript);
  });
}
