var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');

router.baseURL = '/Msgs';
router.likesURL = '/Likes';

// sort in increasing last/firstName order
function lastFirstNameSort(a, b) {
   if (a.lastName > b.lastName) {
      return 1;
   } else if (a.lastName < b.lastName) {
      return -1;
   } else {
      a.firstName >= b.firstName ? 1 : -1;
   }
}

router.get('/:id', function(req, res) {
   var msgId = req.params.id;

   var handler = function(err, msgArr, fields) {
      if (msgArr.length) {
         res.json(msgArr[0]);
      } else {
         res.status(404).end();
      }
      req.cnn.release();
   };

   req.cnn.chkQry('select numLikes, prsId, cnvId, whenMade, email, content from\
    Message WHERE id = ?', [msgId], handler);
});

router.post('/:id/Likes', function(req, res) {
   var msgId = req.params.id;
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;
   var ssn = req.session;

   async.waterfall([
   cb => {
      cnn.chkQry('select * from Message where id = ?', [msgId], cb);
   },
   (messages, fields, cb) => {
      if (vld.check(messages.length, Tags.resourceNotFound, null, cb)) {
         cnn.chkQry('select * from Likes where msgId = ? and prsId = ?', 
          [msgId, ssn.prsId], cb);
      }
   },
   (dupLike, fields, cb) => {
      if (vld.check(!dupLike.length, Tags.dupLike, null, cb)) {   
         cnn.chkQry("update Message set numLikes = numLikes + 1 WHERE id = ?",
          [msgId], cb);
      }
   },
   (result, fields, cb) => {
      body.msgId = msgId;
      body.prsId = ssn.prsId;
      cnn.chkQry("insert into Likes set ?", [body], cb);
   },
   (result, fields, cb) => {
      res.location(router.baseURL + '/' + msgId + router.likesURL + '/' + 
       result.insertId).end();
      cb();
   }],
   err => {
      cnn.release();
   });   
});

router.get('/:id/Likes', function(req, res) {
   var msgId = req.params.id;
   var vld = req.validator;
   var num = req.query.num;
   var cnn = req.cnn;
   var likeInfo;

   async.waterfall([
   cb => {
      cnn.chkQry('select * from Message where id = ?', [msgId], cb);
   },
   (messages, fields, cb) => {
      if (vld.check(messages.length, Tags.resourceNotFound, null, cb)) {
         cnn.chkQry('select id, prsId from Likes where msgId = ?', [msgId], cb);
      }
   },
   (likes, fields, cb) => {
      var prsIds = likes.map(like => like.prsId);
      var query = "select id, firstName, lastName from Person where id IN (" + 
       '?,'.repeat(prsIds.length).slice(0, -1) + ")";
      
      likeInfo = likes.map(x => x);
      cnn.chkQry(query, prsIds, cb);
   },
   (persons, fields, cb) => {
      var prsInfo = {}; 

      persons.forEach(prs => {
         prsInfo[prs.id] = {"lastName" : prs.lastName, 
          "firstName" : prs.firstName};
      });

      likeInfo = likeInfo.map(like => {
         return {
          "id" : like.id, "prsId" : like.prsId, 
          "lastName" : prsInfo[like.prsId].lastName,  
          "firstName" : prsInfo[like.prsId].firstName
         }
      });

      likeInfo.sort(lastFirstNameSort); 
      if (vld.hasValue(num)) {

         likeInfo.sort((a, b) => parseInt(b.id, 10) - parseInt(a.id, 10));
         likeInfo = likeInfo.slice(0, parseInt(num, 10));
      }

      res.json(likeInfo);
      cb();
   }],
   err => {
      cnn.release();
   });
});

module.exports = router;