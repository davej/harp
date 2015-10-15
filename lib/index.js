var path        = require('path')
var fs          = require('fs-extra')
var terraform   = require('terraform')
var async       = require('async')
var connect     = require('connect')
var mime        = require('mime')
var helpers     = require('./helpers')
var middleware  = require('./middleware')
var pkg         = require('../package.json')


/**
 * Server
 *
 * Host a single Harp application.
 *
 */

exports.server = function(dirPath, options, callback){
  var app = connect()
  var middlewareProcess = middleware.process()

  app.use(middleware.regProjectFinder(dirPath))
  app.use(middleware.setup)
  app.use(middleware.basicAuth)
  app.use(middleware.underscore)
  app.use(middleware.mwl)
  app.use(middleware.static)
  app.use(middleware.poly)
  app.use(middlewareProcess)
  app.use(middleware.fallback)
  app.listen(options.port || 9966, options.ip, callback)

  return app
}


/**
 * Multihost
 *
 * Host multiple Harp applications.
 *
 */

exports.multihost = function(dirPath, options, callback){
  var app = connect()
  var middlewareProcess = middleware.process()
  app.use(middleware.notMultihostURL)
  app.use(middleware.index(dirPath))
  app.use(middleware.hostProjectFinder(dirPath))
  app.use(middleware.setup)
  app.use(middleware.basicAuth)
  app.use(middleware.underscore)
  app.use(middleware.mwl)
  app.use(middleware.static)
  app.use(middleware.poly)
  app.use(middlewareProcess)
  app.use(middleware.fallback)
  app.listen(options.port || 9000, callback)
}

/**
 * Mount
 *
 * Offer the asset pipeline as connect middleware
 *
 */

exports.mount = function(mountPoint, root){

  if(!root){
    root = mountPoint
    mountPoint = null
  }else{
    var rx = new RegExp("^" + mountPoint)
  }

  var finder = middleware.regProjectFinder(root)
  var middlewareProcess = middleware.process()

  return function(req, rsp, next){

    if(rx){
      if(!req.url.match(rx)) return next()
      var originalUrl = req.url
      req.url         = req.url.replace(rx, "/")
    }
    finder(req, rsp, function(){
      middleware.setup(req, rsp, function(){
        middleware.static(req, rsp, function(){
          middleware.poly(req, rsp, function(){
            middlewareProcess(req, rsp, function(){
              if(originalUrl) req.url = originalUrl
              next()
            })
          })
        })
      })
    })
  }
}


/**
 * Pipeline
 *
 * Offer the asset pipeline as connect middleware
 *
 */

exports.pipeline = function(root){
  console.log("Deprecated, please use MOUNT instead, this will be removed in a future version.");
  var publicPath = path.resolve(root)
  var terra = terraform.root(publicPath)

  return function(req, rsp, next){
    var normalizedPath  = helpers.normalizeUrl(req.url)
    var priorityList    = terraform.helpers.buildPriorityList(normalizedPath)
    var sourceFile      = terraform.helpers.findFirstFile(publicPath, priorityList)

    if(!sourceFile) return next()

    terra.render(sourceFile, function(error, body){
      if(error) return next(error)
      if(!body) return next() // 404

      var outputType = terraform.helpers.outputType(sourceFile)
      var mimeType   = helpers.mimeType(outputType)
      var charset    = mime.charsets.lookup(mimeType)
      rsp.statusCode = 200
      rsp.setHeader('Content-Type', mimeType + (charset ? '; charset=' + charset : ''))
      rsp.setHeader('Content-Length', body.length)
      rsp.end(body)
    })

  }

}

exports.pkg = pkg

/**
 * Export middleware
 *
 * Make sure middleware is accessible
 * when using harp as a library
 *
 */
exports.middleware = middleware;

/**
 * Compile
 *
 * Compiles Single Harp Application.
 *
 */

exports.compile = function(projectPath, outputPath, callback){

  /**
   * Both projectPath and outputPath are optional
   */

  var ignorePaths;
  if (typeof outputPath === 'object') {
    ignorePaths = outputPath.ignorePaths
    outputPath = outputPath.outputPath
  }

  if(!callback){
    callback   = outputPath
    outputPath = "www"
  }

  if(!outputPath){
    outputPath = "www"
  }


  if(!ignorePaths){
    ignorePaths = ["vendor"]
  }

  /**
   * Setup all the paths and collect all the data
   */

  try{
    outputPath = path.resolve(projectPath, outputPath)
    var setup  = helpers.setup(projectPath, "production")
    var terra  = terraform.root(setup.publicPath, setup.config.globals)
    // vendorPath = path.resolve(projectPath, path.join(setup.publicPath, vendorPath))
  }catch(err){
    return callback(err)
  }

  /**
   * Collate the extensions of files to be compiled from terraform
   *  => [ '.jade', '.ejs', '.md', '.styl', '.less', '.scss', '.sass', '.coffee', '.es6' ]
   */
  var compilationExts =
    terraform.helpers.processors.html.concat(terraform.helpers.processors.css).concat(terraform.helpers.processors.js)
  compilationExts = compilationExts.map(function(ext) { return "." + ext })


  /**
   * Protect the user (as much as possible) from compiling up the tree
   * resulting in the project deleting its own source code.
   */

  if(!helpers.willAllow(projectPath, outputPath)){
    return callback({
      type: "Invalid Output Path",
      message: "Output path cannot be greater then one level up from project path and must be in directory starting with `_` (underscore).",
      projectPath: projectPath,
      outputPath: outputPath
    })
  }


  /**
   * Compile and save file
   */

  var compileFile = function(file, done){
    process.nextTick(function () {
      terra.render(file, function(error, body){
        if(error){
          done(error)
        }else{
          if(body){
            var dest = path.resolve(outputPath, terraform.helpers.outputPath(file))
            fs.mkdirp(path.dirname(dest), function(err){
              fs.writeFile(dest, body, done)
            })
          }else{
            done()
          }
        }
      })
    })
  }

  /**
   * Copy File
   * unless it's a source file for compilation (it has already been compiled by terraform)
   */

  var copyUncompiledFile = function(file, done){
    var ext = path.extname(file)
    if(!terraform.helpers.shouldIgnore(file) && compilationExts.indexOf(ext) === -1){
      copyFile(file, done)
    }else{
      done()
    }
  }

  /**
   * Copy File
   */
  var copyFile = function(file, done){
    var localPath = path.resolve(outputPath, file)
    fs.mkdirp(path.dirname(localPath), function(err){
      fs.copy(path.resolve(setup.publicPath, file), localPath, done)
    })
  }

  /**
   * Scan dir, Compile Less and Jade, Copy the others.
   * Do not compile vendor folder but copy it directly.
   */

   ignorePaths = []

   helpers.prime(outputPath, { ignore: projectPath }, function(err){
    if(err) console.log(err)

    helpers.ls(setup.publicPath, { ignore: ignorePaths }, function(err, results, noCompileResults){
      async.eachLimit(results, 72, compileFile, function(err){
        if(err){
          callback(err)
        }else{
          async.eachLimit(results, 72, copyUncompiledFile, function(err){
            async.eachLimit(noCompileResults, 72, copyFile, function(err) {
              setup.config['harp_version'] = pkg.version
              delete setup.config.globals
              callback(null, setup.config)
            })
          })
        }
      })
    })
  })

}
