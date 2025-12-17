# vite-plugin-html-x-adoc

A Vite plugin that processes AsciiDoc files and injects them into HTML files with full Hot Module Replacement (HMR) support in development mode and static HTML generation in build mode.

## Features

* Hot Module Replacement (HMR) support in development mode
* Static HTML generation in build mode
* Customizable AsciiDoc conversion function
* Automatic HTML metadata injection (title, meta tags, favicon, etc.)
* Configurable HTML attributes and selectors

## Installation

```bash
npm install vite-plugin-html-x-adoc @asciidoctor/core
```

## Basic Usage

### 1. Configure Vite

Add the plugin to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import { vitePluginHtmlXAdoc } from 'vite-plugin-html-x-adoc';

export default defineConfig({
  plugins: [
    vitePluginHtmlXAdoc({
      // Plugin options (all optional)
    })
  ]
});
```

### 2. HTML Structure

Your HTML file must follow this structure:

```html
<!DOCTYPE html>
<html data-adoc="./index.adoc">
<head>
  <meta charset="UTF-8">
  <title>Document</title>
</head>
<body>
  <div data-adoc-insert-here></div>
</body>
</html>
```

* The `data-adoc` attribute on the `<html>` element specifies the path to your AsciiDoc file (relative to the HTML file)
* The `data-adoc-insert-here` selector marks where the converted AsciiDoc content will be inserted

### 3. AsciiDoc File

Create your AsciiDoc file (e.g., `index.adoc`):

```asciidoc
= My Document Title

This is my AsciiDoc content.

== Section One

Content goes here.
```

## Configuration Options

All options are optional and have sensible defaults:

```javascript
vitePluginHtmlXAdoc({
  // HTML attribute that contains the AsciiDoc file path
  htmlAdocAttribute: 'data-adoc',  // default: 'data-adoc'
  
  // CSS selector for the insertion point
  insertSelector: '[data-adoc-insert-here]',  // default: '[data-adoc-insert-here]'
  
  // Base directory for AsciiDoc processing
  baseDir: './src',  // default: './src'
  
  // Output directory for AsciiDoc processing
  toDir: './dist',  // default: './dist'
  
  // Custom AsciiDoc converter function
  asciidocConverterFn: myCustomConverter  // default: uses default converter
})
```

### Option Details

**`htmlAdocAttribute`**:  
The HTML attribute name on the `<html>` element that contains the path to the AsciiDoc file.  
Default: `'data-adoc'`

**`insertSelector`**:  
CSS selector for the element where AsciiDoc content will be inserted.  
Default: `'[data-adoc-insert-here]'`

**`baseDir`**:  
Base directory used by AsciiDoc for resolving includes and other relative paths.  
Default: `'./src'`

**`toDir`**:  
Output directory used by AsciiDoc for resolving output paths.  
Default: `'./dist'`

**`asciidocConverterFn`**:  
Custom function to convert AsciiDoc content. See [Custom Converter Function](#custom-converter-function) for details.  
Default: Uses the default converter with standard AsciiDoc options.

## Custom Converter Function

You can provide a custom function to control how AsciiDoc files are converted. This is useful for:

* Custom templates
* Custom treeprocessors
* Custom attributes
* Different AsciiDoc backends

### Function Signature

```javascript
function myCustomConverter(filename, content) {
  // filename: string - Path to the AsciiDoc file
  // content: string - Content of the AsciiDoc file
  
  // Your conversion logic here
  
  return {
    html: '<div>Converted HTML</div>',
    document: adocDocument  // Asciidoctor document object (optional)
  };
}
```

The function can return:
- An object with `{html: string, document?: object}` - Recommended for metadata injection
- A string (HTML content) - Simple case without metadata

### Example: Default AsciiDoc Converter

The default converter uses standard AsciiDoc with basic HTML5 output:

```javascript
import { defineConfig } from 'vite';
import { vitePluginHtmlXAdoc, createDefaultAsciidocConverter } from 'vite-plugin-html-x-adoc';

