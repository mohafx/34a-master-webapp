export const detectInAppBrowser = (): boolean => {
    if (typeof window === 'undefined') return false;

    const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();

    // List of in-app browser keywords (all lowercase for case-insensitive matching)
    const rules = [
        'instagram',
        'fban',      // Facebook
        'fbav',      // Facebook
        'tiktok',
        'musical_ly', // Old TikTok
        'bytedance',  // Bytedance (TikTok parent)
        'line',
        'twitter',
        'snapchat',
        'wv',         // Android WebView generic
        'micromessenger' // WeChat
    ];

    return rules.some((rule) => ua.includes(rule));
};

export const detectIOS = (): boolean => {
    if (typeof window === 'undefined') return false;

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';

    // Check for iOS devices
    return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
};

export const openInSystemBrowser = (url: string): void => {
    // Try multiple methods to open in system browser

    // Method 1: Try to open with _system target (works on some webviews)
    const systemWindow = window.open(url, '_system');

    // Method 2: If that didn't work, try _blank
    if (!systemWindow || systemWindow.closed) {
        window.open(url, '_blank');
    }

    // Method 3: Also set location as fallback
    setTimeout(() => {
        window.location.href = url;
    }, 100);
};
