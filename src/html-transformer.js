import {dirname, basename, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {HTMLElement, parse as parseHTML, TextNode} from 'node-html-parser';
import {appendMetaIf, getFavicon, setAttributeIf} from './html-helpers.js';

export function transformIndexHtmlWithMetadata(
    html,
    filename,
    options = {}
) {
    const {
        asciidocConverterFn,
        htmlAdocAttribute,
        insertSelector
    } = options;

    const document = parseHTML(html);
    const htmlElement = document.querySelector('html');

    if (!htmlElement) {
        console.warn('[vite-plugin-html-x-adoc] No html element found');
        return html;
    }

    const htmlFilename = filename ? basename(filename) : 'index.html';
    // Get adoc file path from html element attribute or default to index.adoc
    const adocPath = htmlElement.getAttribute(htmlAdocAttribute) || htmlFilename.replace(/\.html$/, '.adoc');
    // Resolve relative to the HTML file's directory
    const htmlDir = filename ? dirname(filename) : '.';
    const file = resolve(htmlDir, adocPath);

    // Load and convert the asciidoc document using the provided conversion function
    // The converter function accepts (filename, content) signature
    const content = readFileSync(file, {encoding: 'UTF-8'});
    const result = asciidocConverterFn(file, content);
    const {html: contentHtml, document: adoc} = typeof result === 'string'
        ? {html: result, document: null}
        : result;

    // Transform HTML document with metadata
    const node_head = document.querySelector('head');
    const node_body = document.querySelector('body');

    if (!node_head || !node_body) {
        console.warn('[vite-plugin-html-x-adoc] Missing head or body element');
        return html;
    }

    // Set lang attribute on html element
    if (adoc) {
        htmlElement.setAttribute('lang', adoc.hasAttribute('nolang') ? '' : adoc.getAttribute('lang', 'en'));

        // Add title
        const title = new HTMLElement('title', {});
        title.appendChild(new TextNode(adoc.getDoctitle() || adoc.getAttribute('untitled-label')));
        node_head.appendChild(title);

        // Add favicon
        const faviconHtml = getFavicon(adoc);
        if (faviconHtml) {
            node_head.appendChild(parseHTML(faviconHtml));
        }

        // Add meta tags
        appendMetaIf(node_head, 'application-name', adoc.getAttribute('app-name'));
        appendMetaIf(node_head, 'author', adoc.getAttribute('authors'));
        appendMetaIf(node_head, 'copyright', adoc.getAttribute('copyright'));
        appendMetaIf(node_head, 'description', adoc.getAttribute('description'));
        appendMetaIf(node_head, 'keywords', adoc.getAttribute('keywords'));
        appendMetaIf(node_head, 'generator', `Asciidoctor ${adoc.getAttribute('asciidoctor-version')}`);

        // Set body attributes
        setAttributeIf(node_body, 'id', adoc.getId());
        setAttributeIf(node_body, 'class', [
            adoc.getAttribute('doctype'),
            adoc.getAttribute('docrole') || adoc.getAttribute('role'),
        ].filter(Boolean).join(' '));
    }

    // Insert content into the specified selector
    const insertElement = document.querySelector(insertSelector);
    if (!insertElement) {
        console.warn(`[vite-plugin-html-x-adoc] Insert selector ${insertSelector} not found`);
        return html;
    }
    insertElement.appendChild(parseHTML(contentHtml));

    return document.toString();
}