export default defineConfig({
  plugins: [
    vitePluginHtmlXAdoc({
      // Explicitly use the default converter (this is the default behavior)
      asciidocConverterFn: createDefaultAsciidocConverter({
        baseDir: './src',
        toDir: './dist'
      })
    })
  ]
});
```

The default converter provides:
* Standard AsciiDoc HTML5 output
* Basic attributes: `showtitle`, `icons: font`
* Safe mode: `unsafe` (allows includes, etc.)
* No header/footer (fragment output)

### Example: Custom Converter

You can create your own converter function:

```javascript
import { defineConfig } from 'vite';
import { vitePluginHtmlXAdoc } from 'vite-plugin-html-x-adoc';
import asciidoctor from '@asciidoctor/core';
import { resolve } from 'node:path';

function createCustomConverter(options) {
  const asciidoctorInstance = asciidoctor();
  const { rootDir, baseDir, toDir } = options;
  
  return (filename, content) => {
    const adoc = asciidoctorInstance.load(content, {
      safe: 'unsafe',
      backend: 'html5',
      header_footer: false,
      base_dir: resolve(rootDir, baseDir),
      to_dir: resolve(rootDir, toDir),
      source: filename,
      attributes: {
        'showtitle': true,
        'icons': 'font',
        'custom-attr': 'value',
        'source-highlighter': 'highlight.js'
      }
    });
    
    return {
      html: adoc.convert(),
      document: adoc
    };
  };
}

export default defineConfig({
  plugins: [
    vitePluginHtmlXAdoc({
      asciidocConverterFn: createCustomConverter({
        baseDir: './src',
        toDir: './dist',
        rootDir: process.cwd()
      })
    })
  ]
});
```

## Development Mode

In development mode, the plugin:

* Transforms `.adoc` files into JavaScript modules
* Injects a script tag into your HTML to load the AsciiDoc module
* Provides HMR support - changes to `.adoc` files trigger automatic page updates
* Content is injected into the element matching `insertSelector`

## Build Mode

In build mode, the plugin:

* Reads the AsciiDoc file specified in `data-adoc` attribute
* Converts it using your converter function
* Injects the HTML content into the `insertSelector` element
* Adds metadata to the HTML document:
  * Document title
  * Meta tags (author, description, keywords, etc.)
  * Favicon (if specified in AsciiDoc attributes)
  * Language attribute on `<html>` element
  * Body ID and class attributes

## HTML Metadata Injection

In build mode, the plugin automatically injects metadata from the AsciiDoc document (if the converter returns a `document` object):

* `<title>`: Document title or untitled label
* Meta tags: `application-name`, `author`, `copyright`, `description`, `keywords`, `generator`
* Favicon: If `favicon` attribute is set in AsciiDoc
* `<html lang="">`: Language attribute (from `lang` attribute, default: `en`)
* `<body>`: ID and class attributes (from document ID, doctype, docrole/role)

## Complete Example

### Step 1: Install Dependencies

```bash
npm install vite-plugin-html-x-adoc @asciidoctor/core
```

### Step 2: Configure Vite

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { vitePluginHtmlXAdoc } from 'vite-plugin-html-x-adoc';

export default defineConfig({
  plugins: [
    vitePluginHtmlXAdoc()
  ]
});
```

### Step 3: Create HTML File

```html
<!-- index.html -->
<!DOCTYPE html>
<html data-adoc="./index.adoc">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div data-adoc-insert-here></div>
</body>
</html>
```

### Step 4: Create AsciiDoc File

```asciidoc
// index.adoc
= My Document Title
:author: John Doe
:description: A sample document

This is a sample AsciiDoc document.

== Introduction

The plugin provides standard AsciiDoc HTML5 output.

* List item one
* List item two

== Code Example

[source,javascript]
----
console.log('Hello, World!');
----
```

## Troubleshooting

### Content Not Appearing

* Ensure the `data-adoc` attribute points to a valid AsciiDoc file path (relative to the HTML file)
* Verify the `insertSelector` element exists in your HTML
* Check the browser console for error messages

### HMR Not Working

* Ensure you're in development mode (`npm run dev`)
* Check that the AsciiDoc file path in `data-adoc` is correct
* Verify the `insertSelector` element exists before the script runs

### Build Errors

* Check that all AsciiDoc files referenced in HTML files exist
* Verify file paths are correct relative to the HTML file location
* Ensure your custom converter function returns the correct format: `{ html: string, document?: object }` or a string

## License

ISC
