08:56:36.859 Running build in Washington, D.C., USA (East) – iad1
08:56:36.860 Build machine configuration: 2 cores, 8 GB
08:56:36.996 Cloning github.com/mikestuchbery/roadtripperde (Branch: main, Commit: 01841f4)
08:56:37.556 Cloning completed: 560.000ms
08:56:37.707 Restored build cache from previous deployment (AzgzhPtMtwV4dGBNRRmUEXpzgLud)
08:56:39.569 Running "vercel build"
08:56:40.177 Vercel CLI 50.23.2
08:56:40.743 Installing dependencies...
08:56:44.062 
08:56:44.062 up to date in 3s
08:56:44.063 
08:56:44.063 7 packages are looking for funding
08:56:44.063   run `npm fund` for details
08:56:44.097 Running "npm run build"
08:56:44.195 
08:56:44.196 > roadtripperde@0.1.0 build
08:56:44.196 > vite build
08:56:44.196 
08:56:44.476 [36mvite v5.4.21 [32mbuilding for production...[36m[39m
08:56:44.537 transforming...
08:56:45.362 [32m✓[39m 76 modules transformed.
08:56:45.364 [31mx[39m Build failed in 857ms
08:56:45.365 [31merror during build:
08:56:45.365 [31msrc/main.jsx (3:7): "default" is not exported by "src/App.jsx", imported by "src/main.jsx".[31m
08:56:45.366 file: [36m/vercel/path0/src/main.jsx:3:7[31m
08:56:45.366 [33m
08:56:45.366 1: import React from "react";
08:56:45.367 2: import ReactDOM from "react-dom/client";
08:56:45.367 3: import App from "./App.jsx";
08:56:45.368           ^
08:56:45.368 4: 
08:56:45.368 5: ReactDOM.createRoot(document.getElementById("root")).render(
08:56:45.369 [31m
08:56:45.369     at getRollupError (file:///vercel/path0/node_modules/rollup/dist/es/shared/parseAst.js:402:41)
08:56:45.369     at error (file:///vercel/path0/node_modules/rollup/dist/es/shared/parseAst.js:398:42)
08:56:45.370     at Module.error (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:17040:16)
08:56:45.370     at Module.traceVariable (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:17452:29)
08:56:45.371     at ModuleScope.findVariable (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:15070:39)
08:56:45.371     at Identifier.bind (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:5447:40)
08:56:45.371     at CallExpression.bind (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:2825:28)
08:56:45.372     at CallExpression.bind (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:12179:15)
08:56:45.372     at Property.bind (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:2829:23)
08:56:45.373     at ObjectExpression.bind (file:///vercel/path0/node_modules/rollup/dist/es/shared/node-entry.js:2825:28)[39m
08:56:45.388 Error: Command "npm run build" exited with 1
