import asciidoctorFactory from '@asciidoctor/core';
import {resolve} from "node:path";
import * as includePreprocessor from "./asciidoctor/include-preprocessor.js"

const asciidoctor = asciidoctorFactory();

export function createDefaultAsciidocConverter() {

    return ({rootDir, baseDir, toDir}) => {
        const base_dir = resolve(rootDir, baseDir);
        const to_dir = resolve(rootDir, toDir);

        const OPTIONS = {
            safe: 'unsafe',
            backend: 'html5',
            header_footer: false,
            attributes: {
                'showtitle': true,
                'icons': 'font'
            },
            base_dir,
            to_dir
        };

        return (filename, content) => {

            const registry = asciidoctor.Extensions.create();
            includePreprocessor.register(registry);
            OPTIONS.extension_registry = registry;
            // If content is provided, use load() instead of loadFile()
            const adoc = asciidoctor.load(content, OPTIONS);
            return {
                html: adoc.convert(),
                document: adoc
            };
        };
    }
}
