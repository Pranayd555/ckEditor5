'use strict';

const path = require('path');
const TerserWebpackPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

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
