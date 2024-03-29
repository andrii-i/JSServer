var Express = require('express');
var Session = require('../Session.js');
var Tags = require('../Validator.js').Tags;
var async = require('async');
var mysql = require('mysql');
var router = Express.Router({caseSensitive: true});

router.baseURL = '/Prss';

function decrMsgLikesQry(msgIds) {
   if (msgIds.length) {
      return "UPDATE Message SET numLikes = numLikes - 1 WHERE id IN ("
       + '?,'.repeat(msgIds.length).slice(0, -1) + ")";
   } else {
      return "SELECT 'Something sweet'";
   }
}

function deleteLikesQry(likeIds) {
   if (likeIds.length) {
      return "delete from Likes where id IN ("
       + '?,'.repeat(likeIds.length).slice(0, -1) + ")";
   } else {
      return "SELECT 'Something sweet'";
   }
}

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
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email = ?', 
       [ssnEmail], handler);
   } else if (!admin && email) {
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email LIKE ? \
       AND email = ?', [email.concat('%'), ssnEmail], handler);
   }
});

router.post('/', function(req, res) {
   var vld = req.validator;
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
          .chain(parseInt(body.role, 10) === 0 || parseInt(body.role, 10) === 1,
          Tags.badValue, ["role"])
          .chain(body.termsAccepted || admin, Tags.noTerms, null)
          .chain(parseInt(body.role, 10) !== 0 && parseInt(body.role, 10) !== 1
          || parseInt(body.role, 10) === 1 && admin 
          || parseInt(body.role, 10) === 0, Tags.forbiddenRole, null)
          .check(body.email.length <= 150, Tags.badValue, ["email"], 
          cb)) {
            cnn.chkQry('select * from Person where email = ?', body.email, cb);
         }
      },
      function(existingPrss, fields, cb) {  
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
      function(result, fields, cb) { 
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
   var body = req.body;
   var cnn = req.cnn;
   var admin = req.session && req.session.isAdmin();

   async.waterfall([
   cb => {      
      if (vld.checkPrsOK(req.params.id, cb) && 
       vld.chain(!("email" in body), Tags.forbiddenField, ["email"])
       .chain(!("termsAccepted" in body), Tags.forbiddenField, 
       ["termsAccepted"])
       .chain(!("whenRegistered" in body), Tags.forbiddenField, 
       ["whenRegistered"])
       .chain(!("lastName" in body) || vld.hasValue(body.lastName) && 
       body.lastName.length <= 50, Tags.badValue, ["lastName"])
       .chain(!("role" in body) || parseInt(body.role, 10) === 0 || 
       parseInt(body.role, 10) === 1 && admin, Tags.badValue, ["role"])
       .chain(!("firstName" in body) || "firstName" in body && 
       body.firstName.length <= 30, Tags.badValue, ["firstName"])
       .chain(!("password" in body) || vld.hasValue(body.password)  
       && body.password.length <= 50, Tags.badValue, ["password"])
       .check(!("password" in body) || "oldPassword" in body || 
       !(vld.hasValue(body.password)) || admin, Tags.noOldPwd, null, cb)) {
         cnn.chkQry("select * from Person where id = ?", [req.params.id], cb);
      }
   },
   (foundPrs, fields, cb) => {
      var query;

      if (vld.check(foundPrs.length, Tags.resourceNotFound, null, cb) &&
       vld.check(admin || !("password" in body) || req.body.oldPassword === 
       foundPrs[0].password, Tags.oldPwdMismatch, null, cb)) {
         Object.keys(req.body).length ? 
          query = "update Person set ? where id = ?" : 
          query = "SELECT 'Something sweet'";
         delete body.oldPassword;
         cnn.chkQry(query, [body, req.params.id], cb);
      } 
   },
   (updRes, fields, cb) => {
      res.status(200).end();
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
      if (vld.check(prsArr.length, Tags.resourceNotFound, null, cb)) {
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
   var prsnId = req.params.id;
   var ssn = req.session;
   var cnn = req.cnn;
   var likeIds;
   var msgIds;
   var query;

   async.waterfall([
   function(cb) {
      if (vld.check(vld.checkAdmin(), Tags.noPermission, null, cb)) {
         req.cnn.chkQry('Select * from Person where id = ?', [prsnId], cb);
      }
   },
   function(result, fields, cb) {
      if (vld.check(result.length, Tags.resourceNotFound, null, cb)) {
         ssn.logOutByPrsId(prsnId);
         req.cnn.chkQry('select * from Likes where prsId = ?', [prsnId],
          cb);
      }
   },
   function(likes, fields, cb) {
      likeIds = likes.map(x => x.id);
      msgIds = likes.map(x => x.msgId);
      query = decrMsgLikesQry(msgIds);
      cnn.chkQry(query, msgIds, cb);
   },
   function(result, fields, cb) {
      query = deleteLikesQry(likeIds);
      cnn.chkQry(query, likeIds, cb);
   },
   function(result, fields, cb) {
      cnn.chkQry('delete from Message where prsId = ?', [prsnId], cb);
   },
   function(result, fields, cb) {
      cnn.chkQry('DELETE from Conversation where ownerId = ?', [prsnId],
       cb);
   },
   function(result, fields, cb) {
      cnn.chkQry('DELETE from Person where id = ?', [prsnId], cb);
   },
   function(result, fields, cb) {
      res.status(200).end();
      cb();
   }],
   function(err) {
      cnn.release();
   });
});

router.get('/:id/Msgs', function(req, res) {
   var prsnId = req.params.id;
   var numQry = req.query.num;
   var orderQry = req.query.order;
   var vld = req.validator;
   var cnn = req.cnn;

   async.waterfall([
      function(cb) {
         cnn.chkQry('Select * from Person where id = ?', [prsnId], cb);
      },
      function(persons, fields, cb) {
         if (vld.check(persons.length, Tags.resourceNotFound, null, cb)) {
            cnn.chkQry('select id, cnvId, whenMade, email, content, numLikes\
             from Message where prsId = ?', [prsnId], cb);
         }
      },
      function(messages, fields, cb) {
         if (vld.check(messages.length, Tags.emptyArray, null, cb)) {
            if (orderQry === 'date') {
               messages.sort((a, b) => parseInt(b.whenMade, 10) - 
                parseInt(a.whenMade, 10));
            } else if (orderQry === 'likes') {
               messages.sort((a, b) => parseInt(b.numLikes, 10) - 
                parseInt(a.numLikes, 10));
            }
            if (vld.hasValue(numQry)) {
               messages = messages.slice(0, parseInt(numQry, 10));
            }
            res.json(messages);
            cb();
         }
      }],
      function(err) {
         cnn.release();
      });
});

module.exports = router;