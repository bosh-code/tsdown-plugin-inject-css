# @bosh-code/tsdown-plugin-inject-css

[![npm version](https://img.shields.io/npm/v/@bosh-code/tsdown-plugin-inject-css)](https://npmjs.com/package/@bosh-code/tsdown-plugin-inject-css)
![license](https://img.shields.io/npm/l/@bosh-code/tsdown-plugin-inject-css)

Inject CSS imports at the top of files built with [tsdown](https://tsdown.dev/).

During the build process, tsdown strips CSS imports from your source files. This plugin tracks those imports and
re-injects them into the built files.

## Installation

Install the plugin:

```shell
# npm
npm install -D @bosh-code/tsdown-plugin-inject-css

# yarn
yarn add -D @bosh-code/tsdown-plugin-inject-css

# pnpm
pnpm add -D @bosh-code/tsdown-plugin-inject-css
```

Add it to your `tsdown.config.ts`:

```ts
// tsdown.config.ts

import { injectCssPlugin } from '@bosh-code/tsdown-plugin-inject-css';

export default defineConfig({
  external: ['preact'],
  plugins: [
    injectCssPlugin()
  ]
});

```

___

### Example

#### Source files:

Component files:

```css
/* src/greeting.css */

/* Add component styles here */

.greeting {
  color: red;
}
```

```tsx
// src/greeting.tsx
import './Foo.css';

export const Greeting = () => <div class="greeting">Hello World</div>;
```

Library entrypoint:

```css
/* src/index.css */

/* Add global styles here */

html {
  background-color: blue;
}
```

```ts
// src/index.ts
import './index.css';

export { Greeting } from './greeting'
```

#### Built files:

```css
/* dist/index.css */
html {
  background-color: blue;
}

.greeting {
  color: red;
}

/* Gorgeous colour theme, I know. */
```

```js
// dist/index.js
import { jsx as e } from 'preact/jsx-runtime';
import './index.css'; // Injected by plugin

const t = () => e(`div`, { className: `greeting`, children: `Hello World` });
export { t as Greeting };

```

___

### The how and why

This plugin is *heavily* inspired by [vite-plugin-lib-inject-css](https://github.com/emosheeep/vite-plugin-lib-inject-css) but
I adapted it to work with tsdown specifically.

I made this because I wanted to use tsdown to build my preact component library.

It *should* work with multiple entrypoint, however I haven't tried that. I got it to work for my project and called it good.

**Contributions welcome!**

### License

MIT © bosh-code

<div align="center">
  <img style="width: 120px" src="https://raw.githubusercontent.com/bosh-code/tsdown-plugin-inject-css/main/.github/images/nz-made.png">
</div>
