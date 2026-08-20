const webpack = require('webpack');
const ZipPlugin = require('zip-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const baseConfig = require('./webpack.config');

module.exports = function(env) {
  const production = env === 'production';

  const optimization = production
    ? { minimizer: [new UglifyJsPlugin({
        uglifyOptions: {
          mangle: false,
        },
      })] }
    : { minimize: false };

  return Object.assign(baseConfig, {
    optimization,
    plugins: baseConfig.plugins.concat([
      new ZipPlugin({
        path: '../build',
        filename: 'widget.zip',
        fileOptions: {
          mtime: new Date(),
          mode: 0o100664,
          compress: true,
          forceZip64Format: false,
        },
        zipOptions: {
          forceZip64Format: false,
        },
      })
    ])
  });
};
