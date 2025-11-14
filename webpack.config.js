'use strict';

const path = require('path');
const TerserWebpackPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
require('dotenv').config(); // loads .env if exists
const webpack = require('webpack');

module.exports = {
    devtool: 'source-map',
    performance: { hints: false },

    entry: path.resolve(__dirname, 'src', 'ckeditor.js'),

    resolve: {
        extensions: ['.ts', '.js', '.json'],
        fallback: {
            fs: false // Prevents attempts to use 'fs' in browser
        },
        // alias: {
        //     'ckeditor5': path.resolve(__dirname, 'node_modules/ckeditor.js'),
        //     '@ckeditor': path.resolve(__dirname, 'node_modules/@ckeditor')
        // }
    },

    // resolve: {
    //     alias: {
    //         'ckeditor5': path.resolve(__dirname, 'src/ckeditor.js')
    //     }
    // },

    output: {
        library: 'ClassicEditor',
        libraryTarget: 'umd',
        libraryExport: 'default',
        umdNamedDefine: true,
        path: path.resolve(__dirname, 'build'),
        filename: 'ckeditor.js',
    },

    optimization: {
        minimize: true,
        minimizer: [
            new TerserWebpackPlugin({
                terserOptions: {
                    output: {
                        comments: /^!/ // Preserve CKEditor license comments.
                    }
                },
                extractComments: false
            })
        ]
    },

    plugins: [
        new webpack.DefinePlugin({
      'process.env.S3_BUCKET_NAME': JSON.stringify(process.env.S3_BUCKET_NAME || 'pranay-poc-bucket'),
      'process.env.AWS_REGION': JSON.stringify(process.env.AWS_REGION || 'eu-north-1'),
      'process.env.AWS_ACCESS_KEY_ID': JSON.stringify(process.env.AWS_ACCESS_KEY_ID || ''),
      'process.env.AWS_SECRET_ACCESS_KEY': JSON.stringify(process.env.AWS_SECRET_ACCESS_KEY || ''),
      'process.env.R2_ACCOUNT_ID': JSON.stringify(process.env.R2_ACCOUNT_ID || ''),
      'process.env.R2_API': JSON.stringify(process.env.R2_API || ''),
      'process.env.R2_BUCKET_NAME': JSON.stringify(process.env.R2_BUCKET_NAME || ''),
      'process.env.R2_TOKEN_VALUE': JSON.stringify(process.env.R2_TOKEN_VALUE || ''),
      'process.env.R2_ACCESS_KEY_ID': JSON.stringify(process.env.R2_ACCESS_KEY_ID || ''),
      'process.env.R2_SECRECT_ACCESS_KEY': JSON.stringify(process.env.R2_SECRECT_ACCESS_KEY || ''),
    }),
        new MiniCssExtractPlugin({
            filename: 'ckeditor.css'
        }),
    ],

    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, 'css-loader']
            },
            {
                test: /\.svg$/,
                use: ['raw-loader']
            }
        ]
    },

    externals: {
        ckeditor: 'CKEDITOR' // Prevent bundling CKEditor if it’s loaded globally
    }
};
