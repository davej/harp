var should            = require("should")
var request           = require('request')
var path              = require("path")
var fs                = require("fs")
var harp              = require("../")
var sinon             = require("sinon")
var connect           = require("connect")
var lessProcessor     = require("terraform/lib/stylesheet/processors/less")

describe("caching", function(){
  var projectPath = path.join(__dirname, "apps/basic/public")

  before(function(done){
    // Watch how many times `less.compile` is called
    // If a compiled less file is cached then `less.compile` wont be called
    lessProcessor.compile = sinon.spy(lessProcessor, "compile")

    var app = connect()
    app.use(connect.static(projectPath))
    app.use(harp.mount(projectPath))
    app.listen(8234, done)
  })

  var compileCount = 0;

  function wasCompiled() {
    sinon.assert.callCount(lessProcessor.compile, ++compileCount)
  }

  function wasCached() {
    sinon.assert.callCount(lessProcessor.compile, compileCount)
  }

  describe("css", function() {

    it("should compile CSS file on first request", function(done){
      request('http://localhost:8234/css/main.css', function (e, r, b) {
        r.statusCode.should.eql(200)
        b.should.include("background")
        wasCompiled()
        done()
      })
    })

    it("should cache the source map", function(done){
      request('http://localhost:8234/css/main.css.map', function (e, r, b) {
        r.statusCode.should.eql(200)
        b.should.include("[\"_nav.less\",\"main.less\"]")
        wasCached()
        done()
      })
    })

    it("should serve CSS file from cache on second request", function(done){
      request('http://localhost:8234/css/main.css', function (e, r, b) {
        r.statusCode.should.eql(200)
        b.should.include("background")
        wasCached()
        done()
      })
    })

    describe("cache invalidation", function() {
      var pathToCSS = path.join(projectPath, "css", "main.less")
      var fileContents;

      before(function(done) {
        fs.readFile(pathToCSS, function(err, contents){
          fileContents = contents
          fs.writeFile(pathToCSS, contents+' ', function (err) {
            setTimeout(done, 250) // Allow 250ms for chokidar to notice the change
          });
        })
      })

      after(function(done) {
        // Revert file back to original state
        fs.writeFile(pathToCSS, fileContents, done)
      })

      it("should recompile CSS file when edited", function(done){
        request('http://localhost:8234/css/main.css', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("background")
          wasCompiled()
          done()
        })
      })

      it("should serve CSS file from cache on second request after edit", function(done){
        request('http://localhost:8234/css/main.css', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("background")
          wasCached()
          done()
        })
      })

    })

    describe("cache invalidation on imported file", function() {
      var pathToCSS = path.join(projectPath, "css", "_nav.less")
      var fileContents;

      before(function(done) {
        fs.readFile(pathToCSS, function(err, contents){
          fileContents = contents
          fs.writeFile(pathToCSS, contents+' ', function (err) {
            setTimeout(done, 250) // Allow 250ms for chokidar to notice the change
          });
        })
      })

      it("should recompile CSS file when edited", function(done){
        request('http://localhost:8234/css/main.css', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("background")
          wasCompiled()
          done()
        })
      })

      it("should serve CSS file from cache on second request after edit", function(done){
        request('http://localhost:8234/css/main.css', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("background")
          wasCached()
          done()
        })
      })

      after(function(done) {
        fs.writeFile(pathToCSS, fileContents, done)
      })

    })

  })

})
