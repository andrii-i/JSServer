var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');

router.baseURL = '/Msgs';

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

module.exports = router;