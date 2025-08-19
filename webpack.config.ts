//@ts-check

'use strict';

import * as webpack from 'webpack';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import CopyPlugin = require('copy-webpack-plugin');

module.exports = [{
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  entry: {
    'extension': './src/extension.ts',
  }, // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'inline-source-map',
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [{
      test: /\.js$/,
      enforce: 'pre',
      use: 'source-map-loader',
    }, {
      test: /\.tsx?$/,
      use: 'ts-loader'
    }]
  },
  ignoreWarnings: [/Failed to parse source map/],
  plugins: [
    new webpack.ProvidePlugin({
      fetch: ['node-fetch', 'default'],
    }),
    new CopyPlugin({
      patterns: [{
        from: 'node_modules/web-tree-sitter/tree-sitter.wasm',
        to: 'web-tree-sitter/[name][ext]'
      }, {
        from: 'node_modules/tree-sitter-python/tree-sitter-python.wasm',
        to: 'tree-sitter-python/[name][ext]'
      }]
    })
  ]
} as webpack.Configuration, {
  target: 'web',
  entry: './src/llmAnalysisReport.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'react.js',
    libraryTarget: 'commonjs',
  },
  devtool: 'inline-source-map',
  externals: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'vscode-webview': 'global vscode-webview',
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx']
  },
  module: {
    rules: [{
      test: /\.js$/,
      enforce: 'pre',
      use: 'source-map-loader',
    }, {
      test: /\.tsx?$/,
      use: 'ts-loader'
    }, {
      test: /\.css$/,
      use: 'css-loader'
    }]
  },
  ignoreWarnings: [/Failed to parse source map/],
} as webpack.Configuration];
