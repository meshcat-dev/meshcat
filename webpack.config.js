const path = require('path')
const LicensePlugin = require('webpack-license-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = [{
  context: path.resolve(__dirname),
  entry: '/src/index.js',
  mode: "development",
  devtool: "eval-source-map",
  stats: 'errors-only',
  output: {
    library: "MeshCat",
    libraryTarget: 'umd'
  },
  devServer: {
    hot: true,
    liveReload: true,
    client: { overlay: false },
    host: "127.0.0.1",
    webSocketServer: false,
    proxy: [
      { context: ['/'], target: 'http://localhost:8080/' },
      { context: ['/ws'], target: 'http://localhost:8080/ws' },
    ],
    port: 8081,
    static: ['/dist'],
  },
}, {
  entry: './src/index.js',
  output: {
    filename: "main.min.js",
    library: "MeshCat",
    libraryTarget: 'umd'
  },
  // watch: true,
  mode: "production",
  module: {
    rules: [
      {
        test: /\/libs\/(basis|draco)\//,
        type: 'asset/inline'
      }
    ]
  },
  plugins: [
    new LicensePlugin({
      outputFilename: "main.min.js.THIRD_PARTY_LICENSES.json",
      licenseOverrides: {
        'wwobjloader2@6.2.1': 'MIT',
      }
    })
  ],
}];
