import type { Plugin, OutputChunk, NormalizedOutputOptions, OutputBundle, OutputOptions } from 'rolldown';
import type JavaScriptTypes from '@ast-grep/napi/lang/JavaScript';
import type { Kinds } from '@ast-grep/napi/types/staticTypes';
import { Lang, parse, type SgNode } from '@ast-grep/napi';

type CSSFiles = Set<string> | undefined;

type NodePos = SgNode<JavaScriptTypes> | undefined;

/**
 * @name extractCssImports
 * @description Extract CSS imports from source code
 * @example
 * const s = 'import "./index.css";'
 * const arr = extractCssImports(s) // ["./index.css"]
 * @param code - The source code to analyze
 * @returns An array of CSS import paths
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
 * @description Inject CSS files at the top of each generated chunk file for tsdown builds.
 * @return {Plugin} A Rolldown plugin to inject CSS imports into library chunks.
 */
export const injectCssPlugin = (): Plugin => {
  // Track CSS imports per module
  const cssImportMap = new Map<string, string[]>();
  // Track which modules are included in which chunks
  const moduleToChunkMap = new Map<string, string>();

  return {
    name: 'tsdown:lib-inject-css',

    // Set default config for better library bundling
    // Not sure if this is required
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

    // Capture CSS imports before they're stripped by the build
    transform(code, id) {
      // Only process TypeScript/JavaScript files (ignore .d.ts files)
      if (!/\.(tsx?|jsx?)$/.test(id)) {
        return null;
      }

      const cssImports = extractCssImports(code);

      if (cssImports.length > 0) {
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
      // Gather all CSS files that have been bundled
      const outputCssFiles = new Set<string>();
      for (const file of Object.keys(bundle)) {
        if (file.endsWith('.css')) {
          outputCssFiles.add(file);
        }
      }

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
            // Normalize CSS import path to match the output file name
            const normalizedPath = cssImport.replace(/^\.\//, '');

            // Only add CSS files have been bundled
            if (outputCssFiles.has(normalizedPath)) {
              chunkCss.add(normalizedPath);
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

        // Update code and sourcemap
        outputChunk.code = code;
      }
    }

    // generateBundle(options: NormalizedOutputOptions, bundle: OutputBundle) {
    //   // First, get all CSS files that actually exist in the output bundle
    //   const outputCssFiles = new Set<string>();
    //   for (const file of Object.keys(bundle)) {
    //     if (file.endsWith('.css')) {
    //       outputCssFiles.add(file);
    //     }
    //   }
    //
    //   console.log('BOSH: CSS files in output bundle:', Array.from(outputCssFiles));
    //
    //   // Build a map of chunk -> CSS files
    //   const chunkCssMap = new Map<string, Set<string>>();
    //
    //   for (const [moduleId, cssImports] of cssImportMap.entries()) {
    //     const chunkName = moduleToChunkMap.get(moduleId);
    //
    //     if (chunkName) {
    //       if (!chunkCssMap.has(chunkName)) {
    //         chunkCssMap.set(chunkName, new Set());
    //       }
    //
    //       const chunkCss = chunkCssMap.get(chunkName)!;
    //       for (const cssImport of cssImports) {
    //         // Normalize the CSS import path to match output file names
    //         const normalizedPath = cssImport.replace(/^\.\//, '');
    //
    //         // Only add CSS files that actually exist in the output bundle
    //         if (outputCssFiles.has(normalizedPath)) {
    //           chunkCss.add(normalizedPath);
    //           console.log(`BOSH: Adding CSS ${normalizedPath} to chunk ${chunkName}`);
    //         } else {
    //           console.log(
    //             `BOSH: Skipping CSS ${normalizedPath} (not in output bundle, likely bundled into another CSS file)`
    //           );
    //         }
    //       }
    //     }
    //   }
    //
    //   console.log('BOSH: Chunk CSS Map:', Array.from(chunkCssMap.entries()));
    //
    //   // Inject CSS imports into chunks
    //   for (const chunk of Object.values(bundle)) {
    //     if (chunk.type !== 'chunk') {
    //       continue;
    //     }
    //
    //     const outputChunk = chunk as OutputChunk;
    //
    //     // Skip non-JavaScript files (like .d.ts files)
    //     if (
    //       !outputChunk.fileName.endsWith('.js') &&
    //       !outputChunk.fileName.endsWith('.mjs') &&
    //       !outputChunk.fileName.endsWith('.cjs')
    //     ) {
    //       continue;
    //     }
    //
    //     const cssFiles = chunkCssMap.get(outputChunk.fileName);
    //
    //     if (!cssFiles || cssFiles.size === 0) {
    //       console.log(`BOSH: No CSS imports for ${outputChunk.fileName}`);
    //       continue;
    //     }
    //
    //     console.log(`BOSH: Injecting ${cssFiles.size} CSS imports into ${outputChunk.fileName}`);
    //
    //     // Find the position to inject CSS imports
    //     const node = parse<JavaScriptTypes>(Lang.JavaScript, outputChunk.code)
    //       .root()
    //       .children()
    //       .find((node) => !excludeTokens.includes(node.kind()));
    //
    //     const position = node?.range().start.index ?? 0;
    //
    //     // Inject CSS imports at the top of the chunk
    //     let code = outputChunk.code;
    //     const injections: string[] = [];
    //
    //     for (const cssFileName of cssFiles) {
    //       // Resolve the CSS file path relative to the chunk
    //       let cssFilePath = cssFileName;
    //
    //       // If it's a relative import, keep it relative
    //       if (cssFilePath.startsWith('./') || cssFilePath.startsWith('../')) {
    //         // Already relative, use as-is
    //       } else {
    //         // Make it relative
    //         cssFilePath = `./${cssFilePath}`;
    //       }
    //
    //       const injection = options.format === 'es' ? `import '${cssFilePath}';` : `require('${cssFilePath}');`;
    //
    //       injections.push(injection);
    //     }
    //
    //     if (injections.length > 0) {
    //       code = code.slice(0, position) + injections.join('\n') + '\n' + code.slice(position);
    //     }
    //
    //     // Update code and sourcemap
    //     outputChunk.code = code;
    //
    //     if (sourcemap && options.sourcemap) {
    //       const ms = new MagicString(code);
    //       outputChunk.map = ms.generateMap({ hires: 'boundary' }) as any;
    //     }
    //
    //     console.log(`BOSH: Successfully injected CSS into ${outputChunk.fileName}`);
    //   }
    // }
  };
};
