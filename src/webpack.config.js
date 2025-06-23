const path = require('path');

module.exports = {
  entry: './client/index.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, '../dist/public'),
    publicPath: '/',
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  devtool: 'source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, '../dist/public'),
    },
    compress: true,
    port: 3000,
    hot: true,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        logLevel: 'debug'
      },
      {
        context: ['/api/ws'],
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        logLevel: 'debug'
      }
    ],
  },
}; 