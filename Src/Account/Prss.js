var Express = require('express');
var Tags = require('../Validator.js').Tags;
var async = require('async');
var mysql = require('mysql');

var router = Express.Router({caseSensitive: true});

router.baseURL = '/Prss';

/* Ugly versions
//.../Prss?email=cstaley
router.get('/', function(req, res) {
   var email = req.session.isAdmin() && req.query.email ||
    !req.session.isAdmin() && req.session.email;
   var cnnConfig = {
      host     : 'localhost',
      user     : 'cstaley',
      password : 'CHSpw',
      database : 'cstaley'
   };

   var cnn = mysql.createConnection(cnnConfig);

   if (email)
      cnn.query('select id, email from Person where email = ?', [email],
      function(err, result) {
         if (err) {
            res.status(500).json("Failed query");
         }
         else {
            res.status(200).json(result);
         }
         cnn.destroy();
      });
   else
      cnn.query('select id, email from Person',
      function(err, result) {
         if (err) {
            res.status(500).json("Failed query");
         }
         else {
            res.status(200).json(result);
         }
         cnn.destroy();
      });
});

// Non-waterfall, non-validator, non-db automation version
router.post('/', function(req, res) {
   var body = req.body;
   var admin = req.session && req.session.isAdmin();
   var errorList = [];
   var qry;
   var noPerm;
   var cnnConfig = {
      host     : '127.0.0.1',
      user     : 'cstaley',
      password : 'CASpw',
      database : 'CHSdb'
   };

   if (admin && !body.password)
      body.password = "*";                       // Blocking password
   body.whenRegistered = new Date();

   // Check for fields
   if (!body.hasOwnProperty('email'))
      errorList.push({tag: "missingField", params: "email"});
   if (!body.hasOwnProperty('password'))
      errorList.push({tag: "missingField", params: "password"});
   if (!body.hasOwnProperty('role'))
      errorList.push({tag: "missingField", params: "role"});

   // Do these checks only if all fields are there
   if (!errorList.length) {
      noPerm = body.role === 1 && !admin;
      if (!body.termsAccepted)
         errorList.push({tag: "noTerms"});
      if (body.role < 0 || body.role > 1)
         errorList.push({tag: "badVal", param: "role"});
   }

   // Post errors, or proceed with data fetches
   if (noPerm)
      res.status(403).end();
   else if (errorList.length)
      res.status(400).json(errorList);
   else {
      var cnn = mysql.createConnection(cnnConfig);

      // Find duplicate Email if any.
      cnn.query(qry = 'select * from Person where email = ?', body.email,
      function(err, dupEmail) {
         if (err) {
            cnn.destroy();
            res.status(500).json("Failed query " + qry);
         }
         else if (dupEmail.length) {
            res.status(400).json({tag: "dupEmail"});
            cnn.destroy();
         }
         else { // No duplicate, so make a new Person
            body.termsAccepted = body.termsAccepted && new Date();
            cnn.query(qry = 'insert into Person set ?', body,
            function(err, insRes) {
               cnn.destroy();
               if (err)
                  res.status(500).json("Failed query " + qry);
               else
                  res.location(router.baseURL + '/' + insRes.insertId).end();
            });
          }
      });
   }
});
*/

/* Much nicer versions*/
router.get('/', function(req, res) {
   var email = req.session.isAdmin() && req.query.email ||
    !req.session.isAdmin() && req.session.email;

   var handler = function(err, prsArr, fields) {
      res.json(prsArr);
      req.cnn.release();
   };

   if (email)
      req.cnn.chkQry('select id, email from Person where email = ?', [email], 
       handler);
   else
      req.cnn.chkQry('select id, email from Person', null, handler);
});

