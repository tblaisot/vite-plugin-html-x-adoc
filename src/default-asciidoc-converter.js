import asciidoctor from '@asciidoctor/core';
import {resolve} from "node:path";


export function createDefaultAsciidocConverter() {
    const asciidoctorInstance = asciidoctor();

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
            // If content is provided, use load() instead of loadFile()
            const adoc = asciidoctorInstance.load(content, OPTIONS);
            return {
                html: adoc.convert(),
                document: adoc
            };
        };
    }
}
