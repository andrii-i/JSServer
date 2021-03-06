import express from "express";
import {Validator} from "../Validator";
import {Session} from "../Session.js";
import {kSuccessHTTP} from "../main";

const baseURL = '/Ssns';

export let router = express.Router({caseSensitive: true});
var Tags = Validator.Tags;

export interface SessionInfo {
   id: number, 
   prsId: number, 
   loginTime: number
}

router.get('/', function(req, res) {
   var body: SessionInfo[] = []; 
   var ssn: Session;
   var vld = req.validator;

   if (vld.check(vld.checkAdmin(null), Tags.noPermission, null, null)) {
      Session.getAllIds().forEach(id => {
         ssn = Session.findById(id);
         body.push({id: ssn.id, prsId: ssn.prsId, loginTime: ssn.loginTime});
      });
      res.json(body);
   }
   req.cnn.release();
});

router.post('/', function(req, res) {
   var ssn: Session;
   var cnn = req.cnn;
   var vld = req.validator;

   cnn.chkQry('select * from Person where email = ?', [req.body.email],
      function(err, result) {
         if (vld.check(result.length && result[0].password ===
          req.body.password, Tags.badLogin, null, null)) {
            ssn = new Session(result[0], res);
            res.location(baseURL + '/' + ssn.id).end();
         }
         cnn.release();
      });
});

router.get('/:id', function(req, res) {
   var vld = req.validator;
   var ssn = Session.findById(req.params.id);

   if (vld.check(vld.hasValue(ssn), Tags.resourceNotFound, null, null) 
    && vld.checkPrsOK(ssn.prsId, null)) {
      res.json({id: ssn.id, prsId: ssn.prsId, loginTime: ssn.loginTime});
   }
   req.cnn.release();
});

router.delete('/:id', function(req, res) {
   var vld = req.validator;
   var ssn = Session.findById(req.params.id);

   if (vld.check(vld.hasValue(ssn), Tags.resourceNotFound, null, null) &&
    vld.checkPrsOK(ssn.prsId, null)) {
      console.log("Logging out the session");
      ssn.logOut();
      res.status(kSuccessHTTP).end();
   }   
   req.cnn.release();
});