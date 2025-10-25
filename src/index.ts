import type { Plugin, OutputChunk, NormalizedOutputOptions, OutputBundle, OutputOptions } from 'rolldown';
import type JavaScriptTypes from '@ast-grep/napi/lang/JavaScript';
import type { Kinds } from '@ast-grep/napi/types/staticTypes';
import { Lang, parse, type SgNode } from '@ast-grep/napi';
import { basename } from 'node:path';

type CSSFiles = Set<string> | undefined;

type NodePos = SgNode<JavaScriptTypes> | undefined;

/**
 * @name extractStyleImports
 * @description Extract CSS imports (including CSS Modules) from source code
 * @example
 * const s = 'import "./index.css"; import styles from "./Button.module.css";'
 * const arr = extractStyleImports(s) // ["./index.css", "./Button.module.css"]
 * @param code - The source code to analyze
 * @returns An array of CSS import paths
 */
const extractStyleImports = (code: string): string[] => {
  const styleImports: string[] = [];

  // Match CSS file extensions (including CSS Modules)
  const cssExtensions = /\.css(?:\?[^'"]*)?/;

  // Pattern 1: import './style.css' or import 'style.css'
  const sideEffectImportRegex = /import\s+(['"])(.*?)\1/g;

  // Pattern 2: import styles from './style.module.css'
  const namedImportRegex = /import\s+(?:\*\s+as\s+)?(\w+)\s+from\s+(['"])(.*?)\2/g;

  // Pattern 3: import { something } from './style.css'
  const destructuredImportRegex = /import\s+{[^}]+}\s+from\s+(['"])(.*?)\1/g;

  // Check side-effect imports
  let match;
  while ((match = sideEffectImportRegex.exec(code)) !== null) {
    const importPath = match[2];
    if (cssExtensions.test(importPath)) {
      styleImports.push(importPath);
    }
  }

  // Check named imports (e.g., CSS modules)
  while ((match = namedImportRegex.exec(code)) !== null) {
    const importPath = match[3];
    if (cssExtensions.test(importPath)) {
      styleImports.push(importPath);
    }
  }

  // Check destructured imports
  while ((match = destructuredImportRegex.exec(code)) !== null) {
    const importPath = match[2];
    if (cssExtensions.test(importPath)) {
      styleImports.push(importPath);
    }
  }

  return styleImports;
};

/**
 * @description Inject CSS files at the top of each generated chunk file for tsdown builds.
 * @return {Plugin} A Rolldown plugin to inject CSS imports into library chunks.
 */
const injectCssPlugin = (): Plugin => {
  // Track style imports per module
  const styleImportMap = new Map<string, string[]>();
  // Track which modules are included in which chunks
  const moduleToChunkMap = new Map<string, string>();

  return {
    name: 'tsdown:lib-inject-css',

    // Set default config for better library bundling
    outputOptions(outputOptions: OutputOptions): OutputOptions {
      // Prevent hoisting transitive imports to avoid tree-shaking issues
      if (typeof outputOptions.hoistTransitiveImports !== 'boolean') {
        return {
          ...outputOptions,
          hoistTransitiveImports: false
        };
      }

      return outputOptions;
    },

    // Capture style imports before they're stripped by the build
    transform(code, id) {
      // Only process TypeScript/JavaScript files (ignore .d.ts files)
      if (!/\.(tsx?|jsx?)$/.test(id)) {
        return null;
      }

      const styleImports = extractStyleImports(code);

      if (styleImports.length > 0) {
        styleImportMap.set(id, styleImports);
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
      // Gather all CSS files that have been bundled
      const outputCssFiles = new Set<string>();
      for (const file of Object.keys(bundle)) {
        if (file.endsWith('.css')) {
          outputCssFiles.add(file);
        }
      }

      // Build a map of chunk -> CSS files
      // This aggregates ALL style imports from ALL modules in each chunk
      const chunkCssMap = new Map<string, Set<string>>();

      for (const [moduleId, styleImports] of styleImportMap.entries()) {
        const chunkName = moduleToChunkMap.get(moduleId);

        if (chunkName) {
          if (!chunkCssMap.has(chunkName)) {
            chunkCssMap.set(chunkName, new Set());
          }

          const chunkCss = chunkCssMap.get(chunkName)!;
          for (const styleImport of styleImports) {
            // Remove query parameters
            const cleanPath = styleImport.split('?')[0];

            // Get the base filename
            const fileName = basename(cleanPath);

            // Try to find matching CSS file in output
            const possibleMatches = Array.from(outputCssFiles).filter((cssFile) => {
              const cssBaseName = basename(cssFile);

              // Exact filename match (including .module.css files)
              return cssBaseName === fileName;
            });

            // If we found exact matches, add them
            if (possibleMatches.length > 0) {
              possibleMatches.forEach((match) => chunkCss.add(match));
            } else if (outputCssFiles.size === 1) {
              // If there's only one CSS file in the output, assume all styles
              // are bundled into it (common case for libraries)
              const [singleCssFile] = Array.from(outputCssFiles);
              chunkCss.add(singleCssFile);
            }
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

        const cssFiles: CSSFiles = chunkCssMap.get(outputChunk.fileName);

        if (!cssFiles || cssFiles.size === 0) {
          continue;
        }

        const excludeTokens: Kinds<JavaScriptTypes>[] = ['import_statement', 'expression_statement'];

        // Find the position to inject CSS imports
        const node: NodePos = parse<JavaScriptTypes>(Lang.JavaScript, outputChunk.code)
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

        // Update code
        outputChunk.code = code;
      }
    }
  };
};

export default injectCssPlugin;
export { injectCssPlugin };
