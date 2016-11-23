/**
 * @前端集成处理工具,此文件仅运行于子进程内.
 * @see
 * jdf-img-minify 
 * homePage:
 * https://github.com/jdf2e/jdf-img-minify
 * 
 */

//system
const path = require('path');
const fs = require('fs');
const os = require("os");

//jdf-lib
const $ = require('jdf-file').base;
const f = require('jdf-file').file;
const jdf = require('./jdf.js');
const base64 = require('./base64.js');

//external
const requirejs = require('requirejs');
const jdfImg = require('jdf-img-minify');
const shelljs = require('shelljs');
const UglifyJS = require("uglify-js");
const CleanCSS = require('clean-css');
const uuid = require('uuid');
const htmlminify = require('html-minifier').minify;

//exports
let compress = module.exports = {};

/**
 * @fileCompress portal
 * @param {String} source filePath is an absolute file path
 * @param {Boolse} isdebug program will skip compresstion under debug mode 
 * @param {Object} config config to overload
 * @returns Promise<any>
 */
compress.init = function (source, isdebug, config) {
    jdf.config = config || jdf.config;
    isdebug = isdebug || false;

    return new Promise((resolve, reject) => {
        //压缩处理图片
        let extName = path.extname(source);
        switch (extName) {
            case ".jpg":
                if (!isdebug && jdf.config.output.compressJpg) {
                    compress.handleImg(source,false).then(val => {
                        resolve(source);
                    });
                }else{
                     resolve(source);
                }; break;
            case ".png":
                if (!isdebug && jdf.config.output.compressPng) {
                    compress.handleImg(source,jdf.config.output.webp).then(val => {
                        resolve(source);
                    });
                }else{
                     resolve(source);
                }; break;
            case ".gif":
                if (!isdebug && jdf.config.output.compressGif) {
                    compress.handleImg(source,jdf.config.output.webp).then(val => {
                        resolve(source);
                    });
                }else{
                     resolve(source);
                }; break;
            default:
                resolve(source);
                ; break;
        }
    }).then(val => {
        //html minify
        if ($.is.html(source) && jdf.config.output.compresshtml) {
            if (!isdebug) {
                var sourceCode = compress.html(source);
                f.write(source, sourceCode);
            }
        }
        return val;
    }).then(val => {
        //js minify and  url replacement
        if ($.is.js(source)) {
            if (jdf.config.output.rjs) {
                var outputdir = path.normalize(f.currentDir() + '/' + jdf.config.outputDirName + '/' + jdf.getProjectPath());
                requirejs.optimize({
                    appDir: outputdir,
                    allowSourceOverwrites: true,
                    keepBuildDir: true,
                    dir: outputdir
                }, function () { }, function (error) { })
            } else {
                if (jdf.config.output.jsUrlReplace) {
                    var sourceCode = compress.addJsDepends(source);
                    f.write(source, sourceCode);
                }
                if (jdf.config.output.compressJs) {
                    var sourceCode = compress.js(source, isdebug);
                    f.write(source, sourceCode);
                }
            }
        }
        return val;
    }).then(val => {
        //css CleanCSS
        var sourceCode;
        if ($.is.css(source) && jdf.config.output.compressCss) {
            sourceCode = compress.css(source, isdebug);
            f.write(source, sourceCode);
        } else if ($.is.css(source)) {
            sourceCode = compress.css2(source, isdebug);
            f.write(source, sourceCode);
        }
        return sourceCode;
    }).then(sourceCode => {
        //增加域名前缀
        if (jdf.config.output.cssImagesUrlReplace && $.is.css(source)) {
            var sourceCode = compress.cssImagesUrlReplace(source, sourceCode, jdf.config.cdn);
            f.write(source, sourceCode);
        }
    }).then(val => {
        //将 css 中引用的图片转为 base64格式
        if (jdf.config.output.base64 && ($.is.sass(source) || $.is.less(source) || $.is.css(source))) {
            var sourceCode = base64.init(source);
            f.write(source, sourceCode);
        }
    }).then(val => {
        //向 css 中追加 webp 前缀.
        if ($.is.css(source) && jdf.config.output.webp) {
            compress.appendWebpCSSFIX(source);
        }
        return source;
    })
}

