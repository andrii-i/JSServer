var Express = require('express');
var Tags = require('../Validator.js').Tags;
var async = require('async');
var mysql = require('mysql');
var router = Express.Router({caseSensitive: true});

router.baseURL = '/Prss';

/* Much nicer versions*/
router.get('/', function(req, res) {
   var admin = req.session.isAdmin();
   var email = req.query.email;
   var ssnEmail = req.session.email;

   var handler = function(err, prsArr, fields) {
      res.json(prsArr);
      req.cnn.release();
   };

   if (admin && !email) {
      req.cnn.chkQry('select id, email from Person', null, handler);
   } else if (admin && email) {
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email LIKE ?', 
       [email.concat('%')], handler);
   } else if (!admin && !email) {
      res.json([]);
      req.cnn.release();
   } else if (!admin && email) {
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email LIKE ? \
       AND email = ?', [email.concat('%'), ssnEmail], handler);
   }
});

router.post('/', function(req, res) {
   var vld = req.validator;  // Shorthands
   var body = req.body;
   var admin = req.session && req.session.isAdmin();
   var cnn = req.cnn;

   if (admin && !body.password)
      body.password = "*";                     
   body.whenRegistered = Date.now();

   async.waterfall([
      function(cb) { 
         if (vld.hasDefinedFields(body, ["password", "email", "lastName", 
          "role"], cb) && 
          vld.chain(!body.firstName || body.firstName.length <= 30, 
          Tags.badValue, ["firstName"])
          .chain(body.lastName.length <= 50, Tags.badValue, 
          ["lastName"])
          .chain(body.password.length <= 50, Tags.badValue, ["password"])
          .chain(body.role === 0 || body.role === 1, Tags.badValue,
          ["role"])
          .chain(body.termsAccepted || admin, Tags.noTerms, null)
          .chain(body.role === 1 && admin || body.role === 0 || 
          body.role !== 0 && body.role !== 1, Tags.forbiddenRole, null)
          .check(body.email.length <= 150, Tags.badValue, ["email"], 
          cb)) {
            cnn.chkQry('select * from Person where email = ?', body.email, cb);
         }
      },
      //function(whatever was after the error parameter from prior callback, cb)
      function(existingPrss, fields, cb) {  // If no dups, insert new Person
         if (vld.check(!existingPrss.length, Tags.dupEmail, null, cb)) {
            if (admin && !body.termsAccepted) {
               body.termsAccepted = null;
            } else {
               body.termsAccepted = body.termsAccepted && Date.now();
               body.whenRegistered = body.termsAccepted;
            }
            cnn.chkQry('insert into Person set ?', [body], cb);
         }
      },
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
   var admin = req.session && req.session.isAdmin();

   async.waterfall([
   cb => {      
      if (vld.checkPrsOK(req.params.id, cb) && 
       vld.chain(!("email" in body), Tags.forbiddenField, ["email"])
       .chain(!("whenRegistered" in body), Tags.forbiddenField, 
       ["whenRegistered"])
       .chain(!("termsAccepted" in body), Tags.forbiddenField, 
       ["termsAccepted"])
       .chain(!("lastName" in body) || vld.hasValue(body.lastName), 
       Tags.badValue, ["lastName"])
       .chain(!("role" in body) || body.role === 0 || body.role === 1 && 
       admin, Tags.badValue, ["role"])
       .chain(!("firstName" in body) || "firstName" in body && 
       body.firstName.length <= 30, Tags.badValue, ["firstName"])
       .chain(!("password" in body) || vld.hasValue(body.password), 
       Tags.badValue, ["password"])
       .check(!("password" in body) || "oldPassword" in body || 
       !(vld.hasValue(body.password)) || admin, Tags.noOldPwd, null, cb)) {
         cnn.chkQry("select * from Person where id = ?", [req.params.id], cb);
      }
   },
   (foundPrs, fields, cb) => {
      if (vld.check(foundPrs.length, Tags.notFound, null, cb) &&
       vld.check(admin || !("password" in body) || req.body.oldPassword === foundPrs[0].password,
       Tags.oldPwdMismatch, null, cb)) {
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
      if (vld.checkPrsOK(req.params.id, cb)) {
         req.cnn.chkQry('select id, firstName, lastName, email, whenRegistered,\
          termsAccepted, role from Person where id = ?', [req.params.id], 
          cb);
      }
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

router.delete('/:id', function(req, res) {
   var vld = req.validator;

   async.waterfall([
   function(cb) {
      if (vld.check(vld.checkAdmin(), Tags.noPermission, null, cb)) {
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