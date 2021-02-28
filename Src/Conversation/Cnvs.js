var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');

router.baseURL = '/Cnvs';
router.msgURL = '/Msgs';

router.get('/', function(req, res) {
   var vld = req.validator; 
   var ownerId = req.query.owner;

   var handler = function(err, cnvArr, fields) {
      res.json(cnvArr);
      req.cnn.release();
   };

   if (vld.hasValue(ownerId)) {
      req.cnn.chkQry('select id, title, lastMessage, ownerId from Conversation \
       WHERE ownerId = ?', [ownerId], handler);
   } else {
      req.cnn.chkQry('select id, title, lastMessage, ownerId from Conversation',
       null, handler);
   }
});

router.get('/:id', function(req, res) {
   var cnvsId = req.params.id;

   var handler = function(err, cnvArr, fields) {
      if (cnvArr.length) {
         res.json(cnvArr[0]);
      } else {
         res.status(404).end();
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

   async.waterfall([
   cb => {
      if (vld.check(vld.hasValue(body.title), Tags.missingField, ["title"], cb) 
       && vld.check(body.title.length <= 80, Tags.badValue, ["title"], cb)) {
         cnn.chkQry('select * from Conversation where title = ?', [body.title], 
          cb);
      }
   },
   (existingCnv, fields, cb) => {
      if (vld.check(!existingCnv.length, Tags.dupTitle, null, cb)) {
         body.lastMessage = null;
         body.ownerId = req.session.prsId;
         cnn.chkQry("insert into Conversation set ?", [body], cb);
      }
   },
   (insRes, fields, cb) => {
      res.location(router.baseURL + '/' + insRes.insertId).end();
      cb();
   }
   ],
   err => {
      cnn.release();
   });
});

router.put('/:cnvId', function(req, res) {
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;
   var cnvId = req.params.cnvId;

   async.waterfall([
   function(cb) {
      if (vld.check(vld.hasValue(body.title), Tags.missingField, ["title"], cb)
       && vld.check(body.title.length <= 80, Tags.badValue, ["title"], cb)) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      }
   },
   function(cnvs, fields, cb) {
      if (vld.check(cnvs.length, Tags.notFound, null, cb) &&
       vld.checkPrsOK(cnvs[0].ownerId, cb)) {
         cnn.chkQry('select * from Conversation where id <> ? AND title = ?',
          [cnvId, body.title], cb);
       }
   },
   function(sameTtl, fields, cb) {
      if (vld.check(!sameTtl.length, Tags.dupTitle, null, cb)) {       
         cnn.chkQry("update Conversation set title = ? WHERE id = ?", 
          [body.title, cnvId], cb);
      }    
   },
   (result, fields, cb) => {
      res.status(200).end();
      cb();
   }],
   function(err) {
      cnn.release();
   });
});

router.delete('/:cnvId', function(req, res) {
   var vld = req.validator;
   var cnvId = req.params.cnvId;
   var cnn = req.cnn;

   async.waterfall([
   function(cb) {
      cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
   },
   function(cnvs, fields, cb) {
      if (vld.check(cnvs.length, Tags.notFound, null, cb) &&
       vld.checkPrsOK(cnvs[0].ownerId, cb)) {
         cnn.chkQry('delete from Message where cnvId = ?', [cnvId], cb);
      }
   },
   function(result, fields, cb) {
      cnn.chkQry('delete from Conversation where id = ?', [cnvId], cb);
   },
   (result, fields, cb) => {
      res.status(200).end();
      cb();
   }],
   err => {
      cnn.release();
   });
});

router.post('/:id/Msgs', function(req, res) {
   var cnvId = req.params.id;
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;

   async.waterfall([
   cb => {
      if (vld.check(vld.hasValue(body.content), Tags.missingField, ["content"], 
       cb) && vld.check(body.content.length <= 5000, Tags.badValue, ["content"],
       cb)) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], 
          cb);
      }
   },
   (existingCnv, fields, cb) => {
      if (vld.check(existingCnv.length, Tags.resourceNotFound, null, cb)) {
         body.whenMade = Date.now();
         cnn.chkQry("update Conversation set lastMessage = ? WHERE id = ?",
          [body.whenMade, cnvId], cb);
      }
   },
   (result, fields, cb) => {
      body.cnvId = cnvId;
      body.prsId = req.session.prsId;
      body.email = req.session.email;
      body.numLikes = 0;
      cnn.chkQry("insert into Message set ?", [body], cb);
   },
   (result, fields, cb) => {
      res.location(router.msgURL + '/' + result.insertId).end();
      cb();
   }],
   err => {
      cnn.release();
   });
});

router.get('/:id/Msgs', function(req, res) {
   var cnvId = req.params.id;
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;
   var dateTime = req.query.dateTime;
   var num = req.query.num;

   async.waterfall([
   cb => {
      cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
   },
   (conversation, fields, cb) => {
      if (vld.check(conversation.length, Tags.resourceNotFound, null, cb)) {
         cnn.chkQry('select id, prsId, whenMade, email, content, numLikes from\
          Message where cnvId = ?', [cnvId], cb); 
      }
   },
   (messages, fields, cb) => {
      if (messages.length) {
         messages.sort((a, b) => {
            if (parseInt(a.whenMade, 10) > parseInt(b.whenMade, 10)) {
               return 1;
            } else if (parseInt(a.whenMade, 10) < parseInt(b.whenMade, 10)) {
               return -1;
            } else {
               if (parseInt(a.id, 10) > parseInt(b.id, 10)) {
                  return 1;
               } else {
                  return -1;
               }
            }
         });

         if (vld.hasValue(dateTime)) {
            messages = messages.filter(
               msg => (parseInt(msg.whenMade, 10) >= parseInt(dateTime, 10))
            );
         }

         if (vld.hasValue(num)) {
            messages = messages.slice(0, parseInt(num, 10));
         }
      }

      res.json(messages);
      cb();
   }],
   err => {
      cnn.release();
   });
});

module.exports = router;
