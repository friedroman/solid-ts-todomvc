'use strict';

const ForkTsCheckerNotifierWebpackPlugin = require('fork-ts-checker-notifier-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const ts = require('ts-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;


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
                // [
                //   "@babel/preset-env",
                //   {
                //     useBuiltIns: "usage",
                //     corejs: 3,
                //     modules: false
                //   }
                // ],
                "solid",
              ],
              plugins: [
                // [
                //   '@babel/plugin-transform-runtime',
                //   {
                //     corejs: 3,
                //     useJSModules: true,
                //   }
                // ]
              ]
            }
          },
          {
            loader: 'ts-loader',
            options: {
              logLevel: 'INFO',
              experimentalWatchApi: true
            },
          }
        ],
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']
  },
  devServer: {
    open: true,
    historyApiFallback: true,
    port: 80
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin(),
    new ForkTsCheckerNotifierWebpackPlugin({title: 'TodoMVC Solid', excludeWarnings: false}),
    new HtmlWebpackPlugin({
      inject: true,
      title: "TodoMVC Solid Typescript",
      template: './src/index.html'
    }),
    // new BundleAnalyzerPlugin({
    //   openAnalyzer: false,
    //   generateStatsFile: true,
    // })
  ]
};