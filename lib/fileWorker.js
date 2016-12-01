"use strict";
/**
 * Created by wangshaoxing on 2014/12/15.
 */
var path = require('path');
var fs = require('fs');

//lib自身组件
const jdfUtils = require('jdf-utils');
const $ = jdfUtils.base;
const f = jdfUtils.file;

process.on('message', function(data) {
    switch (data.route){
        case "copy":move(data);break;
        case "del":del(data);break;
        default :break;

    }
    process.send({tag:1,job:1});
});

/**
 * @在辅助进程里 移动文件夹
 */
var move=function(data){
    f.copy(data.source,data.target);
    f.del(data.source);
}

/**
 * @在辅助进程里 删除文件夹
 */
var del=function(data){
    f.del(data.target);
}
