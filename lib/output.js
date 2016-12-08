"use strict";
/**
* @输出处理后的工程文件
* @param {String} options.type 'default' : 默认输出js,css文件夹 如$ jdf o
* @param {String} options.type 'custom' : 自定义输出 如$ jdf o app/js/test.js
* @param {String} options.list : 自定义输出的文件路径,如app/js/test.js
* @param {Boolse} options.isdebug 是否为debug
* @param {Function} options.callback 回调函数
* @todo 只复制改动的文件
*/
const path = require('path');
const fs = require('fs');
const shelljs = require('shelljs');

//lib自身组件
const jdfUtils = require('jdf-utils');
const $ = jdfUtils.base;
const f = jdfUtils.file;
const logger = require('jdf-log');
const jdf = require('./jdf.js');
const urlReplace = require('./UrlReplace');
const cssSprite = require('./cssSprite');
const base64 = require('./base64');
const compressScheduler = require('./compresser/compressScheduler');
const buildCss = require("./buildCss");
const buildWidget = require("./buildWidget");
const VFS = require('./VFS/VirtualFileSystem');

//exports
const output = module.exports = {};

/**
 * @init
 */
output.init = function (options) {
	var outputType = options.outputType;
	var outputList = options.outputList;

	var outputdir = jdf.config.outputDirName;

    var logText = 'output success';

    return Promise.resolve().then(() => {
        logger.profile('delete file');
        shelljs.rm("-rf",outputdir);
        logger.profile('delete file');
        return buildCss.init(options);
    }).then(() => {
        return buildWidget.init(options);
    }).then(() => {
        base64.init();
    }).then(() => {
        cssSprite.init();
    }).then(() => {
        urlReplace.init(options);
    }).then(() => {
        if(outputType == 'default'){
            logger.profile('delete temp files');
            shelljs.rm("-Rf", jdf.transferDir);

            logger.profile('delete temp files');
            logger.profile('write file');

            return VFS.writeFilesToDir(jdf.transferDir);
        }else{
            logger.profile('write files');
            return VFS.writeFiles();
        }
    }).then(() => {
        if (outputType == 'default') {
            return compressScheduler.init(jdf.transferDir, jdf.outputDir);
        }
    }).then(() => {
        logger.profile('write files');
        logger.info(logText);
    }).catch(err => {
        logger.error(err);
    });
}
