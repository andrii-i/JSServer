import {Router} from "express";
import {waterfall} from 'async';
import {Validator} from "../Validator.js";
import {FieldInfo, queryCallback } from "mysql";
import {kNotFoundHTTP, kSuccessHTTP} from "../main.js";

var Tags = Validator.Tags;
const baseURL = '/Cnvs';
const msgURL = '/Msgs';
const kShortContent = 80;
const kMaxContent = 5000;

export let router = Router({caseSensitive: true});

interface OkPacket {
   insertId: number;
}

export interface Conversation {
   id: number;
   title: string;
   lastMessage: number;
   ownerId: number;
};

export interface Message {
   whenMade: number | string;
   numLikes: number;
   id: number | string;
   prsId: number;
   cnvId?: number;
   email: string;
   content: string;
}

router.get('/', function(req, res) {
   var vld = req.validator;
   var ownerId = req.query.owner; 

   var handler = function(err: Error, cnvArr: Conversation[]) {
      res.json(cnvArr);
      req.cnn.release();
   };

   if (vld.hasValue(ownerId)) {
      req.cnn.chkQry('select id, title, lastMessage, ownerId from Conversation\
       WHERE ownerId = ?', [parseInt(ownerId as string)], handler);
   } else {
      req.cnn.chkQry('select id, title, lastMessage, ownerId from Conversation',
       null, handler);
   }
});

router.get('/:id', function(req, res) {
   var cnvsId = req.params.id;

   var handler = function(err: Error, cnvArr: Conversation[]) {
      if (cnvArr.length) {
         res.json(cnvArr[0]);
      } else {
         res.status(kNotFoundHTTP).end();
      }
      req.cnn.release();
   };

   req.cnn.chkQry('select id, title, lastMessage, ownerId from Conversation \
    WHERE id = ?', [cnvsId], handler);
});

router.post('/', function(req, res) {
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;

   waterfall([
   (cb: queryCallback) => {
      if (vld.check(vld.hasValue(body.title), Tags.missingField, ["title"], cb) 
       && vld.check(body.title.length <= kShortContent, Tags.badValue, 
       ["title"], cb)) {
         cnn.chkQry('select * from Conversation where title = ?', [body.title], 
          cb);
      }
   },
   (existingCnv: Conversation[], fields: FieldInfo[], cb: queryCallback) => {
      if (vld.check(!existingCnv.length, Tags.dupTitle, null, cb)) {
         body.lastMessage = null;
         body.ownerId = req.session.prsId;
         cnn.chkQry("insert into Conversation set ?", [body], cb);
      }
   },
   (insRes: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      res.location(baseURL + '/' + insRes.insertId).end();
      cb(null);
   }
   ], err => {
      cnn.release();
   });
});

router.put('/:cnvId', function(req, res) {
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;
   var cnvId = req.params.cnvId;

   waterfall([
   function(cb: queryCallback) {
      if (vld.check(vld.hasValue(body.title), Tags.missingField, ["title"], cb)
       && vld.check(body.title.length <= kShortContent, Tags.badValue, 
       ["title"], cb)) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      }
   },
   function(cnvs: Conversation[], fields: FieldInfo[], cb: queryCallback) {
      if (vld.check(cnvs.length, Tags.resourceNotFound, null, cb) &&
       vld.checkPrsOK(cnvs[0].ownerId, cb)) {
         cnn.chkQry('select * from Conversation where id <> ? AND title = ?',
          [cnvId, body.title], cb);
       }
   },
   function(sameTtl: Conversation[], fields: FieldInfo[], cb: queryCallback) {
      if (vld.check(!sameTtl.length, Tags.dupTitle, null, cb)) {       
         cnn.chkQry("update Conversation set title = ? WHERE id = ?", 
          [body.title, cnvId], cb);
      }    
   },
   (result: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      res.status(kSuccessHTTP).end();
      cb(null);
   }
   ], err => {
      cnn.release();
   });
});

router.delete('/:cnvId', function(req, res) {
   var vld = req.validator;
   var cnvId = req.params.cnvId;
   var cnn = req.cnn;

   waterfall([
   function(cb: queryCallback) {
      cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
   },
   function(cnvs: Conversation[], fields: FieldInfo[], cb: queryCallback) {
      if (vld.check(cnvs.length, Tags.resourceNotFound, null, cb) &&
       vld.checkPrsOK(cnvs[0].ownerId, cb)) {
         cnn.chkQry('delete from Message where cnvId = ?', [cnvId], cb);
      }
   },
   function(result: OkPacket, fields: FieldInfo[], cb: queryCallback) {
      cnn.chkQry('delete from Conversation where id = ?', [cnvId], cb);
   },
   (result: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      res.status(kSuccessHTTP).end();
      cb(null);
   }], err => {
      cnn.release();
   });
});

router.post('/:id/Msgs', function(req, res) {
   var cnvId = req.params.id;
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;

   waterfall([
   (cb: queryCallback) => {
      if (vld.check(vld.hasValue(body.content), Tags.missingField, ["content"], 
       cb) && vld.check(body.content.length <= kMaxContent, Tags.badValue, 
        ["content"], cb)) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      }
   },
   (existingCnv: Conversation[], fields: FieldInfo[], cb: queryCallback) => {
      if (vld.check(existingCnv.length, Tags.resourceNotFound, null, cb)) {
         body.whenMade = Date.now();
         cnn.chkQry("update Conversation set lastMessage = ? WHERE id = ?",
          [body.whenMade, cnvId], cb);
      }
   },
   (result: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      body.cnvId = cnvId;
      body.prsId = req.session.prsId;
      body.email = req.session.email;
      body.numLikes = 0;
      cnn.chkQry("insert into Message set ?", [body], cb);
   },
   (result: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      res.location(msgURL + '/' + result.insertId).end();
      cb(null);
   }], err => {
      cnn.release();
   });
});

router.get('/:id/Msgs', function(req, res) {
   var cnvId = req.params.id;
   var vld = req.validator;
   var cnn = req.cnn;
   var dateTime = req.query.dateTime;
   var num = req.query.num;

   waterfall([
   (cb: queryCallback) => {
      cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
   },
   (conversation: Conversation[], fields: FieldInfo[], cb: queryCallback) => {
      if (vld.check(conversation.length, Tags.resourceNotFound, null, cb)) {
         cnn.chkQry('select id, prsId, whenMade, email, content, numLikes from\
          Message where cnvId = ?', [cnvId], cb); 
      }
   },
   (messages: Message[], fields: FieldInfo[], cb: queryCallback) => {
      if (messages.length) {
         messages.sort((messageA, messageB) => {
            if (parseInt(messageA.whenMade as string) > 
             parseInt(messageB.whenMade  as string)) {
               return 1;
            } else if (parseInt(messageA.whenMade  as string) < 
             parseInt(messageB.whenMade  as string)) {
               return -1;
            } else {
               return parseInt(messageA.id as string) 
                - parseInt(messageB.id as string);
            }
         });

         if (vld.hasValue(dateTime)) {
            messages = messages.filter(
               msg =>  msg.whenMade >= 
                parseInt(dateTime as string)
            )
         }

         if (vld.hasValue(num)) {
            messages = messages.slice(0, parseInt(num as string));
         }
      }

      res.json(messages); 
      cb(null);
   }], err => {
      cnn.release();
   });
});