router.post('/', function(req, res) {
   var vld = req.validator;  // Shorthands
   var body = req.body;
   var admin = req.session && req.session.isAdmin();
   var cnn = req.cnn;

   if (admin && !body.password)
      body.password = "*";                       // Blocking password
   body.whenRegistered = new Date();

   async.waterfall([
      function(cb) { // Check properties and search for Email duplicates
         if (vld.hasDefinedFields(body, [body.email, body.lastName, body.role, 
          body.password], ["email", "lastName", "role", "password"], cb)) {
            cnn.chkQry('select * from Person where email = ?', body.email, cb);
         }
      },
      // function(cb) { // Check properties and search for Email duplicates
      //    if (vld.hasFields(body, ["email", "password", "role"], cb) &&
      //     vld.chain(body.role === 0 || admin, Tags.noPermission)
      //     .chain(body.termsAccepted || admin, Tags.noTerms)
      //     .check(body.role >= 0, Tags.badValue, ["role"], cb)) {
      //       cnn.chkQry('select * from Person where email = ?', body.email, cb);
      //    }
      // },
      // //function(whatever was after the error parameter from prior callback, cb)
      // function(existingPrss, fields, cb) {  // If no dups, insert new Person
      //    if (vld.check(!existingPrss.length, Tags.dupEmail, null, cb)) {
      //       body.termsAccepted = body.termsAccepted && new Date();
      //       cnn.chkQry('insert into Person set ?', [body], cb);
      //    }
      // },
      function(result, fields, cb) { // Return location of inserted Person
         res.location(router.baseURL + '/' + result.insertId).end();
         cb();
      }],
      function(err) {
         cnn.release();
      }
   );
});

router.put('/:id', function(req, res) {
   var vld = req.validator;
   var ssn = req.session;
   var body = req.body;
   var cnn = req.cnn;

   async.waterfall([
   cb => {
      if (vld.checkPrsOK(req.params.id, cb) && 
       vld.chain(!(role in body) || ssn.isAdmin(), Tags.badValue, ["role"])
       // .hasOnlyFields(body, okFields)
       // .checkFieldsLength(body, ...)
       .chain(!(password in body) || req.body.oldPassword || ssn.isAdmin, 
       Tags.noOldPwd) 
       .check(!(password in body) || req.body.password, Tags.badValue, 
       ["password"], cb)) {
         cnn.chkQry("select * from Person where id = ?", [red.param.id], cb);
      }
   },
   (foundPrs, fields, cb) => {
      if (vld.check(foundPrs.length, Tags.notFound, null, cb) &&
       vld.check(ssn.isAdmin() || !password in body)
       || req.body.oldPassword === foundPrs[0].password,
       Tags.oldPwdMismatch, null, cb) {
         delete body.oldPassword;
         cnn.chkQry("update Person set ? where id = ?",
         [body, req.params.id], cb);
      } 
   },
   (updRes, fields, cb) => {
      res.end();
      cb();
   }, 
   ],
   err => {
      cnn.release();
   });
});

router.get('/:id', function(req, res) {
   var vld = req.validator;

   async.waterfall([
   function(cb) {
     if (vld.checkPrsOK(req.params.id, cb))
        req.cnn.chkQry('select * from Person where id = ?', [req.params.id],
         cb);
   },
   function(prsArr, fields, cb) {
      if (vld.check(prsArr.length, Tags.notFound, null, cb)) {
         res.json(prsArr);
         cb();
      }
   }],
   err => {
      req.cnn.release();
   });
});

/*
router.get('/:id', function(req, res) {
   var vld = req.validator;

   if (vld.checkPrsOK(req.params.id)) {
      req.cnn.query('select * from Person where id = ?', [req.params.id],
      function(err, prsArr) {
         if (vld.check(prsArr.length, Tags.notFound))
            res.json(prsArr);
         req.cnn.release();
      });
   }
   else {
      req.cnn.release();
   }
});
*/

router.delete('/:id', function(req, res) {
   var vld = req.validator;

   async.waterfall([
   function(cb) {
      if (vld.checkAdmin()) {
         req.cnn.chkQry('DELETE from Person where id = ?', [req.params.id], cb);
      }
   },
   function(result, fields, cb) {
      if (vld.check(result.affectedRows, Tags.notFound, null, cb)) {
         res.end();
         cb();
      }
   }],
   function(err) {
      req.cnn.release();
   });
});

module.exports = router;
