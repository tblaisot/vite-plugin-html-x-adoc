import {dirname, relative, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {parse as parseHTML} from 'node-html-parser';
import {transformIndexHtmlWithMetadata} from './html-transformer.js';
import {createDefaultAsciidocConverter} from "./default-asciidoc-converter.js";


export function vitePluginHtmlXAdoc(options = {}) {
    const {
        htmlAdocAttribute = 'data-adoc',
        insertSelector = '[data-adoc-insert-here]',
        asciidocConverterFn = createDefaultAsciidocConverter,
    } = options;

    let isBuild = false;
    let rootDir = '';
    let resolvedBaseDir = '';
    let resolvedToDir = '';
    let converterFn;

    return {
        name: 'vite-plugin-html-x-adoc',

        // Determine if we are in build mode
        config(config, {command}) {
            isBuild = command === 'build';
        },
        // Resolve config from Vite
        configResolved(config) {
            rootDir = process.cwd(); // rootDir is always the actual project root (where vite.config.js is)
            resolvedBaseDir = config.root; // In configResolved config.root is always defined
            resolvedToDir = config.build.outDir;// In configResolved config.build.outDir is always defined

            // Wrap custom converter to pass options automatically
            converterFn = asciidocConverterFn({
                rootDir,
                baseDir: resolvedBaseDir,
                toDir: resolvedToDir
            });
        },

        resolveMimeType(context) {
            // Serve .adoc files as JavaScript
            if (!isBuild && context.path.endsWith('.adoc')) {
                return 'application/javascript';
            }
        },

        // Resolve .adoc file imports
        resolveId(id, importer) {
            if (!isBuild && id.endsWith('.adoc')) {
                // Remove query parameters from id
                const cleanId = id.split('?')[0];
                
                // If id is already absolute, return it
                if (cleanId.startsWith('/') || /^[A-Z]:/.test(cleanId)) {
                    return cleanId;
                }
                
                // Resolve relative to importer (HTML file) or base directory
                let resolvedPath;
                if (importer) {
                    // Remove query parameters from importer path
                    const cleanImporter = importer.split('?')[0];
                    // Get absolute path of importer directory
                    // If importer is relative, resolve it relative to baseDir or cwd
                    let importerAbsPath = cleanImporter;
                    if (!importerAbsPath.startsWith('/') && !/^[A-Z]:/.test(importerAbsPath)) {
                        // Relative path - resolve from baseDir or cwd
                        importerAbsPath = resolvedBaseDir 
                            ? resolve(resolvedBaseDir, cleanImporter)
                            : resolve(process.cwd(), cleanImporter);
                    }
                    const importerDir = dirname(importerAbsPath);
                    resolvedPath = resolve(importerDir, cleanId);
                } else if (resolvedBaseDir) {
                    resolvedPath = resolve(resolvedBaseDir, cleanId);
                } else {
                    // Fallback: resolve relative to current working directory
                    resolvedPath = resolve(process.cwd(), cleanId);
                }
                
                // Normalize path separators
                const normalizedPath = resolvedPath.replace(/\\/g, '/');
                
                // Check if file exists
                if (existsSync(normalizedPath)) {
                    return normalizedPath;
                }
                
                // If file doesn't exist and we have a baseDir, try resolving from baseDir
                if (resolvedBaseDir && importer) {
                    const baseDirPath = resolve(resolvedBaseDir, cleanId).replace(/\\/g, '/');
                    if (existsSync(baseDirPath)) {
                        return baseDirPath;
                    }
                }
                
                // Return the resolved path anyway - Vite will handle the error if file doesn't exist
                return normalizedPath;
            }
        },

        // --- Dev Mode (JS Module Generation) ---
        transform(code, id) {
            if (!isBuild && (id.endsWith('.adoc') || id.endsWith('.adoc?import'))) {
                // Process .adoc files and return JavaScript that injects content
                try {
                    // Clean the id to remove query parameters for path resolution
                    const cleanId = id.split('?')[0];

                    // Use custom conversion function (or default custom rendering)
                    // Pass content directly since Vite already read it
                    // Options are automatically passed by the wrapper function
                    const result = converterFn(cleanId, code);
                    const html = typeof result === 'string' ? result : result.html;

                    // Return JavaScript that creates/replaces a div and inserts content
                    // HMR-compatible: replaces existing content instead of appending
                    // Uses the same selector as build mode: [data-adoc-insert-here]
                    const js = `
                            (function() {
                                // Find the content div using the same selector as build mode
                                let div = document.querySelector(${JSON.stringify(insertSelector)});
                                if (!div) {
                                    console.warn('[vite-plugin-html-x-adoc] Content div not found with selector ${insertSelector}');
                                    return;
                                }
                                // Replace content (for HMR updates)
                                div.innerHTML = ${JSON.stringify(html)};
                            })();
                            
                            // HMR support
                            if (import.meta.hot) {
                              import.meta.hot.accept();
                              import.meta.hot.dispose(() => {
                                // Cleanup if needed
                              });
                            }
                            `.trim();

                    return js;
                } catch (error) {
                    console.error(`Error processing Asciidoctor file ${id}:`, error);
                    const errorMessage = `Error processing ${id}: ${error.message}`;
                    const errorJs = `
                            (function() {
                                // Find the content div using the same selector as build mode
                                let div = document.querySelector(${JSON.stringify(insertSelector)});
                                if (!div) {
                                    console.warn('[vite-plugin-html-x-adoc] Content div not found with selector ${insertSelector}');
                                    return;
                                }
                                // Replace content (for HMR updates)
                                div.innerHTML = ${JSON.stringify(`<p>${errorMessage}</p>`)};
                            })();
                            
                            if (import.meta.hot) {
                              import.meta.hot.accept();
                            }
                            `.trim();
                    return errorJs;
                }
            }
        },

        // --- Build Mode (HTML Injection & Asset Emission) ---
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                if (!isBuild) {
                    // Dev mode: inject script tag to load the .adoc module
                    // Read adoc file path from <html data-adoc> attribute (same as build mode)
                    const document = parseHTML(html);
                    const htmlElement = document.querySelector('html');

                    if (!htmlElement) {
                        console.warn('[vite-plugin-html-x-adoc] No html element found');
                        return html;
                    }

                    const adocPath = htmlElement.getAttribute(htmlAdocAttribute) || 'index.adoc';

                    // Check if insert selector exists
                    const insertEl = document.querySelector(insertSelector);
                    if (!insertEl) {
                        console.warn(`[vite-plugin-html-x-adoc] Insert selector ${insertSelector} not found`);
                        return html;
                    }

                    // Resolve adoc path relative to HTML file location for import
                    // The path from HTML attribute is relative to the HTML file
                    const htmlDir = ctx.filename ? dirname(ctx.filename) : resolvedBaseDir;
                    const resolvedAdocPath = resolve(htmlDir, adocPath);
                    const relativeAdocPath = relative(resolvedBaseDir, resolvedAdocPath).replace(/\\/g, '/');

                    // Inject script tag to load the .adoc module
                    // The script will inject content into [data-adoc-insert-here]
                    const scriptHtml = `<script type="module">import ${JSON.stringify(relativeAdocPath)};</script>`;
                    // const scriptHtml = `<script type="module" src=${JSON.stringify(relativeAdocPath+'.js')}>/* HMR */</script>`;

                    // Use string replacement to insert script right after insertEl element
                    insertEl.after(parseHTML(scriptHtml));
                    return document.toString();
                } else if (isBuild) {
                    // Build mode: use transformIndexHtmlWithMetadata for full HTML transformation
                    try {
                        return transformIndexHtmlWithMetadata(
                            html,
                            ctx.filename,
                            {
                                asciidocConverterFn: converterFn,
                                baseDir: resolvedBaseDir,
                                toDir: resolvedToDir,
                                rootDir,
                                htmlAdocAttribute,
                                insertSelector
                            });
                    } catch (error) {
                        console.error(`[vite-plugin-html-x-adoc] Error processing AsciiDoc in build mode: ${error.message}`);
                        console.error(error.stack);
                        // Return original HTML on error to allow build to continue
                        return html;
                    }
                }
            }
        }
    };
}
