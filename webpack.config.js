const path = require('path');
const fs = require('fs');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const autoprefixer = require('autoprefixer');
const postcssNesting = require('postcss-nesting');
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
  optimization: {
    minimize: false
  },
  output: {
    filename: 'script.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        use: {
          loader: 'babel-loader'
        },
        exclude: /node_modules/
      },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
          appendTsSuffixTo: [/\.vue$/],
        },
        exclude: /node_modules/,
      },
      {
        test: /\.jsx?$/,
        use: [
          {
            loader: 'eslint-loader',
            options: {
              eslintPath: require.resolve('eslint')
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /\.scss$/,
        use: [
          { loader: 'vue-style-loader' },
          { loader: 'style-loader' },
          { loader: 'css-loader' },
          { loader: 'sass-loader' },
          {
            loader: 'postcss-loader',
            options: {
              plugins: () => [autoprefixer, postcssNesting]
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          { loader: 'style-loader' },
          {
            loader: 'css-loader',
            options: {
              modules: true,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: () => [autoprefixer, postcssNesting]
            }
          }
        ]
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      'stores': path.resolve(__dirname, './src/stores'),
      'api': path.resolve(__dirname, './src/api'),
      'types': path.resolve(__dirname, './src/types'),
      'components': path.resolve(__dirname, './src/components'),
      'interfaces': path.resolve(__dirname, './src/interfaces'),
      'entities': path.resolve(__dirname, './src/entities'),
      'drivers': path.resolve(__dirname, './src/drivers'),
      'helpers': path.resolve(__dirname, './src/helpers'),
      'enums': path.resolve(__dirname, './src/enums'),
      'constants': path.resolve(__dirname, './src/constants'),
      'composables': path.resolve(__dirname, './src/composables'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: './static/manifest.json', to: 'manifest.json' },
        { from: './static/i18n', to: 'i18n' },
        { from: './static/images', to: 'images' },
        { from: 'README.md', to: 'README.md' },
      ]
    }),
    new VueLoaderPlugin(),
  ],
  devServer: {
    static: path.resolve(__dirname, 'dist'),
    host: '0.0.0.0',
    port: 9012,
    hot: true,
    allowedHosts: 'all',
    server: {
      type: 'https',
      options: {
        key: fs.readFileSync(path.resolve(__dirname, 'certs/localhost-key.pem')),
        cert: fs.readFileSync(path.resolve(__dirname, 'certs/localhost.pem')),
      },
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
      'Access-Control-Allow-Private-Network': 'true',
    },
    client: {
      webSocketURL: {
        protocol: 'wss',
        hostname: 'localhost',
        port: 9012,
      },
    },
  },
  performance: {
    maxAssetSize: 512000,
    maxEntrypointSize: 512000,
  },
};
