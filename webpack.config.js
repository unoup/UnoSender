const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: {
      'background': './src/background/service-worker.js',
      'content/content': './src/content/content.js',
      'content/wa-bridge': './src/content/wa-bridge.js',
      'popup/popup': './src/popup/popup.js',
      'sidepanel/app': './src/sidepanel/app.js',
      'options/options': './src/options/options.js',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '[name].css' }),
      new CopyPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'icons', to: 'icons' },
          // Copy wa.js vendor bundle verbatim (already built from wa-js source)
          ...(require('fs').existsSync(path.resolve(__dirname, 'vendors/wa.js'))
            ? [{ from: 'vendors/wa.js', to: 'vendors/wa.js' }]
            : []),
        ],
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup/popup.html',
        chunks: ['popup/popup'],
        inject: false,
      }),
      new HtmlWebpackPlugin({
        template: './src/sidepanel/index.html',
        filename: 'sidepanel/index.html',
        chunks: ['sidepanel/app'],
        inject: false,
      }),
      new HtmlWebpackPlugin({
        template: './src/options/options.html',
        filename: 'options/options.html',
        chunks: ['options/options'],
        inject: false,
      }),
    ],
    resolve: {
      extensions: ['.js'],
    },
    devtool: isProduction ? false : 'inline-source-map',
    optimization: {
      minimize: isProduction,
    },
  };
};
