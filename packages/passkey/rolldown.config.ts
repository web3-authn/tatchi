import { defineConfig } from 'rolldown';
import { BUILD_PATHS } from './build-paths.ts';
import * as path from 'path';

const external = [
  // React dependencies
  'react',
  'react-dom',
  'react/jsx-runtime',

  // All @near-js packages
  /@near-js\/.*/,

  // Core dependencies that should be provided by consuming application
  'borsh',
  'bs58',
  'js-sha256',
  'idb',
  'near-api-js',

  // Other common packages
  'tslib'
];

const aliasConfig = {
  '@build-paths': path.resolve(process.cwd(), 'build-paths.ts'),
  '@/*': path.resolve(process.cwd(), 'src/*')
};

export default defineConfig([
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      dir: BUILD_PATHS.BUILD.ESM,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    },
    plugins: []
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      dir: BUILD_PATHS.BUILD.CJS,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    },
    plugins: []
  },
  // Server ESM build
  {
    input: 'src/server/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/server`,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src/server',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    },
    plugins: []
  },
  // Server CJS build
  {
    input: 'src/server/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/server`,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/server',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    },
    plugins: []
  },
  // React ESM build
  {
    input: 'src/react/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react`,
      format: 'esm',
      preserveModules: true,
      preserveModulesRoot: 'src/react',
      sourcemap: true
    },
    external,
    resolve: {
      alias: aliasConfig
    },
    plugins: []
  },
  // React CJS build
  {
    input: 'src/react/index.ts',
    output: {
      dir: `${BUILD_PATHS.BUILD.CJS}/react`,
      format: 'cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/react',
      sourcemap: true,
      exports: 'named'
    },
    external,
    resolve: {
      alias: aliasConfig
    },
    plugins: []
  },
  // React CSS build - output to separate styles directory to avoid JS conflicts
  {
    input: 'src/react/styles.css',
    output: {
      dir: `${BUILD_PATHS.BUILD.ESM}/react/styles`,
      format: 'esm',
      assetFileNames: 'styles.css'
    },
    plugins: []
  }
]);