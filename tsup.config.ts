/**
 * @type {import('tsup').Options}
 */
const options = {
  entry: ['src/*.ts', 'src/apps/*.ts', 'web.config.ts'],
  format: ['esm'],
  target: 'node18',
  splitting: true,
  sourcemap: false,
  clean: true,
  dts: false,
  outDir: 'lib',
  treeshake: false,
  minify: false,
  external: ['node-karin'],
  shims: true,
}

export default options
