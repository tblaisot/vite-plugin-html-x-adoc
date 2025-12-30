import {dirname, normalize, resolve} from "node:path";
import {existsSync, readFileSync} from "node:fs";

export const INCLUDES_KEY = '__includes__';

/**
 * Process include directives recursively
 * @param {string} filePath - Path to the current document
 * @param {string[]} lines - Lines of the document
 */
function processIncludes(filePath, lines, includesFound, visitedFiles = new Set()) {
    const absoluteFilePath = resolve(filePath);
    const baseDir = dirname(absoluteFilePath);
    visitedFiles.add(absoluteFilePath);

    const includePattern = /^include::([^\[]+)\[(.*?)\]$/;

    lines.forEach((line) => {
        const match = line.trim().match(includePattern);
        if (match) {
            const includePath = match[1];

            // Resolve path relative to the current document's directory
            const resolvedPath = normalize(resolve(baseDir, includePath));

            includesFound.add(resolvedPath);

            // If it's an .adoc file, process it recursively
            if (includePath.endsWith('.adoc')) {
                // Only process if file exists and hasn't been visited
                if (existsSync(resolvedPath) && !visitedFiles.has(resolvedPath)) {
                    try {
                        const content = readFileSync(resolvedPath, 'utf-8');
                        const includedLines = content.split('\n');
                        processIncludes(resolvedPath, includedLines, includesFound, visitedFiles);
                    } catch (error) {
                        // Silently ignore errors reading included files
                    }
                }
            }
        }
    });
}

export function register(registry) {
    registry.preprocessor(function () {
        const self = this;
        self.process(function (doc, reader) {
            // console.log(doc)
            const lines = reader.lines;
            // Get the source file path from the document
            const filePath = doc.getAttribute('docfile');

            const includesFound = new Set();

            if (filePath) {
                const absolutePath = resolve(filePath);
                processIncludes(absolutePath, lines, includesFound);
            }

            doc[INCLUDES_KEY] = includesFound;
        })
    })
}
