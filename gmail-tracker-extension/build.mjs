import * as esbuild from "esbuild";

// Builds straight into the extension root (same location as the old plain
// content.js/auth-bridge.js) rather than a separate dist/ folder. That way
// an already-loaded "Load unpacked" pointer in chrome://extensions keeps
// working after every build — just hit reload, no need to repoint Chrome at
// a new folder (which would require the native file picker, not something
// automatable).
const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/content.ts", "src/auth-bridge.ts"],
  bundle: true,
  outdir: ".",
  target: "chrome100",
  format: "iife",
  sourcemap: watch ? "inline" : false,
  // Comments/whitespace in src/*.ts are for maintainers, not the shipped
  // bundle — minify the real build so they don't ship as literal bytes.
  // Left readable in watch mode since that's what you're actually debugging.
  minify: !watch,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes... (Ctrl+C to stop)");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete -> content.js, auth-bridge.js");
}
