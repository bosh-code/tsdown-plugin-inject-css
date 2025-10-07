# @bosh-code/tsdown-plugin-inject-css

[![npm version](https://img.shields.io/npm/v/@bosh-code/tsdown-plugin-inject-css)](https://npmjs.com/package/@bosh-code/tsdown-plugin-inject-css)
![license](https://img.shields.io/npm/l/@bosh-code/tsdown-plugin-inject-css)

Inject CSS imports at the top of each chunk file in tsdown builds.

During the build process, tsdown strips CSS imports from your source files. This plugin tracks those imports and
re-injects them into output chunks.

```js
// Input: foo.ts
import './foo.css';

export const Foo = () => <div>Foo</div>;

// Output: foo.js (with plugin)
import './foo.css';

export const Foo = () => <div>Foo</div>;
```

## Features

- 💡 Automatically tracks CSS imports before they're stripped
- 🎯 Injects imports into the correct output chunks
- ⚡️ Sourcemap support
- 🛠 Out-of-box, minimal configuration
- 🔄 Works with tsdown's code splitting and chunking

## Installation

```bash
npm install @bosh-code/tsdown-plugin-inject-css -D
# or
pnpm add @bosh-code/tsdown-plugin-inject-css -D
# or
yarn add @bosh-code/tsdown-plugin-inject-css -D
```

## Usage

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown';
import { libInjectCss } from '@bosh-code/tsdown-plugin-inject-css';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  plugins: [
    libInjectCss({
      sourcemap: true, // default: true
    }),
  ],
});
```

## How It Works

The plugin operates in three phases:

1. **Transform Phase**: Scans source files for CSS imports (e.g., `import './style.css'`) before they're stripped
2. **Render Phase**: Tracks which source modules end up in which output chunks
3. **Generate Phase**: Re-injects the CSS imports at the top of the appropriate chunks

### Example

Given this structure:

```ts
// src/foo.ts
import './foo.css';

export const Foo = () => <div>Foo < /div>;

// src/bar.ts
import './bar.css';

export const Bar = () => <div>Bar < /div>;

// src/index.ts
export { Foo } from './foo';
export { Bar } from './bar';
```

The plugin ensures:

- `foo.js` includes `import './foo.css';`
- `bar.js` includes `import './bar.css';`
- `index.js` imports from `foo.js` and `bar.js` (CSS already handled)

## Options

### `sourcemap`

- Type: `boolean`
- Default: `true`

Whether to generate sourcemaps for the modified chunks.

```ts
libInjectCss({
  sourcemap: false, // Disable sourcemap generation
})
```

## Why This Plugin?

When building component libraries with tsdown, CSS imports are typically stripped during the transpilation process. This
plugin solves the problem by:

1. **Preserving CSS imports**: Ensures styles are loaded when components are used
2. **Proper chunking**: Each chunk only imports its required CSS files
3. **Tree-shaking friendly**: Works seamlessly with tsdown's code splitting
4. **Zero configuration**: Works out of the box with sensible defaults

## Compatibility

This plugin is designed for:

- ✅ tsdown (primary target)
- ✅ Rolldown (direct compatibility)
- ⚠️ Rollup (may work with limitations)

## Configuration Tips

### For Component Libraries

When building a component library, you typically want:

```ts
export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  plugins: [
    libInjectCss(),
  ],
});
```

### With Multiple Entry Points

The plugin works seamlessly with multiple entries:

```ts
export default defineConfig({
  entry: {
    index: './src/index.ts',
    button: './src/button/index.ts',
    card: './src/card/index.ts',
  },
  format: ['esm'],
  plugins: [
    libInjectCss(),
  ],
});
```

Each entry point will have its CSS imports properly injected.

## Inspired By

This plugin is inspired by [vite-plugin-lib-inject-css](https://github.com/emosheeep/vite-plugin-lib-inject-css) but
adapted specifically for tsdown's architecture and build process.

## License

MIT © bosh-code