/**
 * @js文件依赖替换
 * @time 2014-2-21 18:46:24
 * @param source 文件名
 * @param source 文件内容
 * 
 *   var a=require('a.js') ==> var a=require('projectPath/a.js')
 *
 *   define('/a.js',function(require, exports) {});  ==>
 *   define('projectPath/a.js', ['projectPath/b.js'], function(require, exports) {});
 *
 *  define(function(require, exports)) ==> 
 *  define('projectPath/a.js',['projectPath/b.js'],function(require, exports))
 *
 *  seajs.use(['/a.js', '/b.js'],function(){}) ==> 
 *  seajs.use(['projectPath/a.js', 'projectPath/b.js'],function(){})
 * 
 */
compress.addJsDepends = function (source) {
    var sourceCode = f.read(source);
    var cdn = jdf.config.cdn;

    var requireReg = /require\s*\(\s*("|')(.*?)("|')\s*\)/gmi;
    var requireArray = sourceCode.match(requireReg);

    var dependenceReg = /define\(.*?['|"].*?['|"].*?,\s*\[.*?\],\s*function/m;
    var dependenceArray = [];

    if (requireArray && requireArray.length) {
        requireHandle();
    }

    dependenceHandle();

    defineHandle();

    useHandle();

    function requireHandle() {
        for (var i = 0; i < requireArray.length; i++) {
            var temp = requireArray[i].match(/require\((.*?)\)/);
            if (temp) {
                let match = temp[1].replace(/'|"/g, '');

                //不是以http路径并且不以jdf开头的路径
                if (/^jdf/.test(match)) {
                    match = cdn + $.pathJoin('/', match);
                } else if (!$.is.httpLink(match)) {
                    match = compress.addSourceCdn(source, match);
                }

                sourceCode = sourceCode.replace(requireArray[i], 'require("' + match + '")');
                dependenceArray.push(match);
            }
        }
    }

    /**
     * @has file id add dependenceArray
     * @example
     *   define('/a.js',function(require, exports) {});  ==>
     *   define('projectPath/a.js', ['projectPath/b.js'], function(require, exports) {});
     */
    function dependenceHandle() {
        var a = sourceCode.match(dependenceReg);
        var d = [];

        if (a) {
            var b = a[0].match(/['|"].*?['|"]/g);

            if (b && b.length) {
                for (let i = 0; i < b.length; i++) {
                    let c = b[i].replace(/['|"]/g, '');
                    d.push(compress.addSourceCdn(source, c));
                }
            }

            dependenceArray = dependenceArray.concat(d.slice(1));
        }
    }

    /**
     * @add files id and dependenceArray
     * @example  
     *  define(function(require, exports)) ==> 
     *  define('projectPath/a.js',['projectPath/b.js'],function(require, exports))
     */

    function defineHandle() {
        var defineReg = /define\(.*?function/gm;

        dependenceArray = dependenceArray.map(function (item) {
            return '"' + item + '"';
        });

        if (sourceCode.match(defineReg)) {

            sourceCode = sourceCode.replace(defineReg, 'define("' + compress.addSourceCdn(source) + '",[' + dependenceArray.join(',') + '],function');
        }
    }

    /**
     * @seajs.use add prefix 
     * @example  
     *  seajs.use(['/a.js', '/b.js'],function(){}) ==> 
     *  seajs.use(['projectPath/a.js', 'projectPath/b.js'],function(){})
     */
    function useHandle() {
        var hasSeajs = sourceCode.match(/seajs\.use\((.*?),\s*function/gim);
        if (hasSeajs) {
            //去重obj
            var tempObj = {};

            for (let i = 0, j = hasSeajs.length; i < j; i++) {
                let t = hasSeajs[i].replace(/seajs.use\(|\[|\]|,function/gim, '');
                let t1 = t.split(',');

                if (t1) {
                    for (var m = 0; m < t1.length; m++) {
                        let key = t1[m].replace(/[\"\'\s]/g, '');
                        let value = key;

                        //无.js缀和不含有.css的url加.js
                        if (!(/\.js$/i.test(value)) && !/\.css/i.test(value)) {
                            value += '.js';
                        }

                        //不是以http路径并且不以jdf开头的路径
                        if (/^jdf/.test(value)) {
                            tempObj[key] = cdn + $.pathJoin('/', value)
                        } else if (!$.is.httpLink(value)) {
                            tempObj[key] = compress.addSourceCdn(source, value);
                        }
                    }
                }
            }
            for (var i in tempObj) {
                var reg = new RegExp('["\']' + i + '["\']', 'gim');
                sourceCode = sourceCode.replace(reg, '"' + tempObj[i] + '"');
            }
        }
    }

    return sourceCode;
};

/**
 * @增加前缀banner
 * @return {String} /* projectPath - Date:2014-03-13 13:06:12:120 * /
 */
compress.setPrefixBanner = function (bannerType, source, result) {
    var projectPath = jdf.getProjectPath() ? jdf.getProjectPath().replace('/', '-') + ' ' : '';
    var basename = path.basename(source);
    var banner = '';

    if (bannerType == 1) {
        banner = '/* ' + projectPath + basename + ' Date:' + $.getDay('-') + ' ' + $.getTime(':', false) + ' */\r\n';
    }

    if (bannerType == 2) {
        banner = '/* ' + projectPath + basename + ' md5:' + $.md5(result) + ' */\r\n';
    }

    return banner;
}

/**
 * @html文件压缩
 * @param source 文件/文件夹路径
 * @return compress code
 */
compress.html = function (source) {
    var sourceContent = f.read(source);
    var minify = htmlminify(sourceContent, {
        removeComments: true, //移除注释
        collapseWhitespace: true, //合并多余的空格
        minifyJS: true, //压缩文件中的js代码
        minifyCSS: true //压缩文件中的css代码
    });
    return minify;
}

/**
 * @js文件压缩
 * @param source 文件/文件夹路径
 * @return compress code
 */
compress.js = function (source, isdebug) {
    var isdebug = isdebug || false;
    if (!f.exists(source)) {
        return;
    }
    var sourceContent = f.read(source);

    var options = {
        remove: [], //
        except: ['require', 'define'], //不压缩的字符名
        ascii_only: true, //输出Unicode characters
        beautify: false, //美化代码
        warnings: false //显示压缩报错
        //,mangle: false//是否压缩 失效的参数
    };

    if (jdf.config.output.jsRemove) {
        options.remove = jdf.config.output.jsRemove;
    }

    var result = sourceContent;

    try {
        if (!isdebug) {
            //parse
            UglifyJS.base54.reset();
            var toplevel = UglifyJS.parse(sourceContent);
            toplevel.figure_out_scope();
            var compressorOption = {
                hoist_funs: false, //函数声明至顶端
                //fromString: true,  //说明代码源的格式是否为字符串
                //mangle: true,      //是否压缩,只要配置就不压缩了
                warnings: false, //显示压缩报错
                join_vars: false
            }
            if (options.warnings) {
                compressorOption.warnings = options.warnings;
            }

            //remove console.log
            var matchRemoveOption = function (host, method) {
                return !options.remove.every(function (element) {
                    if (element.indexOf(".") == -1) {
                        return element != host;
                    }
                    return element != host + '.' + method;
                });
            }
            var removeConsoleTransformer = new UglifyJS.TreeTransformer(function (node, descend) {
                if (node instanceof UglifyJS.AST_Call) {
                    var host, method;
                    try {
                        host = node.expression.start.value;
                        method = node.expression.end.value;
                    } catch (err) {

                    }

                    if (host && method) {
                        if (matchRemoveOption(host, method)) {
                            return new UglifyJS.AST_Atom();
                        }
                    }
                }
                descend(node, this);
                return node;
            });
            toplevel = toplevel.transform(removeConsoleTransformer);

            var compressor = UglifyJS.Compressor(compressorOption);
            toplevel = toplevel.transform(compressor);
            toplevel.mangle_names({ except: options.except });

            //output, has /*$ */ comments
            var stream = UglifyJS.OutputStream({
                comments: function (scope, comment) {
                    if (isdebug) {
                        return true;
                    } else {
                        if (comment.type == 'comment2' && comment.value.charAt(0) === '$' && options.copyright) {
                            return comment;
                        }
                        return false;
                    }
                },
                space_colon: false,
                //quote_keys: true, object keys加引号
                beautify: options.beautify,
                ascii_only: options.ascii_only
            });

            toplevel.print(stream);
            result = stream.get();
        }

        //增加前缀banner
        if (!isdebug) {
            result = compress.setPrefixBanner(jdf.config.output.hasBanner, source, result) + result + '\r\n';
        }
    } catch (e) {
        if (e && e.message) {
            console.log('jdf error [compress.js] - ' + source + ' , line:' + e.line + ', ' + e.message);
        }
    }
    return result;
};


/**
 * @css文件压缩
 * @param source 文件/文件夹路径
 * @return compress code
 */
compress.css = function (source, isdebug) {
    var isdebug = isdebug || false;

    if (!f.exists(source)) {
        return;
    }
    var sourceCode = f.read(source);
    var result = sourceCode;
    if (!isdebug) {
        result = new CleanCSS({
            aggressiveMerging: false, //disable aggressive merging of properties.
            keepBreaks: false, //是否有空格
            processImport: false, //是否替换@import
            compatibility: '*'
        }).minify(sourceCode);
    }

    if (jdf.config.output.imagesSuffix) {
        result = compress.imagesSuffix(source, result);
    }

    //增加前缀banner
    result = compress.setPrefixBanner(jdf.config.output.hasBanner, source, result) + result + '\r\n';

    return result;
};

compress.css2 = function (source, isdebug) {
    var isdebug = isdebug || false;

    if (!f.exists(source)) {
        return;
    }
    var sourceCode = f.read(source);
    var result = sourceCode;
    if (jdf.config.output.imagesSuffix) { //替换imagesSuffix情况下的image名称
        result = compress.imagesSuffix(source, result);
    }
    return result;
}

/**
* css中图片路径替换
* @time 2014-2-21 10:17:13
* @param cdn 前缀
* @param prefix css目录前缀
* @param suffix 后缀 
* @example 
    cssImagesUrlReplace('.test{background-image:url("i/test.jpg");}','http://cdn.com/','?time=123') ===> 
    .test{background-image:url("http://cdn.com/i/test.jpg?time=123");}
*/
compress.cssImagesUrlReplace = function (source, str, cdn, prefix, suffix) {

    var suffix = jdf.config.suffix;

    var imagesSuffix = jdf.config.output.imagesSuffix;

    var cssImagesUrlReg = new RegExp("url\\(.*?\\)", "igm");
    var cssImagesUrl = str.match(cssImagesUrlReg);

    //使用Set数据结构，直接去重
    var tempSet = new Set(cssImagesUrl);

    var sourcedir = path.normalize(path.dirname(source));
    var outputdir = path.normalize(f.currentDir() + '/' + jdf.config.outputDirName);

    if (tempSet.size) {

        for (var i of tempSet.values()) {
            var b = i;
            b = b.replace('url(', '');
            b = b.replace(')', '');
            b = b.replace(/\s/g, '');
            b = b.replace(/\"/g, '');
            b = b.replace(/\'/g, '');

            if (b != 'about:blank' && !$.is.httpLink(b) && !/data:image/.test(b) && b.indexOf('?__base64') == -1) {

                var sReg = new RegExp('url\\("{0,1}' + b + '"{0,1}\\)', 'gim');
                str = str.replace(sReg, 'url(' + compress.addSourceCdn(source, b) + ')');
            }
        };
    };

    return str;
}

compress.addSourceCdn = function (source, filename) {
    var cdn = jdf.config.cdn;
    var sourcedir = path.normalize(path.dirname(source));
    var outputdir = path.normalize(path.join(f.currentDir(), jdf.config.outputDirName));

    if (!source) {
        return;
    }

    if (!filename) {
        filename = path.basename(source);
    }

    if (/^\//.test(filename)) {
        //以斜杠的开头的文件直接添加cdn和项目根目录
        filename = cdn + $.pathJoin('/', jdf.getProjectPath(), filename);
    } else {
        //得到当前项目的路径和当前文件路径的一个差值
        var d = sourcedir.replace(path.normalize(outputdir), '');
        var e = path.normalize(path.join(d, filename));

        filename = cdn + e;
    }

    return filename.replace(/\\/g, '/');
}

compress.imagesSuffix = function (source, str) {
    var imagesSuffix = jdf.config.output.imagesSuffix;
    var suffix = jdf.config.suffix;

    if (imagesSuffix == 1) {
        str = str.replace(new RegExp('\\.png\\?__sprite', 'gmi'), '.png?__sprite' + suffix);
    } else if (imagesSuffix == 2) {
        str = str.replace(/\.png\?__sprite/gmi, suffix + '.png?__sprite');
    }

    return str;
}


/**
 * Handle all kinds of images
 * @param {string} source - source img file path
 * @param {bool} webp - is webp enabled ?
 */
compress.handleImg = (source, webp) => {
    let tempFolder = path.resolve(os.tmpdir() + "/jdf_img_temp/" + uuid());
    let tempSourceFile = path.join(tempFolder, path.basename(source));
    shelljs.mkdir("-p", tempFolder);
    return jdfImg.all(source, tempSourceFile, webp).then(values => {
        shelljs.cp(tempSourceFile, source);
        if (webp) {
            shelljs.cp(tempSourceFile + ".webp", source + ".webp");
        }
        //shelljs.rm("-Rf",tempFolder);
    });
}
/**
@method Pngquant优化png图片
@option {String} source 输入文件路径
@option {String} target 输出文件路径
@option {Boolse} false 是否显示log
**/
// compress.png = function (source, target, haslog) {
//     shelljs.mkdir("-p", path.resolve(os.tmpdir() + "/img_temp/"))
//     f.copy(source, )


//     var compressPngReg = jdf.config.output.compressPngReg;
//     if (f.filter(source, false, compressPngReg)) {
//         var buffer = fs.readFileSync(source);
//         var options = {};
//         if (typeof (haslog) != 'undefined') {
//             options.params = '-v --iebug';
//         }
//         buffer = Pngquant.option(options).compress(buffer);
//         fs.writeFileSync(target, buffer);
//     }
// };


/**
@method 将png jpg 转为 webp 格式
@option {String} source 输入文件路径
@option {String} target 输出文件路径
@option {Number} quant 压缩质量
@option {Function} callback 回调函数
@option {Boolse} false 是否显示log
**/
compress.webp = function (source, target, quant, callback, haslog) {
    var webp = require('webp-converter');
    webp.cwebp(source, target, "-q " + quant ? quant : quant, function (status) {
        //if conversion successfull status will be '100' 
        //if conversion unsuccessfull status will be '101' 
        if (callback) {
            callback(status);
        }
    });

};

/**
@method 将 webp 相关css 追加到指定css中
@option {String} source 输入文件路径
**/
compress.appendWebpCSSFIX = function (source) {
    var AST_result = [];
    var sourceCode = compress.css(source, false);
    //remove comment
    sourceCode = sourceCode.replace(/\/\*.*?\*\//ig, function (match) {
        return ""
    });
    var rules = sourceCode.match(/.*?\{.*?\}/ig);
    if (!rules) {
        return;
    }
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.match(/\{/g).length != rule.match(/\}/g).length) {
            continue;
        }
        var cssBodyStr = rule.match(/\{.*?\}/ig)[0];
        var cssHead = rule.replace(cssBodyStr, "");
        cssHead = cssHead.split(';');
        cssHead = cssHead[cssHead.length - 1];
        cssBodyStr = cssBodyStr.replace('{', '').replace('}', '');
        var cssBodyProperties = cssBodyStr.split(';');
        var astCssRule = {};
        astCssRule.selector = cssHead;
        astCssRule.values = [];
        for (var j in cssBodyProperties) {
            var cssObj = cssBodyProperties[j].split(":");
            var cssPropertyName = cssObj[0];
            var cssPropertyValue = cssBodyProperties[j].replace(cssPropertyName + ":", "");
            if (cssPropertyValue.match(/.*?url.*?\.(png|jpg)/ig)) {
                var _c = {
                    k: cssPropertyName,
                    v: cssPropertyValue.replace(/.*?url.*?\.(png|jpg)/ig, function (match) {
                        return match + ".webp";
                    })
                };
                astCssRule.values.push(_c);
            }
        }
        if (astCssRule.values.length) {
            AST_result.push(astCssRule);
        }
    }

    var resultCss = ["/* webp css prefix */"];
    for (var i in AST_result) {
        var webpCssRule = AST_result[i];
        var rootClass = jdf.config.output.webpRootClass ? '.' + jdf.config.output.webpRootClass + " " : ".root-webp ";

        var cssValues = [];
        for (var j in webpCssRule.values) {
            var cssV = webpCssRule.values[j];
            cssValues.push(cssV.k + ":" + cssV.v);
        }
        var css = rootClass + webpCssRule.selector + "{" + cssValues.join(';') + "}";
        resultCss.push(css);
    }

    var raw = f.read(source);
    f.write(source, raw + "\n" + resultCss.join("\n"));


}
