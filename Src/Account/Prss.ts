import {Router} from 'express';
import {waterfall} from 'async';
import {Validator} from "../Validator";
import {FieldInfo, OkPacket, queryCallback} from "mysql";
import {kSuccessHTTP} from "../main";
import {Likes} from "../Conversation/Msgs";
import {Message} from "../Conversation/Cnvs";

export let router = Router({caseSensitive: true});

const baseURL = '/Prss';
const kMaxFirstName = 30;
const kMaxLastName = 50;
const kMaxPassword = 50;
const kMaxEmail = 150;

var Tags = Validator.Tags;

export interface Person {
   id: number | string;
   email?: string;
   firstName?: string;
   lastName?: string;
   password?: string;
   whenRegistered?: number;
   termsAccepted?: number;
   role?: number;
}

function decrMsgLikesQry(msgIds: number[]) {
   if (msgIds.length) {
      return "UPDATE Message SET numLikes = numLikes - 1 WHERE id IN ("
       + '?,'.repeat(msgIds.length).slice(0, -1) + ")";
   } else {
      return "SELECT 'SELECT id'";
   }
}

function deleteLikesQry(likeIds: number[]) {
   if (likeIds.length) {
      return "delete from Likes where id IN ("
       + '?,'.repeat(likeIds.length).slice(0, -1) + ")";
   } else {
      return "SELECT 'SELECT id'";
   }
}

