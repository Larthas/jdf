'use strict';
/**
 * @jdf
 */
const path = require('path');
const os = require('os');

//lib自身组件
const jdfUtils = require('jdf-utils');
const $ = jdfUtils.base;
const f = jdfUtils.file;
const logger = require('jdf-log');

const buildCss = require('./buildCss');
const buildWidget = require('./buildWidget');
const buildES6 = require('./buildES6');
const output = require("./output");
const build = require('./build');

//外部组件
const watch = require('node-watch');
const VFS = require('./VFS/VirtualFileSystem');

//define
const jdf = module.exports;

/**
 * @配置项
 */
jdf.config = require('./config.js');

/**
 * @总的初始化函数 from ../index.js
 * @commander
 */
jdf.init = function () {
    //设置全局时间戳
    jdf.config.suffix = $.getTimestamp();

    //读取配置文件 如果没有 config.json 则直接退出。
    let jdfConfig = jdf.merageConfig();
    if (!jdfConfig) {
        logger.error('The current dir may be not a jdf project!');
        return false;
    }
    // 工程所在目录
    jdf.currentDir = path.normalize(f.currentDir());

    // 中转目录，现在的.jdf-temp/project/projectname。旧版本中的.jdf-temp/temp/projectname,
    jdf.transferDir = jdf.getTransferDir(path.basename(jdf.currentDir))
    jdf.transferDir = path.normalize(jdf.transferDir);

    // output输出目录
    jdf.outputDir = path.join(jdf.currentDir, jdf.config.outputDirName, jdf.config.projectPath);
    if (!path.relative(jdf.outputDir, jdf.currentDir)) {
        logger.error('output dir equal project dir, will cover project');
        return;
    }
    return jdfConfig;
};

jdf.build = function (options, callback) {
    logger.profile('build');

    var buildType = 'default';
    if (options.open) {
        buildType = 'open';
    }

    VFS.setOriginDir(jdf.currentDir);
    VFS.setTargetDir(jdf.outputDir);
    VFS.addIgnore(jdf.config.outputDirName, 'dir');

    logger.profile('read files');
    VFS.readFilesInOriginDir().then(() => {
        logger.profile('read files');
        return build.init({
            buildType: buildType,
            serverDir: jdf.transferDir,
            projectDir: jdf.currentDir,
            profileText: 'build'
        });
    }).then(() => {
        console.log('......');
    }).catch(err => {
        logger.error(err);
    });
}

jdf.output = function (outputList, options) {
    logger.profile('output');

    var ignoreFiles = [];
    if (jdf.config.output.excludeFiles) {
        ignoreFiles = jdf.config.output.excludeFiles.split(',');
    }

    var outputType = 'default';
    var outputCustom = jdf.config.outputCustom;

    if (options.debug) {
        outputType = 'debug';
    } else if (options.plain) {
        outputType = 'plain';
    }

    if (outputCustom && outputList.length == 0) {
        outputList = outputCustom.split(',');
    }

    VFS.setOriginDir(jdf.currentDir);
    VFS.setTargetDir(jdf.outputDir);
    VFS.addIgnore(jdf.config.outputDirName, 'dir');
    VFS.addIgnore(ignoreFiles, 'glob');

    logger.profile('read files');

    return VFS.readFilesInOriginDir(outputList).then(function () {
        logger.profile('read files');
        return output.init({
            outputType: outputType,
            outputList: outputList
        });
    }).then(() => {
        logger.profile('output');
    }).catch(err => {
        logger.error(err);
    });

}

// 中转目录，现在的.jdf-temp/project/projectname。旧版本中的.jdf-temp/temp/projectname,
jdf.getTransferDir = function (projectname) {
    return path.join(os.tmpdir(), '.jdf-temp/project', projectname);
}

/** 获取用户自定义的配置
 * return {object} userConfig
 */
jdf.getUserConfig = function () {
    var userConfigPath = path.join(f.currentDir(), jdf.config.configFileName);
    if (f.exists(userConfigPath)) {
        try {
            var data = f.read(userConfigPath);
            data = JSON.parse(data);
            if (typeof (data) == 'object') {
                return data
            }
        } catch (e) {
            logger.error('config.json format error');
        }
    }
}

/**
 * @读取配置文件config.json, 覆盖默认配置
 */
jdf.merageConfig = function () {
    var userConfig = jdf.getUserConfig();
    if (userConfig) {
        return $.merageObj(jdf.config, userConfig);
    }
}

/**
 * @从服务器端下载文件 todo:检查版本号
 */
jdf.download = function (pathItem, targetDir, targetName) {
    var url = jdf.config[pathItem];
    var cacheDir = path.normalize(jdf.cacheDir + '/' + pathItem + '.tar');

    logger.info('jdf downloading');

    f.download(url, cacheDir, function (data) {
        if (data == 'ok') {
            f.tar(cacheDir, targetDir, function () {
                //强制改项目名同时修改config.json中的projectPath字段
                f.renameFile(path.resolve(targetDir, 'jdf_demo'), path.resolve(targetDir, targetName))
                var configFilePath = path.resolve(targetDir, targetName, 'config.json');
                f.readJSON(configFilePath, function (json) {
                    json.projectPath = targetName;
                    f.write(configFilePath, JSON.stringify(json, null, '\t'));
                    logger.info(targetName + ' install done');
                })
            });
        }
    })
}

/**
 * @获取项目前缀名字
 * @仅从配置文件中取,不再支持branch/trunk 2014-5-24
 * @del --> 1. d:\product\index\trunk ===> product/index
 * @del --> 2. d:\product\index\branches\homebranches ===> product/index
 * @del --> 3. d:\product\index\homebranches ===> product
 */
jdf.getProjectPath = function () {
    var currentDir = f.currentDir(),
        nowDir = '',
        result = '';
    if (jdf.config.projectPath != null) {
        result = jdf.config.projectPath;
    } else {
        //当前文件夹的文件夹命名为projectPath 2014-6-9
        result = path.basename(f.currentDir());
    }
    return result;
}


/**
 * @项目工程目录初始化
 * @time 2014-2-19 10:21:37
 */
jdf.createStandardDir = function (dir) {
    var dirArray = [];
    dirArray[0] = jdf.config.baseDir;
    dirArray[1] = jdf.config.cssDir;
    dirArray[2] = jdf.config.imagesDir;
    dirArray[3] = jdf.config.jsDir;
    dirArray[4] = jdf.config.htmlDir;
    dirArray[5] = jdf.config.widgetDir;

    if (dir) {
        dir += '/';
    } else {
        dir = 'jdf_init/';
    }

    for (var i = 0; i < dirArray.length; i++) {
        f.mkdir(dir + dirArray[i]);
    }

    var fileArray = [];
    fileArray[0] = jdf.config.configFileName;
    fileArray[1] = jdf.config.htmlDir + '/index.html';

    var templateDir = path.resolve(__dirname, '../template/');

    for (var i = 0; i < fileArray.length; i++) {
        if (!f.exists(fileArray[i])) f.write(dir + '/' + fileArray[i], f.read(templateDir + '/' + fileArray[i]));
    }
    logger.info('jdf project directory init done!');
}

/**
 * @清除项目缓存文件夹
 */
jdf.clean = function () {
    logger.profile('clean');
    const shell = require('shelljs');
    const tmpRootPath = path.resolve(os.tmpdir(), '.jdf-temp');
    shell.rm('-rf', tmpRootPath);
    logger.info('cache dir clean done');
    logger.profile('clean');
}
