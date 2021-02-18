var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var {Session, router} = require("./Session.js");
var Validator = require("./Validator.js");
var CnnPool = require("./CnnPool.js");
var async = require("async");
// app returned by express() is in fact a JavaScript Function, designed to be 
// passed to Node’s HTTP servers as a callback to handle requests. 
var app = express(); 

// Static paths to be served like index.html and all client side js
app.use(express.static(path.join(__dirname, "public")));

// Partially complete handler for CORS.
app.use(function(req, res, next) { // mounts middleware function w/o path
                                   // would be executed for every request 
                                   // to the app
   console.log("Handling " + req.path + "/" + req.method);
   res.header("Access-Control-Allow-Origin", "http://localhost:3000");
   res.header("Access-Control-Allow-Credentials", true);
   res.header("Access-Control-Allow-Headers", "Content-Type");
   next();
});

// No further processing needed for options calls.
app.options("/*", function(req, res) {
   res.status(200).end();
});

// Parse all request bodies using JSON, yielding a req.body property
app.use(bodyParser.json());

// No messing w/db ids
app.use(function(req, res, next) {
   delete req.body.id; 
   next();
});

// Parse cookie header, and attach cookies to req as req.cookies.<cookieName>
app.use(cookieParser());

// Set up Session on req if available
app.use(router);

// Check general login.  If OK, add Validator to |req| and continue processing,
// otherwise respond immediately with 401 and noLogin error tag.
app.use(function(req, res, next) {
   if (req.session || (req.method === "POST" &&
    (req.path === "/Prss" || req.path === "/Ssns"))) {
      req.validator = new Validator(req, res);
      next();
   } else
      res.status(401).end();
});

// Add DB connection, as req.cnn, with smart chkQry method, to |req|
app.use(CnnPool.router);

// Load all subroutes
app.use("/Prss", require("./Account/Prss.js"));
app.use("/Ssns", require("./Account/Ssns.js"));
app.use("/Cnvs", require("./Conversation/Cnvs.js"));

// Special debugging route for /DB DELETE.  Clears all table contents,
//resets all auto_increment keys to start at 1, and reinserts one admin user.
app.delete("/DB", function(req, res) {
   // Callbacks to clear tables
   var cbs = ["Message", "Conversation", "Person"].map(
      table => function(cb) {
         req.cnn.query("delete from " + table, cb);
      }
   );   

   if (!req.session.isAdmin()) {
      req.cnn.release();
      res.status(401).end();
   }

   // Callbacks to reset increment bases
   cbs = cbs.concat(
      ["Conversation", "Message", "Person"].map(
         table => cb => {
            req.cnn.query("alter table " + table + " auto_increment = 1", cb);
         }
      ));

   // Callback to reinsert admin user
   cbs.push(cb => {
      req.cnn.query("INSERT INTO Person (firstName, lastName, email," +
       " password, whenRegistered, role) VALUES " +
       "(\"Joe\", \"Admin\", \"adm@11.com\",\"password\", NOW(), 1)", cb);
   });

   // Callback to clear sessions, release connection and return result
   cbs.push(cb => {
      Session.getAllIds().forEach(id => {
         Session.findById(id).logOut();
         console.log("Clearing " + id);
      });
      cb();
   });

   async.series(cbs, err => {
      req.cnn.release();
      if (err)
         res.status(400).json(err);
      else
         res.status(200).end();
   });
});

// Anchor handler for general 404 cases.
app.use(function(req, res) {
   res.status(404).end();
   console.log("404 status given");
   req.cnn && req.cnn.release();
});

// Handler of last resort.  Send a 500 response with stacktrace as the body.
app.use(function(err, req, res, next) {
   res.status(500).json(err.stack);
   req.cnn && req.cnn.release();
});

app.listen(3000, function() {
   console.log("App Listening on port 3000");
});