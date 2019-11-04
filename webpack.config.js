'use strict';

const ForkTsCheckerNotifierWebpackPlugin = require('fork-ts-checker-notifier-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const ts = require('ts-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');


module.exports = {
  devtool: 'source-map',
  entry: './src/index.tsx',
  output: {
    filename: 'lib.js',
    path: path.resolve(__dirname, 'dist'),
    pathinfo: true,
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.s[ac]ss$/i,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      }, {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      }, {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [
                "@babel/env",
                "solid",
              ],
              plugins: [
                ['@babel/plugin-transform-runtime', {corejs: 3, useJSModules: true}]
              ]
            }
          },
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              logLevel: 'INFO',
              experimentalWatchApi: true
            },
          }
        ],
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.ts.d', '.tsx', '.js', '.jsx', '.css', '.scss']
  },
  devServer: {
    clientLogLevel: 'warning',
    open: true,
    historyApiFallback: true,
    stats: 'errors-only'
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin({eslint: true, useTypescriptIncrementalApi: true }),
    new ForkTsCheckerNotifierWebpackPlugin({title: 'VA Admin TypeScript', excludeWarnings: false}),
    new HtmlWebpackPlugin({
      inject: true,
      title: "VAFlow Admin Panel",
      template: './src/index.html'
    })
  ]
};