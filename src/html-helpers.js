import {HTMLElement} from 'node-html-parser';

// Helper function to create HTML tag string
function $(tag, attrs = {}) {
    const attrsStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
        .join(' ');
    return `<${tag}${attrsStr ? ' ' + attrsStr : ''}>`;
}

// Helper function to check if string is empty
function isEmptyString(str) {
    return !str || String(str).trim().length === 0;
}

export function getFavicon(node) {
    let favicon = ''
    if (node.document.hasAttribute('favicon')) {
        let icon_href = node.document.getAttribute('favicon');
        if (isEmptyString(icon_href)) {
            icon_href = 'favicon.ico';
        }
        const icon_ext = icon_href.split('.').pop();
        const icon_type = icon_ext === 'ico' ? 'image/x-icon' : `image/${icon_ext}`;
        favicon = $('link', {rel: "icon", type: icon_type, href: icon_href});
    }
    return favicon
}

export function appendMetaIf(node_head, name, content) {
    if (!isEmptyString(content)) {
        const meta = new HTMLElement('meta', {});
        meta.setAttribute('name', name);
        meta.setAttribute('content', content);
        node_head.appendChild(meta);
    }
}

export function setAttributeIf(node, name, content) {
    if (!isEmptyString(content)) {
        node.setAttribute(name, content);
    }
}
