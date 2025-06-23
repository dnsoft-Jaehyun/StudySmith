const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

const isDevMode = __dirname.includes('src');

module.exports = {
  entry: './src/client/index.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      process: "process/browser"
    },
    fallback: {
      "process": require.resolve("process/browser"),
      "process/browser": require.resolve("process/browser")
    }
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
      {
        test: /\.(png|jpe?g|gif)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              outputPath: 'images',
            },
          },
        ],
      },
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/client/index.html',
      filename: 'index.html'
    }),
    new webpack.DefinePlugin({
      'process.env.REACT_APP_API_URL': JSON.stringify(process.env.REACT_APP_API_URL || 'http://localhost:3000')
    }),
    new CopyPlugin({
      patterns: [
        { from: 'src/templates', to: 'templates' },
      ],
    }),
  ],
  devtool: 'source-map',
  devServer: {
    host: '0.0.0.0',
    port: 3000,
    historyApiFallback: true,
    hot: true,
    allowedHosts: 'all',
    compress: true,
    // 긴 요청 지원을 위한 서버 타임아웃 설정
    server: {
      type: 'http',
      options: {
        requestTimeout: 600000, // 10분
        headersTimeout: 600000, // 10분 (requestTimeout 이하여야 함)
        keepAliveTimeout: 300000, // 5분
      }
    },
    watchFiles: {
      paths: ['src/**/*'],
      options: {
        usePolling: true,
        interval: 1000,
      },
    },
    client: {
      overlay: true,
      webSocketURL: 'ws://localhost:3000/ws',
      logging: 'info',
    },
    devMiddleware: {
      writeToDisk: true,
    },
    static: false,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    proxy: [
      {
        context: ['/api/ws'],
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        logLevel: 'debug',
        // WebSocket 연결 안정성 강화
        timeout: 600000,
        proxyTimeout: 600000,
        agent: false,
        onError: (err, req, res) => {
          console.error('[WebSocket Proxy Error]', err);
        },
      },
      {
        context: ['/api'],
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        logLevel: 'debug',
        // 긴 요청 지원을 위한 타임아웃 설정 (10분)
        timeout: 600000,
        proxyTimeout: 600000,
        // Keep-Alive 연결 유지
        agent: false,
        headers: {
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=600, max=1000'
        },
        onProxyReq: (proxyReq, req, res) => {
          console.log(`[Proxy] ${req.method} ${req.url} -> http://127.0.0.1:8080${req.url}`);
          // 긴 요청을 위한 타임아웃 설정
          proxyReq.setTimeout(600000); // 10분
        },
        onProxyRes: (proxyRes, req, res) => {
          // 응답 헤더에 Keep-Alive 설정
          proxyRes.headers['connection'] = 'keep-alive';
          proxyRes.headers['keep-alive'] = 'timeout=600, max=1000';
        },
        onError: (err, req, res) => {
          console.error('[Proxy Error]', err);
          // 타임아웃 에러인 경우 적절한 응답 반환
          if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
            res.writeHead(408, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: '요청 시간이 초과되었습니다. 문제 생성이 진행 중일 수 있습니다.' 
            }));
          }
        },
      },
    ],
  }
};
