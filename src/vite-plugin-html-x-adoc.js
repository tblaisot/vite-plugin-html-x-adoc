import {dirname, relative, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {parse as parseHTML} from 'node-html-parser';
import {transformIndexHtmlWithMetadata} from './html-transformer.js';
import {createDefaultAsciidocConverter} from "./default-asciidoc-converter.js";
import {INCLUDES_KEY} from './asciidoctor/include-preprocessor.js';


export function vitePluginHtmlXAdoc(options = {}) {
    const {
        htmlAdocAttribute = 'data-adoc',
        insertSelector = '[data-adoc-insert-here]',
        asciidocConverterFn = createDefaultAsciidocConverter,
        reloadOnAdocChange = [], // Array of file paths or a function that returns file paths
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

        async handleHotUpdate({file, timestamp, modules, server}) {
            if (file.endsWith('.adoc')) {
                // Get all modules for the changed .adoc file (Vite may have multiple modules for the same file)
                const changedModules = server.moduleGraph.getModulesByFile(file);
                if (!changedModules || changedModules.size === 0) {
                    return modules;
                }

                // Find all modules that import this .adoc file
                const dependentModules = new Set();

                // For each module instance of the changed file, find its importers
                for (const changedModule of changedModules) {
                    if (changedModule.importers) {
                        for (const importer of changedModule.importers) {
                            dependentModules.add(importer);
                        }
                    }
                }

                // Add additional files configured to reload on .adoc changes
                if (reloadOnAdocChange) {
                    // Get file paths to reload (support function or array)
                    const filesToReload = typeof reloadOnAdocChange === 'function'
                        ? reloadOnAdocChange(file)
                        : reloadOnAdocChange;

                    // Ensure filesToReload is an array
                    if (Array.isArray(filesToReload) && filesToReload.length > 0) {
                        for (const fileToReload of filesToReload) {
                            // Resolve file path (could be relative or absolute)
                            let resolvedPath = fileToReload;
                            if (!resolvedPath.startsWith('/') && (!/^[A-Z]:/.test(resolvedPath) || resolvedPath.startsWith('./'))) {
                                // Relative path - resolve from baseDir
                                resolvedPath = resolvedBaseDir
                                    ? resolve(resolvedBaseDir, resolvedPath).replace(/\\/g, '/')
                                    : resolve(process.cwd(), resolvedPath).replace(/\\/g, '/');
                            } else {
                                resolvedPath = resolvedPath.replace(/\\/g, '/');
                            }

                            // Find modules for this file
                            const reloadModules = server.moduleGraph.getModulesByFile(resolvedPath);
                            if (reloadModules) {
                                for (const reloadModule of reloadModules) {
                                    dependentModules.add(reloadModule);
                                }
                            }
                        }
                    }
                }

                // Convert Set to Array and filter out null/undefined
                const modulesToUpdate = Array.from(dependentModules).filter(Boolean);

                // If we found dependent modules, return them; otherwise fall back to default behavior
                return modulesToUpdate.length > 0 ? modulesToUpdate : modules;
            } else {
                return modules;
            }
        },

        // --- Dev Mode (JS Module Generation) ---
        transform(code, id) {
            // Handle included .adoc files - return noop JS to create module dependency without processing
            if (!isBuild && id.includes('?adoc-included')) {
                // Return empty noop JavaScript - this file is only imported for dependency tracking
                // The actual content is processed when the parent .adoc file is transformed
                return `
                    // Noop module for included file in .adoc - dependency tracking only
                    // HMR support
                    if (import.meta.hot) {
                      import.meta.hot.accept();
                    }
                `.trim();
            }

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
                    const document = typeof result === 'string' ? null : result.document;

                    // Build import statements for included .adoc files to create module dependencies
                    // This allows Vite's module graph to track them for HMR
                    const importStatements = [];
                    if (document && document[INCLUDES_KEY]) {
                        const includes = document[INCLUDES_KEY];
                        if (includes) {
                            // Get the directory of the current file for relative path calculation
                            const currentFileDir = dirname(cleanId);

                            for (const includePath of includes) {
                                // Only process .adoc files (other includes are handled differently)
                                if (includePath.endsWith('.adoc') && existsSync(includePath)) {
                                    // Convert absolute path to relative path from current file directory
                                    const relativeIncludePath = relative(currentFileDir, includePath).replace(/\\/g, '/');
                                    // Ensure relative path starts with ./ or ../
                                    const importPath = relativeIncludePath.startsWith('.')
                                        ? relativeIncludePath
                                        : './' + relativeIncludePath;

                                    // Add to watch list and create import statement
                                    // The import statement creates a module dependency in Vite's graph
                                    // so when the included file changes, Vite knows to re-transform this module
                                    this.addWatchFile(includePath);
                                    importStatements.push(`import ${JSON.stringify(importPath + '?adoc-included')};`);
                                } else {
                                    // For non-.adoc files, just add to watch list
                                    this.addWatchFile(includePath);
                                }
                            }
                        }
                    }

                    // Return JavaScript that creates/replaces a div and inserts content
                    // HMR-compatible: replaces existing content instead of appending
                    // Uses the same selector as build mode: [data-adoc-insert-here]
                    const js = `
                            ${importStatements.join('\n')}
                            
                            (function() {
                                // Find the content div using the same selector as build mode
                                let div = document.querySelector(${JSON.stringify(insertSelector)});
                                if (!div) {
                                    console.warn('[vite-plugin-html-x-adoc] Content div not found with selector ${insertSelector}');
                                    return;
                                }
                                // Replace content (for HMR updates)
                                div.innerHTML = ${JSON.stringify(html)};
                                // div.dispatchEvent(new Event("HMR"));
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
