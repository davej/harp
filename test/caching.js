var should            = require("should")
var request           = require('request')
var path              = require("path")
var fs                = require("fs")
var harp              = require("../")
var sinon             = require("sinon")
var connect           = require("connect")
var lessProcessor     = require("terraform/lib/stylesheet/processors/less")
var jadeProcessor     = require("terraform/node_modules/harp-jade")


describe("caching", function(){
  var projectPath = path.join(__dirname, "apps/basic/public")

  before(function(done){
    var app = connect()
    app.use(connect.static(projectPath))
    app.use(harp.mount(projectPath))
    app.listen(8234, done)
  })

  describe("css", function() {

    before(function(done){
      lessProcessor.compile = sinon.spy(lessProcessor, "compile")
      done()
    })

    var compileCount = 0;

    function wasCompiled() {
      sinon.assert.callCount(lessProcessor.compile, ++compileCount)
    }

    function wasCached() {
      sinon.assert.callCount(lessProcessor.compile, compileCount)
    }

    it("should compile file on first request", function(done){
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

    it("should serve file from cache on second request", function(done){
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

      it("should recompile file when edited", function(done){
        request('http://localhost:8234/css/main.css', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("background")
          wasCompiled()
          done()
        })
      })

      it("should serve file from cache on second request after edit", function(done){
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

      it("should recompile file when edited", function(done){
        request('http://localhost:8234/css/main.css', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("background")
          wasCompiled()
          done()
        })
      })

      it("should serve file from cache on second request after edit", function(done){
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

  describe("html", function() {

    before(function(done){
      jadeProcessor.compile = sinon.spy(jadeProcessor.compile)
      done()
    })

    var compileCount = 0;

    function wasCompiled() {
      compileCount = compileCount + 3 // about.html is the combination of 3 jade files
      sinon.assert.callCount(jadeProcessor.compile, compileCount)
    }

    function wasCached() {
      sinon.assert.callCount(jadeProcessor.compile, compileCount)
    }

    it("should compile file on first request", function(done){
      request('http://localhost:8234/about.html', function (e, r, b) {
        r.statusCode.should.eql(200)
        b.should.include("<h2>About Brock</h2>")
        wasCompiled()
        done()
      })
    })

    it("should serve file from cache on second request", function(done){
      request('http://localhost:8234/about.html', function (e, r, b) {
        r.statusCode.should.eql(200)
        b.should.include("<h2>About Brock</h2>")
        wasCached()
        done()
      })
    })

    describe("cache invalidation", function() {
      var pathToJade = path.join(projectPath, "about.jade")
      var fileContents;

      before(function(done) {
        fs.readFile(pathToJade, function(err, contents){
          fileContents = contents
          fs.writeFile(pathToJade, contents+' ', function (err) {
            setTimeout(done, 250) // Allow 250ms for chokidar to notice the change
          });
        })
      })

      after(function(done) {
        // Revert file back to original state
        fs.writeFile(pathToJade, fileContents, done)
      })

      it("should recompile file when edited", function(done){
        request('http://localhost:8234/about.html', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("<h2>About Brock</h2>")
          wasCompiled()
          done()
        })
      })

      it("should serve file from cache on second request after edit", function(done){
        request('http://localhost:8234/about.html', function (e, r, b) {
          r.statusCode.should.eql(200)
          b.should.include("<h2>About Brock</h2>")
          wasCached()
          done()
        })
      })

    })

  });

})