router.get('/', function(req, res) {
   var admin = req.session.isAdmin();
   var email = req.query.email;
   var ssnEmail = req.session.email;

   var handler = function(err: Error, prsArr: Person[], fields: FieldInfo[]) {
      res.json(prsArr);
      req.cnn.release();
   };

   if (admin && !email) {
      req.cnn.chkQry('select id, email from Person', null, handler);
   } else if (admin && email) {
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email LIKE ?', 
       [email + '%'], handler);
   } else if (!admin && !email) {
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email = ?', 
       [ssnEmail], handler);
   } else if (!admin && email) {
      req.cnn.chkQry('SELECT id, email FROM Person WHERE email LIKE ? \
       AND email = ?', [email + '%', ssnEmail], handler);
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
   
   waterfall([
      function(cb: queryCallback) { 
         if (vld.hasDefinedFields(body, ["password", "email", "lastName", 
          "role"], cb) && 
          vld.chain(!body.firstName || body.firstName.length <= kMaxFirstName, 
          Tags.badValue, ["firstName"])
          .chain(body.lastName.length <= kMaxLastName, Tags.badValue, 
          ["lastName"])
          .chain(body.password.length <= kMaxPassword , Tags.badValue, 
          ["password"])
          .chain(parseInt(body.role) === 0 || parseInt(body.role) === 1, 
          Tags.badValue, ["role"])
          .chain(body.termsAccepted || admin, Tags.noTerms, null)
          .chain(parseInt(body.role) !== 0 && parseInt(body.role) !== 1 || 
          parseInt(body.role) === 1 && admin || parseInt(body.role) === 0, 
          Tags.forbiddenRole, null)
          .check(body.email.length <= kMaxEmail, Tags.badValue, ["email"], 
          cb)) {
            cnn.chkQry('select * from Person where email = ?', body.email, cb);
         }
      },
      function(existingPrss: Person[], fields: FieldInfo[], cb: queryCallback) {  
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
      function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) { 
         res.location(baseURL + '/' + result.insertId).end();
         cb(null);
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

   waterfall([
   (cb: queryCallback) => {      
      if (vld.checkPrsOK(req.params.id, cb) && 
       vld.chain(!("email" in body), Tags.forbiddenField, ["email"])
       .chain(!("termsAccepted" in body), Tags.forbiddenField, 
       ["termsAccepted"])
       .chain(!("whenRegistered" in body), Tags.forbiddenField, 
       ["whenRegistered"])
       .chain(!("lastName" in body) || vld.hasValue(body.lastName) && 
       body.lastName.length <= kMaxLastName , Tags.badValue, ["lastName"])
       .chain(!("role" in body) || parseInt(body.role) === 0 || 
       parseInt(body.role) === 1 && admin, Tags.badValue, ["role"])
       .chain(!("firstName" in body) || "firstName" in body && 
       body.firstName.length <= kMaxFirstName , Tags.badValue, ["firstName"])
       .chain(!("password" in body) || vld.hasValue(body.password)  
       && body.password.length <= kMaxPassword, Tags.badValue, ["password"])
       .check(!("password" in body) || "oldPassword" in body || 
       !(vld.hasValue(body.password)) || admin, Tags.noOldPwd, null, cb)) {
         cnn.chkQry("select * from Person where id = ?", [req.params.id], cb);
      }
   },
   (foundPrs: Person[], fields: FieldInfo[], cb: queryCallback) => {
      var query: string;

      if (vld.check(foundPrs.length, Tags.resourceNotFound, null, cb) &&
       vld.check(admin || !("password" in body) || req.body.oldPassword === 
       foundPrs[0].password, Tags.oldPwdMismatch, null, cb)) {
         Object.keys(req.body).length ? 
          query = "update Person set ? where id = ?" : 
          query = "SELECT 'id'";
         delete body.oldPassword;
         cnn.chkQry(query, [body, req.params.id], cb);
      } 
   },
   (updRes: Person[], fields: FieldInfo, cb: queryCallback) => {
      res.status(kSuccessHTTP).end();
      cb(null);
   }, 
   ],
   err => {
      cnn.release();
   });
});

router.get('/:id', function(req, res) {
   var vld = req.validator;

   waterfall([
   function(cb: queryCallback) {
      if (vld.checkPrsOK(req.params.id, cb)) {
         req.cnn.chkQry('select id, firstName, lastName, email, whenRegistered,\
          termsAccepted, role from Person where id = ?', [req.params.id], 
          cb);
      }
   },
   function(prsArr: Person[], fields: FieldInfo[], cb: queryCallback) {
      if (vld.check(prsArr.length, Tags.resourceNotFound, null, cb)) {
         res.json(prsArr);
         cb(null);
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
   var likeIds: number[];
   var msgIds: number[];
   var query: string;

   waterfall([
   function(cb: queryCallback) {
      if (vld.check(vld.checkAdmin(null), Tags.noPermission, null, cb)) {
         req.cnn.chkQry('Select * from Person where id = ?', [prsnId], cb);
      }
   },
   function(result: Person[], fields: FieldInfo[], cb: queryCallback) {
      if (vld.check(result.length, Tags.resourceNotFound, null, cb)) {
         ssn.logOutByPrsId(prsnId);
         req.cnn.chkQry('select * from Likes where prsId = ?', [prsnId],
          cb);
      }
   },
   function(likes: Likes[], fields: FieldInfo[], cb: queryCallback) {
      likeIds = likes.map(like => like.id);
      msgIds = likes.map(like => like.msgId);
      query = decrMsgLikesQry(msgIds);
      cnn.chkQry(query, msgIds, cb);
   },
   function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) {
      query = deleteLikesQry(likeIds);
      cnn.chkQry(query, likeIds, cb);
   },
   function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) {
      cnn.chkQry('delete from Message where prsId = ?', [prsnId], cb);
   },
   function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) {
      cnn.chkQry('DELETE from Conversation where ownerId = ?', [prsnId],
       cb);
   },
   function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) {
      cnn.chkQry('DELETE from Person where id = ?', [prsnId], cb);
   },
   function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) {
      res.status(kSuccessHTTP).end();
      cb(null);
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

   waterfall([
      function(cb: queryCallback) {
         cnn.chkQry('Select * from Person where id = ?', [prsnId], cb);
      },
      function(persons: Person[], fields: FieldInfo[], cb: queryCallback) {
         if (vld.check(persons.length, Tags.resourceNotFound, null, cb)) {
            cnn.chkQry('select id, cnvId, whenMade, email, content, numLikes\
             from Message where prsId = ?', [prsnId], cb);
         }
      },
      function(messages: Message[], fields: FieldInfo[], cb: queryCallback) {
         if (vld.check(messages.length, Tags.emptyArray, null, cb)) {
            if (orderQry === 'date') {
               messages.sort((messageA, messageb) => 
                parseInt(messageb.whenMade as string) - 
                parseInt(messageA.whenMade as string));
            } else if (orderQry === 'likes') {
               messages.sort((messageA, messageb) => messageb.numLikes - 
                messageA.numLikes);
            }
            if (vld.hasValue(numQry)) {
               messages = messages.slice(0, parseInt(numQry as string));
            }
            res.json(messages);
            cb(null);
         }
      }],
      function(err) {
         cnn.release();
      });
});