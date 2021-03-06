import {Router} from 'express';
import {waterfall} from 'async';
import {FieldInfo, MysqlError, OkPacket, queryCallback} from "mysql";
import {kNotFoundHTTP} from "../main.js";
import {Validator} from "../Validator.js";
import {Message} from "./Cnvs.js";

const baseURL = '/Msgs';
const likesURL = '/Likes';

var Tags = Validator.Tags;

export let router = Router({caseSensitive: true});

export interface Likes {
   id: number,
   msgId: number,
   prsId: number
}

class LikeInfo{
   id: number;
   prsId: number;
   lastName: string;
   firstName: string;

   constructor(id: number, prsId: number, lastName: string, 
    firstName: string) {
      this.id = id;
      this.prsId = prsId;
      this.lastName = lastName;
      this.firstName = firstName;
   }
}

function lastFirstNameSort(firstLastNameA: {firstName: string, 
 lastName: string}, firstLastNameB: {firstName: string, lastName: string}) {
   if (firstLastNameA.lastName > firstLastNameB.lastName) {
      return 1;
   } else if (firstLastNameA.lastName < firstLastNameB.lastName) {
      return -1;
   } else {
      firstLastNameA.firstName >= firstLastNameB.firstName ? 1 : -1;
   }
}

router.get('/:id', function(req, res) {
   var msgId = req.params.id;

   function handler(err: Error, msgArr: Message[], fields: FieldInfo[]) {
      if (msgArr.length) {
         res.json(msgArr[0]);
      } else {
         res.status(kNotFoundHTTP).end();
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

   waterfall([
   (cb: queryCallback) => {
      cnn.chkQry('select * from Message where id = ?', [msgId], cb);
   },
   (messages: Message[], fields: FieldInfo[], cb: queryCallback) => {
      if (vld.check(messages.length, Tags.resourceNotFound, null, cb)) {
         cnn.chkQry('select * from Likes where msgId = ? and prsId = ?', 
          [msgId, ssn.prsId], cb);
      }
   },
   (dupLike: Likes[], fields: FieldInfo[], cb: queryCallback) => {
      if (vld.check(!dupLike.length, Tags.dupLike, null, cb)) {   
         cnn.chkQry("update Message set numLikes = numLikes + 1 WHERE id = ?",
          [msgId], cb);
      }
   },
   (result: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      body.msgId = msgId;
      body.prsId = ssn.prsId;
      cnn.chkQry("insert into Likes set ?", [body], cb);
   },
   (result: OkPacket, fields: FieldInfo[], cb: queryCallback) => {
      res.location(baseURL + '/' + msgId + likesURL + '/' + 
       result.insertId).end();
      cb(null);
   }], (err) => {
      cnn.release();
   });   
});

router.get('/:id/Likes', function(req, res) {
   var msgId = req.params.id;
   var vld = req.validator;
   var num = req.query.num;
   var cnn = req.cnn;
   var likeInfo: {id: number, prsId: number}[];
   var likeInfoExt: LikeInfo[];

   waterfall([
   (cb: queryCallback) => {
      cnn.chkQry('select * from Message where id = ?', [msgId], cb);
   },
   (messages: Message[], fields: FieldInfo[], cb: queryCallback) => {
      if (vld.check(messages.length, Tags.resourceNotFound, null, cb)) {
         cnn.chkQry('select id, prsId from Likes where msgId = ?', [msgId], cb);
      }
   },
   (likes: {id: number, prsId: number}[], fields: FieldInfo[], 
    cb: queryCallback) => {
      var prsIds: number[];
      var query: string;

      if (vld.check(likes.length, Tags.emptyArray, null, cb)) {
         likeInfo = likes.map(like => like);
         prsIds = likes.map(like => like.prsId);
         query = "select id, firstName, lastName from Person where id IN ("
          + '?,'.repeat(prsIds.length).slice(0, -1) + ")";
         cnn.chkQry(query, prsIds, cb);
      }
   },
   (persons: {id: number, firstName: string, lastName: string}[], 
    fields: FieldInfo[], cb: queryCallback) => {
      var prsInfo: {[key: number]: {lastName: string, firstName: string}} = {}; 

      persons.forEach(prs => {
         prsInfo[prs.id] = {"lastName" : prs.lastName, 
          "firstName" : prs.firstName};
      });

      likeInfoExt = likeInfo.map(like => {
         return new LikeInfo(like.id, like.prsId, prsInfo[like.prsId].lastName, 
          prsInfo[like.prsId].firstName);
      });

      likeInfoExt.sort(lastFirstNameSort); 
      if (vld.hasValue(num)) {
         likeInfoExt.sort((likeInfoA, likeInfoB) => likeInfoB.id - 
          likeInfoA.id);
         likeInfoExt = likeInfoExt.slice(0, parseInt(num as string));
      }

      res.json(likeInfoExt);
      cb(null);
   }],
   (err) => {
      cnn.release();
   });
});