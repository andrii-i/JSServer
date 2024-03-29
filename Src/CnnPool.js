var mysql = require('mysql');

// Constructor for DB connection pool
// Note: In some mysql server instances, standard password access may
// not be the default authentication.  In this case, adjust the user
// in question via this MySQL command, replacing the <> with appropriate
// values.
// ALTER USER '<user>'@'localhost' IDENTIFIED WITH mysql_native_password BY '<YourPassword>'; 
var CnnPool = function() {
   var poolCfg = require('./connection.json');

   poolCfg.connectionLimit = CnnPool.PoolSize;
   this.pool = mysql.createPool(poolCfg);
};

// NOTE: Do *not* change this pool size.  It is required to be 1 in order
// to demonstrate you are properly freeing connections!
CnnPool.PoolSize = 1;

// The one (and probably only) CnnPool object needed for the app
CnnPool.singleton = new CnnPool();

// Conventional getConnection, drawing from the pool
CnnPool.prototype.getConnection = function(cb) {
   this.pool.getConnection(cb);
};

// Router function for use in auto-creating CnnPool for a request
CnnPool.router = function(req, res, next) {
   console.log("Getting connection");
   CnnPool.singleton.getConnection(function(err, cnn) {
      if (err) {
         res.status(500).json('Failed to get connection ' + err);
      } else {
         console.log("Connection acquired");
         cnn.chkQry = function(qry, prms, cb) {
            // Run real qry, checking for error
            this.query(qry, prms, function(errQuery, qryRes, fields) {
               if (errQuery) {
                  res.status(500).json('Failed query ' + qry);
               }
               cb(errQuery, qryRes, fields);
            });
         }; 
         req.cnn = cnn;
         next();
      }
   });
};

module.exports = CnnPool;