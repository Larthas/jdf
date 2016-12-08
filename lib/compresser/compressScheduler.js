"use strict";
/**
 * Created by wangshaoxing on 2014/12/12.
 */

const path = require('path');
const fs = require('fs');
const shell = require('shelljs');
const fork = require('child_process').fork;
const cpus = require('os').cpus();
const logger = require('jdf-log');

//lib自身组件
const jdfUtils = require('jdf-utils');
const $ = jdfUtils.base;
const f = jdfUtils.file;

const jdf = require('../jdf.js');
const compress = require('./compress.js');

/**
 * compressScheduler 进程调度器
 */
let compressScheduler = module.exports = {};


/**
 * 获取文件夹中所有需要处理的文件
 * @param {string} folderPath
 * @returns {Array} tasks
 */
let getTasksArray = function (folderPath) {
    return shell.find(folderPath).filter(function (file) {
        return file.match(/\.(js|jpg|png|gif|css|html)$/);
    });
}
/**
 * @param {string} srcDir
 * @returns Promise<any>
 */
compressScheduler.init = (srcDir, distDir) => {
    logger.profile('delete build-dir');
    shell.rm("-rf",distDir);
    logger.profile('delete build-dir');

    logger.profile('compress');
    let arr = getTasksArray(srcDir);
    let childPath = path.normalize(__dirname + "/compressWorker.js");
    let threadCount = cpus.length;
    let promisePool = [];

    for (let i = 0; i < threadCount; i++) {
        promisePool.push(new Promise((resolve, reject) => {
            let subProc = fork(childPath);
            subProc.jobDone = 0;
            subProc.on('message', data => {
                if (data.err) console.log(data);
                let task = arr.pop();
                if (!task) {
                    subProc.disconnect()
                    resolve();
                } else {
                    let relativePath = path.relative(srcDir, task);
                    let distPath = path.join(distDir, relativePath)
                    shell.mkdir("-p", path.dirname(distPath))
                    subProc.send({
                        task: task,
                        config: jdf.config,
                        dist: distPath
                    });
                }
            });
        }));
    }
    return Promise.all(promisePool).then(v=>{
        logger.profile('compress');
    })

    /**
     * wangshaoxing 2016-11-22
     * 下面这些是在单进程下 调试使用的代码. 误删..
     */

    // arr.forEach((val, idx) => {
    //     var singlePromise = compress.init(
    //         val,
    //         isdebug,
    //         jdf.config
    //     )
    //     promisePool.push(singlePromise);
    // });
    // return Promise.all(promisePool).then(val => {
    // }, err => {
    //     console.log(err);
    // })


}
