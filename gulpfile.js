'use strict';
const _ = require('lodash');
const gulp = require('gulp');
const gulpUtil = require('gulp-util');
const concat = require('gulp-concat');
const sass = require('gulp-sass');
//var sourcemaps = require('gulp-sourcemaps');
const prettify = require('gulp-jsbeautifier');
const browserify = require('gulp-browserify');
const uglify = require('gulp-uglify');
const nodeunit = require('gulp-nodeunit');

const debug = require('gulp-debug');
const browserSync = require('browser-sync').create();
const glob = require('glob-promise');
const fs = require('fs-sync');
const hjson = require('hjson');

/*----------------------------------------------------------------------------*/
/* Some utility functions                                                     */
/*----------------------------------------------------------------------------*/
const chalk = require('chalk');

function date() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    return '[' + chalk.gray(hour + ':' + min + ':' + sec) + ']';
}

function info(msg) {
    console.warn(date() + ' ' + chalk.green('\u221A [INFO ] ' + msg));
}

function warn(msg) {
    console.warn(date() + ' ' + chalk.yellow('~ [WARN ] ' + msg));
}

function err(msg) {
    console.error(date() + ' ' + chalk.red('\u2716 [ERROR] ' + msg));
}

function fatal(msg) {
    err(msg);
    throw new gulpUtil.PluginError({
        plugin: __filename,
        message: msg
    });
}

function log(msg) {
    gulpUtil.log(msg);
}

function getConfig() {
    const argv = require('yargs').argv
    var config = {
        env: argv.env || process.env.NODE_ENV ||  'dev',
        uglify: argv.uglify || false,
        buildDate: new Date().toISOString(),
        buildUser: require('username').sync(),
        buildHostname: require('os').hostname()
    }
    var files = ['config/config.json', 'config/config.hjson', 'config/config-' + config.env + '.json', 'config/config-' + config.env + '.hjson'];
    for(var i = 0; i < files.length; i++) {
        if(fs.exists(files[i])) {
            if(files[i].endsWith('hjson')) {
                var data = fs.read(files[i]);
                config = _.assign(config, hjson.parse(data));
            } else {
                config = _.assign(config, fs.readJSON(files[i]));
            }
        }
    }
    return config;
}
/*----------------------------------------------------------------------------*/
/* read configuration                                                          */
/*----------------------------------------------------------------------------*/
const config = getConfig();

/*----------------------------------------------------------------------------*/
/* Tasks                                                                      */
/*----------------------------------------------------------------------------*/


gulp.task('showconf', function() {
    return new Promise(function(accept, reject) {
        console.log(config);
    });
});

//beautify scripts
gulp.task('prettify', function() {
    return gulp.src(['./*.css', './*.html', './*.js']).pipe(prettify({
        ident_size: 4,
        debug: true
    })).pipe(prettify.reporter()).pipe(gulp.dest('./'));
});

// Compile sass into CSS & auto-inject into browsers
gulp.task('sass', function() {
    return gulp.src("assets/**/*.scss").pipe(debug()).pipe(sass({
        data: config,
        outputStyle: 'compressed'
    })).pipe(gulp.dest("dist")).pipe(browserSync.stream());
});

gulp.task('make_conf_js', function() {
    return new Promise(function(accept, reject) {
        var confJs = 'window.config = ' + JSON.stringify(config) + ';';
        fs.write('dist/js/config.js', confJs);
        info("created 'dist/js/config.js'");
        browserSync.reload()
        accept();
    });

});

//make the project browser-ready
gulp.task('browserify', ['make_conf_js'], function() {
    return gulp.src(['src/app.js'])
    //      .pipe(sourcemaps.init())
    .pipe(debug()).pipe(browserify({
        transform: ['envify', 'vueify', 'babelify', 'aliasify'],
        insertGlobals: true,
        debug: config.env !== 'production'
    }))
    //      .pipe(sourcemaps.write())
    .pipe(gulp.dest('dist/js')).pipe(browserSync.stream());
});

//copy assets from dependencies
gulp.task('copy_ext_assets', function() {
    var packageJson = fs.readJSON('package.json');
    var promises = [];
    for(var pkgName in packageJson.dependencies) {
        _.forEach(['css', 'fonts'], function(subdir) {
            var location = './node_modules/' + pkgName + '/dist/' + subdir + '/*';
            promises.push(glob(location).then(function(files) {
                //console.log(files);
                return gulp.src(files).pipe(debug()).pipe(gulp.dest('dist/' + subdir));
            }));
        });
    }
    return Promise.all(promises);
});


gulp.task('nunjucks', function() {
    const nunjucks = require('nunjucks');
    return new Promise(function(accept, reject) {
        glob('assets/**.html').then(function(files) {
            try {
                for(var i = 0; i < files.length; i++) {
                    var inputfile = files[i];
                    if(!inputfile.endsWith('.vue.html')) {
                        var outputfile = files[i].replace(/^assets/, 'dist');
                        var res = nunjucks.render(files[i], config);
                        info('nunjucks ' + inputfile + ' -> ' + outputfile);
                        fs.write(outputfile, res);
                    }
                }
                browserSync.reload()
                accept();
            } catch(e) {
                reject(e);
            }
        });
    });
});

//copy assets of the current project
gulp.task('copy_assets', ['copy_ext_assets', 'nunjucks'], function() {
    return gulp.src(['assets/**', '!assets/**.html']).pipe(gulp.dest('dist')).pipe(debug()).pipe(browserSync.stream())
});

//shrinks the main javascript
gulp.task('uglify', ['sass', 'browserify', 'copy_assets'], function() {
    if(config.uglify ||  config.env !== 'dev') {
        return gulp.src('dist/js/app.js').pipe(uglify()).pipe(gulp.dest('dist'));
    } else {
        warn("uglify is disabled for env == 'dev' unless --uglify=true flag is set");
    }
});

//remove dist directory
gulp.task('clean', function() {
    const rimraf = require('rimraf');
    return new Promise(function(resolve, reject) {
        rimraf('dist', resolve);
    });
});

//create deployement-ready content in ./dist
gulp.task('dist', ['sass', 'browserify', 'copy_assets', 'uglify']);

//run a test server
gulp.task('serve', ['dist'], function() {
    browserSync.init({
        server: "./dist",
        notify: false
    });
    gulp.watch("src/*", ['browserify']);
    gulp.watch("assets/**/*.scss", ['sass']);
    gulp.watch("assets/**/*", ['copy_assets']);
});

gulp.task('e2e', function(cb) {

    if(!config.skipTests) {

        var Server = require('karma').Server;
        new Server({
            configFile: __dirname + '/config/karma.conf.js',
            singleRun: true
        }, cb).start();

    } else {
        warn('unit tests are skipped');
        return null;
    }

});

//node-based (non-browser) unit tests
gulp.task('unittest', function() {
    return gulp.src('test/**/*.unittest.js').pipe(nodeunit(
    /*{
                 reporter:'junit',
                 reporterOptions : {
                     output: 'testreport'
                 }
             }*/
    ));
});

//todo : normal (non-browser) unit tests using mocha
//todo : ievms integration (tests on IE)
//todo : cucumber reports
