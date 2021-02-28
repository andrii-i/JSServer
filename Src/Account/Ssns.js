var Express = require('express');
var Tags = require('../Validator.js').Tags;
var {Session, router} = require('../Session.js');
var router = Express.Router({caseSensitive: true});

router.baseURL = '/Ssns';

router.get('/', function(req, res) {
   var body = [], ssn;
   var vld = req.validator;

   if (vld.check(vld.checkAdmin(), Tags.noPermission)) {
      Session.getAllIds().forEach(id => {
         ssn = Session.findById(id);
         body.push({id: ssn.id, prsId: ssn.prsId, loginTime: ssn.loginTime});
      });
      res.json(body);
   }
   req.cnn.release();
});

router.post('/', function(req, res) {
   var ssn;
   var cnn = req.cnn;
   var vld = req.validator;

   cnn.chkQry('select * from Person where email = ?', [req.body.email],
      function(err, result) {
         if (vld.check(result.length && result[0].password ===
          req.body.password, Tags.badLogin)) {
            ssn = new Session(result[0], res);
            res.location(router.baseURL + '/' + ssn.id).end();
         }
         cnn.release();
      });
});

router.get('/:id', function(req, res) {
   var vld = req.validator;
   var ssn = Session.findById(req.params.id);

   if (vld.check(vld.hasValue(ssn), Tags.resourceNotFound) 
    && vld.checkPrsOK(ssn.prsId)) {
      res.json({id: ssn.id, prsId: ssn.prsId, loginTime: ssn.loginTime});
   }
   req.cnn.release();
});

router.delete('/:id', function(req, res) {
   var vld = req.validator;
   var ssn = Session.findById(req.params.id);

   if (vld.check(vld.hasValue(ssn), Tags.resourceNotFound) &&
    vld.checkPrsOK(ssn.prsId)) {
      console.log("Logging out the session");
      ssn.logOut();
      res.status(200).end();
   }   
   req.cnn.release();
});

module.exports = router;