import type { Plugin, OutputChunk, NormalizedOutputOptions, OutputBundle } from 'rolldown';
import type JavaScriptTypes from '@ast-grep/napi/lang/JavaScript';
import type { Kinds } from '@ast-grep/napi/types/staticTypes';
import { Lang, parse } from '@ast-grep/napi';

/**
 * Extract CSS imports from source code
 */
const extractCssImports = (code: string): string[] => {
  const cssImports: string[] = [];

  // Match CSS import statements
  // Handles: import './style.css', import 'style.css', import './style.css?inline'
  const importRegex = /import\s+(['"])(.*?\.css(?:\?[^'"]*)?)\1/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const cssPath = match[2];
    cssImports.push(cssPath);
  }

  return cssImports;
};

/**
 * Inject css at the top of each generated chunk file for tsdown library builds.
 * This plugin automatically imports CSS files that are referenced by each chunk.
 */
export const libInjectCss = (): Plugin => {
  // Track CSS imports per module
  const cssImportMap = new Map<string, string[]>();
  // Track which modules are included in which chunks
  const moduleToChunkMap = new Map<string, string>();

  return {
    name: 'tsdown:lib-inject-css',

    // Set default config for better library bundling
    outputOptions(outputOptions) {
      // Prevent hoisting transitive imports to avoid tree-shaking issues
      if (typeof outputOptions.hoistTransitiveImports !== 'boolean') {
        return {
          ...outputOptions,
          hoistTransitiveImports: false
        };
      }
      return outputOptions;
    },

    // Capture CSS imports before they're stripped
    transform(code, id) {
      // Only process TypeScript/JavaScript files
      if (!/\.(tsx?|jsx?)$/.test(id)) {
        return null;
      }

      const cssImports = extractCssImports(code);

      if (cssImports.length > 0) {
        console.log(`BOSH: Found ${cssImports.length} CSS imports in ${id}:`, cssImports);
        cssImportMap.set(id, cssImports);
      }

      return null;
    },

    // Track which modules end up in which chunks
    renderChunk(code, chunk) {
      // Store the relationship between modules and chunks
      for (const moduleId of Object.keys(chunk.modules)) {
        moduleToChunkMap.set(moduleId, chunk.fileName);
      }
      return null;
    },

    generateBundle(options: NormalizedOutputOptions, bundle: OutputBundle) {
      // Build a map of chunk -> CSS files
      const chunkCssMap = new Map<string, Set<string>>();

      for (const [moduleId, cssImports] of cssImportMap.entries()) {
        const chunkName = moduleToChunkMap.get(moduleId);

        if (chunkName) {
          if (!chunkCssMap.has(chunkName)) {
            chunkCssMap.set(chunkName, new Set());
          }

          const chunkCss = chunkCssMap.get(chunkName)!;
          for (const cssImport of cssImports) {
            chunkCss.add(cssImport);
          }
        }
      }

      // Inject CSS imports into chunks
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') {
          continue;
        }

        const outputChunk = chunk as OutputChunk;

        // Skip non-JavaScript files (like .d.ts files)
        if (
          !outputChunk.fileName.endsWith('.js') &&
          !outputChunk.fileName.endsWith('.mjs') &&
          !outputChunk.fileName.endsWith('.cjs')
        ) {
          continue;
        }

        const cssFiles = chunkCssMap.get(outputChunk.fileName);

        if (!cssFiles || cssFiles.size === 0) {
          continue;
        }

        const excludeTokens: Kinds<JavaScriptTypes>[] = ['import_statement', 'expression_statement'];

        // Find the position to inject CSS imports
        const node = parse<JavaScriptTypes>(Lang.JavaScript, outputChunk.code)
          .root()
          .children()
          .find((node) => !excludeTokens.includes(node.kind()));

        const position = node?.range().start.index ?? 0;

        // Inject CSS imports at the top of the chunk
        let code = outputChunk.code;
        const injections: string[] = [];

        for (const cssFileName of cssFiles) {
          // Resolve the CSS file path relative to the chunk
          let cssFilePath = cssFileName;

          // If it's a relative import, keep it relative
          if (cssFilePath.startsWith('./') || cssFilePath.startsWith('../')) {
            // Already relative, use as-is
          } else {
            // Make it relative
            cssFilePath = `./${cssFilePath}`;
          }

          const injection = options.format === 'es' ? `import '${cssFilePath}';` : `require('${cssFilePath}');`;

          injections.push(injection);
        }

        if (injections.length > 0) {
          code = code.slice(0, position) + injections.join('\n') + '\n' + code.slice(position);
        }

        // Update code and sourcemap
        outputChunk.code = code;
      }
    }
  };
};

export default libInjectCss;
