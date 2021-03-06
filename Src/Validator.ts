import {Request, Response} from 'express';
import {kBadRequestHTTP, kForbiddenHTTP, kNotFoundHTTP} from './main';
import {Session} from './Session';

interface Error {
   tag: string;
   params: string[];
}

export class Validator {
   private errors: Error[];
   private session: Session;
   private res: Response;

   static Tags = { 
      noLogin: "noLogin",              
      noPermission: "noPermission",    
      missingField: "missingField",    
      badValue: "badValue",            
      notFound: "notFound",            
      badLogin: "badLogin",            
      dupEmail: "dupEmail",            
      noTerms: "noTerms",              
      forbiddenRole: "forbiddenRole",  
      noOldPwd: "noOldPwd",           
      oldPwdMismatch: "oldPwdMismatch",
      dupTitle: "dupTitle",           
      queryFailed: "queryFailed",
      forbiddenField: "forbiddenField",
      resourceNotFound : "resourceNotFound",
      dupLike : "dupLike",
      emptyArray : "emptyArray"
   };

   constructor(req: Request, res: Response) {
      this.errors = [] as Error[];
      this.session = req.session; 
      this.res = res;
   };

   check(test: any, tag: Error["tag"], params: Error["params"], cb: Function) {
      if (!test)
         this.errors.push({tag: tag, params: params}); 

      if (this.errors.length) { 
         if (this.res) { 
            if (this.errors[0].tag === Validator.Tags.noPermission)
               this.res.status(kForbiddenHTTP).end(); 
            else if (this.errors[0].tag === Validator.Tags.resourceNotFound) {
               this.res.status(kNotFoundHTTP).end();
            } else if (this.errors[0].tag === Validator.Tags.emptyArray) {
               this.res.json([]);
            } else this.res.status(kBadRequestHTTP).json(this.errors);
            this.res = null; 
         }
         if (cb) 
            cb(this); 
      }
      return !this.errors.length; 
   };

   chain(test: any, tag: Error["tag"], params: Error["params"]) {
      if (!test) {
         this.errors.push({tag: tag, params: params});
      }
      return this;
   };

   checkAdmin(cb: Function) {
      return this.check(this.session && this.session.isAdmin(),
         Validator.Tags.noPermission, null, cb);
   };

   checkPrsOK(claimedId: number | string, cb: Function) {
      return this.check(this.session &&
       this.session.prsId === parseInt(claimedId as string) || 
       this.checkAdmin(null), Validator.Tags.noPermission, null, cb);
   };

   hasFields(obj: any, fieldList: string[], cb: Function) {
      var self = this;

      fieldList.forEach(function(name) {
         self.chain(obj.hasOwnProperty(name), Validator.Tags.missingField, 
          [name]);
      });

      return this.check(true, null, null, cb);
   };

   hasDefinedFields(obj: any, fieldNames: string[], cb: Function) {
      var self = this;
      var i = 0;
      for (i = 0; i < fieldNames.length; i++) {
         self.chain(obj.hasOwnProperty(fieldNames[i]) && 
         this.hasValue(obj[fieldNames[i]]), Validator.Tags.missingField, 
         [fieldNames[i]]);
      }
      return this.check(true, null, null, cb);
   };

   hasValue(obj: any) {
      return (obj !== null && obj !== "" && obj !== undefined);
   };  
}