/**
 * Universal KaTeX Auto-Renderer for Engineering Hub
 * Automatically finds math delimiters ($...$, $$...$$, \(...\), \[...\])
 * and renders high-quality LaTeX math across all apps.
 */
(function () {
    'use strict';

    // Helper to determine the path prefix for assets (e.g. "../" or "./")
    function getAssetPrefix() {
        if (window.KATEX_PATH_PREFIX) return window.KATEX_PATH_PREFIX;
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].getAttribute('src') || '';
            if (src.includes('template.js') || src.includes('katex') || src.includes('shared-utils.js')) {
                const idx = src.indexOf('js/');
                if (idx >= 0) {
                    return src.substring(0, idx);
                }
            }
        }
        return '../';
    }

    // Ensure KaTeX CSS is loaded
    function ensureKatexCSS() {
        if (!document.querySelector('link[href*="katex.min.css"]')) {
            const prefix = getAssetPrefix();
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${prefix}js/katex/katex.min.css`;
            document.head.appendChild(link);
        }
    }

    // Ensure KaTeX JS is loaded
    function ensureKatexJS(callback) {
        if (window.katex) {
            if (callback) callback();
            return;
        }
        if (!document.querySelector('script[src*="katex.min.js"]')) {
            const prefix = getAssetPrefix();
            const script = document.createElement('script');
            script.src = `${prefix}js/katex/katex.min.js`;
            script.onload = () => {
                if (callback) callback();
            };
            document.head.appendChild(script);
        } else {
            const timer = setInterval(() => {
                if (window.katex) {
                    clearInterval(timer);
                    if (callback) callback();
                }
            }, 30);
        }
    }

    // Parse math tokens from text
    const DELIMITERS = [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
    ];

    function parseMathTokens(text) {
        const tokens = [];
        let i = 0;

        while (i < text.length) {
            let match = null;

            for (const delim of DELIMITERS) {
                if (text.startsWith(delim.left, i)) {
                    // For single $, ensure not preceded by backslash and not followed by whitespace or numbers/currency
                    if (delim.left === '$') {
                        if (i > 0 && text[i - 1] === '\\') continue;
                        const nextChar = text[i + 1];
                        if (!nextChar || /\s/.test(nextChar)) continue;
                    }

                    const startSearch = i + delim.left.length;
                    let endIdx = text.indexOf(delim.right, startSearch);

                    if (delim.right === '$' && endIdx !== -1) {
                        while (endIdx !== -1 && (text[endIdx - 1] === '\\' || /\s/.test(text[endIdx - 1]))) {
                            endIdx = text.indexOf(delim.right, endIdx + 1);
                        }
                    }

                    if (endIdx !== -1) {
                        match = {
                            start: i,
                            end: endIdx + delim.right.length,
                            content: text.slice(i + delim.left.length, endIdx),
                            display: delim.display
                        };
                        break;
                    }
                }
            }

            if (match) {
                tokens.push({ type: 'math', content: match.content, display: match.display });
                i = match.end;
            } else {
                let nextSpecial = text.length;
                for (const delim of DELIMITERS) {
                    const nextPos = text.indexOf(delim.left, i + 1);
                    if (nextPos !== -1 && nextPos < nextSpecial) {
                        nextSpecial = nextPos;
                    }
                }
                tokens.push({ type: 'text', content: text.slice(i, nextSpecial) });
                i = nextSpecial;
            }
        }
        return tokens;
    }

    // Check if an element should be ignored by TreeWalker
    function shouldIgnoreElement(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = el.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CODE', 'PRE', 'CANVAS', 'SVG', 'MATH'].includes(tag)) {
            return true;
        }
        if (el.isContentEditable) return true;
        if (el.classList && (el.classList.contains('katex') || el.classList.contains('no-katex') || el.classList.contains('no-latex'))) {
            return true;
        }
        return false;
    }

    let isRendering = false;
    let observer = null;

    function renderLatexIn(rootElement) {
        if (!window.katex) {
            ensureKatexJS(() => renderLatexIn(rootElement));
            return;
        }

        const root = rootElement || document.body;
        if (!root) return;

        // Temporarily pause observer to avoid re-triggering on our own KaTeX DOM insertions
        if (observer) {
            observer.disconnect();
        }
        isRendering = true;

        try {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function (node) {
                        if (!node.nodeValue || (!node.nodeValue.includes('$') && !node.nodeValue.includes('\\(') && !node.nodeValue.includes('\\['))) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        let parent = node.parentElement;
                        while (parent && parent !== root) {
                            if (shouldIgnoreElement(parent)) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            parent = parent.parentElement;
                        }
                        if (parent && shouldIgnoreElement(parent)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            const nodesToProcess = [];
            let currentNode = walker.nextNode();
            while (currentNode) {
                nodesToProcess.push(currentNode);
                currentNode = walker.nextNode();
            }

            for (const textNode of nodesToProcess) {
                const text = textNode.nodeValue;
                if (!text || (!text.includes('$') && !text.includes('\\(') && !text.includes('\\['))) continue;

                const tokens = parseMathTokens(text);
                const hasMath = tokens.some(t => t.type === 'math');
                if (!hasMath) continue;

                const fragment = document.createDocumentFragment();
                for (const token of tokens) {
                    if (token.type === 'text') {
                        fragment.appendChild(document.createTextNode(token.content));
                    } else if (token.type === 'math') {
                        const span = document.createElement('span');
                        try {
                            const normalizedMath = token.content
                                .replace(/·/g, '\\cdot ')
                                .replace(/²/g, '^2')
                                .replace(/³/g, '^3')
                                .replace(/⁴/g, '^4')
                                .replace(/\\text\{([^{}]*)\^2\}/g, '\\text{$1}^2')
                                .replace(/\\text\{([^{}]*)\^3\}/g, '\\text{$1}^3')
                                .replace(/\\text\{([^{}]*)\^4\}/g, '\\text{$1}^4')
                                .replace(/\\text\{([^{}]*)\\cdot([^{}]*)\}/g, '\\text{$1}\\cdot\\text{$2}');
                            span.innerHTML = window.katex.renderToString(normalizedMath, {
                                displayMode: token.display,
                                throwOnError: false,
                                strict: false
                            });
                        } catch (err) {
                            console.warn("KaTeX render error on:", token.content, err);
                            span.textContent = (token.display ? '$$' : '$') + token.content + (token.display ? '$$' : '$');
                        }
                        fragment.appendChild(span);
                    }
                }

                if (textNode.parentNode) {
                    textNode.parentNode.replaceChild(fragment, textNode);
                }
            }
        } catch (e) {
            console.error("renderLatex error:", e);
        } finally {
            isRendering = false;
            if (observer && document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        }
    }

    // Set up MutationObserver to re-render when dynamic content is inserted
    let debounceTimer = null;
    function initMutationObserver() {
        if (!window.MutationObserver || observer) return;

        observer = new MutationObserver((mutations) => {
            if (isRendering) return;

            let shouldRender = false;
            for (const m of mutations) {
                if (m.type === 'childList') {
                    for (let i = 0; i < m.addedNodes.length; i++) {
                        const node = m.addedNodes[i];
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (!node.classList.contains('katex') && !node.closest?.('.katex')) {
                                shouldRender = true;
                                break;
                            }
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            if (node.nodeValue && (node.nodeValue.includes('$') || node.nodeValue.includes('\\('))) {
                                shouldRender = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldRender) break;
            }

            if (shouldRender) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    renderLatexIn(document.body);
                }, 120);
            }
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Expose global methods
    window.renderLatex = renderLatexIn;
    window.renderLatexIn = renderLatexIn;
    window.parseMathTokens = parseMathTokens;

    // Auto-initialize when ready
    function autoInit() {
        ensureKatexCSS();
        ensureKatexJS(() => {
            renderLatexIn(document.body);
            initMutationObserver();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }
})();
